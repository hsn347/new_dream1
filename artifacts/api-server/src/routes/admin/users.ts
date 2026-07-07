import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable, whatsappConnectionsTable, userSettingsTable, apiKeysTable, conversationsTable,
  messagesTable, productsTable, couponsTable, businessesTable, ordersTable,
  notificationsTable, broadcastCampaignsTable, pushSubscriptionsTable, customerProfilesTable,
  omqiReceiptsTable, deliveryZonesTable, deliveryZoneRatesTable, deliverySettingsTable,
} from "@workspace/db/schema";
import { eq, count, inArray } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import {
  testEvolutionConnection,
  createEvolutionInstance,
  fetchEvolutionQrCode,
  setEvolutionWebhook,
} from "../../lib/providers/evolution.js";
import { testTwilioConnection } from "../../lib/providers/twilio.js";
import { testDialog360Connection } from "../../lib/providers/dialog360.js";

const router = Router();
router.use(requireAdmin);

// ── List users ────────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const users = await db.select().from(usersTable).where(eq(usersTable.role, "user")).orderBy(usersTable.createdAt);

  const result = await Promise.all(
    users.map(async (u) => {
      const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, u.id)).limit(1);
      const [settings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, u.id)).limit(1);

      let chatKeyName: string | undefined;
      let embeddingKeyName: string | undefined;
      if (settings?.chatKeyId) {
        const [k] = await db.select({ name: apiKeysTable.name }).from(apiKeysTable).where(eq(apiKeysTable.id, settings.chatKeyId)).limit(1);
        chatKeyName = k?.name;
      }
      if (settings?.embeddingKeyId) {
        const [k] = await db.select({ name: apiKeysTable.name }).from(apiKeysTable).where(eq(apiKeysTable.id, settings.embeddingKeyId)).limit(1);
        embeddingKeyName = k?.name;
      }

      const [convCount] = await db.select({ count: count() }).from(conversationsTable).where(eq(conversationsTable.userId, u.id));

      let waConfig: Record<string, string> | undefined;
      if (wa?.config) { try { waConfig = JSON.parse(wa.config); } catch { /* */ } }

      return {
        id: u.id, name: u.name, email: u.email, phone: u.phone,
        role: u.role, status: u.status,
        chatKeyId: settings?.chatKeyId, embeddingKeyId: settings?.embeddingKeyId,
        chatKeyName, embeddingKeyName,
        waProvider: wa?.provider ?? "evolution",
        waStatus: wa?.status ?? "idle",
        waBaseUrl: wa?.baseUrl, waInstanceName: wa?.instanceName,
        waConfig,
        conversations: convCount?.count ?? 0,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString(),
      };
    }),
  );
  res.json(result);
});

// ── Get single user ───────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!u) { res.status(404).json({ message: "المستخدم غير موجود" }); return; }

  const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id)).limit(1);
  const [settings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, id)).limit(1);
  const [convCount] = await db.select({ count: count() }).from(conversationsTable).where(eq(conversationsTable.userId, id));

  let waConfig: Record<string, string> | undefined;
  if (wa?.config) { try { waConfig = JSON.parse(wa.config); } catch { /* */ } }

  res.json({
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status,
    chatKeyId: settings?.chatKeyId, chatFallbackKeyIds: settings?.chatFallbackKeyIds ?? "[]",
    embeddingKeyId: settings?.embeddingKeyId,
    waProvider: wa?.provider ?? "evolution",
    waStatus: wa?.status ?? "idle",
    waBaseUrl: wa?.baseUrl, waInstanceName: wa?.instanceName,
    waConfig,
    agentEnabled: settings?.agentEnabled ?? true,
    conversations: convCount?.count ?? 0,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString(),
  });
});

// ── Create user ───────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { name, email, password, phone, chatKeyId, embeddingKeyId, waProvider, waConfig } = req.body as {
    name?: string; email?: string; password?: string; phone?: string;
    chatKeyId?: number; embeddingKeyId?: number;
    waProvider?: string; waConfig?: Record<string, string>;
  };

  if (!name || !email || !password) {
    res.status(400).json({ message: "الاسم والبريد وكلمة المرور مطلوبة" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable)
    .values({ name, email: email.toLowerCase().trim(), passwordHash, phone })
    .returning();

  await db.insert(userSettingsTable).values({
    userId: user!.id,
    chatKeyId: chatKeyId ?? null,
    embeddingKeyId: embeddingKeyId ?? null,
    agentEnabled: true,
  });

  const provider = waProvider ?? "evolution";
  const configJson = waConfig ? JSON.stringify(waConfig) : null;

  // For evolution, store baseUrl/apiKey/instanceName from waConfig; for others, store in config column
  const baseUrl = provider === "evolution" ? (waConfig?.baseUrl ?? null) : null;
  const apiKey  = provider === "evolution" ? (waConfig?.apiKey  ?? null) : null;
  const instanceName = provider === "evolution" ? (waConfig?.instanceName ?? null) : null;

  await db.insert(whatsappConnectionsTable).values({
    userId: user!.id,
    provider,
    baseUrl,
    apiKey,
    instanceName,
    config: provider !== "evolution" ? configJson : null,
    status: "idle",
  });

  res.status(201).json({
    id: user!.id, name, email, role: "user", status: "active",
    waProvider: provider, waConfig,
    createdAt: new Date().toISOString(),
  });
});

// ── Update user info ──────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, phone, status, chatKeyId, embeddingKeyId, agentEnabled, chatFallbackKeyIds } = req.body as {
    name?: string; phone?: string; status?: string;
    chatKeyId?: number | null; embeddingKeyId?: number | null; agentEnabled?: boolean;
    chatFallbackKeyIds?: number[];
  };

  const userUpdates: Partial<typeof usersTable.$inferInsert> = {};
  if (name) userUpdates.name = name;
  if (phone !== undefined) userUpdates.phone = phone;
  if (status) userUpdates.status = status as "active" | "pending" | "disabled";
  if (Object.keys(userUpdates).length > 0) {
    await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, id));
  }

  const settingsUpdates: Partial<typeof userSettingsTable.$inferInsert> = { updatedAt: new Date() };
  if (chatKeyId !== undefined) settingsUpdates.chatKeyId = chatKeyId;
  if (embeddingKeyId !== undefined) settingsUpdates.embeddingKeyId = embeddingKeyId;
  if (agentEnabled !== undefined) settingsUpdates.agentEnabled = agentEnabled;
  if (chatFallbackKeyIds !== undefined) settingsUpdates.chatFallbackKeyIds = JSON.stringify(chatFallbackKeyIds);

  await db.insert(userSettingsTable)
    .values({ userId: id, ...settingsUpdates })
    .onConflictDoUpdate({ target: userSettingsTable.userId, set: settingsUpdates });

  res.json({ ok: true });
});

// ── Update WhatsApp config (any provider) ─────────────────────────────────────
router.put("/:id/whatsapp", async (req, res) => {
  const id = Number(req.params["id"]);
  const { provider, baseUrl, apiKey, instanceName, config } = req.body as {
    provider?: string;
    baseUrl?: string; apiKey?: string; instanceName?: string;
    config?: Record<string, string>;
  };

  const prov = provider ?? "evolution";
  const configJson = config ? JSON.stringify(config) : null;

  await db.insert(whatsappConnectionsTable)
    .values({
      userId: id,
      provider: prov,
      baseUrl: prov === "evolution" ? (baseUrl ?? null) : null,
      apiKey:  prov === "evolution" ? (apiKey  ?? null) : null,
      instanceName: prov === "evolution" ? (instanceName ?? null) : null,
      config: prov !== "evolution" ? configJson : null,
      status: "idle",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappConnectionsTable.userId,
      set: {
        provider: prov,
        baseUrl: prov === "evolution" ? (baseUrl ?? null) : null,
        apiKey:  prov === "evolution" ? (apiKey  ?? null) : null,
        instanceName: prov === "evolution" ? (instanceName ?? null) : null,
        config: prov !== "evolution" ? configJson : null,
        status: "idle",
        updatedAt: new Date(),
      },
    });

  res.json({ ok: true });
});

// ── Test WhatsApp connection (all providers) ───────────────────────────────────
router.post("/:id/whatsapp/test", async (req, res) => {
  const id = Number(req.params["id"]);
  const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id)).limit(1);
  if (!wa) { res.json({ success: false, message: "لم يتم إعداد واتساب بعد" }); return; }

  const provider = wa.provider ?? "evolution";

  if (provider === "evolution") {
    if (!wa.baseUrl || !wa.apiKey || !wa.instanceName) {
      res.json({ success: false, message: "يجب إدخال بيانات Evolution (Base URL، API Key، Instance Name)" });
      return;
    }
    const result = await testEvolutionConnection({ baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName });
    await db.update(whatsappConnectionsTable)
      .set({ status: result.success ? "connected" : "error", updatedAt: new Date() })
      .where(eq(whatsappConnectionsTable.userId, id));
    res.json(result); return;
  }

  let cfg: Record<string, string> = {};
  if (wa.config) { try { cfg = JSON.parse(wa.config); } catch { /* */ } }

  if (provider === "twilio") {
    if (!cfg.accountSid || !cfg.authToken) {
      res.json({ success: false, message: "يجب إدخال Account SID و Auth Token" }); return;
    }
    const result = await testTwilioConnection({ accountSid: cfg.accountSid, authToken: cfg.authToken, fromNumber: cfg.fromNumber ?? "" });
    await db.update(whatsappConnectionsTable)
      .set({ status: result.success ? "connected" : "error", updatedAt: new Date() })
      .where(eq(whatsappConnectionsTable.userId, id));
    res.json(result); return;
  }

  if (provider === "360dialog") {
    if (!cfg.apiKey) {
      res.json({ success: false, message: "يجب إدخال مفتاح API" }); return;
    }
    const result = await testDialog360Connection({ apiKey: cfg.apiKey, phoneNumber: cfg.phoneNumber ?? "" });
    await db.update(whatsappConnectionsTable)
      .set({ status: result.success ? "connected" : "error", updatedAt: new Date() })
      .where(eq(whatsappConnectionsTable.userId, id));
    res.json(result); return;
  }

  // Meta / Gupshup — just mark as configured (no auto-test yet)
  await db.update(whatsappConnectionsTable)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(eq(whatsappConnectionsTable.userId, id));
  res.json({ success: true, message: "تم حفظ الإعدادات — يرجى التحقق من إعداد الـ Webhook في لوحة " + provider });
});

// ── Delete user & all data ────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ message: "المستخدم غير موجود" }); return; }
  if (user.role === "admin") { res.status(403).json({ message: "لا يمكن حذف حساب مسؤول" }); return; }

  // حذف الرسائل أولاً (تابعة للمحادثات)
  const convIds = await db.select({ id: conversationsTable.id })
    .from(conversationsTable).where(eq(conversationsTable.userId, id));
  if (convIds.length > 0) {
    await db.delete(messagesTable)
      .where(inArray(messagesTable.conversationId, convIds.map(c => c.id)));
  }

  // حذف بيانات المستخدم كاملاً
  await db.delete(conversationsTable).where(eq(conversationsTable.userId, id));
  await db.delete(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id));
  await db.delete(userSettingsTable).where(eq(userSettingsTable.userId, id));
  await db.delete(productsTable).where(eq(productsTable.userId, id));
  await db.delete(couponsTable).where(eq(couponsTable.userId, id));
  await db.delete(businessesTable).where(eq(businessesTable.userId, id));
  await db.delete(ordersTable).where(eq(ordersTable.userId, id));
  await db.delete(omqiReceiptsTable).where(eq(omqiReceiptsTable.userId, id));
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, id));
  await db.delete(broadcastCampaignsTable).where(eq(broadcastCampaignsTable.userId, id));
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, id));
  await db.delete(customerProfilesTable).where(eq(customerProfilesTable.userId, id));
  const zones = await db.select({ id: deliveryZonesTable.id })
    .from(deliveryZonesTable).where(eq(deliveryZonesTable.userId, id));
  if (zones.length > 0) {
    await db.delete(deliveryZoneRatesTable)
      .where(inArray(deliveryZoneRatesTable.zoneId, zones.map(z => z.id)));
  }
  await db.delete(deliveryZonesTable).where(eq(deliveryZonesTable.userId, id));
  await db.delete(deliverySettingsTable).where(eq(deliverySettingsTable.userId, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));

  res.json({ ok: true });
});

// ── Evolution-specific routes ─────────────────────────────────────────────────
router.post("/:id/whatsapp/create-instance", async (req, res) => {
  const id = Number(req.params["id"]);
  const { webhookUrl } = req.body as { webhookUrl?: string };
  const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id)).limit(1);

  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.status(400).json({ success: false, message: "يجب حفظ بيانات Evolution أولاً (Base URL، API Key، Instance Name)" });
    return;
  }
  const wh = webhookUrl ?? `${req.protocol}://${req.get("host")}/api/webhooks/evolution/${id}`;
  const result = await createEvolutionInstance({ baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName }, wh);
  if (result.success) {
    await db.update(whatsappConnectionsTable).set({ status: "idle", updatedAt: new Date() }).where(eq(whatsappConnectionsTable.userId, id));
  }
  res.json(result);
});

router.get("/:id/whatsapp/qr", async (req, res) => {
  const id = Number(req.params["id"]);
  const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id)).limit(1);
  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.status(400).json({ success: false, message: "يجب حفظ بيانات Evolution أولاً" }); return;
  }
  const result = await fetchEvolutionQrCode({ baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName });
  if (result.state === "open") {
    await db.update(whatsappConnectionsTable).set({ status: "connected", updatedAt: new Date() }).where(eq(whatsappConnectionsTable.userId, id));
  }
  res.json(result);
});

router.get("/:id/whatsapp/state", async (req, res) => {
  const id = Number(req.params["id"]);
  const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id)).limit(1);
  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.json({ success: false, state: "not_configured", message: "لم يتم الإعداد" }); return;
  }
  const result = await testEvolutionConnection({ baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName });
  if (result.success) {
    await db.update(whatsappConnectionsTable).set({ status: "connected", updatedAt: new Date() }).where(eq(whatsappConnectionsTable.userId, id));
  } else if (result.state === "not_found" || result.state === "auth_error") {
    await db.update(whatsappConnectionsTable)
      .set({ status: result.state === "auth_error" ? "error" : "idle", updatedAt: new Date() })
      .where(eq(whatsappConnectionsTable.userId, id));
  }
  res.json({ ...result, state: result.state ?? (result.success ? "open" : "disconnected") });
});

router.post("/:id/whatsapp/set-webhook", async (req, res) => {
  const id = Number(req.params["id"]);
  const { webhookUrl } = req.body as { webhookUrl?: string };
  const [wa] = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, id)).limit(1);
  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.status(400).json({ success: false, message: "يجب حفظ بيانات Evolution أولاً" }); return;
  }
  const wh = webhookUrl ?? `${req.protocol}://${req.get("host")}/api/webhooks/evolution/${id}`;
  const ok = await setEvolutionWebhook({ baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName }, wh);
  res.json({ success: ok, message: ok ? "تم ضبط الـ Webhook بنجاح" : "فشل ضبط الـ Webhook" });
});

export default router;
