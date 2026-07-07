import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, whatsappConnectionsTable, userSettingsTable, productsTable } from "@workspace/db/schema";
import { eq, and, desc, ilike, inArray } from "drizzle-orm";
import { sendEvolutionMessage } from "../../lib/providers/evolution.js";
import { normalizePhone } from "../../lib/phoneNormalizer.js";
import { logger } from "../../lib/logger.js";
import { createNotification } from "../../lib/notifications.js";
import { generateAndSendInvoice } from "../../lib/invoice.js";

const router = Router();

const ARCHIVE_STATUSES_LIST = ["delivered", "rejected", "cancelled", "returned"] as const;

router.delete("/archive", async (req, res) => {
  const userId = req.session.userId!;
  await db
    .delete(ordersTable)
    .where(and(eq(ordersTable.userId, userId), inArray(ordersTable.status, [...ARCHIVE_STATUSES_LIST])));
  res.json({ ok: true });
});

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt));

  res.json(
    orders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      reviewSentAt: o.reviewSentAt?.toISOString() ?? null,
    })),
  );
});

router.get("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)))
    .limit(1);

  if (!order) { res.status(404).json({ message: "الطلب غير موجود" }); return; }

  res.json({
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    reviewSentAt: order.reviewSentAt?.toISOString() ?? null,
  });
});

router.patch("/:id/status", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { status } = req.body as { status: string };

  const allowed = ["approved", "rejected", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    res.status(400).json({ message: "حالة غير صالحة" });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)))
    .limit(1);

  if (!order) { res.status(404).json({ message: "الطلب غير موجود" }); return; }

  await db
    .update(ordersTable)
    .set({ status: status as "approved" | "rejected" | "delivered" | "cancelled", updatedAt: new Date() })
    .where(eq(ordersTable.id, id));

  res.json({ ok: true });

  // Deduct product quantities when order is approved (only if not already approved before)
  if (status === "approved" && order.status !== "approved") {
    deductProductInventory(userId, order).catch((err) => {
      logger.error({ err, userId, orderId: id }, "Product inventory deduction failed");
    });
  }

  // Send WhatsApp notification to customer asynchronously
  if (status === "approved" || status === "delivered" || status === "rejected" || status === "cancelled") {
    sendCustomerNotification(userId, order, status as "approved" | "delivered" | "rejected" | "cancelled").catch((err) => {
      logger.error({ err, userId, orderId: id, status }, "Customer notification failed");
    });
  }

  // Send PDF invoice when order is manually approved
  if (status === "approved" && order.status !== "approved") {
    generateAndSendInvoice(userId, id).catch((err) => {
      logger.error({ err, userId, orderId: id }, "Invoice send failed");
    });
  }
});

async function deductProductInventory(
  userId: number,
  order: typeof ordersTable.$inferSelect,
): Promise<void> {
  try {
    // Fetch user's low stock threshold setting
    const [settings] = await db
      .select({ lowStockThreshold: userSettingsTable.lowStockThreshold, reviewWhatsappNumber: userSettingsTable.reviewWhatsappNumber })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const threshold = settings?.lowStockThreshold ?? 5;

    const items = JSON.parse(order.items) as Array<{ name: string; qty: number }>;
    const lowStockProducts: Array<{ name: string; qty: number }> = [];

    for (const item of items) {
      if (!item.name || !item.qty) continue;
      const [product] = await db
        .select({ id: productsTable.id, qty: productsTable.qty, name: productsTable.name })
        .from(productsTable)
        .where(and(eq(productsTable.userId, userId), ilike(productsTable.name, item.name.trim())))
        .limit(1);

      if (product) {
        const newQty = Math.max(0, product.qty - item.qty);
        await db
          .update(productsTable)
          .set({ qty: newQty, updatedAt: new Date() })
          .where(eq(productsTable.id, product.id));
        logger.info(
          { userId, orderId: order.id, productId: product.id, before: product.qty, deducted: item.qty, after: newQty },
          "Product inventory deducted on order approval",
        );

        // Collect products that dropped to or below threshold
        if (newQty <= threshold) {
          lowStockProducts.push({ name: product.name, qty: newQty });
        }
      } else {
        logger.warn({ userId, orderId: order.id, itemName: item.name }, "Product not found for inventory deduction");
      }
    }

    // Send low-stock WhatsApp notification if any products are running low
    if (lowStockProducts.length > 0 && settings?.reviewWhatsappNumber) {
      sendLowStockNotification(userId, lowStockProducts, threshold, settings.reviewWhatsappNumber).catch((err) => {
        logger.error({ err, userId }, "Low stock notification failed");
      });
    }

    // Create in-app notification for low stock
    if (lowStockProducts.length > 0) {
      const names = lowStockProducts.map((p) => `${p.name} (${p.qty})`).join("، ");
      createNotification(
        userId,
        "low_stock",
        "⚠️ مخزون منخفض",
        `المنتجات التالية وصلت للحد الأدنى: ${names}`,
        "/products",
      ).catch(() => {});
    }
  } catch {
    logger.warn({ userId, orderId: order.id, orderItems: order.items }, "Could not parse order items for inventory deduction");
  }
}

async function sendLowStockNotification(
  userId: number,
  products: Array<{ name: string; qty: number }>,
  threshold: number,
  reviewNumber: string,
): Promise<void> {
  try {
    const [wa] = await db
      .select()
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId))
      .limit(1);

    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

    const productLines = products
      .map((p) => `  • ${p.name} — تبقّى *${p.qty}* فقط`)
      .join("\n");

    const message = [
      `⚠️ *تنبيه: مخزون منخفض*`,
      ``,
      `المنتجات التالية وصلت إلى الحد الأدنى (${threshold} وحدات أو أقل):`,
      ``,
      productLines,
      ``,
      `يُنصح بإعادة تعبئة المخزون قريباً.`,
    ].join("\n");

    await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      reviewNumber,
      message,
    );

    logger.info({ userId, products, threshold, reviewNumber }, "Low stock notification sent");
  } catch (err) {
    logger.error({ err, userId }, "sendLowStockNotification error");
  }
}

const DEFAULT_APPROVED_MSG = (order: typeof ordersTable.$inferSelect) => [
  `✅ *تم قبول طلبك بنجاح!*`,
  ``,
  `مرحباً ${order.customerName}،`,
  `يسعدنا إبلاغك بأن طلبك رقم *#${order.id}* قد تم قبوله ومراجعته.`,
  ``,
  `📦 الإجمالي: ${order.total} ر.س`,
  order.customerAddress ? `📍 العنوان: ${order.customerAddress}` : ``,
  ``,
  `سيتم التواصل معك قريباً لتنسيق التوصيل. شكراً لثقتك بنا! 🙏`,
].filter((l) => l !== ``).join("\n");

const DEFAULT_DELIVERED_MSG = (order: typeof ordersTable.$inferSelect) => [
  `🚚 *تم توصيل طلبك!*`,
  ``,
  `مرحباً ${order.customerName}،`,
  `يسعدنا إبلاغك بأن طلبك رقم *#${order.id}* قد وصل إلى وجهته.`,
  ``,
  `نتمنى أن تكون راضياً عن طلبك. إذا كان لديك أي استفسار لا تتردد في التواصل معنا.`,
  ``,
  `شكراً لك على ثقتك بنا! ⭐`,
].join("\n");

const DEFAULT_REJECTED_MSG = (order: typeof ordersTable.$inferSelect) => [
  `❌ *بخصوص طلبك رقم #${order.id}*`,
  ``,
  `مرحباً ${order.customerName}،`,
  `نأسف لإبلاغك بأنه تعذّر قبول طلبك في الوقت الحالي.`,
  ``,
  `إذا كان لديك أي استفسار أو تريد معرفة السبب، لا تتردد في التواصل معنا وسنكون سعداء بمساعدتك. 🙏`,
].join("\n");

const DEFAULT_CANCELLED_MSG = (order: typeof ordersTable.$inferSelect) => [
  `🚫 *تم إلغاء طلبك رقم #${order.id}*`,
  ``,
  `مرحباً ${order.customerName}،`,
  `نُحيطك علماً بأن طلبك قد تم إلغاؤه.`,
  ``,
  `إذا كنت ترغب في تقديم طلب جديد أو لديك أي استفسار، يسعدنا مساعدتك في أي وقت. 😊`,
].join("\n");

/** Replace template variables: {{name}}, {{orderId}}, {{total}}, {{address}} */
function interpolate(template: string, order: typeof ordersTable.$inferSelect): string {
  return template
    .replace(/\{\{name\}\}/g, order.customerName ?? "")
    .replace(/\{\{orderId\}\}/g, String(order.id))
    .replace(/\{\{total\}\}/g, order.total ?? "")
    .replace(/\{\{address\}\}/g, order.customerAddress ?? "");
}

async function sendCustomerNotification(
  userId: number,
  order: typeof ordersTable.$inferSelect,
  status: "approved" | "delivered" | "rejected" | "cancelled",
): Promise<void> {
  try {
    const [wa] = await db
      .select()
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId))
      .limit(1);

    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
      logger.info({ userId, orderId: order.id }, "No WA connection — skipping customer notification");
      return;
    }

    const rawPhone = (order.customerPhone?.trim() || order.senderPhone?.trim()) ?? "";
    if (!rawPhone) {
      logger.warn({ userId, orderId: order.id }, "No phone available — skipping notification");
      return;
    }

    const normalizedPhone = normalizePhone(rawPhone);
    logger.info(
      { userId, orderId: order.id, source: order.customerPhone?.trim() ? "customerPhone" : "senderPhone", rawPhone },
      "Sending notification to phone",
    );

    // Load custom message templates from settings
    const [settings] = await db
      .select({ approvedOrderMessage: userSettingsTable.approvedOrderMessage, deliveredOrderMessage: userSettingsTable.deliveredOrderMessage })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    let message: string;
    if (status === "approved") {
      const tpl = settings?.approvedOrderMessage?.trim();
      message = tpl ? interpolate(tpl, order) : DEFAULT_APPROVED_MSG(order);
    } else if (status === "delivered") {
      const tpl = settings?.deliveredOrderMessage?.trim();
      message = tpl ? interpolate(tpl, order) : DEFAULT_DELIVERED_MSG(order);
    } else if (status === "rejected") {
      message = DEFAULT_REJECTED_MSG(order);
    } else {
      message = DEFAULT_CANCELLED_MSG(order);
    }

    const waConfig = { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName };
    const sent = await sendEvolutionMessage(waConfig, normalizedPhone, message);

    logger.info({ userId, orderId: order.id, status, normalizedPhone, sent }, "Customer notification sent");
  } catch (err) {
    logger.error({ err, userId, orderId: order.id }, "sendCustomerNotification error");
  }
}

router.patch("/:id/notes", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { notes } = req.body as { notes: string };

  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId)))
    .limit(1);

  if (!order) { res.status(404).json({ message: "الطلب غير موجود" }); return; }

  await db
    .update(ordersTable)
    .set({ notes, updatedAt: new Date() })
    .where(eq(ordersTable.id, id));

  res.json({ ok: true });
});

export default router;
