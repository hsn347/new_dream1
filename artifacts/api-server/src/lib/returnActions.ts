import { db } from "@workspace/db";
import { returnsTable, userSettingsTable, whatsappConnectionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendEvolutionMessage } from "./providers/evolution.js";
import { logger } from "./logger.js";
import { extractTaggedJsons } from "./parseTagAction.js";

export interface ReturnRequest {
  action: "request_return";
  customerName: string;
  customerPhone: string;
  orderId?: string;
  reason: string;
  items: string;
  senderPhone?: string;
}

export type ReturnAction = ReturnRequest;

export function parseReturnActions(text: string): { actions: ReturnAction[]; cleanText: string } {
  const { jsonStrings, cleanText: partial } = extractTaggedJsons(text, "[RETURN_ACTION:", 10);

  const actions: ReturnAction[] = [];
  for (const jsonStr of jsonStrings) {
    try {
      actions.push(JSON.parse(jsonStr) as ReturnAction);
    } catch {
      logger.warn({ jsonStr }, "Failed to parse RETURN_ACTION JSON");
    }
  }

  // Final cleanup: remove leftover fragments, orphaned braces, and extra blank lines
  let result = partial
    .replace(/\[RETURN_ACTION:[^\]]{0,2000}\]?/gs, "")
    .replace(/^\s*[\{\}\[\]]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { actions, cleanText: result };
}

export async function processReturnAction(
  userId: number,
  conversationId: number | undefined | null,
  action: ReturnAction,
  fallbackPhone?: string,
  fallbackName?: string,
  senderPhone?: string,
): Promise<number | null> {
  logger.info({ userId, conversationId, action }, "processReturnAction called");

  try {
    if (action.action === "request_return") {
      const resolvedSenderPhone = action.senderPhone ?? senderPhone ?? null;
      const insertValues = {
        userId,
        conversationId: conversationId ?? undefined,
        senderPhone: resolvedSenderPhone,
        orderId: action.orderId?.trim() || null,
        customerName: action.customerName?.trim() || fallbackName?.trim() || "غير محدد",
        customerPhone: action.customerPhone?.trim() || fallbackPhone?.trim() || "غير محدد",
        reason: action.reason?.trim() || "غير محدد",
        items: action.items?.trim() || "الطلب كاملاً",
        status: "pending_review" as const,
        updatedAt: new Date(),
      };

      logger.info({ userId, insertValues }, "Inserting return into DB");

      const [created] = await db
        .insert(returnsTable)
        .values(insertValues)
        .returning();

      if (created) {
        logger.info({ userId, returnId: created.id }, "Return request created successfully");
        await sendReturnNotification(userId, created.id);
        return created.id;
      } else {
        logger.warn({ userId }, "Return insert returned no rows");
      }
    }
  } catch (err) {
    logger.error({ err, userId, action }, "processReturnAction error");
  }
  return null;
}

async function buildReturnMessage(ret: typeof returnsTable.$inferSelect): Promise<string> {
  return [
    `↩️ *طلب استرجاع جديد*`,
    ``,
    `👤 *العميل:* ${ret.customerName}`,
    `📱 *الجوال:* ${ret.customerPhone}`,
    ret.orderId ? `📋 *رقم الطلب:* #${ret.orderId}` : `📋 *رقم الطلب:* لم يُحدد`,
    ``,
    `❓ *سبب الاسترجاع:*`,
    ret.reason,
    ``,
    `📦 *المنتجات المراد إرجاعها:*`,
    ret.items,
    ``,
    `🔢 *رقم المراجعة:* #${ret.id}`,
    ``,
    `📅 *التاريخ:* ${new Date(ret.createdAt).toLocaleDateString("ar-SA")}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function sendReturnNotification(userId: number, returnId: number): Promise<void> {
  try {
    const [settings] = await db
      .select({ reviewWhatsappNumber: userSettingsTable.reviewWhatsappNumber })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    const reviewNumber = settings?.reviewWhatsappNumber?.trim();
    if (!reviewNumber) {
      logger.info({ userId, returnId }, "No review number — skipping return notification");
      return;
    }

    const [wa] = await db
      .select()
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId))
      .limit(1);

    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

    const [ret] = await db.select().from(returnsTable).where(eq(returnsTable.id, returnId)).limit(1);
    if (!ret) return;

    const message = await buildReturnMessage(ret);
    const sent = await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      reviewNumber,
      message,
    );

    if (sent) {
      await db.update(returnsTable).set({ reviewSentAt: new Date() }).where(eq(returnsTable.id, returnId));
      logger.info({ userId, returnId, reviewNumber }, "Return notification sent");
    }
  } catch (err) {
    logger.error({ err, userId, returnId }, "sendReturnNotification error");
  }
}
