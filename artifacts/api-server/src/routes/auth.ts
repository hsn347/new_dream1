import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Simple in-memory rate limiter: max 10 attempts per IP per 15 minutes ─────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function resetRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

// Clean up stale entries every 30 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");

  if (!checkRateLimit(ip)) {
    logger.warn({ ip }, "Login rate limit exceeded");
    res.status(429).json({ message: "محاولات كثيرة — انتظر 15 دقيقة وحاول مجدداً" });
    return;
  }

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ message: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  if (user.status === "disabled") {
    res.status(403).json({ message: "الحساب موقوف. تواصل مع المدير" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    return;
  }

  // Successful login — reset rate limit counter for this IP
  resetRateLimit(ip);

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  req.session.userId = user.id;
  req.session.userRole = user.role;

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session?.userId) {
    res.json(null);
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1);

  res.json(user ?? null);
});

export default router;
