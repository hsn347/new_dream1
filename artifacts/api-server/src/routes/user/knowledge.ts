import { Router } from "express";
import { db } from "@workspace/db";
import { knowledgeEntriesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { upsertChunk, deleteChunk, getEmbeddingKeyForUser } from "../../lib/vectorSearch.js";

const router = Router();
router.use(requireAuth);

function buildKnowledgeChunk(entry: { title: string; content: string }): string {
  return `${entry.title}\n${entry.content}`;
}

async function triggerKnowledgeEmbedding(userId: number, entry: { id: number; title: string; content: string }) {
  const embKey = await getEmbeddingKeyForUser(userId).catch(() => null);
  if (!embKey) return;
  const content = buildKnowledgeChunk(entry);
  upsertChunk(userId, "knowledge", `knowledge-${entry.id}`, content, embKey.apiKey, embKey.model, embKey.id).catch(() => {});
}

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const entries = await db
    .select()
    .from(knowledgeEntriesTable)
    .where(eq(knowledgeEntriesTable.userId, userId))
    .orderBy(knowledgeEntriesTable.createdAt);
  res.json(entries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() })));
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const { title, content, type } = req.body as { title?: string; content?: string; type?: string };

  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({ message: "العنوان والمحتوى مطلوبان" });
    return;
  }

  const [entry] = await db
    .insert(knowledgeEntriesTable)
    .values({ userId, title: title.trim(), content: content.trim(), type: type || "custom" })
    .returning();

  triggerKnowledgeEmbedding(userId, entry!).catch(() => {});

  res.json({ ...entry!, createdAt: entry!.createdAt.toISOString(), updatedAt: entry!.updatedAt.toISOString() });
});

router.put("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  const { title, content, type } = req.body as { title?: string; content?: string; type?: string };

  const updates: Partial<typeof knowledgeEntriesTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content.trim();
  if (type !== undefined) updates.type = type;

  const [entry] = await db
    .update(knowledgeEntriesTable)
    .set(updates)
    .where(and(eq(knowledgeEntriesTable.id, id), eq(knowledgeEntriesTable.userId, userId)))
    .returning();

  if (!entry) { res.status(404).json({ message: "الإدخال غير موجود" }); return; }

  triggerKnowledgeEmbedding(userId, entry).catch(() => {});

  res.json({ ...entry, createdAt: entry.createdAt.toISOString(), updatedAt: entry.updatedAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);

  const [deleted] = await db
    .delete(knowledgeEntriesTable)
    .where(and(eq(knowledgeEntriesTable.id, id), eq(knowledgeEntriesTable.userId, userId)))
    .returning({ id: knowledgeEntriesTable.id });

  if (!deleted) { res.status(404).json({ message: "الإدخال غير موجود" }); return; }

  getEmbeddingKeyForUser(userId)
    .then((embKey) => { if (embKey) deleteChunk(userId, "knowledge", `knowledge-${id}`); })
    .catch(() => {});

  res.json({ ok: true });
});

router.post("/bulk", async (req, res) => {
  const userId = req.session.userId!;
  const { entries } = req.body as { entries?: Array<{ title: string; content: string; type?: string }> };

  if (!Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ message: "لا توجد إدخالات للحفظ" });
    return;
  }

  const valid = entries.filter((e) => e.title?.trim() && e.content?.trim());
  if (valid.length === 0) {
    res.status(400).json({ message: "جميع الإدخالات فارغة" });
    return;
  }

  const inserted = await db
    .insert(knowledgeEntriesTable)
    .values(valid.map((e) => ({ userId, title: e.title.trim(), content: e.content.trim(), type: e.type || "custom" })))
    .returning();

  const embKey = await getEmbeddingKeyForUser(userId).catch(() => null);
  if (embKey) {
    for (const entry of inserted) {
      upsertChunk(userId, "knowledge", `knowledge-${entry.id}`, buildKnowledgeChunk(entry), embKey.apiKey, embKey.model, embKey.id).catch(() => {});
    }
  }

  res.json(inserted.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString() })));
});

export default router;
