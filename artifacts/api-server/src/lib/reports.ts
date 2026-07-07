import { db } from "@workspace/db";
import {
  userSettingsTable,
  whatsappConnectionsTable,
  ordersTable,
  productsTable,
  conversationsTable,
  messagesTable,
  businessesTable,
} from "@workspace/db/schema";
import { eq, and, gte, lt, count, isNull, or, inArray } from "drizzle-orm";
import { sendEvolutionMessage } from "./providers/evolution.js";
import { logger } from "./logger.js";

export type ReportPeriod = "daily" | "weekly" | "monthly";

// ── Date helpers ──────────────────────────────────────────────────────────────
function getPeriodBounds(period: ReportPeriod): {
  start: Date;
  prev: Date;
  prevEnd: Date;
  label: string;
} {
  const now = new Date();

  if (period === "daily") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 1);
    const prevEnd = new Date(start);
    return { start, prev, prevEnd, label: "اليومي" };
  }

  if (period === "weekly") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 7);
    const prevEnd = new Date(start);
    return { start, prev, prevEnd, label: "الأسبوعي" };
  }

  // monthly
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(start);
  return { start, prev, prevEnd, label: "الشهري" };
}

function formatGrowth(current: number, prev: number): string {
  if (prev === 0 && current === 0) return "";
  if (prev === 0) return " 🆕";
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return ` 📈 +${pct}%`;
  if (pct < 0) return ` 📉 ${pct}%`;
  return " ↔️ 0%";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "long" });
}

function formatTime(): string {
  return new Date().toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Build & send one report ───────────────────────────────────────────────────
export async function buildAndSendReport(userId: number, period: ReportPeriod): Promise<boolean> {
  try {
    const { start, prev, prevEnd, label } = getPeriodBounds(period);
    const now = new Date();

    const [wa, settings, biz] = await Promise.all([
      db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, userId)).limit(1).then(r => r[0]),
      db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1).then(r => r[0]),
      db.select({ name: businessesTable.name }).from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1).then(r => r[0]),
    ]);

    const managerPhone = settings?.reportManagerPhone?.trim();
    if (!managerPhone || !wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
      logger.warn({ userId }, "Report: missing manager phone or WA config — skipping");
      return false;
    }

    const waConfig = { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName };
    const storeName = biz?.name ?? "المتجر";

    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [
      currentOrders,
      prevOrders,
      currentConvs,
      prevConvs,
      currentMsgs,
      prevMsgs,
      pendingOrders,
      allProducts,
    ] = await Promise.all([
      db.select().from(ordersTable).where(
        and(eq(ordersTable.userId, userId), gte(ordersTable.createdAt, start))
      ),
      db.select().from(ordersTable).where(
        and(eq(ordersTable.userId, userId), gte(ordersTable.createdAt, prev), lt(ordersTable.createdAt, start))
      ),
      db.select({ count: count() }).from(conversationsTable).where(
        and(eq(conversationsTable.userId, userId), gte(conversationsTable.createdAt, start))
      ).then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(conversationsTable).where(
        and(eq(conversationsTable.userId, userId), gte(conversationsTable.createdAt, prev), lt(conversationsTable.createdAt, start))
      ).then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(messagesTable)
        .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
        .where(and(eq(conversationsTable.userId, userId), gte(messagesTable.createdAt, start)))
        .then(r => Number(r[0]?.count ?? 0)),
      db.select({ count: count() }).from(messagesTable)
        .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
        .where(and(eq(conversationsTable.userId, userId), gte(messagesTable.createdAt, prev), lt(messagesTable.createdAt, start)))
        .then(r => Number(r[0]?.count ?? 0)),
      db.select().from(ordersTable).where(
        and(eq(ordersTable.userId, userId), eq(ordersTable.status, "pending_review"))
      ),
      db.select().from(productsTable).where(
        and(eq(productsTable.userId, userId), eq(productsTable.status, "active"))
      ),
    ]);

    // ── Metrics ──────────────────────────────────────────────────────────────
    const completed = currentOrders.filter(o => !["draft", "cancelled"].includes(o.status));
    const prevCompleted = prevOrders.filter(o => !["draft", "cancelled"].includes(o.status));

    const currentRevenue = completed.reduce((s, o) => s + parseFloat(o.total || "0"), 0);
    const prevRevenue    = prevCompleted.reduce((s, o) => s + parseFloat(o.total || "0"), 0);
    const avgOrder       = completed.length > 0 ? currentRevenue / completed.length : 0;
    const prevAvgOrder   = prevCompleted.length > 0 ? prevRevenue / prevCompleted.length : 0;

    // ── Top products by revenue ───────────────────────────────────────────────
    const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const order of completed) {
      try {
        const items = JSON.parse(order.items) as Array<{ name: string; qty?: number; total?: string; price?: string }>;
        for (const item of items) {
          const key = item.name;
          if (!prodMap[key]) prodMap[key] = { name: key, qty: 0, revenue: 0 };
          prodMap[key]!.qty += item.qty ?? 1;
          prodMap[key]!.revenue += parseFloat(item.total ?? item.price ?? "0");
        }
      } catch (err) { logger.warn({ err, orderId: order.id }, "reports: malformed items JSON"); }
    }
    const topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 3);

    // ── Low stock ─────────────────────────────────────────────────────────────
    const threshold = settings?.lowStockThreshold ?? 5;
    const lowStock = allProducts.filter(p => p.qty !== null && p.qty <= threshold);

    // ── Conversion rate ────────────────────────────────────────────────────────
    const convRate = currentConvs > 0 ? Math.round((completed.length / currentConvs) * 100) : 0;

    // ── Smart recommendations ─────────────────────────────────────────────────
    const recs: string[] = [];
    if (completed.length === 0 && currentConvs > 0)
      recs.push("💡 لديك عملاء يتصفحون دون شراء — جرّب تفعيل استراتيجية الإقناع أو أطلق كوبون خصم.");
    if (lowStock.length > 0)
      recs.push(`⚠️ ${lowStock.length} منتج على وشك النفاد — أعِد التخزين لتجنب خسارة مبيعات.`);
    if (currentRevenue < prevRevenue && prevRevenue > 0) {
      const drop = Math.round(((prevRevenue - currentRevenue) / prevRevenue) * 100);
      recs.push(`📉 الإيرادات انخفضت ${drop}% — فكّر في إطلاق عرض أو التواصل مع العملاء غير النشطين.`);
    }
    if (pendingOrders.length >= 3)
      recs.push(`🔔 ${pendingOrders.length} طلبات تنتظر مراجعتك — لا تُبطئ تجربة عملائك!`);
    if (avgOrder > prevAvgOrder * 1.15 && prevAvgOrder > 0)
      recs.push("🎯 متوسط قيمة الطلب ارتفع — العملاء يشترون أكثر، فكّر في منتجات premium أو حزم مجمّعة.");
    if (convRate >= 30)
      recs.push(`🏆 معدل التحويل ${convRate}% — أداء الوكيل ممتاز! واصل.`);
    if (completed.length > 0 && topProducts.length > 0)
      recs.push(`⭐ ${topProducts[0]!.name} هو نجم المبيعات — تأكد من توفره دائماً.`);
    if (recs.length === 0)
      recs.push("✅ كل شيء يسير على ما يُرام — واصل وكلّنا ثقة بنجاحك!");

    // ── Format message ────────────────────────────────────────────────────────
    const periodIcons: Record<ReportPeriod, string> = { daily: "📅", weekly: "📆", monthly: "🗓️" };
    const lines: string[] = [];

    lines.push(`${periodIcons[period]} *التقرير ${label} — ${storeName}*`);
    lines.push(`_${formatDate(start)} — ${formatDate(now)}_`);
    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push("💰 *الإيرادات والطلبات*");
    lines.push(`• الإيرادات: *${currentRevenue.toFixed(0)} ر.س*${formatGrowth(currentRevenue, prevRevenue)}`);
    lines.push(`• الطلبات المكتملة: *${completed.length}*${formatGrowth(completed.length, prevCompleted.length)}`);
    lines.push(`• متوسط قيمة الطلب: *${avgOrder.toFixed(0)} ر.س*${formatGrowth(avgOrder, prevAvgOrder)}`);
    lines.push("");
    lines.push("💬 *نشاط العملاء*");
    lines.push(`• محادثات جديدة: *${currentConvs}*${formatGrowth(currentConvs, prevConvs)}`);
    lines.push(`• رسائل مستقبَلة: *${currentMsgs}*${formatGrowth(currentMsgs, prevMsgs)}`);
    lines.push(`• معدل التحويل: *${convRate}%*`);

    if (topProducts.length > 0) {
      lines.push("");
      lines.push("🏆 *أفضل المنتجات مبيعاً*");
      const medals = ["🥇", "🥈", "🥉"];
      topProducts.forEach((p, i) => {
        lines.push(`${medals[i] ?? "•"} ${p.name}: ${p.revenue.toFixed(0)} ر.س (${p.qty} وحدة)`);
      });
    }

    if (pendingOrders.length > 0) {
      lines.push("");
      lines.push(`⏳ *${pendingOrders.length} طلب ينتظر مراجعتك*`);
      lines.push("ادخل لوحة التحكم لمراجعتها وتأكيدها.");
    }

    if (lowStock.length > 0) {
      lines.push("");
      lines.push(`⚠️ *مخزون منخفض — ${lowStock.length} منتج*`);
      lowStock.slice(0, 4).forEach(p => {
        lines.push(`• ${p.name}: متبقي *${p.qty}* ${p.unit ?? ""}`);
      });
      if (lowStock.length > 4) lines.push(`... و${lowStock.length - 4} منتجات أخرى.`);
    }

    lines.push("");
    lines.push("━━━━━━━━━━━━━━━━━━");
    lines.push("💡 *التوصيات الذكية*");
    recs.forEach(r => lines.push(r));
    lines.push("");
    lines.push(`_وكيل المبيعات الذكي · ${formatTime()}_`);

    const message = lines.join("\n");
    const sent = await sendEvolutionMessage(waConfig, managerPhone, message);
    if (sent) {
      logger.info({ userId, period, managerPhone }, "Scheduled report sent");
    } else {
      logger.warn({ userId, period }, "Report send failed (WA error)");
    }
    return sent;
  } catch (err) {
    logger.error({ err, userId, period }, "buildAndSendReport error");
    return false;
  }
}

// ── Scheduler logic ───────────────────────────────────────────────────────────
function shouldSend(
  frequency: string,
  reportTime: string,
  lastSentAt: Date | null,
  period: ReportPeriod,
): boolean {
  const serverNow = new Date();
  // Get KSA Time explicitly
  const ksaNowString = serverNow.toLocaleString("en-US", { timeZone: "Asia/Riyadh" });
  const now = new Date(ksaNowString);

  const [hStr, mStr] = reportTime.split(":");
  const targetHour = parseInt(hStr ?? "8", 10);
  const targetMin  = parseInt(mStr ?? "0", 10);

  // Must be within the target minute
  if (now.getHours() !== targetHour || now.getMinutes() !== targetMin) return false;

  // Support comma-separated multi-select (e.g. "daily,weekly") and legacy "all"
  const selected = frequency === "all"
    ? ["daily", "weekly", "monthly"]
    : frequency.split(",").map((s) => s.trim()).filter(Boolean);

  if (period === "daily") {
    if (!selected.includes("daily")) return false;
    if (!lastSentAt) return true;
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    return lastSentAt < todayMidnight;
  }

  if (period === "weekly") {
    if (!selected.includes("weekly")) return false;
    if (now.getDay() !== 0) return false; // Sundays only
    if (!lastSentAt) return true;
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return lastSentAt < weekAgo;
  }

  if (period === "monthly") {
    if (!selected.includes("monthly")) return false;
    if (now.getDate() !== 1) return false; // 1st of month
    if (!lastSentAt) return true;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return lastSentAt < monthStart;
  }

  return false;
}

export async function runReportScheduler(): Promise<void> {
  try {
    const rows = await db
      .select({
        userId: userSettingsTable.userId,
        reportFrequency: userSettingsTable.reportFrequency,
        reportTime: userSettingsTable.reportTime,
        reportManagerPhone: userSettingsTable.reportManagerPhone,
        lastDailyReportAt: userSettingsTable.lastDailyReportAt,
        lastWeeklyReportAt: userSettingsTable.lastWeeklyReportAt,
        lastMonthlyReportAt: userSettingsTable.lastMonthlyReportAt,
      })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.reportEnabled, true));

    for (const row of rows) {
      if (!row.reportManagerPhone?.trim()) continue;

      const freq = row.reportFrequency ?? "daily";
      const time = row.reportTime ?? "08:00";

      const checks: Array<{ period: ReportPeriod; lastSent: Date | null; field: string }> = [
        { period: "daily",   lastSent: row.lastDailyReportAt,   field: "lastDailyReportAt" },
        { period: "weekly",  lastSent: row.lastWeeklyReportAt,  field: "lastWeeklyReportAt" },
        { period: "monthly", lastSent: row.lastMonthlyReportAt, field: "lastMonthlyReportAt" },
      ];

      for (const { period, lastSent, field } of checks) {
        if (!shouldSend(freq, time, lastSent, period)) continue;

        const sent = await buildAndSendReport(row.userId, period);
        if (sent) {
          await db
            .update(userSettingsTable)
            .set({ [field]: new Date() } as Partial<typeof userSettingsTable.$inferInsert>)
            .where(eq(userSettingsTable.userId, row.userId));
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "runReportScheduler error");
  }
}

export function startReportScheduler(): void {
  setInterval(() => {
    runReportScheduler().catch((err) => logger.error({ err }, "Report scheduler tick failed"));
    runFollowupScheduler().catch((err) => logger.error({ err }, "Followup scheduler tick failed"));
  }, 60_000);
  logger.info("Report scheduler started (checks every minute)");
}

export async function runFollowupScheduler(): Promise<void> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const eligibleUsers = await db
      .select({ userId: userSettingsTable.userId, stratFollowup: userSettingsTable.stratFollowup, stratCart: userSettingsTable.stratCart })
      .from(userSettingsTable)
      .where(or(eq(userSettingsTable.stratFollowup, true), eq(userSettingsTable.stratCart, true)));

    for (const user of eligibleUsers) {
      if (!user.stratFollowup && !user.stratCart) continue;

      const [wa] = await db
        .select()
        .from(whatsappConnectionsTable)
        .where(and(eq(whatsappConnectionsTable.userId, user.userId), eq(whatsappConnectionsTable.status, "connected")))
        .limit(1);

      if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) continue;

      const pendingOrders = await db
        .select({
          id: ordersTable.id,
          customerName: ordersTable.customerName,
          senderPhone: ordersTable.senderPhone,
          items: ordersTable.items,
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.userId, user.userId),
            inArray(ordersTable.status, ["draft", "pending_payment"]),
            isNull(ordersTable.followupSentAt),
            lt(ordersTable.updatedAt, twoHoursAgo),
          )
        )
        .limit(20);

      for (const order of pendingOrders) {
        if (!order.senderPhone) continue;

        let itemsText = "";
        try {
          const parsed = JSON.parse(order.items) as Array<{ name: string }>;
          itemsText = parsed.map((i) => i.name).join("، ");
        } catch {}

        const name = order.customerName ?? "عزيزي العميل";
        const message = itemsText
          ? `مرحباً ${name} 👋\nلاحظنا أنك كنت مهتماً بـ: *${itemsText}*\nهل تحتاج أي مساعدة لإتمام طلبك؟ نحن هنا ومستعدون! 😊`
          : `مرحباً ${name} 👋\nلاحظنا أن طلبك لم يكتمل بعد.\nهل تحتاج أي مساعدة؟ نحن هنا ومستعدون لمساعدتك! 😊`;

        await sendEvolutionMessage(
          { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
          order.senderPhone,
          message,
        ).catch(() => {});

        await db
          .update(ordersTable)
          .set({ followupSentAt: new Date() })
          .where(eq(ordersTable.id, order.id));

        logger.info({ userId: user.userId, orderId: order.id }, "Follow-up sent for pending order");
      }
    }
  } catch (err) {
    logger.error({ err }, "runFollowupScheduler error");
  }
}
