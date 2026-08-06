import { Router } from "express";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  whatsappConnectionsTable,
  userSettingsTable,
  apiKeysTable,
  ordersTable,
  productsTable,
} from "@workspace/db/schema";
import { eq, and, count, gte, lt, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { testEvolutionConnection } from "../../lib/providers/evolution.js";
import productsRouter from "./products.js";
import couponsRouter from "./coupons.js";
import businessRouter from "./business.js";
import knowledgeRouter from "./knowledge.js";
import deliveryRouter from "./delivery.js";
import ordersRouter from "./orders.js";
import customersRouter from "./customers.js";
import broadcastRouter from "./broadcast.js";
import returnsRouter from "./returns.js";
import notificationsRouter from "./notifications.js";
import pushSubscriptionsRouter from "./pushSubscriptions.js";

const router = Router();
router.use(requireAuth);

router.use("/products", productsRouter);
router.use("/coupons", couponsRouter);
router.use("/business", businessRouter);
router.use("/knowledge", knowledgeRouter);
router.use("/delivery", deliveryRouter);
router.use("/orders", ordersRouter);
router.use("/customers", customersRouter);
router.use("/broadcast", broadcastRouter);
router.use("/returns", returnsRouter);
router.use("/notifications", notificationsRouter);
router.use("/push", pushSubscriptionsRouter);

router.get("/dashboard", async (req, res) => {
  const userId = req.session.userId!;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 4 queries instead of 13: use SQL CASE WHEN aggregation ────────────────
  const [convStats, orderStats, wa, settings, msgToday, productsActive] = await Promise.all([
    // Query 1: All conversation counts in one DB round-trip
    db.select({
      total:       count(),
      activeToday: count(sql`CASE WHEN ${conversationsTable.updatedAt} >= ${today.toISOString()} THEN 1 END`),
      active:      count(sql`CASE WHEN ${conversationsTable.status} = 'active' THEN 1 END`),
      pending:     count(sql`CASE WHEN ${conversationsTable.status} = 'pending' THEN 1 END`),
      closed:      count(sql`CASE WHEN ${conversationsTable.status} = 'closed' THEN 1 END`),
    }).from(conversationsTable).where(eq(conversationsTable.userId, userId)).then(r => r[0]),

    // Query 2: All order counts in one DB round-trip
    db.select({
      draft:          count(sql`CASE WHEN ${ordersTable.status} = 'draft' THEN 1 END`),
      pending_review: count(sql`CASE WHEN ${ordersTable.status} = 'pending_review' THEN 1 END`),
      approved:       count(sql`CASE WHEN ${ordersTable.status} = 'approved' THEN 1 END`),
      delivered:      count(sql`CASE WHEN ${ordersTable.status} = 'delivered' THEN 1 END`),
    }).from(ordersTable).where(eq(ordersTable.userId, userId)).then(r => r[0]),

    // Query 3a: WhatsApp connection status
    db.select({ status: whatsappConnectionsTable.status }).from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId)).limit(1).then(r => r[0]),

    // Query 3b: User settings
    db.select({ agentEnabled: userSettingsTable.agentEnabled })
      .from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1).then(r => r[0]),

    // Query 3c: Messages count today
    db.select({ count: count() }).from(messagesTable)
      .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
      .where(and(eq(conversationsTable.userId, userId), gte(messagesTable.createdAt, today)))
      .then(r => r[0]),

    // Query 4: Active products count
    db.select({ count: count() }).from(productsTable)
      .where(and(eq(productsTable.userId, userId), eq(productsTable.status, "active")))
      .then(r => r[0]),
  ]);

  res.json({
    conversations:       Number(convStats?.total ?? 0),
    activeToday:         Number(convStats?.activeToday ?? 0),
    messagesToday:       Number(msgToday?.count ?? 0),
    waStatus:            wa?.status ?? "idle",
    agentEnabled:        settings?.agentEnabled ?? true,
    convActive:          Number(convStats?.active ?? 0),
    convPending:         Number(convStats?.pending ?? 0),
    convClosed:          Number(convStats?.closed ?? 0),
    ordersDraft:         Number(orderStats?.draft ?? 0),
    ordersPendingReview: Number(orderStats?.pending_review ?? 0),
    ordersApproved:      Number(orderStats?.approved ?? 0),
    ordersDelivered:     Number(orderStats?.delivered ?? 0),
    productsActive:      Number(productsActive?.count ?? 0),
  });
});


router.get("/conversations", async (req, res) => {
  const userId = req.session.userId!;
  const { desc } = await import("drizzle-orm");
  const convs = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .orderBy(desc(conversationsTable.updatedAt));
  res.json(convs.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })));
});

router.patch("/conversations/:id/pause", async (req, res) => {
  const userId = req.session.userId!;
  const convId = Number(req.params["id"]);
  const { paused } = req.body as { paused: boolean };

  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.userId, userId)))
    .limit(1);

  if (!conv) { res.status(404).json({ message: "المحادثة غير موجودة" }); return; }

  await db
    .update(conversationsTable)
    .set({ agentPaused: Boolean(paused), updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId));

  res.json({ ok: true, paused: Boolean(paused) });
});

router.delete("/conversations/:id/messages", async (req, res) => {
  const userId = req.session.userId!;
  const convId = Number(req.params["id"]);

  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.userId, userId)))
    .limit(1);

  if (!conv) { res.status(404).json({ message: "المحادثة غير موجودة" }); return; }

  await db.delete(messagesTable).where(eq(messagesTable.conversationId, convId));

  await db
    .update(conversationsTable)
    .set({ lastMessage: null, sentImageProductIds: "[]", updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId));

  res.json({ ok: true });
});

router.get("/conversations/:id/messages", async (req, res) => {
  const userId = req.session.userId!;
  const convId = Number(req.params["id"]);

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.userId, userId)))
    .limit(1);

  if (!conv) { res.status(404).json({ message: "المحادثة غير موجودة" }); return; }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(messagesTable.createdAt);

  res.json(msgs.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

router.post("/conversations/:id/send", async (req, res) => {
  const userId = req.session.userId!;
  const convId = Number(req.params["id"]);
  const { text } = req.body as { text?: string };

  if (!text?.trim()) {
    res.status(400).json({ message: "الرسالة فارغة" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, convId), eq(conversationsTable.userId, userId)))
    .limit(1);

  if (!conv) { res.status(404).json({ message: "المحادثة غير موجودة" }); return; }

  const [wa] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.userId, userId))
    .limit(1);

  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.status(400).json({ message: "لم يتم إعداد واتساب — اذهب إلى الإعدادات" });
    return;
  }

  const { sendEvolutionMessage } = await import("../../lib/providers/evolution.js");
  const sent = await sendEvolutionMessage(
    { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
    conv.customerPhone,
    text.trim(),
  );

  if (!sent) {
    res.status(502).json({ message: "فشل إرسال الرسالة عبر واتساب — تحقق من الاتصال" });
    return;
  }

  const [saved] = await db
    .insert(messagesTable)
    .values({ conversationId: convId, from: "agent", text: text.trim() })
    .returning();

  await db
    .update(conversationsTable)
    .set({ lastMessage: text.trim(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId));

  res.status(201).json({ ...saved, createdAt: saved!.createdAt.toISOString() });
});

router.get("/settings", async (req, res) => {
  const userId = req.session.userId!;

  const [settings] = await db
    .select()
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId))
    .limit(1);

  res.json({
    chatKeyId: settings?.chatKeyId ?? null,
    embeddingKeyId: settings?.embeddingKeyId ?? null,
    agentEnabled: settings?.agentEnabled ?? true,
    systemPrompt: settings?.systemPrompt ?? null,
    dialect: settings?.dialect ?? "gulf",
    dialectStrength: settings?.dialectStrength ?? 5,
    style: settings?.style ?? "friendly",
    tone: settings?.tone ?? "warm",
    persuasion: settings?.persuasion ?? 7,
    formality: settings?.formality ?? 5,
    responseDelay: settings?.responseDelay ?? 3,
    emojiLevel: settings?.emojiLevel ?? "medium",
    replyLength: settings?.replyLength ?? "medium",
    openingMessage: settings?.openingMessage ?? null,
    closingMessage: settings?.closingMessage ?? null,
    stratFollowup: settings?.stratFollowup ?? true,
    stratCart: settings?.stratCart ?? true,
    stratUpsell: settings?.stratUpsell ?? true,
    stratPromo: settings?.stratPromo ?? false,
    stratReview: settings?.stratReview ?? true,
    sendProductImages: settings?.sendProductImages ?? true,
    orderSystemEnabled: settings?.orderSystemEnabled ?? true,
    reviewWhatsappNumber: settings?.reviewWhatsappNumber ?? null,
    approvedOrderMessage: settings?.approvedOrderMessage ?? null,
    deliveredOrderMessage: settings?.deliveredOrderMessage ?? null,
    lowStockThreshold: settings?.lowStockThreshold ?? 5,
    depositTolerance: settings?.depositTolerance ?? 5,
    messageAggregationDelay: settings?.messageAggregationDelay ?? 10,
    returnSystemEnabled: settings?.returnSystemEnabled ?? true,
    maxTokens: settings?.maxTokens ?? 1500,
    reportEnabled: settings?.reportEnabled ?? false,
    reportFrequency: settings?.reportFrequency ?? "daily",
    reportTime: settings?.reportTime ?? "08:00",
    reportManagerPhone: settings?.reportManagerPhone ?? null,
    groupReplyMode: settings?.groupReplyMode ?? "disabled",
    allowedGroupIds: settings?.allowedGroupIds ?? "[]",
    invoiceColor: settings?.invoiceColor ?? "#16a34a",
    invoiceEnabled: settings?.invoiceEnabled ?? true,
    omqiVerificationEnabled: settings?.omqiVerificationEnabled ?? true,
  });
});

router.put("/settings", async (req, res) => {
  const userId = req.session.userId!;
  const body = req.body as {
    agentEnabled?: boolean;
    systemPrompt?: string;
    chatKeyId?: number | null;
    embeddingKeyId?: number | null;
    dialect?: string;
    dialectStrength?: number;
    style?: string;
    tone?: string;
    persuasion?: number;
    formality?: number;
    responseDelay?: number;
    emojiLevel?: string;
    replyLength?: string;
    openingMessage?: string | null;
    closingMessage?: string | null;
    stratFollowup?: boolean;
    stratCart?: boolean;
    stratUpsell?: boolean;
    stratPromo?: boolean;
    stratReview?: boolean;
    sendProductImages?: boolean;
    orderSystemEnabled?: boolean;
    reviewWhatsappNumber?: string | null;
    approvedOrderMessage?: string | null;
    deliveredOrderMessage?: string | null;
    lowStockThreshold?: number;
    depositTolerance?: number;
    messageAggregationDelay?: number;
    returnSystemEnabled?: boolean;
    maxTokens?: number;
    reportEnabled?: boolean;
    reportFrequency?: string;
    reportTime?: string;
    reportManagerPhone?: string | null;
    groupReplyMode?: string;
    allowedGroupIds?: string;
    invoiceColor?: string;
    invoiceEnabled?: boolean;
    omqiVerificationEnabled?: boolean;
  };

  const updates: Partial<typeof userSettingsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.agentEnabled !== undefined) updates.agentEnabled = body.agentEnabled;
  if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
  if (body.chatKeyId !== undefined) updates.chatKeyId = body.chatKeyId;
  if (body.embeddingKeyId !== undefined) updates.embeddingKeyId = body.embeddingKeyId;
  if (body.dialect !== undefined) updates.dialect = body.dialect;
  if (body.dialectStrength !== undefined) updates.dialectStrength = body.dialectStrength;
  if (body.style !== undefined) updates.style = body.style;
  if (body.tone !== undefined) updates.tone = body.tone;
  if (body.persuasion !== undefined) updates.persuasion = body.persuasion;
  if (body.formality !== undefined) updates.formality = body.formality;
  if (body.responseDelay !== undefined) updates.responseDelay = body.responseDelay;
  if (body.emojiLevel !== undefined) updates.emojiLevel = body.emojiLevel;
  if (body.replyLength !== undefined) updates.replyLength = body.replyLength;
  if (body.openingMessage !== undefined) updates.openingMessage = body.openingMessage;
  if (body.closingMessage !== undefined) updates.closingMessage = body.closingMessage;
  if (body.stratFollowup !== undefined) updates.stratFollowup = body.stratFollowup;
  if (body.stratCart !== undefined) updates.stratCart = body.stratCart;
  if (body.stratUpsell !== undefined) updates.stratUpsell = body.stratUpsell;
  if (body.stratPromo !== undefined) updates.stratPromo = body.stratPromo;
  if (body.stratReview !== undefined) updates.stratReview = body.stratReview;
  if (body.sendProductImages !== undefined) updates.sendProductImages = body.sendProductImages;
  if (body.orderSystemEnabled !== undefined) updates.orderSystemEnabled = body.orderSystemEnabled;
  if (body.reviewWhatsappNumber !== undefined) updates.reviewWhatsappNumber = body.reviewWhatsappNumber;
  if (body.approvedOrderMessage !== undefined) updates.approvedOrderMessage = body.approvedOrderMessage;
  if (body.deliveredOrderMessage !== undefined) updates.deliveredOrderMessage = body.deliveredOrderMessage;
  if (body.lowStockThreshold !== undefined) updates.lowStockThreshold = body.lowStockThreshold;
  if (body.depositTolerance !== undefined) updates.depositTolerance = body.depositTolerance;
  if (body.messageAggregationDelay !== undefined) updates.messageAggregationDelay = body.messageAggregationDelay;
  if (body.returnSystemEnabled !== undefined) updates.returnSystemEnabled = body.returnSystemEnabled;
  if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens;
  if (body.reportEnabled !== undefined) updates.reportEnabled = body.reportEnabled;
  if (body.reportFrequency !== undefined) updates.reportFrequency = body.reportFrequency;
  if (body.reportTime !== undefined) updates.reportTime = body.reportTime;
  if (body.reportManagerPhone !== undefined) updates.reportManagerPhone = body.reportManagerPhone;
  if (body.groupReplyMode !== undefined) updates.groupReplyMode = body.groupReplyMode;
  if (body.allowedGroupIds !== undefined) updates.allowedGroupIds = body.allowedGroupIds;
  if (body.invoiceColor !== undefined) updates.invoiceColor = body.invoiceColor;
  if (body.invoiceEnabled !== undefined) updates.invoiceEnabled = body.invoiceEnabled;
  if (body.omqiVerificationEnabled !== undefined) updates.omqiVerificationEnabled = body.omqiVerificationEnabled;

  await db
    .insert(userSettingsTable)
    .values({ userId, ...updates })
    .onConflictDoUpdate({ target: userSettingsTable.userId, set: updates });

  res.json({ ok: true });
});

router.get("/groups", async (req, res) => {
  const userId = req.session.userId!;
  const groups = await db
    .select({ customerPhone: conversationsTable.customerPhone, customerName: conversationsTable.customerName })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.userId, userId), eq(conversationsTable.isGroup, true)))
    .groupBy(conversationsTable.customerPhone, conversationsTable.customerName);
  res.json(groups);
});

router.post("/reports/send-now", async (req, res) => {
  const userId = req.session.userId!;
  const { period } = req.body as { period?: string };
  const validPeriods = ["daily", "weekly", "monthly"] as const;
  type Period = typeof validPeriods[number];
  const p: Period = validPeriods.includes(period as Period) ? (period as Period) : "daily";

  const { buildAndSendReport } = await import("../../lib/reports.js");
  const sent = await buildAndSendReport(userId, p);
  if (sent) {
    res.json({ ok: true, message: "تم إرسال التقرير بنجاح ✓" });
  } else {
    res.status(502).json({ ok: false, message: "فشل إرسال التقرير — تحقق من إعداد واتساب ورقم المدير" });
  }
});

router.get("/whatsapp", async (req, res) => {
  const userId = req.session.userId!;
  const [wa] = await db
    .select({
      id: whatsappConnectionsTable.id,
      userId: whatsappConnectionsTable.userId,
      provider: whatsappConnectionsTable.provider,
      baseUrl: whatsappConnectionsTable.baseUrl,
      instanceName: whatsappConnectionsTable.instanceName,
      status: whatsappConnectionsTable.status,
      updatedAt: whatsappConnectionsTable.updatedAt,
      hasApiKey: sql<boolean>`(${whatsappConnectionsTable.apiKey} IS NOT NULL AND ${whatsappConnectionsTable.apiKey} != '')`,
    })
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.userId, userId))
    .limit(1);
  res.json(wa ?? { status: "idle", provider: "evolution" });
});

router.put("/whatsapp", async (req, res) => {
  const userId = req.session.userId!;
  const { provider, baseUrl, apiKey, instanceName } = req.body as {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    instanceName?: string;
  };

  await db
    .insert(whatsappConnectionsTable)
    .values({ userId, provider: provider ?? "evolution", baseUrl, apiKey, instanceName, status: "idle", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: whatsappConnectionsTable.userId,
      set: { provider: provider ?? "evolution", baseUrl, apiKey, instanceName, status: "idle", updatedAt: new Date() },
    });

  res.json({ ok: true });
});

router.post("/whatsapp/test", async (req, res) => {
  const userId = req.session.userId!;

  const [wa] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.userId, userId))
    .limit(1);

  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.json({ success: false, message: "لم يتم إعداد بيانات واتساب بعد" });
    return;
  }

  const result = await testEvolutionConnection({
    baseUrl: wa.baseUrl,
    apiKey: wa.apiKey,
    instanceName: wa.instanceName,
  });

  await db
    .update(whatsappConnectionsTable)
    .set({ status: result.success ? "connected" : "error", updatedAt: new Date() })
    .where(eq(whatsappConnectionsTable.userId, userId));

  res.json(result);
});

router.get("/analytics", async (req, res) => {
  const userId = req.session.userId!;
  const periodDays = Math.min(Math.max(Number(req.query["period"]) || 30, 7), 90);
  const now = new Date();
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const prevStart = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const [allOrders, prevOrders, allConversations, conversationsInPeriod] = await Promise.all([
    db.select({
      id: ordersTable.id, status: ordersTable.status, total: ordersTable.total,
      items: ordersTable.items, conversationId: ordersTable.conversationId,
      createdAt: ordersTable.createdAt,
    }).from(ordersTable).where(and(eq(ordersTable.userId, userId), gte(ordersTable.createdAt, startDate))),
    db.select({ total: ordersTable.total, status: ordersTable.status })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), gte(ordersTable.createdAt, prevStart), lt(ordersTable.createdAt, startDate))),
    db.select({ count: count() }).from(conversationsTable).where(eq(conversationsTable.userId, userId)).then(r => Number(r[0]?.count ?? 0)),
    db.select({ id: conversationsTable.id }).from(conversationsTable)
      .where(and(eq(conversationsTable.userId, userId), gte(conversationsTable.createdAt, startDate))),
  ]);

  const completedStatuses = ["approved", "delivered"];
  const activeOrders = allOrders.filter(o => !["cancelled", "rejected"].includes(o.status));
  const prevActiveOrders = prevOrders.filter(o => !["cancelled", "rejected"].includes(o.status));
  
  const completedOrders = allOrders.filter(o => completedStatuses.includes(o.status));
  const prevCompletedOrders = prevOrders.filter(o => completedStatuses.includes(o.status));

  const totalRevenue = completedOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  const prevRevenue = prevCompletedOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
  const revenueGrowth = prevRevenue === 0 ? 0 : ((totalRevenue - prevRevenue) / prevRevenue) * 100;
  const ordersGrowth = prevCompletedOrders.length === 0 ? 0 : ((completedOrders.length - prevCompletedOrders.length) / prevCompletedOrders.length) * 100;
  const avgOrderValue = completedOrders.length > 0 ? (totalRevenue / completedOrders.length).toFixed(2) : "0";

  const convIds = new Set(allOrders.map(o => o.conversationId).filter(Boolean));
  const conversionsWithOrders = convIds.size;
  const periodConvCount = conversationsInPeriod.length || allConversations;
  const conversionRate = periodConvCount > 0 ? (conversionsWithOrders / periodConvCount) * 100 : 0;

  const dailyMap: Record<string, { orders: number; revenue: number; conversations: number }> = {};
  for (let d = 0; d < periodDays; d++) {
    const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const key = date.toISOString().split("T")[0]!;
    dailyMap[key] = { orders: 0, revenue: 0, conversations: 0 };
  }
  for (const o of activeOrders) {
    const key = o.createdAt.toISOString().split("T")[0]!;
    if (dailyMap[key]) {
      dailyMap[key]!.orders++;
      if (completedStatuses.includes(o.status)) {
        dailyMap[key]!.revenue += parseFloat(o.total) || 0;
      }
    }
  }
  const dailyData = Object.entries(dailyMap).map(([date, v]) => ({
    date: date.slice(5),
    orders: v.orders,
    revenue: Math.round(v.revenue),
    conversations: v.conversations,
  }));

  // Products from completed/approved orders → actual sales
  const soldCounts: Record<string, { count: number; revenue: number }> = {};
  for (const o of allOrders.filter(o => completedStatuses.includes(o.status))) {
    try {
      const items = JSON.parse(o.items) as Array<{ name: string; total?: string; qty?: number }>;
      for (const item of items) {
        if (!soldCounts[item.name]) soldCounts[item.name] = { count: 0, revenue: 0 };
        soldCounts[item.name]!.count += item.qty ?? 1;
        soldCounts[item.name]!.revenue += parseFloat(item.total ?? "0") || 0;
      }
    } catch {}
  }
  const topProducts = Object.entries(soldCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, d]) => ({ name, count: d.count, revenue: d.revenue.toFixed(0) }));

  // Products from ALL active orders (including pending/draft) → customer interest
  const requestedCounts: Record<string, { count: number; revenue: number }> = {};
  for (const o of activeOrders) {
    try {
      const items = JSON.parse(o.items) as Array<{ name: string; total?: string; qty?: number }>;
      for (const item of items) {
        if (!requestedCounts[item.name]) requestedCounts[item.name] = { count: 0, revenue: 0 };
        requestedCounts[item.name]!.count += item.qty ?? 1;
        requestedCounts[item.name]!.revenue += parseFloat(item.total ?? "0") || 0;
      }
    } catch {}
  }
  const topRequestedProducts = Object.entries(requestedCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, d]) => ({ name, count: d.count, revenue: d.revenue.toFixed(0) }));

  const orderStatusBreakdown: Record<string, number> = {};
  for (const o of allOrders) {
    orderStatusBreakdown[o.status] = (orderStatusBreakdown[o.status] ?? 0) + 1;
  }

  const ordersApproved = allOrders.filter(o => completedStatuses.includes(o.status)).length;
  const ordersDelivered = allOrders.filter(o => o.status === "delivered").length;

  res.json({
    dailyData,
    funnel: { totalConversations: allConversations, conversationsWithOrders: conversionsWithOrders, ordersApproved, ordersDelivered },
    topProducts,
    topRequestedProducts,
    summary: {
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders: activeOrders.length,
      avgOrderValue,
      conversionRate: Math.round(conversionRate * 10) / 10,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      ordersGrowth: Math.round(ordersGrowth * 10) / 10,
    },
    orderStatusBreakdown,
  });
});

router.get("/keys", async (_req, res) => {
  const keys = await db
    .select({ id: apiKeysTable.id, name: apiKeysTable.name, type: apiKeysTable.type, provider: apiKeysTable.provider, model: apiKeysTable.model })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.status, "active"));
  res.json(keys);
});

export default router;
