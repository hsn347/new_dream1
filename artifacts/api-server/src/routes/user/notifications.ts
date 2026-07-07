import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const notifs = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(notifs.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

router.patch("/read-all", async (req, res) => {
  const userId = req.session.userId!;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
  res.json({ ok: true });
});

router.patch("/:id/read", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

router.delete("/", async (req, res) => {
  const userId = req.session.userId!;
  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const id = Number(req.params["id"]);
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

export default router;
