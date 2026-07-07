import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, userSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export async function seedDatabase() {
  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, "admin@demo.com"))
      .limit(1);

    if (existing.length > 0) return;

    const [adminHash, userHash] = await Promise.all([
      bcrypt.hash("admin123", 12),
      bcrypt.hash("user123", 12),
    ]);

    const [admin] = await db
      .insert(usersTable)
      .values({
        name: "أحمد الإداري",
        email: "admin@demo.com",
        passwordHash: adminHash,
        role: "admin",
        status: "active",
        phone: "+966500000000",
      })
      .returning({ id: usersTable.id });

    const [user] = await db
      .insert(usersTable)
      .values({
        name: "محمد العمري",
        email: "user@demo.com",
        passwordHash: userHash,
        role: "user",
        status: "active",
        phone: "+966501234567",
      })
      .returning({ id: usersTable.id });

    await Promise.all([
      db.insert(userSettingsTable).values({ userId: admin!.id, agentEnabled: true }),
      db.insert(userSettingsTable).values({ userId: user!.id, agentEnabled: true }),
    ]);

    logger.info("Database seeded with admin@demo.com and user@demo.com");
  } catch (err) {
    logger.warn({ err }, "Seed skipped or failed");
  }
}
