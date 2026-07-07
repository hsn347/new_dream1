import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { upsertChunk, deleteChunk, getEmbeddingKeyForUser, buildBusinessChunks } from "../../lib/vectorSearch.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

async function triggerBusinessEmbeddings(userId: number, biz: typeof businessesTable.$inferSelect) {
  const embKey = await getEmbeddingKeyForUser(userId).catch(() => null);
  if (!embKey) return;
  const chunks = buildBusinessChunks(biz);
  for (const chunk of chunks) {
    upsertChunk(userId, "business", chunk.refId, chunk.content, embKey.apiKey, embKey.model, embKey.id).catch(() => {});
  }
  const validRefIds = new Set(chunks.map((c) => c.refId));
  const allBusinessRefIds = ["business-general", "business-contact", "business-hours", "business-return", "business-social", "business-banking"];
  for (const refId of allBusinessRefIds) {
    if (!validRefIds.has(refId)) {
      deleteChunk(userId, "business", refId).catch(() => {});
    }
  }
}

function parseContactList(raw: string | null | undefined): Array<{ label: string; value: string }> {
  if (!raw) return [];

  // Handle legacy PostgreSQL array format: {val1,val2} or {"val1","val2"}
  if (raw.startsWith("{") && raw.endsWith("}")) {
    const inner = raw.slice(1, -1);
    if (!inner) return [];
    const items = inner.split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    return items.map(v => ({ label: "", value: v }));
  }

  // Handle JSON format: [{label, value}] or ["string"]
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown) => {
      if (typeof item === "string") return { label: "", value: item.trim() };
      if (typeof item === "object" && item !== null) {
        const o = item as { label?: string; value?: string };
        return { label: o.label ?? "", value: o.value ?? "" };
      }
      return { label: "", value: "" };
    }).filter(x => x.value);
  } catch {
    return [];
  }
}

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const [biz] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.userId, userId))
    .limit(1);

  if (!biz) {
    res.json({ name: "", description: "", storeUrl: "", phones: [], branches: [], socialLinks: {}, bankAccounts: [], workingHours: [], returnPolicy: "", logoUrl: "" });
    return;
  }

  res.json({
    name: biz.name ?? "",
    description: biz.description ?? "",
    storeUrl: biz.storeUrl ?? "",
    phones: parseContactList(biz.phones),
    branches: parseContactList(biz.branches),
    socialLinks: biz.socialLinks ? (JSON.parse(biz.socialLinks) as Record<string, string>) : {},
    bankAccounts: biz.bankAccounts ? JSON.parse(biz.bankAccounts) : [],
    workingHours: biz.workingHours ? JSON.parse(biz.workingHours) : [],
    returnPolicy: biz.returnPolicy ?? "",
    logoUrl: biz.logoUrl ?? "",
  });
});

router.put("/", async (req, res) => {
  const userId = req.session.userId!;
  const { name, description, storeUrl, phones, branches, socialLinks, bankAccounts, workingHours, returnPolicy, logoUrl } = req.body as {
    name?: string; description?: string; storeUrl?: string;
    phones?: Array<string | { label?: string; value?: string }>;
    branches?: Array<string | { label?: string; value?: string }>;
    socialLinks?: Record<string, string>; bankAccounts?: unknown[]; workingHours?: unknown[]; returnPolicy?: string;
    logoUrl?: string;
  };

  function normalizeContactList(list: Array<string | { label?: string; value?: string }> | undefined): Array<{ label: string; value: string }> {
    return (list ?? [])
      .map(item => {
        if (typeof item === "string") return { label: "", value: item.trim() };
        if (typeof item === "object" && item !== null) return { label: (item.label ?? "").trim(), value: (item.value ?? "").trim() };
        return { label: "", value: "" };
      })
      .filter(x => x.value);
  }

  const values = {
    userId,
    name: name ?? "",
    description: description ?? "",
    storeUrl: storeUrl ?? "",
    phones: JSON.stringify(normalizeContactList(phones)),
    branches: JSON.stringify(normalizeContactList(branches)),
    socialLinks: JSON.stringify(socialLinks ?? {}),
    bankAccounts: JSON.stringify(bankAccounts ?? []),
    workingHours: JSON.stringify(workingHours ?? []),
    returnPolicy: returnPolicy ?? "",
    logoUrl: logoUrl ?? null,
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(businessesTable)
    .values(values)
    .onConflictDoUpdate({
      target: businessesTable.userId,
      set: {
        name: values.name, description: values.description, storeUrl: values.storeUrl,
        phones: values.phones, branches: values.branches, socialLinks: values.socialLinks,
        bankAccounts: values.bankAccounts, workingHours: values.workingHours,
        returnPolicy: values.returnPolicy, logoUrl: values.logoUrl, updatedAt: values.updatedAt,
      },
    })
    .returning();

  if (saved) {
    triggerBusinessEmbeddings(userId, saved).catch(() => {});
  }

  res.json({ ok: true });
});

// ── Logo upload endpoint ──────────────────────────────────────────────────────
router.post("/logo", upload.single("logo"), async (req, res) => {
  const userId = req.session.userId!;

  if (!req.file) {
    res.status(400).json({ message: "No image file provided" });
    return;
  }

  const mimeType = req.file.mimetype;
  const base64 = req.file.buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  await db
    .insert(businessesTable)
    .values({ userId, logoUrl: dataUrl, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: businessesTable.userId,
      set: { logoUrl: dataUrl, updatedAt: new Date() },
    });

  res.json({ ok: true, logoUrl: dataUrl });
});

export default router;
