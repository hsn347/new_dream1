import { Router } from "express";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { testGroqConnection } from "../../lib/providers/groq.js";
import { testCohereConnection } from "../../lib/providers/cohere.js";
import { testGeminiConnection } from "../../lib/providers/gemini.js";

const router = Router();
router.use(requireAdmin);

router.get("/", async (_req, res) => {
  const keys = await db.select().from(apiKeysTable).orderBy(apiKeysTable.createdAt);
  const sanitized = keys.map((k) => ({ ...k, apiKey: maskKey(k.apiKey) }));
  res.json(sanitized);
});

router.post("/", async (req, res) => {
  const { name, type, provider, model, apiKey } = req.body as {
    name?: string;
    type?: string;
    provider?: string;
    model?: string;
    apiKey?: string;
  };

  if (!name || !type || !provider || !model || !apiKey) {
    res.status(400).json({ message: "جميع الحقول مطلوبة" });
    return;
  }

  const [created] = await db
    .insert(apiKeysTable)
    .values({ name, type: type as "chat" | "embedding", provider, model, apiKey })
    .returning();

  res.status(201).json({ ...created, apiKey: maskKey(created!.apiKey) });
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, provider, model, status, apiKey } = req.body as {
    name?: string;
    provider?: string;
    model?: string;
    status?: string;
    apiKey?: string;
  };

  const updates: Partial<typeof apiKeysTable.$inferInsert> = {};
  if (name) updates.name = name;
  if (provider) updates.provider = provider;
  if (model) updates.model = model;
  if (status) updates.status = status as "active" | "disabled";
  if (apiKey && apiKey.trim() && !apiKey.includes("•")) updates.apiKey = apiKey;

  const [updated] = await db
    .update(apiKeysTable)
    .set(updates)
    .where(eq(apiKeysTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ message: "المفتاح غير موجود" });
    return;
  }

  res.json({ ...updated, apiKey: maskKey(updated.apiKey) });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  res.json({ ok: true });
});

router.post("/:id/test", async (req, res) => {
  const id = Number(req.params["id"]);

  const [key] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.id, id))
    .limit(1);

  if (!key) {
    res.status(404).json({ message: "المفتاح غير موجود" });
    return;
  }

  let result: { success: boolean; message: string; latencyMs?: number };

  const providerLower = key.provider.toLowerCase();
  if (providerLower.includes("gemini") || providerLower.includes("google")) {
    result = await testGeminiConnection(key.apiKey, key.model);
  } else if (key.type === "chat" && providerLower.includes("groq")) {
    result = await testGroqConnection(key.apiKey, key.model);
  } else if (key.type === "embedding" && providerLower.includes("cohere")) {
    result = await testCohereConnection(key.apiKey, key.model);
  } else if (key.type === "chat") {
    result = await testGroqConnection(key.apiKey, key.model);
  } else {
    result = await testCohereConnection(key.apiKey, key.model);
  }

  if (result.latencyMs) {
    const current = key.avgLatencyMs || 0;
    const newAvg = current === 0 ? result.latencyMs : Math.round((current + result.latencyMs) / 2);
    await db
      .update(apiKeysTable)
      .set({ avgLatencyMs: newAvg, lastUsedAt: new Date() })
      .where(eq(apiKeysTable.id, id));
  }

  res.json(result);
});

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}

export default router;
