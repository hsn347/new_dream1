import webpush from "web-push";
import { db } from "@workspace/db";
import { systemSettingsTable, pushSubscriptionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const VAPID_PUBLIC_KEY = "BNq0SOxyVpQextNPWSxNiDE_jgsaHTz4V7F00egXU0YKPJW7HMb373qci32u1w0HvI7K1AfwGpPSeGIC5Qd_qxY";
const VAPID_PRIVATE_KEY = "4AP9W3f7plbIiCrNHf2LM5_9fJBm4nf8d-7vFkef7YU";
const VAPID_EMAIL = "mailto:admin@wakeel-saas.com";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL ?? VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY ?? VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY ?? VAPID_PRIVATE_KEY,
);

export const PUSH_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? VAPID_PUBLIC_KEY;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  try {
    const subs = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, userId));

    if (subs.length === 0) return;

    const data = JSON.stringify(payload);
    const failed: number[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            data,
          );
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            failed.push(sub.id);
          } else {
            logger.warn({ err, subId: sub.id }, "push send failed (non-fatal)");
          }
        }
      }),
    );

    if (failed.length > 0) {
      for (const id of failed) {
        await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "sendPushToUser failed (non-fatal)");
  }
}
