import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, and, count, ne } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";

const router = Router();
router.use(requireAdmin);

router.get("/", async (_req, res) => {
  const admins = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
      lastLoginAt: usersTable.lastLoginAt,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .orderBy(usersTable.createdAt);

  res.json(admins.map(a => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  })));
});

router.post("/", async (req, res) => {
  const { name, email, password, phone } = req.body as {
    name?: string; email?: string; password?: string; phone?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({ message: "الاسم والبريد وكلمة المرور مطلوبة" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing.length > 0) {
    res.status(400).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [admin] = await db
    .insert(usersTable)
    .values({ name, email: email.toLowerCase().trim(), passwordHash, phone, role: "admin" })
    .returning();

  res.status(201).json({
    id: admin!.id,
    name: admin!.name,
    email: admin!.email,
    phone: admin!.phone,
    status: admin!.status,
    createdAt: admin!.createdAt.toISOString(),
    lastLoginAt: null,
  });
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, email, phone, status, password } = req.body as {
    name?: string; email?: string; phone?: string; status?: string; password?: string;
  };

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (name) updates.name = name;
  if (email) updates.email = email.toLowerCase().trim();
  if (phone !== undefined) updates.phone = phone;
  if (status) updates.status = status as "active" | "pending" | "disabled";
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  if (Object.keys(updates).length > 0) {
    await db.update(usersTable).set(updates).where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")));
  }

  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const selfId = req.session?.userId;

  if (id === selfId) {
    res.status(400).json({ message: "لا يمكنك حذف حسابك الخاص" });
    return;
  }

  const [adminCount] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(and(eq(usersTable.role, "admin"), ne(usersTable.id, id)));

  if ((adminCount?.count ?? 0) === 0) {
    res.status(400).json({ message: "لا يمكن حذف آخر مسؤول في النظام" });
    return;
  }

  await db.delete(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "admin")));
  res.json({ ok: true });
});

export default router;
