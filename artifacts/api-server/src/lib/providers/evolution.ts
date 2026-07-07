export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export async function testEvolutionConnection(config: EvolutionConfig): Promise<{ success: boolean; message: string; state?: string }> {
  const base = normalizeUrl(config.baseUrl);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${base}/instance/connectionState/${config.instanceName}`, {
      headers: { apikey: config.apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const state = (data as { instance?: { state?: string } })?.instance?.state ?? "unknown";
      if (state === "open") {
        return { success: true, message: `متصل بنجاح — الحالة: ${state}`, state };
      }
      return { success: false, message: `الـ Instance غير متصل — الحالة: ${state}`, state };
    }

    if (res.status === 404) {
      return { success: false, message: `الـ Instance "${config.instanceName}" غير موجود على الخادم`, state: "not_found" };
    }
    if (res.status === 401 || res.status === 403) {
      return { success: false, message: "مفتاح API غير صحيح — تحقق من الـ API Key", state: "auth_error" };
    }
    return { success: false, message: `خطأ HTTP ${res.status}: ${res.statusText}`, state: "error" };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, message: "انتهت مهلة الاتصال — تحقق من الـ Base URL", state: "timeout" };
    }
    return { success: false, message: `خطأ في الاتصال: ${err instanceof Error ? err.message : String(err)}`, state: "error" };
  }
}

/**
 * Fetches the phone number connected to the Evolution instance.
 * Returns the raw phone digits (e.g. "96779XXXXXXX") or null if unavailable.
 */
export async function fetchInstancePhone(config: EvolutionConfig): Promise<string | null> {
  const base = normalizeUrl(config.baseUrl);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(config.instanceName)}`,
      { headers: { apikey: config.apiKey }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as unknown;
    // Evolution v2 returns an array; v1 returns a single object
    const entry = Array.isArray(data) ? data[0] : data;
    if (!entry) return null;
    // ownerJid looks like "96779XXXXXXX@s.whatsapp.net"
    const ownerJid: string =
      (entry as Record<string, unknown>)["ownerJid"] as string
      ?? (entry as Record<string, unknown>)["owner"] as string
      ?? ((entry as Record<string, unknown>)["instance"] as Record<string, unknown> | undefined)?.["ownerJid"] as string
      ?? "";
    const phone = ownerJid.replace(/@.*$/, "").replace(/\D/g, "");
    return phone || null;
  } catch {
    return null;
  }
}

export async function createEvolutionInstance(config: EvolutionConfig, webhookUrl: string): Promise<{ success: boolean; message: string; alreadyExists?: boolean }> {
  const base = normalizeUrl(config.baseUrl);
  try {
    const res = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceName: config.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          headers: {},
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "PRESENCE_UPDATE"],
        },
      }),
    });

    if (res.ok) {
      return { success: true, message: "تم إنشاء الـ Instance بنجاح" };
    }
    if (res.status === 400 || res.status === 409) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      const msg = body?.message ?? "";
      if (msg.toLowerCase().includes("exist") || msg.toLowerCase().includes("already")) {
        return { success: true, message: "الـ Instance موجود مسبقاً", alreadyExists: true };
      }
      return { success: false, message: msg || `خطأ ${res.status}` };
    }
    const body = await res.json().catch(() => ({})) as { message?: string };
    return { success: false, message: (body as { message?: string })?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, message: `خطأ: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function fetchEvolutionQrCode(config: EvolutionConfig): Promise<{ success: boolean; qrCode?: string; message: string; state?: string }> {
  const base = normalizeUrl(config.baseUrl);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${base}/instance/connect/${config.instanceName}`, {
      headers: { apikey: config.apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 404) {
        return { success: false, message: `الـ Instance "${config.instanceName}" غير موجود — أنشئه أولاً`, state: "not_found" };
      }
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data = await res.json() as Record<string, unknown>;

    const b64 = (data["base64"] as string | undefined)
      ?? (data["qrcode"] as string | undefined)
      ?? ((data["instance"] as Record<string, unknown> | undefined)?.["qrcode"] as string | undefined)
      ?? ((data["qrcode"] as Record<string, unknown> | undefined)?.["base64"] as string | undefined);

    if (b64) {
      const qrCode = b64.startsWith("data:image") ? b64 : `data:image/png;base64,${b64}`;
      return { success: true, qrCode, message: "QR Code جاهز للمسح", state: "qr_ready" };
    }

    const state = (data as { state?: string })?.state ?? "unknown";
    if (state === "open") {
      return { success: true, message: "الـ Instance متصل بالفعل", state: "open" };
    }

    return { success: false, message: `الـ Instance في حالة: ${state}`, state };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, message: "انتهت مهلة الطلب — تحقق من الخادم", state: "timeout" };
    }
    return { success: false, message: `خطأ: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function setEvolutionWebhook(config: EvolutionConfig, webhookUrl: string): Promise<boolean> {
  const base = normalizeUrl(config.baseUrl);
  try {
    const res = await fetch(`${base}/webhook/set/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        byEvents: false,
        base64: false,
        headers: {},
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "PRESENCE_UPDATE"],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendEvolutionImage(
  config: EvolutionConfig,
  phoneNumber: string,
  imageUrl: string,
  caption = "",
): Promise<boolean> {
  const base = normalizeUrl(config.baseUrl);
  const phone = phoneNumber.replace(/[^0-9]/g, "");

  try {
    // Evolution API v2 format — send image as a public URL
    const payload = {
      number: phone,
      mediatype: "image",
      mimetype: "image/jpeg",
      caption,
      media: imageUrl,
      fileName: "product.jpg",
    };

    const res = await fetch(`${base}/message/sendMedia/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) return true;

    const errBody = await res.json().catch(() => ({})) as { message?: unknown };
    console.error(`[Evolution] sendMedia failed ${res.status}:`, JSON.stringify(errBody));
    return false;
  } catch (err) {
    console.error("[Evolution] sendEvolutionImage exception:", err);
    return false;
  }
}

export async function sendEvolutionDocument(
  config: EvolutionConfig,
  phoneNumber: string,
  base64: string,
  fileName: string,
  caption = "",
): Promise<boolean> {
  const base = normalizeUrl(config.baseUrl);
  const phone = phoneNumber.replace(/[^0-9]/g, "");

  try {
    const payload = {
      number: phone,
      mediatype: "document",
      mimetype: "application/pdf",
      caption,
      media: base64,
      fileName,
    };

    const res = await fetch(`${base}/message/sendMedia/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) return true;

    const errBody = await res.json().catch(() => ({})) as { message?: unknown };
    console.error(`[Evolution] sendEvolutionDocument failed ${res.status}:`, JSON.stringify(errBody));
    return false;
  } catch (err) {
    console.error("[Evolution] sendEvolutionDocument exception:", err);
    return false;
  }
}

export async function sendEvolutionMessage(
  config: EvolutionConfig,
  phoneNumber: string,
  text: string,
): Promise<boolean> {
  const base = normalizeUrl(config.baseUrl);
  const phone = phoneNumber.replace(/[^0-9]/g, "");

  try {
    const res = await fetch(`${base}/message/sendText/${config.instanceName}`, {
      method: "POST",
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: phone,
        options: { delay: 1200, presence: "composing" },
        textMessage: { text },
      }),
    });

    if (res.ok) return true;

    const alt = await fetch(`${base}/message/sendText/${config.instanceName}`, {
      method: "POST",
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: phone, text }),
    });
    return alt.ok;
  } catch {
    return false;
  }
}

// ─── Subscribe to a contact's presence events ─────────────────────────────────
// Must be called after receiving each customer message so WhatsApp starts
// forwarding their "composing" events to the webhook.
export async function subscribeToPresence(
  config: EvolutionConfig,
  phoneNumber: string,
): Promise<void> {
  const base = normalizeUrl(config.baseUrl);
  const phone = phoneNumber.replace(/[^0-9]/g, "");
  try {
    // Evolution API v2
    await fetch(`${base}/chat/subscribeToPresenceEvents/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: `${phone}@s.whatsapp.net` }),
    });
  } catch {
    // Non-critical — silently ignore
  }
}

// ─── Send typing / composing presence indicator ──────────────────────────────
export async function sendEvolutionTyping(
  config: EvolutionConfig,
  phoneNumber: string,
  durationMs = 8000,
): Promise<void> {
  const base = normalizeUrl(config.baseUrl);
  const phone = phoneNumber.replace(/[^0-9]/g, "");
  try {
    // Evolution v2 presence endpoint
    await fetch(`${base}/chat/sendPresence/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: phone,
        options: { presence: "composing", delay: durationMs },
      }),
    });
  } catch {
    // Non-critical — silently ignore
  }
}

// ─── Fetch group subject (real name) from Evolution API ──────────────────────
export async function fetchGroupName(
  config: EvolutionConfig,
  groupJid: string,
): Promise<string | null> {
  const base = normalizeUrl(config.baseUrl);
  const jid = groupJid.endsWith("@g.us") ? groupJid : `${groupJid}@g.us`;
  try {
    const res = await fetch(
      `${base}/group/findGroupInfos/${config.instanceName}?groupJid=${encodeURIComponent(jid)}`,
      { headers: { apikey: config.apiKey } },
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const subject =
      (data["subject"] as string | undefined) ??
      ((data["group"] as Record<string, unknown> | undefined)?.["subject"] as string | undefined) ??
      null;
    return subject ?? null;
  } catch {
    return null;
  }
}

// ─── Download media (audio/image) as base64 from Evolution API ───────────────
export async function downloadEvolutionMedia(
  config: EvolutionConfig,
  messageKey: Record<string, unknown>,
  messageObj: Record<string, unknown>,
): Promise<{ base64: string; mimetype: string } | null> {
  const base = normalizeUrl(config.baseUrl);
  try {
    const res = await fetch(`${base}/chat/getBase64FromMediaMessage/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: messageKey, message: messageObj } }),
    });

    if (!res.ok) {
      console.error(`[Evolution] downloadMedia failed ${res.status}`);
      return null;
    }

    const data = await res.json() as { base64?: string; mimetype?: string };
    if (!data.base64) return null;

    return {
      base64: data.base64,
      mimetype: data.mimetype ?? "audio/ogg; codecs=opus",
    };
  } catch (err) {
    console.error("[Evolution] downloadMedia exception:", err);
    return null;
  }
}

export async function fetchProfilePictureUrl(
  config: EvolutionConfig,
  phone: string,
): Promise<string | null> {
  const base = normalizeUrl(config.baseUrl);
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  try {
    const res = await fetch(`${base}/chat/fetchProfilePictureUrl/${config.instanceName}`, {
      method: "POST",
      headers: { apikey: config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: cleanPhone }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { profilePictureUrl?: string };
    return data?.profilePictureUrl ?? null;
  } catch {
    return null;
  }
}
