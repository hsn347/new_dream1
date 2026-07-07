import { Router } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { PUSH_PUBLIC_KEY } from "../../lib/webPush.js";

const router = Router();

router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: PUSH_PUBLIC_KEY });
});

router.post("/subscribe", async (req, res) => {
  const userId = (req.session as any).userId as number;
  const { endpoint, keys } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ message: "بيانات الاشتراك غير مكتملة" });
    return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });

  res.json({ ok: true });
});

router.delete("/unsubscribe", async (req, res) => {
  const userId = (req.session as any).userId as number;
  const { endpoint } = req.body as { endpoint: string };

  if (!endpoint) {
    res.status(400).json({ message: "endpoint مطلوب" });
    return;
  }

  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.userId, userId),
        eq(pushSubscriptionsTable.endpoint, endpoint),
      ),
    );

  res.json({ ok: true });
});

export default router;
