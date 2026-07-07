import type { ToolCall, LLMResult, AGENT_TOOLS } from "./groq.js";

export type { ToolCall, LLMResult };

export interface GeminiConversationMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

async function callGeminiAPI(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
}

function parseGeminiError(status: number, body: { error?: { message?: string; status?: string } }): string {
  const rawMsg = body?.error?.message ?? "";
  const errStatus = body?.error?.status ?? "";

  if (status === 401 || status === 403) {
    return "مفتاح API غير صحيح أو لا يملك صلاحية الوصول";
  }
  if (status === 404) {
    return "النموذج غير موجود — تحقق من اسم النموذج";
  }
  if (status === 429 || errStatus === "RESOURCE_EXHAUSTED") {
    if (rawMsg.includes("limit: 0")) {
      return "الحصة المجانية غير متاحة لهذا المشروع — يرجى تفعيل الفوترة في Google Cloud أو استخدام مفتاح من مشروع آخر";
    }
    return "تم تجاوز حصة الطلبات — حاول مرة أخرى بعد قليل";
  }
  if (status === 400) {
    return rawMsg || "طلب غير صحيح";
  }
  return rawMsg || `خطأ HTTP ${status}`;
}

// ─── Vision: analyze customer image using Gemini's free vision capability ─────
//
// Uses the caller's configured model (e.g. gemini-2.0-flash, gemini-1.5-flash).
// max_tokens=150 keeps cost minimal — one short Arabic description is all we need.
// Returns null on failure so the caller can fall back gracefully.
//
export async function analyzeImageWithGemini(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimetype: string,
  caption?: string,
): Promise<string | null> {
  try {
    const mime = (mimetype || "image/jpeg").split(";")[0]!.trim();

    const prompt = caption?.trim()
      ? `العميل أرسل صورة مع التعليق: "${caption.trim()}". صف باختصار ما يظهر في الصورة وما يحتاجه العميل على الأرجح. جملة واحدة أو جملتان فقط بالعربية.`
      : `ما الذي يظهر في هذه الصورة؟ هل العميل يستفسر عن منتج معين؟ جملة واحدة أو جملتان بالعربية فقط.`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mime, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.1,
      },
    };

    const res = await callGeminiAPI(apiKey, model, body);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
      console.error(`[Gemini Vision] API error ${res.status}: ${errBody?.error?.message ?? "unknown"} — model: ${model}`);
      return null;
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error("[Gemini Vision] Exception:", err);
    return null;
  }
}

// ─── Audio: transcribe voice message via Gemini multimodal ────────────────────
//
// Used as fallback when no Groq key is available.
// Gemini 2.0 Flash / 1.5 Flash support audio inlineData natively.
// Returns null on failure.
//
export async function transcribeAudioWithGemini(
  apiKey: string,
  model: string,
  audioBase64: string,
  mimetype: string,
): Promise<string | null> {
  try {
    const mime = (mimetype || "audio/ogg").split(";")[0]!.trim();

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: "اكتب نص هذا التسجيل الصوتي بدقة. إذا كان بالعربية اكتبه بالعربية، وإذا كان بلغة أخرى اكتبه بتلك اللغة. اكتب النص فقط بدون أي تعليق أو مقدمة." },
            { inlineData: { mimeType: mime, data: audioBase64 } },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0,
      },
    };

    const res = await callGeminiAPI(apiKey, model, body);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
      console.error(`[Gemini Audio] API error ${res.status}: ${errBody?.error?.message ?? "unknown"} — model: ${model}`);
      return null;
    }

    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error("[Gemini Audio] Exception:", err);
    return null;
  }
}

export async function testGeminiConnection(
  apiKey: string,
  model: string,
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await callGeminiAPI(
      apiKey,
      model,
      {
        contents: [{ role: "user", parts: [{ text: "مرحباً" }] }],
        generationConfig: { maxOutputTokens: 10 },
      },
      controller.signal,
    );
    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, message: `الاتصال ناجح — ${model}`, latencyMs };
    }

    const body = await res.json().catch(() => ({})) as { error?: { message?: string; status?: string } };
    return { success: false, message: parseGeminiError(res.status, body) };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, message: "انتهت مهلة الاتصال" };
    }
    return { success: false, message: `خطأ في الاتصال: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function generateGeminiReply(
  apiKey: string,
  model: string,
  userMessage: string,
  systemPrompt?: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  tools?: typeof AGENT_TOOLS,
  maxTokens = 1000,
): Promise<LLMResult> {
  const MAX_ATTEMPTS = 3;

  const contents: GeminiConversationMessage[] = [];

  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.3,
    },
  };

  if (systemPrompt?.trim()) {
    body["systemInstruction"] = { parts: [{ text: systemPrompt.trim() }] };
  }

  if (tools && tools.length > 0) {
    body["tools"] = [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
    body["toolConfig"] = { functionCallingConfig: { mode: "AUTO" } };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await callGeminiAPI(apiKey, model, body);

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset-requests");
        const waitSec = retryAfterHeader ? Number(retryAfterHeader) : attempt * 3;
        console.warn(`[Gemini] 429 rate limit on attempt ${attempt}/${MAX_ATTEMPTS} — waiting ${waitSec}s`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        const body429 = await res.json().catch(() => ({})) as { error?: { message?: string } };
        console.error(`[Gemini] Rate limit exhausted after ${MAX_ATTEMPTS} attempts: ${body429?.error?.message}`);
        return { text: null, tokensUsed: 0 };
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        console.error(`[Gemini] API error ${res.status}: ${errBody?.error?.message ?? "unknown"} — model: ${model}`);
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        return { text: null, tokensUsed: 0 };
      }

      const data = await res.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<
              | { text?: string; functionCall?: undefined }
              | { functionCall?: { name: string; args: Record<string, unknown> }; text?: undefined }
            >;
          };
        }>;
        usageMetadata?: { totalTokenCount?: number };
      };

      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const tokensUsed = data?.usageMetadata?.totalTokenCount ?? 0;

      const textPart = parts.find((p) => typeof p.text === "string");
      const text = textPart?.text?.trim() ?? null;

      const toolCalls: ToolCall[] = parts
        .filter((p) => p.functionCall)
        .map((p) => ({ name: p.functionCall!.name, arguments: p.functionCall!.args }));

      if (toolCalls.length > 0) {
        return { text, tokensUsed, toolCalls };
      }
      return { text, tokensUsed };
    } catch (err) {
      console.error(`[Gemini] Request failed on attempt ${attempt}:`, err);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      return { text: null, tokensUsed: 0 };
    }
  }

  return { text: null, tokensUsed: 0 };
}
