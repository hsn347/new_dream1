import { Router } from "express";
import { db } from "@workspace/db";
import { returnsTable, ordersTable, productsTable, whatsappConnectionsTable } from "@workspace/db/schema";
import { eq, and, desc, ilike } from "drizzle-orm";
import { sendEvolutionMessage } from "../../lib/providers/evolution.js";
import { normalizePhone } from "../../lib/phoneNormalizer.js";
import { logger } from "../../lib/logger.js";

const router = Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const returns = await db
    .select()
    .from(returnsTable)
    .where(eq(returnsTable.userId, userId))
    .orderBy(desc(returnsTable.createdAt));

  const enriched = await Promise.all(
    returns.map(async (r) => {
      let linkedOrder = null;
      if (r.orderId) {
        const orderId = parseInt(r.orderId, 10);
        if (!isNaN(orderId)) {
          const [o] = await db
            .select()
            .from(ordersTable)
            .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
            .limit(1);
          if (o) {
            linkedOrder = {
              id: o.id,
              customerName: o.customerName,
              customerPhone: o.customerPhone,
              items: o.items,
              total: o.total,
              status: o.status,
              createdAt: o.createdAt.toISOString(),
            };
          }
        }
      }
      return {
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        reviewSentAt: r.reviewSentAt?.toISOString() ?? null,
        linkedOrder,
      };
    }),
  );

  res.json(enriched);
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const { orderId, customerName, customerPhone, reason, items, status, adminNotes } = req.body;

  if (!customerName || !customerPhone || !reason || !items) {
    res.status(400).json({ message: "البيانات المطلوبة غير مكتملة" });
    return;
  }

  const finalStatus = status || "completed";

  const [newReturn] = await db
    .insert(returnsTable)
    .values({
      userId,
      orderId: orderId ? String(orderId) : null,
      customerName,
      customerPhone,
      reason,
      items,
      status: finalStatus,
      adminNotes: adminNotes || null,
    })
    .returning();

  if (finalStatus === "completed" || finalStatus === "approved") {
    applyReturnApprovalEffects(userId, newReturn).catch(err => {
      logger.error({ err, userId, returnId: newReturn.id }, "Return creation effects failed");
    });
    sendReturnCustomerNotification(userId, newReturn, finalStatus as "completed").catch(err => {
      logger.error({ err, userId, returnId: newReturn.id }, "Return creation customer notification failed");
    });
  }

  res.json(newReturn);
});

router.patch("/:id/status", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { status } = req.body as { status: string };

  const allowed = ["approved", "rejected", "completed"];
  if (!allowed.includes(status)) {
    res.status(400).json({ message: "حالة غير صالحة" });
    return;
  }

  const [ret] = await db
    .select()
    .from(returnsTable)
    .where(and(eq(returnsTable.id, id), eq(returnsTable.userId, userId)))
    .limit(1);

  if (!ret) { res.status(404).json({ message: "طلب الاسترجاع غير موجود" }); return; }

  await db
    .update(returnsTable)
    .set({ status: status as "approved" | "rejected" | "completed", updatedAt: new Date() })
    .where(eq(returnsTable.id, id));

  res.json({ ok: true });

  if (status === "approved") {
    applyReturnApprovalEffects(userId, ret).catch((err) => {
      logger.error({ err, userId, returnId: id }, "Return approval effects failed");
    });
    sendReturnCustomerNotification(userId, ret, "approved").catch((err) => {
      logger.error({ err, userId, returnId: id }, "Return customer notification failed");
    });
  } else if (status === "rejected") {
    sendReturnCustomerNotification(userId, ret, "rejected").catch((err) => {
      logger.error({ err, userId, returnId: id }, "Return customer notification failed");
    });
  }
});

router.patch("/:id/notes", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { notes } = req.body as { notes: string };

  const [ret] = await db
    .select({ id: returnsTable.id })
    .from(returnsTable)
    .where(and(eq(returnsTable.id, id), eq(returnsTable.userId, userId)))
    .limit(1);

  if (!ret) { res.status(404).json({ message: "طلب الاسترجاع غير موجود" }); return; }

  await db
    .update(returnsTable)
    .set({ adminNotes: notes, updatedAt: new Date() })
    .where(eq(returnsTable.id, id));

  res.json({ ok: true });
});

function parseReturnItems(itemsStr: string): { name: string; qty: number }[] {
  const items: { name: string; qty: number }[] = [];
  const regex = /(.+?)\s*\(الكمية:\s*(\d+)\)/g;
  let match;
  while ((match = regex.exec(itemsStr)) !== null) {
    items.push({ name: match[1].trim(), qty: parseInt(match[2], 10) });
  }
  return items;
}

async function applyReturnApprovalEffects(
  userId: number,
  ret: typeof returnsTable.$inferSelect,
): Promise<void> {
  // 1. Update linked order status to "returned"
  if (ret.orderId) {
    const orderId = parseInt(ret.orderId, 10);
    if (!isNaN(orderId)) {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
        .limit(1);

      if (order) {
        await db
          .update(ordersTable)
          .set({ status: "returned", updatedAt: new Date() })
          .where(eq(ordersTable.id, orderId));
        logger.info({ userId, orderId, returnId: ret.id }, "Order marked as returned");

        // 2. Restore product inventory from return items
        try {
          const itemsToRestore = parseReturnItems(ret.items);
          for (const item of itemsToRestore) {
            if (!item.name || !item.qty) continue;
            const [product] = await db
              .select({ id: productsTable.id, qty: productsTable.qty })
              .from(productsTable)
              .where(and(eq(productsTable.userId, userId), ilike(productsTable.name, item.name)))
              .limit(1);

            if (product) {
              await db
                .update(productsTable)
                .set({ qty: product.qty + item.qty, updatedAt: new Date() })
                .where(eq(productsTable.id, product.id));
              logger.info({ userId, productId: product.id, restoredQty: item.qty }, "Product inventory restored");
            }
          }
        } catch (err) {
          logger.warn({ userId, returnId: ret.id, error: err }, "Could not parse return items for inventory restoration");
        }
      }
    }
  }
}

async function sendReturnCustomerNotification(
  userId: number,
  ret: typeof returnsTable.$inferSelect,
  status: "approved" | "rejected" | "completed",
): Promise<void> {
  try {
    const [wa] = await db
      .select()
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId))
      .limit(1);

    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

    const rawPhone = ret.customerPhone?.trim();
    if (!rawPhone) return;
    const normalizedPhone = normalizePhone(rawPhone);

    let message = "";
    if (status === "completed") {
      message = [
        `✅ *إشعار بإتمام عملية الاسترجاع*`,
        ``,
        `مرحباً ${ret.customerName}،`,
        `نود إبلاغك بأنه قد تمت عملية استرجاع طلبك رقم *#${ret.id}* بنجاح.`,
        `شكراً لتعاملك معنا، ونتطلع لخدمتك مرة أخرى! 🙏`,
      ].join("\n");
    } else if (status === "approved") {
      message = [
        `✅ *تمت الموافقة على طلب الاسترجاع*`,
        ``,
        `مرحباً ${ret.customerName}،`,
        `يسعدنا إبلاغك بأنه تمت الموافقة على طلب الاسترجاع رقم *#${ret.id}*.`,
        `سيتم التواصل معك قريباً لإتمام إجراءات الاسترجاع.`,
        ``,
        `شكراً لتعاملك معنا! 🙏`,
      ].join("\n");
    } else {
      message = [
        `❌ *طلب الاسترجاع*`,
        ``,
        `مرحباً ${ret.customerName}،`,
        `نعتذر عن إبلاغك بأنه تعذّر قبول طلب الاسترجاع رقم *#${ret.id}*.`,
        `للاستفسار، يرجى التواصل معنا مباشرة.`,
      ].join("\n");
    }

    await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      normalizedPhone,
      message,
    );

    logger.info({ userId, returnId: ret.id, status, normalizedPhone }, "Return customer notification sent");
  } catch (err) {
    logger.error({ err, userId, returnId: ret.id }, "sendReturnCustomerNotification error");
  }
}

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const returnId = Number(req.params.id);

  const [returnReq] = await db
    .select()
    .from(returnsTable)
    .where(and(eq(returnsTable.id, returnId), eq(returnsTable.userId, userId)))
    .limit(1);

  if (!returnReq) {
    res.status(404).json({ message: "الاسترجاع غير موجود" });
    return;
  }

  // Revert inventory and order status if it was approved/completed
  if (returnReq.status === "approved" || returnReq.status === "completed") {
    try {
      const itemsToDeduct = parseReturnItems(returnReq.items);
      for (const item of itemsToDeduct) {
        if (!item.name || !item.qty) continue;
        const [product] = await db
          .select({ id: productsTable.id, qty: productsTable.qty })
          .from(productsTable)
          .where(and(eq(productsTable.userId, userId), ilike(productsTable.name, item.name)))
          .limit(1);

        if (product) {
          await db
            .update(productsTable)
            .set({ qty: Math.max(0, product.qty - item.qty), updatedAt: new Date() })
            .where(eq(productsTable.id, product.id));
          logger.info({ userId, productId: product.id, deductedQty: item.qty }, "Product inventory reverted after return deletion");
        }
      }
    } catch (err) {
      logger.warn({ userId, returnId, error: err }, "Could not revert inventory on delete");
    }

    if (returnReq.orderId) {
      const orderId = parseInt(returnReq.orderId, 10);
      if (!isNaN(orderId)) {
        await db.update(ordersTable).set({ status: "delivered", updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
      }
    }
  }

  await db.delete(returnsTable).where(eq(returnsTable.id, returnId));
  res.json({ ok: true });
});

export default router;
