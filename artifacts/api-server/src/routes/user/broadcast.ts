import { Router } from "express";
import { db } from "@workspace/db";
import {
  broadcastCampaignsTable,
  conversationsTable,
  customerProfilesTable,
  whatsappConnectionsTable,
  userSettingsTable,
  productsTable,
} from "@workspace/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { sendEvolutionMessage } from "../../lib/providers/evolution.js";
import { logger } from "../../lib/logger.js";

const router = Router();

type SegmentId = "all" | "active" | "buyers" | "notBought";

async function getPhonesInterestedInProducts(userId: number, productNames: string[]): Promise<Set<string>> {
  if (productNames.length === 0) return new Set();
  const profiles = await db
    .select({ phone: customerProfilesTable.customerPhone })
    .from(customerProfilesTable)
    .where(
      and(
        eq(customerProfilesTable.userId, userId),
        sql`${customerProfilesTable.inquiredProducts} && ARRAY[${sql.join(productNames.map((n) => sql`${n}`), sql`, `)}]::text[]`,
      ),
    );
  return new Set(profiles.map((p) => p.phone));
}

async function getSegmentPhones(userId: number, segment: SegmentId): Promise<string[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  if (segment === "all") {
    const convs = await db
      .select({ phone: conversationsTable.customerPhone })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId));
    return [...new Set(convs.map((c) => c.phone))];
  }

  if (segment === "active") {
    const convs = await db
      .select({ phone: conversationsTable.customerPhone })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.userId, userId), gte(conversationsTable.updatedAt, thirtyDaysAgo)));
    return [...new Set(convs.map((c) => c.phone))];
  }

  if (segment === "buyers") {
    const profiles = await db
      .select({ phone: customerProfilesTable.customerPhone })
      .from(customerProfilesTable)
      .where(and(eq(customerProfilesTable.userId, userId), eq(customerProfilesTable.isBuyer, true)));
    return profiles.map((p) => p.phone);
  }

  if (segment === "notBought") {
    const allConvs = await db
      .select({ phone: conversationsTable.customerPhone })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId));
    const allPhones = new Set(allConvs.map((c) => c.phone));

    const buyers = await db
      .select({ phone: customerProfilesTable.customerPhone })
      .from(customerProfilesTable)
      .where(and(eq(customerProfilesTable.userId, userId), eq(customerProfilesTable.isBuyer, true)));
    const buyerPhones = new Set(buyers.map((p) => p.phone));

    return [...allPhones].filter((p) => !buyerPhones.has(p));
  }

  return [];
}

async function getSegmentPhonesForSegments(userId: number, segments: SegmentId[]): Promise<string[]> {
  if (segments.includes("all")) {
    return getSegmentPhones(userId, "all");
  }
  const phoneSets = await Promise.all(segments.map((s) => getSegmentPhones(userId, s)));
  return [...new Set(phoneSets.flat())];
}

router.get("/products", async (req, res) => {
  const userId = req.session.userId!;

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(and(eq(productsTable.userId, userId), eq(productsTable.status, "active")));

  if (products.length === 0) {
    res.json([]);
    return;
  }

  const profiles = await db
    .select({ phone: customerProfilesTable.customerPhone, inquiredProducts: customerProfilesTable.inquiredProducts })
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, userId));

  const productNames = products.map((p) => p.name);
  const interestCounts: Record<string, number> = {};
  for (const name of productNames) interestCounts[name] = 0;

  for (const profile of profiles) {
    const prefs = profile.inquiredProducts ?? [];
    for (const pref of prefs) {
      const match = productNames.find((n) => n.toLowerCase() === pref.toLowerCase() || pref.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(pref.toLowerCase()));
      if (match) interestCounts[match] = (interestCounts[match] ?? 0) + 1;
    }
  }

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      interestedCount: interestCounts[p.name] ?? 0,
    })),
  );
});

router.get("/segments", async (req, res) => {
  const userId = req.session.userId!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [allConvs, activeConvs, buyers] = await Promise.all([
    db.select({ phone: conversationsTable.customerPhone })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, userId)),
    db.select({ phone: conversationsTable.customerPhone })
      .from(conversationsTable)
      .where(and(eq(conversationsTable.userId, userId), gte(conversationsTable.updatedAt, thirtyDaysAgo))),
    db.select({ phone: customerProfilesTable.customerPhone })
      .from(customerProfilesTable)
      .where(and(eq(customerProfilesTable.userId, userId), eq(customerProfilesTable.isBuyer, true))),
  ]);

  const allPhones = new Set(allConvs.map((c) => c.phone));
  const activePhones = new Set(activeConvs.map((c) => c.phone));
  const buyerPhones = new Set(buyers.map((p) => p.phone));
  const notBoughtCount = [...allPhones].filter((p) => !buyerPhones.has(p)).length;

  res.json([
    { id: "all",       count: allPhones.size },
    { id: "active",    count: activePhones.size },
    { id: "buyers",    count: buyerPhones.size },
    { id: "notBought", count: notBoughtCount },
  ]);
});

router.get("/campaigns", async (req, res) => {
  const userId = req.session.userId!;
  const campaigns = await db
    .select()
    .from(broadcastCampaignsTable)
    .where(eq(broadcastCampaignsTable.userId, userId))
    .orderBy(desc(broadcastCampaignsTable.createdAt))
    .limit(20);

  res.json(
    campaigns.map((c) => ({
      ...c,
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      startedAt: c.startedAt?.toISOString() ?? null,
      completedAt: c.completedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  );
});

router.post("/send", async (req, res) => {
  const userId = req.session.userId!;
  const body = req.body as {
    message?: string;
    segments?: SegmentId[];
    scheduleMode?: "now" | "later";
    scheduledAt?: string;
    countryCodes?: string[];
    productInterests?: string[];
  };

  if (!body.message?.trim()) {
    res.status(400).json({ message: "الرسالة مطلوبة" });
    return;
  }
  if (!body.segments?.length) {
    res.status(400).json({ message: "الشريحة المستهدفة مطلوبة" });
    return;
  }

  const [wa] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.userId, userId))
    .limit(1);

  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.status(400).json({ message: "لم يتم إعداد اتصال واتساب بعد" });
    return;
  }

  if (wa.status !== "connected") {
    res.status(400).json({ message: "اتصال واتساب غير نشط — تأكد من الاتصال أولاً" });
    return;
  }

  let phones = await getSegmentPhonesForSegments(userId, body.segments);

  // فلتر حسب الاهتمام بمنتجات محددة
  if (body.productInterests && body.productInterests.length > 0) {
    const interestedPhones = await getPhonesInterestedInProducts(userId, body.productInterests);
    phones = phones.filter((p) => interestedPhones.has(p));
  }

  // فلتر حسب الدولة إن وُجد
  if (body.countryCodes && body.countryCodes.length > 0) {
    const codes = body.countryCodes;
    phones = phones.filter((phone) => codes.some((code) => phone.startsWith(code)));
  }

  if (phones.length === 0) {
    res.status(400).json({ message: "لا يوجد عملاء في الشريحة والدولة المختارة" });
    return;
  }

  const scheduledAt = body.scheduleMode === "later" && body.scheduledAt
    ? new Date(body.scheduledAt)
    : null;

  const [campaign] = await db
    .insert(broadcastCampaignsTable)
    .values({
      userId,
      message: body.message.trim(),
      segments: JSON.stringify(body.segments),
      recipientCount: phones.length,
      status: scheduledAt ? "scheduled" : "sending",
      scheduledAt,
      startedAt: scheduledAt ? null : new Date(),
    })
    .returning();

  if (!campaign) {
    res.status(500).json({ message: "فشل إنشاء الحملة" });
    return;
  }

  res.json({ ok: true, campaignId: campaign.id, recipientCount: phones.length });

  if (scheduledAt) return;

  const waConfig = { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName };
  const campaignId = campaign.id;
  const messageText = body.message.trim();

  setImmediate(async () => {
    let sent = 0;
    let failed = 0;

    for (const phone of phones) {
      try {
        const ok = await sendEvolutionMessage(waConfig, phone, messageText);
        if (ok) { sent++; } else { failed++; }
      } catch (err) {
        failed++;
        logger.warn({ err, phone }, "[Broadcast] Failed to send message");
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    const finalStatus = failed === phones.length ? "failed" : "done";

    await db
      .update(broadcastCampaignsTable)
      .set({
        sentCount: sent,
        failedCount: failed,
        status: finalStatus,
        completedAt: new Date(),
      })
      .where(eq(broadcastCampaignsTable.id, campaignId));

    logger.info({ campaignId, sent, failed }, "[Broadcast] Campaign completed");

    // إشعار واتساب لرقم المراجعة عند اكتمال الحملة
    try {
      const [settings] = await db
        .select({ reviewWhatsappNumber: userSettingsTable.reviewWhatsappNumber })
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);

      const reviewNumber = settings?.reviewWhatsappNumber?.trim();
      if (reviewNumber) {
        const emoji = finalStatus === "done" ? "✅" : "❌";
        const notificationText =
          `${emoji} *تقرير الحملة الإعلانية*\n\n` +
          `📨 إجمالي المستلمين: ${phones.length}\n` +
          `✅ وصلت بنجاح: ${sent}\n` +
          (failed > 0 ? `❌ فشل الإرسال: ${failed}\n` : "") +
          `📊 نسبة النجاح: ${phones.length > 0 ? Math.round((sent / phones.length) * 100) : 0}%\n\n` +
          `🕐 اكتملت في: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", hour12: false })}`;

        await sendEvolutionMessage(waConfig, reviewNumber, notificationText);
        logger.info({ reviewNumber, campaignId }, "[Broadcast] Notification sent to review number");
      }
    } catch (err) {
      logger.warn({ err }, "[Broadcast] Failed to send notification to review number");
    }
  });
});

export default router;
