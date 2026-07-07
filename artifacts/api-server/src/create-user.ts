import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, userSettingsTable } from "@workspace/db/schema";

async function main() {
  const hash = await bcrypt.hash("owner123", 10);
  const [user] = await db.insert(usersTable).values({
    name: "المدير الجديد",
    email: "owner@demo.com",
    passwordHash: hash,
    role: "admin",
    status: "active",
    phone: "+966500000001",
  }).returning();
  
  await db.insert(userSettingsTable).values({
    userId: user.id,
    agentEnabled: true,
  });
  
  console.log("SUCCESS! User created with ID:", user.id);
  process.exit(0);
}

main().catch(console.error);
