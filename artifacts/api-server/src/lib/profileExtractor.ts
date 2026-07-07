import { db } from "@workspace/db";
import { customerProfilesTable, ordersTable, productsTable } from "@workspace/db/schema";
import { eq, and, inArray, count, desc } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Rule-based customer profile update — no LLM calls, zero token cost.
 * Updates 4 simple fields:
 *   1. detectedName — from WhatsApp push name or order customer name
 *   2. city         — from most recent order's delivery address
 *   3. isBuyer      — has at least one completed/delivered order (once true, stays true)
 *   4. inquiredProducts — product names mentioned in this message (matched against DB)
 */
export async function extractAndUpdateProfile(
  userId: number,
  customerPhone: string,
  customerName: string | undefined,
  incomingText: string,
): Promise<void> {
  try {
    const now = new Date();

    // ── Products mentioned in this message (no LLM — simple string match) ──
    const products = await db
      .select({ name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.userId, userId));

    const textLower = incomingText.toLowerCase();
    const mentionedProducts = products
      .filter((p) => p.name && textLower.includes(p.name.toLowerCase()))
      .map((p) => p.name);

    // ── isBuyer: at least one completed / delivered order for this phone ────
    const [completedCount] = await db
      .select({ c: count() })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, userId),
          eq(ordersTable.senderPhone, customerPhone),
          inArray(ordersTable.status, ["approved", "delivered"]),
        ),
      );
    const isBuyer = Number(completedCount?.c ?? 0) > 0;

    // ── Location + name from most recent order ───────────────────────────────
    const [latestOrder] = await db
      .select({ customerAddress: ordersTable.customerAddress, customerName: ordersTable.customerName })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), eq(ordersTable.senderPhone, customerPhone)))
      .orderBy(desc(ordersTable.createdAt))
      .limit(1);

    // ── Total orders for this phone ──────────────────────────────────────────
    const [orderCount] = await db
      .select({ c: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), eq(ordersTable.senderPhone, customerPhone)));
    const totalOrders = Number(orderCount?.c ?? 0);

    // ── Upsert ───────────────────────────────────────────────────────────────
    const [existing] = await db
      .select()
      .from(customerProfilesTable)
      .where(and(eq(customerProfilesTable.userId, userId), eq(customerProfilesTable.customerPhone, customerPhone)))
      .limit(1);

    const resolvedName = customerName ?? latestOrder?.customerName ?? null;

    if (!existing) {
      await db.insert(customerProfilesTable).values({
        userId,
        customerPhone,
        detectedName: resolvedName,
        city: latestOrder?.customerAddress ?? null,
        isBuyer,
        inquiredProducts: mentionedProducts,
        totalOrders,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const merged = Array.from(
        new Set([...(existing.inquiredProducts ?? []), ...mentionedProducts]),
      ).slice(0, 30);

      const updates: Partial<typeof customerProfilesTable.$inferInsert> = {
        lastActiveAt: now,
        updatedAt: now,
        totalOrders,
        isBuyer: isBuyer || existing.isBuyer,
        inquiredProducts: merged,
      };

      if (!existing.detectedName && resolvedName) updates.detectedName = resolvedName;
      if (!existing.city && latestOrder?.customerAddress) updates.city = latestOrder.customerAddress;

      await db
        .update(customerProfilesTable)
        .set(updates)
        .where(eq(customerProfilesTable.id, existing.id));
    }

    logger.info(
      { userId, customerPhone, isBuyer, mentioned: mentionedProducts.length },
      "Customer profile updated (rule-based)",
    );
  } catch (err) {
    logger.warn({ err, userId, customerPhone }, "Failed to update customer profile");
  }
}
