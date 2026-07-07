export async function testCohereConnection(apiKey: string, model: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        texts: ["test"],
        input_type: "search_document",
        embedding_types: ["float"],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, message: `الاتصال ناجح — ${model}`, latencyMs };
    }
    if (res.status === 401) {
      return { success: false, message: "مفتاح API غير صحيح" };
    }
    if (res.status === 404) {
      return { success: false, message: `النموذج "${model}" غير موجود في Cohere` };
    }
    const body = await res.json().catch(() => ({})) as { message?: string };
    return { success: false, message: body?.message ?? `HTTP ${res.status}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, message: "انتهت مهلة الاتصال" };
    }
    return { success: false, message: `خطأ: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function generateEmbedding(
  apiKey: string,
  model: string,
  text: string,
  inputType: "search_document" | "search_query" = "search_document",
): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.cohere.com/v2/embed", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        texts: [text.slice(0, 2048)],
        input_type: inputType,
        embedding_types: ["float"],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as { embeddings?: { float?: number[][] } };
    return data?.embeddings?.float?.[0] ?? null;
  } catch {
    return null;
  }
}
