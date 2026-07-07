import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { eq, and, or, ilike, count, desc, sql } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { upsertChunk, deleteChunk, getEmbeddingKeyForUser, buildProductChunk } from "../../lib/vectorSearch.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const UPLOADS_DIR = path.join(process.cwd(), "public/uploads");

const router = Router();
router.use(requireAuth);

function triggerProductEmbedding(
  userId: number,
  product: {
    id: number; name: string; description: string; price: string;
    currency: string; unit: string; qty: number; status: string;
  },
) {
  getEmbeddingKeyForUser(userId)
    .then((embKey) => {
      if (!embKey) return;
      const content = buildProductChunk(product);
      return upsertChunk(userId, "product", `product-${product.id}`, content, embKey.apiKey, embKey.model, embKey.id);
    })
    .catch(() => {});
}

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const page      = Math.max(1, Number(req.query["page"]      ?? 1));
  const limit     = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 20)));
  const q         = String(req.query["q"]         ?? "").trim();
  const status    = String(req.query["status"]    ?? "all");
  const threshold = Number(req.query["threshold"] ?? 5);
  const offset    = (page - 1) * limit;

  // Build base conditions
  const baseConds: ReturnType<typeof eq>[] = [eq(productsTable.userId, userId)];

  const withStatus = (s: string) => {
    const conds = [...baseConds];
    if (s === "active")     conds.push(eq(productsTable.status, "active"));
    else if (s === "inactive") conds.push(eq(productsTable.status, "inactive"));
    else if (s === "low_stock") {
      conds.push(eq(productsTable.status, "active"));
      conds.push(sql`${productsTable.qty} > 0`);
      conds.push(sql`${productsTable.qty} <= ${threshold}`);
    }
    if (q) {
      conds.push(or(ilike(productsTable.name, `%${q}%`), ilike(productsTable.description, `%${q}%`))!);
    }
    return and(...conds);
  };

  // Paginated items + total for current filter
  const [countRow] = await db.select({ n: count() }).from(productsTable).where(withStatus(status));
  const items = await db.select().from(productsTable)
    .where(withStatus(status))
    .orderBy(desc(productsTable.createdAt))
    .limit(limit).offset(offset);

  // Counts per tab (always without search so numbers stay stable)
  const countWhere = (s: string) => {
    const conds = [eq(productsTable.userId, userId), eq(productsTable.status, "active")];
    if (s === "inactive") return and(eq(productsTable.userId, userId), eq(productsTable.status, "inactive"));
    if (s === "low_stock") return and(
      eq(productsTable.userId, userId),
      eq(productsTable.status, "active"),
      sql`${productsTable.qty} > 0`,
      sql`${productsTable.qty} <= ${threshold}`,
    );
    if (s === "active") return and(...conds);
    return eq(productsTable.userId, userId);
  };
  const [ca, ci, cl] = await Promise.all([
    db.select({ n: count() }).from(productsTable).where(countWhere("active")),
    db.select({ n: count() }).from(productsTable).where(countWhere("inactive")),
    db.select({ n: count() }).from(productsTable).where(countWhere("low_stock")),
  ]);

  res.json({
    items: items.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
    total: countRow?.n ?? 0,
    counts: { active: ca[0]?.n ?? 0, inactive: ci[0]?.n ?? 0, low_stock: cl[0]?.n ?? 0 },
  });
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const { name, description, qty, unit, price, negotiationPrice, currency, status } = req.body as {
    name?: string; description?: string; qty?: number; unit?: string;
    price?: string; negotiationPrice?: string; currency?: string; status?: string;
  };

  if (!name?.trim() || !price?.trim()) {
    res.status(400).json({ message: "اسم المنتج والسعر مطلوبان" });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      userId,
      name: name.trim(),
      description: description?.trim() ?? "",
      qty: Number(qty ?? 0),
      unit: unit?.trim() || "قطعة",
      price: price.trim(),
      negotiationPrice: negotiationPrice?.trim() || null,
      currency: currency?.trim() || "SAR",
      status: status || "active",
    })
    .returning();

  triggerProductEmbedding(userId, product!);

  res.json({ ...product!, createdAt: product!.createdAt.toISOString(), updatedAt: product!.updatedAt.toISOString() });
});

router.put("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const body = req.body as Record<string, unknown>;

  const updates: Partial<typeof productsTable.$inferInsert> = { updatedAt: new Date() };
  if (body["name"] !== undefined) updates.name = String(body["name"]).trim();
  if (body["description"] !== undefined) updates.description = String(body["description"]).trim();
  if (body["qty"] !== undefined) updates.qty = Number(body["qty"]);
  if (body["unit"] !== undefined) updates.unit = String(body["unit"]).trim();
  if (body["price"] !== undefined) updates.price = String(body["price"]).trim();
  if (body["negotiationPrice"] !== undefined)
    updates.negotiationPrice = body["negotiationPrice"] ? String(body["negotiationPrice"]).trim() : null;
  if (body["currency"] !== undefined) updates.currency = String(body["currency"]).trim();
  if (body["status"] !== undefined) updates.status = String(body["status"]);

  const [product] = await db
    .update(productsTable)
    .set(updates)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .returning();

  if (!product) { res.status(404).json({ message: "المنتج غير موجود" }); return; }

  triggerProductEmbedding(userId, product);

  res.json({ ...product, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);

  const [deleted] = await db
    .delete(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .returning({ id: productsTable.id });

  if (!deleted) { res.status(404).json({ message: "المنتج غير موجود" }); return; }

  getEmbeddingKeyForUser(userId)
    .then((embKey) => { if (embKey) deleteChunk(userId, "product", `product-${id}`); })
    .catch(() => {});

  res.json({ ok: true });
});

// ── Excel bulk import ─────────────────────────────────────────────────────────
router.post("/import", async (req, res) => {
  const userId = req.session.userId!;
  const { data } = req.body as { data?: string };
  if (!data) { res.status(400).json({ message: "بيانات الملف مطلوبة" }); return; }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(data, "base64");
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    res.status(400).json({ message: "ملف Excel غير صالح" });
    return;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) { res.status(400).json({ message: "الملف فارغ" }); return; }
  const sheet = workbook.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const findCol = (row: Record<string, unknown>, ...aliases: string[]): string => {
    for (const key of Object.keys(row)) {
      if (aliases.some(a => key.trim().toLowerCase() === a.toLowerCase())) {
        return String(row[key] ?? "").trim();
      }
    }
    return "";
  };

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = findCol(row, "name", "اسم", "اسم المنتج", "product_name", "ProductName");
    const price = findCol(row, "price", "السعر", "سعر البيع", "Price");
    if (!name || !price) {
      errors.push(`صف ${i + 2}: اسم المنتج أو السعر مفقود`);
      continue;
    }
    const description = findCol(row, "description", "وصف", "الوصف", "Description");
    const qtyStr = findCol(row, "qty", "quantity", "الكمية", "كمية", "Qty", "Quantity");
    const unit = findCol(row, "unit", "وحدة", "الوحدة", "Unit") || "قطعة";
    const negotiationPriceRaw = findCol(row, "negotiationPrice", "negotiation_price", "سعر المساومة", "NegotiationPrice");
    const currency = findCol(row, "currency", "عملة", "العملة", "Currency") || "SAR";
    const statusRaw = findCol(row, "status", "حالة", "الحالة", "Status");
    const status = ["active", "inactive"].includes(statusRaw) ? statusRaw : "active";

    try {
      const [product] = await db.insert(productsTable).values({
        userId,
        name,
        description,
        qty: Number(qtyStr) || 0,
        unit,
        price,
        negotiationPrice: negotiationPriceRaw || null,
        currency,
        status,
      }).returning();
      triggerProductEmbedding(userId, product!);
      imported++;
    } catch {
      errors.push(`صف ${i + 2}: خطأ في الإدراج`);
    }
  }

  res.json({ imported, skipped: errors.length, errors });
});

// ── Add to stock ──────────────────────────────────────────────────────────────
router.patch("/:id/stock", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { add } = req.body as { add?: number };
  if (add === undefined || isNaN(Number(add)) || Number(add) === 0) {
    res.status(400).json({ message: "الكمية المضافة غير صالحة" });
    return;
  }
  const [current] = await db.select({ qty: productsTable.qty })
    .from(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .limit(1);
  if (!current) { res.status(404).json({ message: "المنتج غير موجود" }); return; }

  const newQty = Math.max(0, current.qty + Number(add));
  const [updated] = await db.update(productsTable)
    .set({ qty: newQty, updatedAt: new Date() })
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .returning();

  triggerProductEmbedding(userId, updated!);
  res.json({ ...updated!, createdAt: updated!.createdAt.toISOString(), updatedAt: updated!.updatedAt.toISOString() });
});

router.post("/:id/image", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { data, mimeType } = req.body as { data?: string; mimeType?: string };

  if (!data) { res.status(400).json({ message: "بيانات الصورة مطلوبة" }); return; }

  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(eq(productsTable.id, id), eq(productsTable.userId, userId)))
    .limit(1);

  if (!product) { res.status(404).json({ message: "المنتج غير موجود" }); return; }

  try {
    const buffer = Buffer.from(data, "base64");
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const filename = `p-${userId}-${id}-${Date.now()}.${ext}`;
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

    const imageUrl = `/api/uploads/${filename}`;
    await db.update(productsTable).set({ imageUrl, updatedAt: new Date() }).where(eq(productsTable.id, id));
    res.json({ imageUrl });
  } catch {
    res.status(500).json({ message: "فشل رفع الصورة" });
  }
});

export default router;
