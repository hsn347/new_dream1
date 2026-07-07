import { Router } from "express";
import { db } from "@workspace/db";
import { deliveryZonesTable, deliveryZoneRatesTable, deliverySettingsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { upsertChunk, getEmbeddingKeyForUser } from "../../lib/vectorSearch.js";
import { logger } from "../../lib/logger.js";

const router = Router();
router.use(requireAuth);

type ZoneWithRates = {
  name: string;
  minOrder: string;
  rates: Array<{ unit: string; cost: string }>;
};

export function buildDeliveryChunk(
  zones: ZoneWithRates[],
  freeDeliveryAll: boolean,
  unknownLocationPolicy: string,
): string {
  const lines: string[] = ["=== سياسة التوصيل والشحن ==="];

  if (freeDeliveryAll) {
    lines.push("التوصيل مجاني لجميع المناطق بدون استثناء.");
    return lines.join("\n");
  }

  if (zones.length === 0) {
    lines.push("لم يتم تحديد مناطق توصيل بعد.");
  } else {
    lines.push("تكاليف التوصيل حسب المنطقة:");
    for (const z of zones) {
      const ratesStr =
        z.rates.length === 0
          ? "لم تحدد تكلفة"
          : z.rates.map((r) => `${r.cost} ريال لكل ${r.unit}`).join("، ");
      const minStr = z.minOrder && z.minOrder !== "0" ? ` (الحد الأدنى للطلب: ${z.minOrder} ريال)` : "";
      lines.push(`• ${z.name}: ${ratesStr}${minStr}`);
    }
  }

  const policyLabel =
    unknownLocationPolicy === "free"
      ? "المناطق غير المذكورة: التوصيل إليها مجاني."
      : "المناطق غير المذكورة: لا يتوفر توصيل إليها.";
  lines.push(policyLabel);

  return lines.join("\n");
}

async function triggerDeliveryEmbedding(userId: number) {
  try {
    const embKey = await getEmbeddingKeyForUser(userId).catch(() => null);
    if (!embKey) return;

    const [settings] = await db
      .select()
      .from(deliverySettingsTable)
      .where(eq(deliverySettingsTable.userId, userId))
      .limit(1);

    const zones = await db
      .select()
      .from(deliveryZonesTable)
      .where(eq(deliveryZonesTable.userId, userId));

    const zoneIds = zones.map((z) => z.id);
    const allRates =
      zoneIds.length > 0
        ? await db.select().from(deliveryZoneRatesTable).where(inArray(deliveryZoneRatesTable.zoneId, zoneIds))
        : [];

    const zonesWithRates: ZoneWithRates[] = zones.map((z) => ({
      name: z.name,
      minOrder: z.minOrder,
      rates: allRates.filter((r) => r.zoneId === z.id).map((r) => ({ unit: r.unit, cost: r.cost })),
    }));

    const content = buildDeliveryChunk(
      zonesWithRates,
      settings?.freeDeliveryAll ?? false,
      settings?.unknownLocationPolicy ?? "unavailable",
    );
    upsertChunk(userId, "delivery", "delivery-policy", content, embKey.apiKey, embKey.model, embKey.id).catch(() => {});
  } catch (err) {
    logger.warn({ err, userId }, "triggerDeliveryEmbedding failed");
  }
}

router.get("/", async (req, res) => {
  const userId = req.session.userId!;

  const [settings] = await db
    .select()
    .from(deliverySettingsTable)
    .where(eq(deliverySettingsTable.userId, userId))
    .limit(1);

  const zones = await db
    .select()
    .from(deliveryZonesTable)
    .where(eq(deliveryZonesTable.userId, userId))
    .orderBy(deliveryZonesTable.createdAt);

  const zoneIds = zones.map((z) => z.id);
  const allRates =
    zoneIds.length > 0
      ? await db.select().from(deliveryZoneRatesTable).where(inArray(deliveryZoneRatesTable.zoneId, zoneIds))
      : [];

  res.json({
    freeDeliveryAll: settings?.freeDeliveryAll ?? false,
    unknownLocationPolicy: settings?.unknownLocationPolicy ?? "unavailable",
    zones: zones.map((z) => ({
      id: z.id,
      userId: z.userId,
      name: z.name,
      minOrder: z.minOrder,
      createdAt: z.createdAt.toISOString(),
      updatedAt: z.updatedAt.toISOString(),
      rates: allRates
        .filter((r) => r.zoneId === z.id)
        .map((r) => ({ id: r.id, zoneId: r.zoneId, unit: r.unit, cost: r.cost })),
    })),
  });
});

router.put("/settings", async (req, res) => {
  const userId = req.session.userId!;
  const { freeDeliveryAll, unknownLocationPolicy } = req.body as {
    freeDeliveryAll?: boolean;
    unknownLocationPolicy?: string;
  };

  const updates: Partial<typeof deliverySettingsTable.$inferInsert> = { updatedAt: new Date() };
  if (freeDeliveryAll !== undefined) updates.freeDeliveryAll = Boolean(freeDeliveryAll);
  if (unknownLocationPolicy !== undefined) updates.unknownLocationPolicy = unknownLocationPolicy;

  await db
    .insert(deliverySettingsTable)
    .values({ userId, ...updates })
    .onConflictDoUpdate({ target: deliverySettingsTable.userId, set: updates });

  triggerDeliveryEmbedding(userId).catch(() => {});
  res.json({ ok: true });
});

router.post("/zones", async (req, res) => {
  const userId = req.session.userId!;
  const { name, minOrder, rates } = req.body as {
    name?: string;
    minOrder?: string;
    rates?: Array<{ unit: string; cost: string }>;
  };

  if (!name?.trim()) {
    res.status(400).json({ message: "اسم المنطقة مطلوب" });
    return;
  }

  const [zone] = await db
    .insert(deliveryZonesTable)
    .values({ userId, name: name.trim(), minOrder: minOrder ?? "0" })
    .returning();

  const insertedRates =
    Array.isArray(rates) && rates.length > 0
      ? await db
          .insert(deliveryZoneRatesTable)
          .values(rates.filter((r) => r.unit?.trim() && r.cost).map((r) => ({ zoneId: zone!.id, unit: r.unit.trim(), cost: r.cost })))
          .returning()
      : [];

  triggerDeliveryEmbedding(userId).catch(() => {});

  res.json({
    id: zone!.id,
    userId: zone!.userId,
    name: zone!.name,
    minOrder: zone!.minOrder,
    createdAt: zone!.createdAt.toISOString(),
    updatedAt: zone!.updatedAt.toISOString(),
    rates: insertedRates.map((r) => ({ id: r.id, zoneId: r.zoneId, unit: r.unit, cost: r.cost })),
  });
});

router.put("/zones/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { name, minOrder, rates } = req.body as {
    name?: string;
    minOrder?: string;
    rates?: Array<{ id?: number; unit: string; cost: string }>;
  };

  const [zone] = await db
    .select()
    .from(deliveryZonesTable)
    .where(and(eq(deliveryZonesTable.id, id), eq(deliveryZonesTable.userId, userId)))
    .limit(1);

  if (!zone) {
    res.status(404).json({ message: "المنطقة غير موجودة" });
    return;
  }

  const zoneUpdates: Partial<typeof deliveryZonesTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) zoneUpdates.name = name.trim();
  if (minOrder !== undefined) zoneUpdates.minOrder = minOrder;

  const [updatedZone] = await db
    .update(deliveryZonesTable)
    .set(zoneUpdates)
    .where(eq(deliveryZonesTable.id, id))
    .returning();

  if (Array.isArray(rates)) {
    await db.delete(deliveryZoneRatesTable).where(eq(deliveryZoneRatesTable.zoneId, id));
    if (rates.length > 0) {
      const valid = rates.filter((r) => r.unit?.trim() && r.cost);
      if (valid.length > 0) {
        await db
          .insert(deliveryZoneRatesTable)
          .values(valid.map((r) => ({ zoneId: id, unit: r.unit.trim(), cost: r.cost })));
      }
    }
  }

  const newRates = await db.select().from(deliveryZoneRatesTable).where(eq(deliveryZoneRatesTable.zoneId, id));

  triggerDeliveryEmbedding(userId).catch(() => {});

  res.json({
    id: updatedZone!.id,
    userId: updatedZone!.userId,
    name: updatedZone!.name,
    minOrder: updatedZone!.minOrder,
    createdAt: updatedZone!.createdAt.toISOString(),
    updatedAt: updatedZone!.updatedAt.toISOString(),
    rates: newRates.map((r) => ({ id: r.id, zoneId: r.zoneId, unit: r.unit, cost: r.cost })),
  });
});

router.delete("/zones/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);

  const [deleted] = await db
    .delete(deliveryZonesTable)
    .where(and(eq(deliveryZonesTable.id, id), eq(deliveryZonesTable.userId, userId)))
    .returning({ id: deliveryZonesTable.id });

  if (!deleted) {
    res.status(404).json({ message: "المنطقة غير موجودة" });
    return;
  }

  triggerDeliveryEmbedding(userId).catch(() => {});
  res.json({ ok: true });
});

export default router;
