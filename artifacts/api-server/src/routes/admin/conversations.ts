import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  whatsappConnectionsTable,
  conversationsTable,
  messagesTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { sendEvolutionMessage } from "../../lib/providers/evolution.js";

const router = Router();
router.use(requireAdmin);

// ── List all conversations (optionally filtered by userId) ────────────────────
router.get("/", async (req, res) => {
  const userId = req.query["userId"] ? Number(req.query["userId"]) : null;

  const rows = await db
    .select({
      id: conversationsTable.id,
      userId: conversationsTable.userId,
      customerPhone: conversationsTable.customerPhone,
      customerName: conversationsTable.customerName,
      status: conversationsTable.status,
      lastMessage: conversationsTable.lastMessage,
      agentPaused: conversationsTable.agentPaused,
      isGroup: conversationsTable.isGroup,
      avatarUrl: conversationsTable.avatarUrl,
      updatedAt: conversationsTable.updatedAt,
      createdAt: conversationsTable.createdAt,
      userEmail: usersTable.email,
      userName: usersTable.name,
    })
    .from(conversationsTable)
    .innerJoin(usersTable, eq(conversationsTable.userId, usersTable.id))
    .where(userId ? eq(conversationsTable.userId, userId) : undefined)
    .orderBy(desc(conversationsTable.updatedAt))
    .limit(200);

  res.json(rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString(), createdAt: r.createdAt.toISOString() })));
});

// ── Get messages for a conversation ──────────────────────────────────────────
router.get("/:id/messages", async (req, res) => {
  const convId = Number(req.params["id"]);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(100);

  res.json(msgs.reverse().map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
});

// ── Inject a correction / override message (sends via WA + records in DB) ────
router.post("/:id/inject", async (req, res) => {
  const convId = Number(req.params["id"]);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: "text is required" }); return; }

  // Load conversation + user WA config
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, convId))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const [wa] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.userId, conv.userId))
    .limit(1);

  // Send via WhatsApp if connection exists
  let sent = false;
  if (wa?.baseUrl && wa.apiKey && wa.instanceName) {
    sent = await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      conv.customerPhone,
      text.trim(),
    ).catch(() => false);
  }

  // Always record in DB as agent message
  const [msg] = await db
    .insert(messagesTable)
    .values({ conversationId: convId, from: "agent", text: text.trim() })
    .returning();

  await db
    .update(conversationsTable)
    .set({ lastMessage: text.trim(), updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId));

  res.json({ ok: true, sent, message: { ...msg!, createdAt: msg!.createdAt.toISOString() } });
});

// ── Pause / Resume agent for a conversation ───────────────────────────────────
router.patch("/:id/pause", async (req, res) => {
  const convId = Number(req.params["id"]);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db
    .select({ agentPaused: conversationsTable.agentPaused })
    .from(conversationsTable)
    .where(eq(conversationsTable.id, convId))
    .limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const next = !conv.agentPaused;
  await db
    .update(conversationsTable)
    .set({ agentPaused: next, updatedAt: new Date() })
    .where(eq(conversationsTable.id, convId));

  res.json({ ok: true, agentPaused: next });
});

export default router;
