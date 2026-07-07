import { db } from "@workspace/db";
import { knowledgeChunksTable, userSettingsTable, apiKeysTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { generateEmbedding } from "./providers/cohere.js";
import { logger } from "./logger.js";

async function trackEmbeddingUsage(keyId: number, textLength: number): Promise<void> {
  try {
    const estimatedTokens = Math.ceil(textLength / 4);
    const [current] = await db
      .select({ requestsCount: apiKeysTable.requestsCount, tokensUsed: apiKeysTable.tokensUsed })
      .from(apiKeysTable)
      .where(eq(apiKeysTable.id, keyId))
      .limit(1);
    if (!current) return;
    await db
      .update(apiKeysTable)
      .set({
        requestsCount: current.requestsCount + 1,
        tokensUsed: current.tokensUsed + estimatedTokens,
        lastUsedAt: new Date(),
      })
      .where(eq(apiKeysTable.id, keyId));
  } catch (err) {
    logger.warn({ err, keyId }, "Failed to track embedding usage");
  }
}

export interface ChunkResult {
  content: string;
  refId: string;
  type: string;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function upsertChunk(
  userId: number,
  type: string,
  refId: string,
  content: string,
  apiKey: string,
  model: string,
  keyId?: number,
): Promise<void> {
  try {
    const embedding = await generateEmbedding(apiKey, model, content, "search_document");
    if (!embedding) {
      logger.warn({ userId, type, refId }, "Embedding generation returned null");
      return;
    }
    if (keyId) void trackEmbeddingUsage(keyId, content.length);

    const embeddingJson = JSON.stringify(embedding);

    await db
      .delete(knowledgeChunksTable)
      .where(
        and(
          eq(knowledgeChunksTable.userId, userId),
          eq(knowledgeChunksTable.type, type),
          eq(knowledgeChunksTable.refId, refId),
        ),
      );

    await db.insert(knowledgeChunksTable).values({
      userId,
      type,
      refId,
      content,
      embedding: embeddingJson,
    });

    logger.info({ userId, type, refId }, "Chunk upserted");
  } catch (err) {
    logger.error({ err, userId, type, refId }, "Failed to upsert chunk");
  }
}

export async function deleteChunk(userId: number, type: string, refId: string): Promise<void> {
  try {
    await db
      .delete(knowledgeChunksTable)
      .where(
        and(
          eq(knowledgeChunksTable.userId, userId),
          eq(knowledgeChunksTable.type, type),
          eq(knowledgeChunksTable.refId, refId),
        ),
      );
  } catch (err) {
    logger.error({ err, userId, type, refId }, "Failed to delete chunk");
  }
}

export async function searchChunks(
  userId: number,
  query: string,
  apiKey: string,
  model: string,
  topK = 5,
  minScore = 0.25,
  keyId?: number,
): Promise<ChunkResult[]> {
  try {
    const queryEmbedding = await generateEmbedding(apiKey, model, query, "search_query");
    if (!queryEmbedding) return [];
    if (keyId) void trackEmbeddingUsage(keyId, query.length);

    const chunks = await db
      .select({
        content: knowledgeChunksTable.content,
        embedding: knowledgeChunksTable.embedding,
        refId: knowledgeChunksTable.refId,
        type: knowledgeChunksTable.type,
      })
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.userId, userId));

    if (chunks.length === 0) return [];

    const scored = chunks
      .map((chunk) => {
        try {
          const emb = JSON.parse(chunk.embedding) as number[];
          return {
            content: chunk.content,
            refId: chunk.refId,
            type: chunk.type,
            score: cosineSimilarity(queryEmbedding, emb),
          };
        } catch {
          return { content: chunk.content, refId: chunk.refId, type: chunk.type, score: 0 };
        }
      })
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  } catch (err) {
    logger.error({ err, userId }, "Vector search failed");
    return [];
  }
}

export async function getEmbeddingKeyForUser(
  userId: number,
): Promise<{ id: number; apiKey: string; model: string } | null> {
  const [settings] = await db
    .select({ embeddingKeyId: userSettingsTable.embeddingKeyId })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId))
    .limit(1);

  // If user has a specific key configured, use it
  if (settings?.embeddingKeyId) {
    const [key] = await db
      .select({ id: apiKeysTable.id, apiKey: apiKeysTable.apiKey, model: apiKeysTable.model })
      .from(apiKeysTable)
      .where(and(eq(apiKeysTable.id, settings.embeddingKeyId), eq(apiKeysTable.status, "active")))
      .limit(1);
    if (key) return { id: key.id, apiKey: key.apiKey, model: key.model };
  }

  // Fall back to any active embedding key
  const [anyKey] = await db
    .select({ id: apiKeysTable.id, apiKey: apiKeysTable.apiKey, model: apiKeysTable.model })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.type, "embedding"), eq(apiKeysTable.status, "active")))
    .limit(1);

  if (!anyKey) return null;
  return { id: anyKey.id, apiKey: anyKey.apiKey, model: anyKey.model };
}

export function buildProductChunk(p: {
  id?: number;
  name: string;
  description: string;
  price: string;
  currency: string;
  unit: string;
  qty: number;
  status: string;
}): string {
  const lines: string[] = [`منتج: ${p.name}`];
  if (p.description) lines.push(`الوصف: ${p.description}`);
  lines.push(`السعر: ${p.price} ${p.currency} لكل ${p.unit}`);
  if (p.qty > 0) lines.push(`الكمية المتاحة: ${p.qty} ${p.unit}`);
  lines.push(`الحالة: ${p.status === "active" ? "متاح للبيع" : "غير متاح"}`);
  return lines.join("\n");
}

export function buildCouponChunk(c: {
  code: string;
  type: string;
  value: string;
  products: string;
  startDate: string | null;
  endDate: string | null;
}): string {
  const disc = c.type === "percent" ? `خصم ${c.value}%` : `خصم ${c.value} ريال`;
  const lines: string[] = [`كوبون خصم: ${c.code} — ${disc}`];
  if (c.products !== "الكل") lines.push(`يشمل: ${c.products}`);
  if (c.startDate) lines.push(`من: ${c.startDate}`);
  if (c.endDate) lines.push(`حتى: ${c.endDate}`);
  return lines.join("\n");
}

export function buildBusinessChunks(biz: {
  name: string | null;
  description: string | null;
  storeUrl: string | null;
  phones: string | null;
  branches: string | null;
  socialLinks: string | null;
  bankAccounts: string | null;
  workingHours: string | null;
  returnPolicy: string | null;
}): Array<{ refId: string; content: string }> {
  const chunks: Array<{ refId: string; content: string }> = [];

  if (biz.name) {
    const lines = [`معلومات المتجر: ${biz.name}`];
    if (biz.description) lines.push(`الوصف: ${biz.description}`);
    if (biz.storeUrl) lines.push(`الموقع الإلكتروني: ${biz.storeUrl}`);
    chunks.push({ refId: "business-general", content: lines.join("\n") });
  }

  function parseContactJson(raw: string | null): Array<{ label: string; value: string }> {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map((item: unknown) => {
        if (typeof item === "string") return { label: "", value: item.trim() };
        if (typeof item === "object" && item !== null) {
          const o = item as { label?: string; value?: string };
          return { label: o.label ?? "", value: o.value ?? "" };
        }
        return { label: "", value: "" };
      }).filter(x => x.value);
    } catch { return []; }
  }

  const phoneItems = parseContactJson(biz.phones);
  const branchItems = parseContactJson(biz.branches);

  const cleanPhones = phoneItems.map(p => p.label ? `${p.label}: ${p.value}` : p.value).filter(Boolean);
  const cleanBranches = branchItems.map(b => b.label ? `${b.label}: ${b.value}` : b.value).filter(Boolean);

  if (cleanPhones.length || cleanBranches.length) {
    const lines = ["معلومات التواصل والفروع"];
    if (cleanPhones.length) lines.push(`أرقام الهاتف: ${cleanPhones.join(", ")}`);
    if (cleanBranches.length) lines.push(`الفروع: ${cleanBranches.join(", ")}`);
    chunks.push({ refId: "business-contact", content: lines.join("\n") });
  }

  try {
    const wh = biz.workingHours
      ? (JSON.parse(biz.workingHours) as Array<{ day: string; enabled: boolean; open: string; close: string }>)
      : [];
    const active = wh.filter((d) => d.enabled).map((d) => `${d.day}: ${d.open}–${d.close}`).join(", ");
    if (active) chunks.push({ refId: "business-hours", content: `ساعات العمل:\n${active}` });
  } catch {}

  if (biz.returnPolicy) {
    chunks.push({ refId: "business-return", content: `سياسة الاسترجاع:\n${biz.returnPolicy}` });
  }

  try {
    const sl = biz.socialLinks ? (JSON.parse(biz.socialLinks) as Record<string, string>) : {};
    const active = Object.entries(sl).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
    if (active) chunks.push({ refId: "business-social", content: `روابط التواصل الاجتماعي:\n${active}` });
  } catch {}

  try {
    const ba = biz.bankAccounts
      ? (JSON.parse(biz.bankAccounts) as Array<{ bank?: string; type?: string; owner: string; iban?: string; account?: string }>)
      : [];
    if (ba.length > 0) {
      const typeAliases: Record<string, string> = { omqi: "عمقي", kuraimi: "الكريمي", ahli: "الأهلي", cac: "كاك بنك" };
      const baStr = ba.map((b) => {
        const rawType = b.type?.trim() ?? "";
        const bankName = b.bank?.trim() || typeAliases[rawType.toLowerCase()] || rawType || "بنك";
        const iban = b.iban?.trim();
        const accountNum = b.account?.trim();
        const numPart = iban
          ? ` — IBAN: ${iban}${accountNum ? ` — رقم الحساب: ${accountNum}` : ""}`
          : accountNum
            ? ` — رقم الحساب: ${accountNum}`
            : "";
        return `${bankName} — اسم صاحب الحساب: ${b.owner}${numPart}`;
      }).join("\n");
      chunks.push({ refId: "business-banking", content: `الحسابات البنكية:\n${baStr}` });
    }
  } catch {}

  return chunks;
}
