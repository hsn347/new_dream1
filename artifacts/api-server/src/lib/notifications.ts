import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { logger } from "./logger.js";
import { sendPushToUser } from "./webPush.js";

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  body: string,
  link?: string,
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({ userId, type, title, body, link: link ?? null });
  } catch (err) {
    logger.warn({ err, userId, type }, "createNotification insert failed (non-fatal)");
  }
  sendPushToUser(userId, { title, body, url: link, tag: type }).catch(() => {});
}
