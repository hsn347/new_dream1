import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { upsertChunk, deleteChunk, getEmbeddingKeyForUser, buildCouponChunk } from "../../lib/vectorSearch.js";

const router = Router();
router.use(requireAuth);

async function triggerCouponEmbedding(userId: number, coupon: {
  id: number; code: string; type: string; value: string;
  products: string; startDate: string | null; endDate: string | null;
}) {
  const embKey = await getEmbeddingKeyForUser(userId).catch(() => null);
  if (!embKey) return;
  const content = buildCouponChunk(coupon);
  upsertChunk(userId, "coupon", `coupon-${coupon.id}`, content, embKey.apiKey, embKey.model, embKey.id).catch(() => {});
}

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const coupons = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.userId, userId))
    .orderBy(couponsTable.createdAt);
  res.json(coupons.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const { code, type, value, startDate, endDate, products, status } = req.body as {
    code?: string; type?: string; value?: string; startDate?: string;
    endDate?: string; products?: string; status?: string;
  };

  if (!code?.trim() || !value?.trim()) {
    res.status(400).json({ message: "رمز الكوبون والقيمة مطلوبان" });
    return;
  }

  const [coupon] = await db
    .insert(couponsTable)
    .values({
      userId,
      code: code.trim().toUpperCase(),
      type: type || "percent",
      value: value.trim(),
      startDate: startDate?.trim() || null,
      endDate: endDate?.trim() || null,
      products: products?.trim() || "الكل",
      status: status || "active",
    })
    .returning();

  triggerCouponEmbedding(userId, coupon!).catch(() => {});

  res.json({ ...coupon!, createdAt: coupon!.createdAt.toISOString() });
});

router.put("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const body = req.body as Record<string, unknown>;

  const updates: Partial<typeof couponsTable.$inferInsert> = {};
  if (body["code"] !== undefined) updates.code = String(body["code"]).trim().toUpperCase();
  if (body["type"] !== undefined) updates.type = String(body["type"]);
  if (body["value"] !== undefined) updates.value = String(body["value"]).trim();
  if (body["startDate"] !== undefined) updates.startDate = body["startDate"] ? String(body["startDate"]).trim() : null;
  if (body["endDate"] !== undefined) updates.endDate = body["endDate"] ? String(body["endDate"]).trim() : null;
  if (body["products"] !== undefined) updates.products = String(body["products"]).trim() || "الكل";
  if (body["status"] !== undefined) updates.status = String(body["status"]);

  const [coupon] = await db
    .update(couponsTable)
    .set(updates)
    .where(and(eq(couponsTable.id, id), eq(couponsTable.userId, userId)))
    .returning();

  if (!coupon) { res.status(404).json({ message: "الكوبون غير موجود" }); return; }

  triggerCouponEmbedding(userId, coupon).catch(() => {});

  res.json({ ...coupon, createdAt: coupon.createdAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);

  const [deleted] = await db
    .delete(couponsTable)
    .where(and(eq(couponsTable.id, id), eq(couponsTable.userId, userId)))
    .returning({ id: couponsTable.id });

  if (!deleted) { res.status(404).json({ message: "الكوبون غير موجود" }); return; }

  getEmbeddingKeyForUser(userId)
    .then((embKey) => { if (embKey) deleteChunk(userId, "coupon", `coupon-${id}`); })
    .catch(() => {});

  res.json({ ok: true });
});

export default router;
