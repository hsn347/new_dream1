export interface Dialog360Config {
  apiKey: string;
  phoneNumber: string;
}

export async function testDialog360Connection(cfg: Dialog360Config): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch("https://waba.360dialog.io/v1/settings/profile", {
      headers: { "D360-API-KEY": cfg.apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 404) return { success: true, message: "تم التحقق من مفتاح 360dialog بنجاح ✓" };
    if (res.status === 401 || res.status === 403)
      return { success: false, message: "مفتاح 360dialog API غير صحيح أو منتهي الصلاحية" };
    return { success: false, message: `خطأ HTTP ${res.status} من 360dialog` };
  } catch {
    return { success: false, message: "تعذّر الاتصال بـ 360dialog — تحقق من اتصال الشبكة" };
  }
}

export async function sendDialog360Message(cfg: Dialog360Config, to: string, message: string): Promise<boolean> {
  try {
    const res = await fetch("https://waba.360dialog.io/v1/messages", {
      method: "POST",
      headers: { "D360-API-KEY": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ to, type: "text", text: { body: message } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[360dialog] sendMessage failed:", res.status, err);
    }
    return res.ok;
  } catch (err) {
    console.error("[360dialog] sendMessage exception:", err);
    return false;
  }
}
