export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

function basicAuth(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

export async function testTwilioConnection(cfg: TwilioConfig): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}.json`,
      { headers: { Authorization: basicAuth(cfg.accountSid, cfg.authToken) }, signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) return { success: true, message: "تم الاتصال بـ Twilio بنجاح ✓" };
    if (res.status === 401) return { success: false, message: "بيانات Twilio غير صحيحة — تحقق من Account SID و Auth Token" };
    if (res.status === 404) return { success: false, message: "Account SID غير موجود في Twilio" };
    return { success: false, message: `خطأ HTTP ${res.status} من Twilio` };
  } catch {
    return { success: false, message: "تعذّر الاتصال بـ Twilio — تحقق من اتصال الشبكة" };
  }
}

export async function sendTwilioMessage(cfg: TwilioConfig, to: string, message: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      From: `whatsapp:${cfg.fromNumber}`,
      To: `whatsapp:${to}`,
      Body: message,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(cfg.accountSid, cfg.authToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("[Twilio] sendMessage failed:", res.status, err);
    }
    return res.ok;
  } catch (err) {
    console.error("[Twilio] sendMessage exception:", err);
    return false;
  }
}
