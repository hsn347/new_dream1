import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable, whatsappConnectionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../../middlewares/requireAdmin.js";
import { sendEvolutionMessage } from "../../lib/providers/evolution.js";
import { logger } from "../../lib/logger.js";

const router = Router();
router.use(requireAdmin);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(systemSettingsTable);
  const result: Record<string, string> = {};
  for (const r of rows) result[r.key] = r.value;
  res.json(result);
});

router.put("/", async (req, res) => {
  const data = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(data)) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
  }
  res.json({ ok: true });
});

router.post("/test-whatsapp", async (req, res) => {
  const { number } = req.body as { number?: string };
  if (!number) {
    res.status(400).json({ success: false, message: "رقم الهاتف مطلوب" });
    return;
  }

  const [wa] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.status, "connected"))
    .limit(1);

  if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) {
    res.json({
      success: false,
      message: "لا يوجد اتصال واتساب نشط في النظام لإرسال رسالة الاختبار",
    });
    return;
  }

  try {
    const sent = await sendEvolutionMessage(
      { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName },
      number,
      "✅ رسالة اختبار من نظام وكيل المبيعات — إشعارات المفاتيح تعمل بشكل صحيح!",
    );
    res.json({
      success: sent,
      message: sent
        ? "تم إرسال رسالة الاختبار بنجاح!"
        : "فشل الإرسال — تحقق من إعدادات اتصال واتساب",
    });
  } catch (err) {
    logger.error({ err }, "Test WhatsApp notification failed");
    res.json({ success: false, message: "حدث خطأ أثناء الإرسال" });
  }
});

export default router;
