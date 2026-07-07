import { Router } from "express";
import { db } from "@workspace/db";
import { customerProfilesTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const profiles = await db
    .select()
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.userId, userId))
    .orderBy(desc(customerProfilesTable.lastActiveAt));

  res.json(
    profiles.map((p) => ({
      ...p,
      lastActiveAt: p.lastActiveAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  );
});

router.get("/:phone", async (req, res) => {
  const userId = req.session.userId!;
  const phone = decodeURIComponent(req.params["phone"]!);

  const [profile] = await db
    .select()
    .from(customerProfilesTable)
    .where(and(eq(customerProfilesTable.userId, userId), eq(customerProfilesTable.customerPhone, phone)))
    .limit(1);

  if (!profile) {
    res.json(null);
    return;
  }

  res.json({
    ...profile,
    lastActiveAt: profile.lastActiveAt.toISOString(),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
});

router.patch("/:phone", async (req, res) => {
  const userId = req.session.userId!;
  const phone = decodeURIComponent(req.params["phone"]!);
  const body = req.body as {
    detectedName?: string;
    city?: string;
  };

  const [existing] = await db
    .select({ id: customerProfilesTable.id })
    .from(customerProfilesTable)
    .where(and(eq(customerProfilesTable.userId, userId), eq(customerProfilesTable.customerPhone, phone)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ message: "الملف غير موجود" });
    return;
  }

  const updates: Partial<typeof customerProfilesTable.$inferInsert> = { updatedAt: new Date() };
  if (body.detectedName !== undefined) updates.detectedName = body.detectedName;
  if (body.city !== undefined) updates.city = body.city;

  await db
    .update(customerProfilesTable)
    .set(updates)
    .where(eq(customerProfilesTable.id, existing.id));

  res.json({ ok: true });
});

export default router;
