// ═══════════════════════════════════════════════════════════════════════════
// agent.ts — منطق الوكيل الكامل
//
// هذا الملف يحتوي على كامل منطق الوكيل الذكي في مكان واحد:
//
//   القسم الأول  : بناء سياق المتجر (ما يعرفه الوكيل عن المتجر والمنتجات)
//   القسم الثاني : إدارة الطلبات (إنشاء / تحديث / قبول / رفض)
//   القسم الثالث : إعدادات الوكيل العامة (من لوحة الأدمن)
//   القسم الرابع : منع التكرار وحماية الفيضان
//   القسم الخامس : تجميع الرسائل وتأخير الرد (Buffer & Debounce)
//   القسم السادس : دوال مساعدة متنوعة
//   القسم السابع : معالجة رسائل صاحب العمل
//   القسم الثامن : حلقة معالجة الذكاء الاصطناعي الرئيسية (processTextFlow)
//   القسم التاسع : معالج أحداث الويب هوك (processEvolutionPayload)
// ═══════════════════════════════════════════════════════════════════════════

import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { db } from "@workspace/db";
import {
  usersTable,
  whatsappConnectionsTable,
  userSettingsTable,
  apiKeysTable,
  conversationsTable,
  messagesTable,
  businessesTable,
  productsTable,
  couponsTable,
  ordersTable,
  systemSettingsTable,
  deliveryZonesTable,
  deliveryZoneRatesTable,
  deliverySettingsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  generateGroqReply,
  buildStrictSystemPrompt,
  AGENT_TOOLS,
  transcribeAudioWithGroq,
  analyzeImageWithVision,
  type ConversationMessage,
  type NegotiationProduct,
  type AgentBehavior,
} from "./providers/groq.js";
import {
  generateGeminiReply,
  analyzeImageWithGemini,
  transcribeAudioWithGemini,
} from "./providers/gemini.js";
import {
  sendEvolutionMessage,
  sendEvolutionImage,
  sendEvolutionTyping,
  downloadEvolutionMedia,
  subscribeToPresence,
  fetchGroupName,
  fetchProfilePictureUrl,
} from "./providers/evolution.js";
import { generateAndSendInvoice } from "./invoice.js";
import { logger } from "./logger.js";
import { searchChunks, getEmbeddingKeyForUser } from "./vectorSearch.js";

import { processReturnAction } from "./returnActions.js";
import { extractAndUpdateProfile } from "./profileExtractor.js";
import { enqueueOutgoing, typingDuration } from "./antiBan.js";
import { extractTaggedJsons } from "./parseTagAction.js";
import { createNotification } from "./notifications.js";
import { normalizePhone } from "./phoneNormalizer.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES & INTERFACES — الأنواع والواجهات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OrderItem {
  name: string;
  qty: number;
  unit: string;
  price: string;
  total: string;
}

export interface OrderDraft {
  action: "save_draft";
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: OrderItem[];
  subtotal: string;
  deliveryCost: string;
  total: string;
  currency?: string;
  senderPhone?: string;
}

export interface SetDepositRef {
  action: "set_deposit_ref";
  reference: string;
}

export interface SubmitOrder {
  action: "submit";
}

export type OrderAction = OrderDraft | SetDepositRef | SubmitOrder;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم الأول: بناء سياق المتجر
// SECTION 1: Store Context Builders
//
// هذه الدوال تبني النص الذي يُضاف لـ system prompt الوكيل
// عدّل هنا لتغيير ما يعرفه الوكيل عن المتجر
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const COUPON_KEYWORDS = [
  "كوبون",
  "خصم",
  "كود",
  "كوبن",
  "discount",
  "coupon",
  "promo",
  "code",
];

/** هل تحتوي رسالة العميل على نية استخدام كوبون؟ */
export function messageHasCouponIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (COUPON_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  if (/\b[A-Z]{2,}\d{1,4}\b/.test(text) || /\b\d{1,4}[A-Z]{2,}\b/.test(text))
    return true;
  return false;
}

/** يبني قسم الكوبونات الفعالة ويضيفه للسياق عند الحاجة */
export async function buildCouponContext(userId: number, currencyLabel = "ريال"): Promise<string> {
  const coupons = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.userId, userId));
  const today = new Date().toISOString().split("T")[0]!;
  const activeCoupons = coupons.filter((c) => {
    if (c.status !== "active") return false;
    if (c.endDate && c.endDate < today) return false;
    if (c.startDate && c.startDate > today) return false;
    return true;
  });
  if (activeCoupons.length === 0) return "";
  const lines: string[] = ["\n=== الكوبونات الفعالة ==="];
  activeCoupons.forEach((c) => {
    const disc =
      c.type === "percent" ? `خصم ${c.value}%` : `خصم ${c.value} ${currencyLabel}`;
    let line = `- كود: ${c.code} (${disc})`;
    if (c.products !== "الكل") line += ` على: ${c.products}`;
    if (c.endDate) line += ` — صالح حتى ${c.endDate}`;
    lines.push(line);
  });
  return lines.join("\n");
}

/**
 * يبني السياق الأساسي للوكيل (معلومات النشاط التجاري + سياسة التوصيل + الحسابات البنكية).
 * المنتجات تأتي عبر البحث المتجهي، والكوبونات عند الطلب.
 */
export async function buildAgentContext(userId: number, currencyLabel = "ريال"): Promise<string> {
  const [biz] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.userId, userId))
    .limit(1);
  const [deliverySettings] = await db
    .select()
    .from(deliverySettingsTable)
    .where(eq(deliverySettingsTable.userId, userId))
    .limit(1);
  const deliveryZones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.userId, userId));
  const deliveryZoneIds = deliveryZones.map((z) => z.id);
  const deliveryRates =
    deliveryZoneIds.length > 0
      ? await db
        .select()
        .from(deliveryZoneRatesTable)
        .where(inArray(deliveryZoneRatesTable.zoneId, deliveryZoneIds))
      : [];

  const parts: string[] = [];

  if (biz?.name) {
    parts.push(`=== معلومات النشاط التجاري ===`);
    parts.push(`الاسم: ${biz.name}`);
    if (biz.description) parts.push(`الوصف: ${biz.description}`);
    if (biz.phones) parts.push(`رقم التواصل: ${biz.phones}`);
    if (biz.branches) parts.push(`الفروع: ${biz.branches}`);
  }

  // ── الحسابات البنكية ──
  if (biz?.bankAccounts) {
    try {
      const accounts = JSON.parse(biz.bankAccounts as string) as Array<{
        type?: string; bankName?: string; owner?: string;
        account?: string; iban?: string; name?: string;
      }>;
      if (accounts.length > 0) {
        parts.push(`\n=== الحسابات البنكية للدفع ===`);
        accounts.forEach((acc, i) => {
          const label = acc.bankName || acc.type || `حساب ${i + 1}`;
          parts.push(`${i + 1}. ${label}`);
          if (acc.owner || acc.name) parts.push(`   اسم صاحب الحساب: ${acc.owner || acc.name}`);
          if (acc.iban) parts.push(`   IBAN: ${acc.iban}`);
          if (acc.account) parts.push(`   رقم الحساب: ${acc.account}`);
        });
      }
    } catch { /* تجاهل الأخطاء */ }
  }

  // ── سياسة التوصيل ──
  if (deliverySettings || deliveryZones.length > 0) {
    parts.push(`\n=== سياسة التوصيل ===`);
    if (deliverySettings) {
      if (deliverySettings.freeDeliveryAll) {
        parts.push(`شحن مجاني لجميع الطلبات!`);
      }
      parts.push(`سياسة المواقع غير المعروفة: ${deliverySettings.unknownLocationPolicy === "unavailable" ? "غير متاح" : "متاح"}`);
    }
    if (deliveryZones.length > 0) {
      parts.push(`مناطق التوصيل المتاحة:`);
      const ratesByZone = new Map<number, typeof deliveryRates>();
      for (const r of deliveryRates) {
        const list = ratesByZone.get(r.zoneId) ?? [];
        list.push(r);
        ratesByZone.set(r.zoneId, list);
      }
      deliveryZones.forEach((z) => {
        const zoneRates = ratesByZone.get(z.id) ?? [];
        if (zoneRates.length > 0) {
          const ratesText = zoneRates.map(r => `الوحدة (${r.unit}): ${r.cost} ${currencyLabel}`).join(" | ");
          parts.push(`  • ${z.name}: ${ratesText}`);
        } else {
          parts.push(`  • ${z.name}`);
        }
      });
    }
  }

  return parts.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم الثاني: إدارة الطلبات
// SECTION 2: Order Management
//
// كل شيء يتعلق بإنشاء الطلبات وتحديثها وإرسال الإشعارات
// عدّل هنا لتغيير سلوك إدارة الطلبات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** يزيل رموز العملة ويُبقي الأرقام فقط (مثل "210 SAR" → "210") */
export function cleanNumeric(value: string | undefined | null): string {
  if (!value) return "0";
  const cleaned = String(value)
    .replace(/[^\d.]/g, "")
    .trim();
  return cleaned || "0";
}

/** جلب الطلب النشط (مسودة أو ينتظر دفع) لمحادثة محددة */
export async function getActiveOrder(userId: number, conversationId: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.userId, userId),
        eq(ordersTable.conversationId, conversationId),
        inArray(ordersTable.status, ["draft", "pending_payment"]),
      ),
    )
    .limit(1);
  return order ?? null;
}

/**
 * البحث عن أي طلب نشط أو مقفل لرقم الجوال عبر جميع المحادثات.
 * طلبات pending_review الأقدم من 7 أيام تُعتبر منتهية ولا تُعيد.
 */
export async function getAnyOrderBySenderPhone(
  userId: number,
  senderPhone: string,
) {
  if (!senderPhone) return null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.userId, userId),
        eq(ordersTable.senderPhone, senderPhone),
        inArray(ordersTable.status, [
          "draft",
          "pending_payment",
          "pending_review",
        ]),
      ),
    )
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);
  if (!order) return null;
  if (order.status === "pending_review" && order.createdAt < sevenDaysAgo)
    return null;
  return order;
}

/** يبني نص سياق الطلب الذي يُضاف للـ system prompt */
export function buildActiveOrderContext(
  order: typeof ordersTable.$inferSelect,
): string {
  let items: OrderItem[] = [];
  try {
    items = JSON.parse(order.items) as OrderItem[];
  } catch { }

  const curr = humanCurrency(order.currency) || order.currency || "ريال";
  const itemsText =
    items.length > 0
      ? items
        .map(
          (i) =>
            `${i.qty} ${i.unit} ${i.name} بـ ${i.price} ${curr} للوحدة = ${i.total} ${curr}`,
        )
        .join("، ")
      : "لم تحدد بعد";

  const phoneDisplay = order.customerPhone?.trim()
    ? `${order.customerPhone} (من المحادثة) | ${order.senderPhone} (واتساب)`
    : order.senderPhone || "لم يُحدد";

  if (order.status === "pending_review") {
    return `
🔒 طلب مقفل — في انتظار مراجعة صاحب العمل (رقم الطلب: #${order.id}):
- الاسم: ${order.customerName || "لم يُحدد"}
- الجوال: ${phoneDisplay}
- عنوان التوصيل: ${order.customerAddress || "لم يُحدد"}
- المنتجات: ${itemsText}
- الإجمالي: ${order.total} ${curr}
⛔ قواعد صارمة:
  • هذا الطلب مقفل — لا تعدّله ولا تنشئ طلباً جديداً ما دام موجوداً.
  • لا تستدعِ submit_order أبداً ما دام هذا الطلب موجوداً.
  • إذا طلب العميل تعديلاً أو إضافة منتجات → أخبره أن طلبه قيد المراجعة وسيتم التواصل معه قريباً.
  • إذا أرسل صورة إيداع أو رقم مرجعي جديد → أخبره أن طلبه السابق تحت المراجعة ولا داعي لإرسال آخر.
  ✅ مسموح: إذا سأل العميل عن رقم الحساب البنكي أو تفاصيل الدفع → زوّده بالمعلومات الكاملة من بيانات المتجر (الحسابات البنكية) حتى يتمكن من إرسال الإيداع.`.trim();
  }

  const statusText =
    order.status === "pending_payment"
      ? "في انتظار سند الإيداع"
      : "جارٍ (مسودة)";
  return `
📋 معلومات الطلب الجارية لهذا الزبون (محفوظة مسبقاً — لا تسأل عنها مجدداً):
- الاسم: ${order.customerName || "لم يُحدد"}
- الجوال: ${phoneDisplay}
- عنوان التوصيل: ${order.customerAddress || "لم يُحدد"}
- المنتجات: ${itemsText}
- المجموع الفرعي: ${order.subtotal} ${curr}
- التوصيل: ${order.deliveryCost} ${curr}
- الإجمالي: ${order.total} ${curr}
- حالة الطلب: ${statusText}
⚠️ هذه المعلومات مسجّلة — لا تطلب من الزبون تكرارها إطلاقاً.`.trim();
}

/** يبني رسالة المراجعة التي تُرسل لصاحب العمل */
export async function buildReviewMessage(
  order: typeof ordersTable.$inferSelect,
): Promise<string> {
  let items: OrderItem[] = [];
  try {
    items = JSON.parse(order.items) as OrderItem[];
  } catch { }

  const curr = humanCurrency(order.currency) || order.currency || "ر.س";

  const itemsText = items
    .map(
      (i) =>
        `  • ${i.name} — ${i.qty} ${i.unit} × ${i.price} ${curr} = ${i.total} ${curr}`,
    )
    .join("\n");

  const depositInfo = order.depositReference
    ? `رقم المرجع: ${order.depositReference}`
    : order.depositMediaUrl
      ? `سند إيداع: ${order.depositMediaUrl}`
      : "لم يُرسل سند إيداع";

  return [
    `🛒 *طلب جديد يحتاج مراجعة*`,
    ``,
    `👤 *العميل:* ${order.customerName}`,
    `📱 *واتساب:* ${order.senderPhone || "غير محدد"}`,
    order.customerPhone?.trim()
      ? `📞 *جوال (من المحادثة):* ${order.customerPhone}`
      : "",
    order.customerAddress ? `📍 *العنوان:* ${order.customerAddress}` : "",
    ``,
    `*المنتجات:*`,
    itemsText,
    ``,
    `المجموع الفرعي: ${order.subtotal} ${curr}`,
    `التوصيل: ${order.deliveryCost} ${curr}`,
    `*الإجمالي: ${order.total} ${curr}*`,
    ``,
    `💳 *الإيداع:* ${depositInfo}`,
    ``,
    `رقم الطلب: #${order.id}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** يرسل إشعار المراجعة لصاحب العمل عبر واتساب */
export async function sendReviewNotification(
  userId: number,
  orderId: number,
): Promise<void> {
  try {
    const [settings] = await db
      .select({ reviewWhatsappNumber: userSettingsTable.reviewWhatsappNumber })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const reviewNumber = settings?.reviewWhatsappNumber?.trim();
    if (!reviewNumber) {
      logger.info(
        { userId, orderId },
        "No review number — skipping notification",
      );
      return;
    }

    const [wa] = await db
      .select()
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId))
      .limit(1);

    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) return;

    const message = await buildReviewMessage(order);
    const sent = await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      reviewNumber,
      message,
    );

    if (sent) {
      await db
        .update(ordersTable)
        .set({ reviewSentAt: new Date() })
        .where(eq(ordersTable.id, orderId));
      logger.info(
        { userId, orderId, reviewNumber },
        "Review notification sent",
      );
    }
  } catch (err) {
    logger.error({ err, userId, orderId }, "sendReviewNotification error");
  }
}

/** معالجة أوامر الطلبات من الوكيل (save_draft / set_deposit_ref / submit) */
export async function processOrderAction(
  userId: number,
  conversationId: number,
  action: OrderAction,
  senderPhone?: string,
): Promise<void> {
  try {
    if (action.action === "save_draft") {
      const resolvedSenderPhone = action.senderPhone ?? senderPhone ?? "";

      // منع إنشاء مسودة جديدة إذا كان هناك طلب مقفل pending_review لهذا الجوال
      if (resolvedSenderPhone) {
        const lockedOrder = await db
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.userId, userId),
              eq(ordersTable.senderPhone, resolvedSenderPhone),
              eq(ordersTable.status, "pending_review"),
            ),
          )
          .limit(1)
          .then((r) => r[0] ?? null);

        if (lockedOrder) {
          logger.warn(
            {
              userId,
              senderPhone: resolvedSenderPhone,
              lockedOrderId: lockedOrder.id,
            },
            "Blocked save_draft — senderPhone has a pending_review order",
          );
          return;
        }
      }

      const existing = await getActiveOrder(userId, conversationId);
      const cleanedItems = action.items.map((item) => ({
        ...item,
        price: cleanNumeric(item.price),
        total: cleanNumeric(item.total),
      }));
      const values = {
        userId,
        conversationId,
        senderPhone: resolvedSenderPhone,
        customerName: action.customerName,
        customerPhone:
          action.customerPhone?.trim() || resolvedSenderPhone || null,
        customerAddress: action.customerAddress ?? null,
        items: JSON.stringify(cleanedItems),
        subtotal: cleanNumeric(action.subtotal),
        deliveryCost: cleanNumeric(action.deliveryCost),
        total: cleanNumeric(action.total),
        currency: (action.currency ?? "SAR").trim().toUpperCase() || "SAR",
        status: "pending_payment" as const,
        updatedAt: new Date(),
      };

      if (existing) {
        await db
          .update(ordersTable)
          .set(values)
          .where(eq(ordersTable.id, existing.id));
        logger.info({ userId, orderId: existing.id }, "Order draft updated");
      } else {
        const [created] = await db
          .insert(ordersTable)
          .values(values)
          .returning();
        logger.info({ userId, orderId: created?.id }, "Order draft created");
      }
      return;
    }

    if (action.action === "set_deposit_ref") {
      const existing = await getActiveOrder(userId, conversationId);
      if (!existing) {
        logger.warn(
          { userId, conversationId },
          "set_deposit_ref: no active order found",
        );
        return;
      }
      await db
        .update(ordersTable)
        .set({
          depositReference: action.reference,
          status: "pending_review",
          updatedAt: new Date(),
        })
        .where(eq(ordersTable.id, existing.id));
      logger.info({ userId, orderId: existing.id }, "Deposit reference saved");
      await sendReviewNotification(userId, existing.id);
      createNotification(
        userId,
        "new_order",
        "🛒 طلب جديد يحتاج مراجعة",
        `طلب #${existing.id} من ${existing.customerName} — الإجمالي: ${existing.total} ر.س`,
        "/orders",
      ).catch(() => { });
      return;
    }

    if (action.action === "submit") {
      const existing = await getActiveOrder(userId, conversationId);
      if (!existing) {
        logger.warn({ userId }, "submit: no active order found");
        return;
      }
      await db
        .update(ordersTable)
        .set({ status: "pending_review", updatedAt: new Date() })
        .where(eq(ordersTable.id, existing.id));
      await sendReviewNotification(userId, existing.id);
      createNotification(
        userId,
        "new_order",
        "🛒 طلب جديد يحتاج مراجعة",
        `طلب #${existing.id} من ${existing.customerName} — الإجمالي: ${existing.total} ر.س`,
        "/orders",
      ).catch(() => { });
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, "processOrderAction error");
  }
}

/** معالجة صورة الإيداع — يحفظها ويحول الطلب لـ pending_review */
export async function handleDepositMedia(
  userId: number,
  conversationId: number,
  mediaUrl: string,
): Promise<boolean> {
  try {
    const existing = await getActiveOrder(userId, conversationId);
    if (!existing) return false;
    await db
      .update(ordersTable)
      .set({
        depositMediaUrl: mediaUrl,
        status: "pending_review",
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, existing.id));
    logger.info({ userId, orderId: existing.id }, "Deposit media saved");
    await sendReviewNotification(userId, existing.id);
    return true;
  } catch (err) {
    logger.error({ err, userId }, "handleDepositMedia error");
    return false;
  }
}



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم الثالث: إعدادات الوكيل العامة (من لوحة الأدمن)
// SECTION 3: Global Agent Settings
//
// الإعدادات التي يتحكم فيها الأدمن وتؤثر على جميع المستخدمين
// تُحفظ في جدول system_settings بمفاتيح تبدأ بـ agent_default_
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GlobalAgentSettings {
  dialect?: string;
  dialectStrength?: number;
  style?: string;
  tone?: string;
  persuasion?: number;
  formality?: number;
  emojiLevel?: string;
  replyLength?: string;
  openingMessage?: string | null;
  closingMessage?: string | null;
  stratFollowup?: boolean;
  stratCart?: boolean;
  stratUpsell?: boolean;
  stratPromo?: boolean;
  stratReview?: boolean;
  orderSystemEnabled?: boolean;
  returnSystemEnabled?: boolean;
  sendProductImages?: boolean;
  maxTokens?: number;
  responseDelay?: number;
  convWindow?: number;
  lowStockThreshold?: number;
  groupReplyMode?: string;
  profileExtraction?: boolean;
  negotiationEnabled?: boolean;
  sessionGapHours?: number;
  couponTiming?: string;
  adminOverride?: boolean;
  defaultDepositTolerance?: number;
}

export let _globalAgentCache: GlobalAgentSettings | null = null;
export let _globalAgentCachedAt = 0;
export const GLOBAL_AGENT_TTL = 30_000; // 30 ثانية

export async function getGlobalAgentSettings(): Promise<GlobalAgentSettings> {
  const now = Date.now();
  if (_globalAgentCache && now - _globalAgentCachedAt < GLOBAL_AGENT_TTL)
    return _globalAgentCache;
  try {
    const allRows = await db.select().from(systemSettingsTable);
    const map: Record<string, string> = {};
    for (const r of allRows) map[r.key] = r.value;

    const g = (k: string) => map[`agent_default_${k}`];
    const gBool = (k: string) => {
      const v = g(k);
      return v === undefined ? undefined : v === "true";
    };
    const gNum = (k: string) => {
      const v = g(k);
      if (v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const result: GlobalAgentSettings = {
      dialect: g("dialect"),
      dialectStrength: gNum("dialect_strength"),
      style: g("style"),
      tone: g("tone"),
      persuasion: gNum("persuasion"),
      formality: gNum("formality"),
      emojiLevel: g("emoji_level"),
      replyLength: g("reply_length"),
      openingMessage: g("opening_message") ?? null,
      closingMessage: g("closing_message") ?? null,
      stratFollowup: gBool("strat_followup"),
      stratCart: gBool("strat_cart"),
      stratUpsell: gBool("strat_upsell"),
      stratPromo: gBool("strat_promo"),
      stratReview: gBool("strat_review"),
      orderSystemEnabled: gBool("order_system"),
      returnSystemEnabled: gBool("return_system"),
      sendProductImages: gBool("send_images"),
      maxTokens: gNum("max_tokens"),
      responseDelay: gNum("response_delay"),
      convWindow: gNum("conv_window"),
      lowStockThreshold: gNum("low_stock_threshold"),
      groupReplyMode: g("group_reply_mode"),
      profileExtraction: gBool("profile_extraction"),
      negotiationEnabled: gBool("negotiation_enabled"),
      sessionGapHours: gNum("session_gap_hours"),
      couponTiming: g("coupon_timing"),
      adminOverride: map["agent_admin_override"] === "true" ? true : undefined,
      defaultDepositTolerance: gNum("default_deposit_tolerance"),
    };
    _globalAgentCache = result;
    _globalAgentCachedAt = now;
    return result;
  } catch {
    return _globalAgentCache ?? {};
  }
}

// ── إعدادات Buffer ──────────────────────────────────────────────────────────
export const MAX_WAIT_MS = 120_000;

export const BUFFER_DEFAULTS = {
  message_wait_ms: 6_000,
  composing_wait_ms: 15_000,
};

interface BufferSettings {
  messageWaitMs: number;
  composingWaitMs: number;
}

export let _bufferSettingsCache: BufferSettings | null = null;
export let _bufferSettingsCachedAt = 0;
export const BUFFER_SETTINGS_TTL = 30_000;

export async function getBufferSettings(): Promise<BufferSettings> {
  const now = Date.now();
  if (
    _bufferSettingsCache &&
    now - _bufferSettingsCachedAt < BUFFER_SETTINGS_TTL
  )
    return _bufferSettingsCache;
  try {
    const allRows = await db.select().from(systemSettingsTable);
    const map: Record<string, string> = {};
    for (const r of allRows) map[r.key] = r.value;
    const parse = (key: string, def: number) => {
      const v = Number(map[key]);
      return Number.isFinite(v) && v > 0 ? v : def;
    };
    _bufferSettingsCache = {
      messageWaitMs: parse(
        "buffer_message_wait_ms",
        BUFFER_DEFAULTS.message_wait_ms,
      ),
      composingWaitMs: parse(
        "buffer_composing_wait_ms",
        BUFFER_DEFAULTS.composing_wait_ms,
      ),
    };
    _bufferSettingsCachedAt = now;
    return _bufferSettingsCache;
  } catch {
    return {
      messageWaitMs: BUFFER_DEFAULTS.message_wait_ms,
      composingWaitMs: BUFFER_DEFAULTS.composing_wait_ms,
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم الرابع: منع التكرار وحماية الفيضان
// SECTION 4: Deduplication & Flood Protection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// منع معالجة نفس الرسالة مرتين خلال 60 ثانية
export const recentMessages = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 90_000;
  for (const [k, ts] of recentMessages) {
    if (ts < cutoff) recentMessages.delete(k);
  }
}, 30_000);

export function isDuplicate(userId: number, phone: string, text: string): boolean {
  const key = `${userId}:${phone}:${text.slice(0, 200)}`;
  const last = recentMessages.get(key);
  const now = Date.now();
  if (last && now - last < 60_000) return true;
  recentMessages.set(key, now);
  return false;
}

// الحد الأقصى للصور: 3 صور كل 10 دقائق من نفس العميل
export const IMAGE_FLOOD_WINDOW_MS = 10 * 60 * 1000;
export const IMAGE_FLOOD_LIMIT = 3;
export const recentImageTimestamps = new Map<string, number[]>();
setInterval(() => {
  const cutoff = Date.now() - IMAGE_FLOOD_WINDOW_MS;
  for (const [k, ts] of recentImageTimestamps) {
    const filtered = ts.filter((t) => t > cutoff);
    if (filtered.length === 0) recentImageTimestamps.delete(k);
    else recentImageTimestamps.set(k, filtered);
  }
}, 60_000);

export function countRecentImages(userId: number, phone: string): number {
  const key = `${userId}:${phone}`;
  const cutoff = Date.now() - IMAGE_FLOOD_WINDOW_MS;
  return (recentImageTimestamps.get(key) ?? []).filter((t) => t > cutoff)
    .length;
}

export function trackImage(userId: number, phone: string): void {
  const key = `${userId}:${phone}`;
  const cutoff = Date.now() - IMAGE_FLOOD_WINDOW_MS;
  const ts = (recentImageTimestamps.get(key) ?? []).filter((t) => t > cutoff);
  ts.push(Date.now());
  recentImageTimestamps.set(key, ts);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم الخامس: تجميع الرسائل وتأخير الرد (Buffer & Debounce)
// SECTION 5: Message Buffer & Debounce
//
// يجمع الرسائل المتعددة من نفس العميل قبل إرسالها للـ AI دفعة واحدة.
// يمتد الانتظار إذا كان العميل لا يزال يكتب (composing event).
//
//   message_wait_ms   — الانتظار بعد آخر رسالة (افتراضي 6 ثواني)
//   composing_wait_ms — الانتظار بعد إشعار الكتابة (افتراضي 15 ثانية)
//   MAX_WAIT_MS       — الحد الأقصى المطلق (120 ثانية، غير قابل للتغيير)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TextBuffer {
  texts: string[];
  customerName: string;
  isGroup: boolean;
  timer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}
export const textBuffers = new Map<string, TextBuffer>();

export function flushBuffer(
  userId: number,
  customerPhone: string,
  buf: TextBuffer,
): void {
  const combined = buf.texts.join("\n");
  logger.info(
    { userId, customerPhone, count: buf.texts.length, combined },
    "Flushing buffer — calling LLM",
  );
  processTextFlow(
    userId,
    customerPhone,
    buf.customerName,
    combined,
    buf.isGroup,
  ).catch((err: unknown) =>
    logger.error({ err, userId }, "Debounced processTextFlow error"),
  );
}

export function setTimer(
  key: string,
  userId: number,
  customerPhone: string,
  delayMs: number,
): void {
  const buf = textBuffers.get(key);
  if (!buf) return;
  clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    const b = textBuffers.get(key);
    textBuffers.delete(key);
    if (b) {
      clearTimeout(b.maxTimer);
      flushBuffer(userId, customerPhone, b);
    }
  }, delayMs);
}

/** رسالة نصية جديدة — تُضاف للـ buffer ويُعاد ضبط المؤقت */
export async function bufferAndProcess(
  userId: number,
  customerPhone: string,
  customerName: string,
  text: string,
  isGroup = false,
): Promise<void> {
  const { messageWaitMs } = await getBufferSettings();
  const key = `${userId}:${customerPhone}`;
  const existing = textBuffers.get(key);

  if (existing) {
    existing.texts.push(text);
    existing.customerName = customerName;
    setTimer(key, userId, customerPhone, messageWaitMs);
    logger.info(
      {
        userId,
        customerPhone,
        bufferedCount: existing.texts.length,
        messageWaitMs,
      },
      "Message buffered",
    );
    return;
  }

  const buf: TextBuffer = {
    texts: [text],
    customerName,
    isGroup,
    timer: null as unknown as ReturnType<typeof setTimeout>,
    maxTimer: null as unknown as ReturnType<typeof setTimeout>,
  };

  buf.timer = setTimeout(() => {
    const b = textBuffers.get(key);
    textBuffers.delete(key);
    if (b) {
      clearTimeout(b.maxTimer);
      flushBuffer(userId, customerPhone, b);
    }
  }, messageWaitMs);

  buf.maxTimer = setTimeout(() => {
    const b = textBuffers.get(key);
    textBuffers.delete(key);
    if (b) {
      clearTimeout(b.timer);
      flushBuffer(userId, customerPhone, b);
    }
  }, MAX_WAIT_MS);

  textBuffers.set(key, buf);
  logger.info({ userId, customerPhone, messageWaitMs }, "Buffer created");
}

/** إشعار "composing" (العميل يكتب) — يمتد المؤقت الحالي */
export async function handleCustomerTyping(
  userId: number,
  customerPhone: string,
): Promise<void> {
  const { composingWaitMs } = await getBufferSettings();
  const key = `${userId}:${customerPhone}`;
  if (textBuffers.has(key)) {
    setTimer(key, userId, customerPhone, composingWaitMs);
    logger.info(
      { userId, customerPhone, composingWaitMs },
      "Composing — timer reset",
    );
    return;
  }
  // LID fallback: Evolution API قد يستخدم تنسيق JID مختلف
  for (const [k] of textBuffers) {
    if (k.startsWith(`${userId}:`)) {
      const phone = k.slice(k.indexOf(":") + 1);
      setTimer(k, userId, phone, composingWaitMs);
      logger.info(
        { userId, phone, composingId: customerPhone, composingWaitMs },
        "Composing (LID fallback)",
      );
      return;
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم السادس: دوال مساعدة
// SECTION 6: Utility Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// حفظ وسائط الإيداع محلياً لتجنب انتهاء صلاحية روابط WhatsApp CDN
export const UPLOADS_DIR = nodePath.join(process.cwd(), "public/uploads");

export async function saveDepositMediaLocally(
  base64: string,
  mimetype: string,
): Promise<string | null> {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const ext = mimetype.includes("pdf")
      ? "pdf"
      : mimetype.includes("png")
        ? "png"
        : mimetype.includes("webp")
          ? "webp"
          : "jpg";
    const filename = `deposit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await fs.writeFile(
      nodePath.join(UPLOADS_DIR, filename),
      Buffer.from(base64, "base64"),
    );
    return `/api/uploads/${filename}`;
  } catch (err) {
    logger.error({ err }, "saveDepositMediaLocally failed");
    return null;
  }
}

export function getPublicImageUrl(imageUrl: string): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  const domain =
    process.env["RENDER_EXTERNAL_URL"]?.replace(/^https?:\/\//, "");
  if (!domain) return imageUrl; // Last resort, just return the relative path hoping the client appends domain
  return `https://${domain.replace(/\/$/, "")}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

/** تحويل رموز العملات لأسماء عربية مقروءة */
export function humanCurrency(code: string | null | undefined): string {
  if (!code) return "";
  const map: Record<string, string> = {
    YER: "ريال يمني",
    SAR: "ريال سعودي",
    USD: "دولار أمريكي",
    AED: "درهم إماراتي",
    QAR: "ريال قطري",
    KWD: "دينار كويتي",
    BHD: "دينار بحريني",
    OMR: "ريال عُماني",
    EGP: "جنيه مصري",
    JOD: "دينار أردني",
  };
  return map[code.toUpperCase()] ?? code;
}

/** يزيل قسم المنتجات من السياق عندما يجد البحث المتجهي نتائج أفضل */
export function stripProductsFromContext(ctx: string): string {
  const productsMarker = "\n=== المنتجات";
  const deliveryMarker = "\n=== سياسة التوصيل";
  const pi = ctx.indexOf(productsMarker);
  if (pi === -1) return ctx;
  const di = ctx.indexOf(deliveryMarker);
  return ctx.slice(0, pi) + (di !== -1 ? ctx.slice(di) : "");
}

/**
 * تنظيف رد النموذج من JSON والكتل البرمجية.
 * يكشف أيضاً إذا كان النموذج يعيد نص الـ system prompt (تسرب).
 */
export function cleanReplyText(text: string): string {
  let out = text.replace(/```[\s\S]*?```/g, "").trim();
  out = out.replace(/\n\s*[\[{][\s\S]*[\]}]\s*$/, "").trim();
  if (/^\s*[\[{][\s\S]*[\]}]\s*$/.test(out)) return "";

  const SYSTEM_PROMPT_MARKERS = [
    "تحدث باللهجة",
    "استخدم الاسم الأول فقط",
    "قواعد التفاعل الأساسية",
    "قاعدة صارمة لا تُخالَف",
    "استراتيجية التفاوض الذكية",
    "نظام الطلبات والاسترجاع",
    "هذه المعلومات مسجّلة",
    "بيانات المتجر الكاملة",
    "الذاكرة وسياق المحادثة",
    "كيف تستخدم البيانات",
  ];
  if (SYSTEM_PROMPT_MARKERS.some((marker) => out.includes(marker))) {
    logger.warn(
      { leaked: out.slice(0, 100) },
      "System prompt leakage detected — discarding reply",
    );
    return "";
  }
  return out;
}

/** مقارنة أرقام الجوال (آخر 9 أرقام فقط لتجاهل كود الدولة) */
export function phonesMatch(a: string, b: string): boolean {
  const cleanA = a.replace(/[^0-9]/g, "").slice(-9);
  const cleanB = b.replace(/[^0-9]/g, "").slice(-9);
  return cleanA.length >= 7 && cleanA === cleanB;
}

/** إشعار الأدمن عند فشل مفتاح AI */
export async function notifyAdminKeyFailed(
  wa:
    | {
      baseUrl?: string | null;
      apiKey?: string | null;
      instanceName?: string | null;
    }
    | null
    | undefined,
  keyName: string,
  userId: number,
): Promise<void> {
  try {
    const [setting] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "admin_whatsapp_number"))
      .limit(1);
    const adminNumber = setting?.value;
    if (!adminNumber || !wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;
    const msg = `⚠️ تنبيه: المفتاح "${keyName}" توقف عن العمل للمستخدم #${userId}. تم الانتقال تلقائياً للمفتاح التالي.`;
    await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      adminNumber,
      msg,
    );
  } catch (err) {
    logger.error({ err }, "Failed to notify admin of key failure");
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم السابع: معالجة رسائل صاحب العمل
// SECTION 7: Owner Message Handler
//
// عندما يرسل صاحب العمل رسالة من رقم المراجعة المحدد في الإعدادات،
// يستجيب الوكيل بنظام خاص لإدارة الطلبات:
//   "طلب X موافق"   → قبول الطلب وإرسال فاتورة
//   "طلب X مرفوض"  → رفض الطلب
//   "الطلبات"       → عرض ملخص الطلبات النشطة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function handleOwnerMessage(
  userId: number,
  waConfig: { baseUrl: string; apiKey: string; instanceName: string },
  ownerPhone: string,
  text: string,
): Promise<void> {
  const send = (msg: string) =>
    enqueueOutgoing(userId, ownerPhone, async () => {
      await sendEvolutionMessage(waConfig, ownerPhone, msg);
    });

  // 1. تحليل أمر القبول: "طلب 34 موافق"، "34 تم"، "وافق 12"، "قبلت 8"
  const approvalPattern =
    /(?:(?:طلب|order)\s*#?(\d+)\s*(?:تم|موافق|مقبول|صحيح|قبلت?|تأكيد|ok|approved))|(?:(?:تم|موافق|مقبول|صحيح|قبلت?|تأكيد|ok|approved)\s*(?:طلب|order)?\s*#?(\d+))/i;
  const match = text.match(approvalPattern);
  const orderIdStr = match?.[1] ?? match?.[2];

  if (orderIdStr) {
    const orderId = parseInt(orderIdStr, 10);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
      .limit(1);

    if (!order) {
      await send(`❌ لم يُعثر على طلب رقم #${orderId}`);
      return;
    }

    if (order.status !== "pending_review") {
      const STATUS_LABELS: Record<string, string> = {
        draft: "مسودة",
        pending_payment: "ينتظر الدفع",
        pending_review: "ينتظر المراجعة",
        approved: "مقبول",
        delivered: "تم التسليم",
        rejected: "مرفوض",
        cancelled: "ملغى",
        returned: "مسترجع",
      };
      await send(
        `⚠️ الطلب #${orderId} ليس في انتظار مراجعة\nالحالة الحالية: ${STATUS_LABELS[order.status] ?? order.status}`,
      );
      return;
    }

    // قبول الطلب
    await db
      .update(ordersTable)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));

    // إشعار العميل وإرسال الفاتورة
    const customerPhone = order.senderPhone || order.customerPhone || null;
    if (customerPhone) {
      await sendEvolutionMessage(
        waConfig,
        customerPhone,
        `✅ تم قبول طلبك رقم #${orderId}! جاري التحضير للتسليم. شكراً لك 🎉`,
      ).catch(() => { });
      const [us] = await db
        .select({ invoiceEnabled: userSettingsTable.invoiceEnabled })
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);
      if (us?.invoiceEnabled !== false) {
        generateAndSendInvoice(userId, orderId).catch(() => { });
      }
    }

    await send(`✅ تم قبول الطلب #${orderId} وإشعار العميل`);
    return;
  }

  // 2. تحليل أمر الرفض: "طلب 34 مرفوض"، "ملغى 12"
  const rejectionPattern =
    /(?:(?:طلب|order)\s*#?(\d+)\s*(?:مرفوض|رفض|لا|ملغى))|(?:(?:مرفوض|رفض|ملغى)\s*(?:طلب|order)?\s*#?(\d+))/i;
  const rMatch = text.match(rejectionPattern);
  const rOrderIdStr = rMatch?.[1] ?? rMatch?.[2];

  if (rOrderIdStr) {
    const orderId = parseInt(rOrderIdStr, 10);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId)))
      .limit(1);

    if (!order || order.status !== "pending_review") {
      await send(`❌ الطلب #${orderId} غير موجود أو ليس في انتظار المراجعة`);
      return;
    }
    await db
      .update(ordersTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
    const customerPhone = order.senderPhone || order.customerPhone || null;
    if (customerPhone) {
      await sendEvolutionMessage(
        waConfig,
        customerPhone,
        `❌ عذراً، تم رفض طلبك رقم #${orderId}. للاستفسار تواصل معنا.`,
      ).catch(() => { });
    }
    await send(`🚫 تم رفض الطلب #${orderId} وإشعار العميل`);
    return;
  }

  // 3. عرض ملخص الطلبات النشطة
  const summaryTriggers = [
    "الطلبات",
    "طلبات",
    "ماعندي",
    "ما عندي",
    "كم طلب",
    "status",
    "الوضع",
    "ملخص",
  ];
  if (summaryTriggers.some((t) => text.includes(t)) || text.trim().length < 6) {
    const pending = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, userId),
          inArray(
            ordersTable.status as never,
            ["pending_review", "pending_payment", "approved"] as never[],
          ),
        ),
      )
      .orderBy(desc(ordersTable.id))
      .limit(10);

    if (pending.length === 0) {
      await send("📋 لا توجد طلبات نشطة حالياً");
    } else {
      const STATUS_EMOJI: Record<string, string> = {
        pending_review: "🔍",
        pending_payment: "💳",
        approved: "✅",
      };
      const lines = pending.map((o) => {
        const emoji = STATUS_EMOJI[o.status] ?? "📦";
        return `${emoji} #${o.id} — ${o.customerName ?? "—"} — ${o.total ?? "—"}`;
      });
      await send(
        `📋 الطلبات النشطة (${pending.length}):\n${lines.join("\n")}\n\nللقبول: "طلب X موافق"\nللرفض: "طلب X مرفوض"`,
      );
    }
    return;
  }

  // 4. رد ذكاء اصطناعي في وضع صاحب العمل
  const [settings] = await db
    .select({ chatKeyId: userSettingsTable.chatKeyId })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId))
    .limit(1);
  if (settings?.chatKeyId) {
    const [chatKey] = await db
      .select()
      .from(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.id, settings.chatKeyId),
          eq(apiKeysTable.status, "active"),
        ),
      )
      .limit(1);
    if (chatKey) {
      const systemPrompt = `أنت مساعد ذكي لصاحب العمل. تعرف كل شيء عن المتجر. تحدث بشكل مباشر ومختصر.\nللقبول: "طلب X موافق" | للرفض: "طلب X مرفوض" | لعرض الطلبات: "الطلبات"`;
      const result = await generateGroqReply(
        chatKey.apiKey,
        chatKey.model || "llama-3.3-70b-versatile",
        text,
        systemPrompt,
        [],
        undefined,
        600,
      ).catch(() => null);
      if (result?.text) {
        await send(result.text);
        return;
      }
    }
  }
  await send(
    `مرحباً! للقبول على طلب: "طلب [رقم] موافق"\nللرفض: "طلب [رقم] مرفوض"\nلعرض الطلبات: "الطلبات"`,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم الثامن: حلقة معالجة الذكاء الاصطناعي الرئيسية
// SECTION 8: Core AI Processing Loop (processTextFlow)
//
// هذه الدالة هي قلب الوكيل — تُستدعى لكل رسالة نصية من العميل:
//   1. تحميل بيانات المستخدم والإعدادات
//   2. بناء السياق (معلومات المتجر + الطلب النشط + الكوبونات)
//   3. البحث المتجهي عن المنتجات ذات الصلة
//   4. اختيار مفتاح AI والاتصال بالنموذج
//   5. معالجة tool calls (الطلبات / الاسترجاع)
//   6. إرسال الرد للعميل عبر واتساب
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// القسم التاسع: معالج أحداث الويب هوك
// SECTION 9: Webhook Event Processor
//
// نقطة الدخول الرئيسية من Evolution API — يُحلل الحدث ويُوجهه:
//   PRESENCE_UPDATE  → handleCustomerTyping (يمتد مؤقت الـ buffer)
//   MESSAGES_UPSERT  → bufferAndProcess / processTextFlow / معالجة الوسائط
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function jidToPhone(jid: string): string {
  return jid
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/@g\.us$/, "")
    .trim();
}

export function extractPresencePhone(body: Record<string, unknown>): string | null {
  const data = body["data"];
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    const jid =
      (first["jid"] as string | undefined) ??
      (first["remoteJid"] as string | undefined) ??
      (first["id"] as string | undefined);
    return jid ? jidToPhone(jid) : null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const idA = d["id"] as string | undefined;
  if (idA?.includes("@")) return jidToPhone(idA);
  const idB = d["remoteJid"] as string | undefined;
  if (idB?.includes("@")) return jidToPhone(idB);
  const idD = d["from"] as string | undefined;
  if (idD?.includes("@")) return jidToPhone(idD);
  const presences = d["presences"] as Record<string, unknown> | undefined;
  if (presences) {
    const firstKey = Object.keys(presences)[0];
    if (firstKey?.includes("@")) return jidToPhone(firstKey);
  }
  return null;
}

export function extractPresenceStatus(body: Record<string, unknown>): string | null {
  const data = body["data"];
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    return (
      (first?.["presence"] as string | undefined) ??
      (first?.["lastKnownPresence"] as string | undefined) ??
      (first?.["status"] as string | undefined) ??
      null
    );
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const direct =
    (d["presence"] as string | undefined) ??
    (d["lastKnownPresence"] as string | undefined) ??
    (d["type"] as string | undefined);
  if (direct) return direct;
  const presences = d["presences"] as
    | Record<string, Record<string, string>>
    | undefined;
  if (presences) {
    const firstEntry = Object.values(presences)[0];
    return (
      firstEntry?.["lastKnownPresence"] ?? firstEntry?.["presence"] ?? null
    );
  }
  return null;
}

import { processTextFlow, processEvolutionPayload } from "./agentBrain.js";
export { processTextFlow, processEvolutionPayload };
