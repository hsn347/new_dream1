export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResult {
  text: string | null;
  tokensUsed: number;
  toolCalls?: ToolCall[];
}

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "submit_order",
      description: "Save the customer order when required details are collected: name, address, items, and totals. Also call this when the customer provides a deposit reference number — pass it as depositReference.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Customer full name" },
          customerPhone: { type: "string", description: "Contact/delivery phone number ONLY if the customer explicitly stated it in the conversation. Do NOT infer or auto-fill this from any other source. Leave empty if the customer did not mention a phone number." },
          customerAddress: { type: "string", description: "Delivery address" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                qty: { type: "number" },
                unit: { type: "string" },
                price: { type: "string" },
                total: { type: "string" },
              },
              required: ["name", "qty", "unit", "price", "total"],
            },
          },
          subtotal: { type: "string" },
          deliveryCost: { type: "string" },
          total: { type: "string" },
          currency: { type: "string", description: "Currency code of the order (e.g. SAR, YER, USD). Use the currency shown in the product catalog." },
          depositReference: { type: "string", description: "Payment/deposit reference number if the customer provided one" },
        },
        required: ["customerName", "items", "subtotal", "deliveryCost", "total", "currency"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "amend_order",
      description: "Amend (update) an existing order when the customer wants to change items, quantities, or totals — including when the customer paid more than the order total and wants to use the surplus to add more products. Use this tool ONLY for modifying an already-submitted order. It replaces the current order items with the new ones you provide.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Customer full name (carry over from existing order)" },
          customerPhone: { type: "string", description: "Contact phone if known" },
          customerAddress: { type: "string", description: "Delivery address (carry over from existing order)" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                qty: { type: "number" },
                unit: { type: "string" },
                price: { type: "string" },
                total: { type: "string" },
              },
              required: ["name", "qty", "unit", "price", "total"],
            },
          },
          subtotal: { type: "string" },
          deliveryCost: { type: "string" },
          total: { type: "string" },
          currency: { type: "string" },
          amendReason: { type: "string", description: "Brief reason for the amendment, e.g. 'customer paid more, adding 8kg honey'" },
        },
        required: ["customerName", "items", "subtotal", "deliveryCost", "total", "currency"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "request_return",
      description: "Call this tool IMMEDIATELY if the customer asks to return or exchange any product. Do NOT ask for reasons, items, or order numbers. Just call it.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID or reference number" },
          customerName: { type: "string" },
          customerPhone: { type: "string" },
          reason: { type: "string", description: "Reason for the return (optional, put 'غير محدد' if unknown)" },
          items: { type: "string", description: "Items to return (optional, put 'غير محدد' if unknown)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_product_image",
      description: "Call this tool if the customer asks for a picture of a specific product AND the product catalog indicates that the product has an image (has_image: true / يمتلك صورة). Pass the product ID. DO NOT call this if the product does not have an image.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number", description: "The ID of the product to send the image for" },
        },
        required: ["productId"],
      },
    },
  },
] as const;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentBehavior {
  dialect: string;
  dialectStrength: number;
  style: string;
  tone: string;
  persuasion: number;
  formality: number;
  emojiLevel: string;
  replyLength: string;
  openingMessage?: string | null;
  closingMessage?: string | null;
  stratFollowup: boolean;
  stratCart: boolean;
  stratUpsell: boolean;
  stratPromo: boolean;
  stratReview: boolean;
  orderSystemEnabled?: boolean;
}

export async function testGroqConnection(apiKey: string, model: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 5,
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
      return { success: false, message: `النموذج "${model}" غير موجود في Groq` };
    }
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { success: false, message: body?.error?.message ?? `HTTP ${res.status}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, message: "انتهت مهلة الاتصال" };
    }
    return { success: false, message: `خطأ: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function generateGroqReply(
  apiKey: string,
  model: string,
  userMessage: string,
  systemPrompt?: string,
  history?: ConversationMessage[],
  tools?: typeof AGENT_TOOLS,
  maxTokens = 1000,
): Promise<LLMResult> {
  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: systemPrompt ?? "أنت وكيل مبيعات ذكي ومحترف. أجب فقط بناءً على بياناتك.",
    },
  ];

  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: userMessage });

  const payload: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  };

  if (tools && tools.length > 0) {
    payload["tools"] = tools;
    payload["tool_choice"] = "auto";
  }

  const body = JSON.stringify(payload);

  // Retry up to 3 times with exponential backoff (handles rate limits)
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "5");
        const waitMs = Math.min((retryAfter * 1000) + (attempt * 500), 15000);
        console.warn(`[Groq] Rate limited (attempt ${attempt}/${maxAttempts}), waiting ${waitMs}ms`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        return { text: null, tokensUsed: 0 };
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        console.error(`[Groq] API error ${res.status}: ${errBody?.error?.message ?? "unknown"} — model: ${model}`);
        if (attempt < maxAttempts && res.status >= 500) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        return { text: null, tokensUsed: 0 };
      }

      const data = await res.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
        usage?: { total_tokens?: number };
      };

      const msg = data?.choices?.[0]?.message;
      const text = msg?.content?.trim() ?? null;
      const tokensUsed = data?.usage?.total_tokens ?? 0;

      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        const toolCalls: ToolCall[] = msg.tool_calls
          .filter((tc) => tc.type === "function")
          .map((tc) => {
            try {
              return { name: tc.function.name, arguments: JSON.parse(tc.function.arguments) as Record<string, unknown> };
            } catch {
              console.error("[Groq] Failed to parse tool call arguments:", tc.function.arguments);
              return null;
            }
          })
          .filter((tc): tc is ToolCall => tc !== null);
        return { text, tokensUsed, toolCalls };
      }

      return { text, tokensUsed };
    } catch (err) {
      console.error(`[Groq] Request failed (attempt ${attempt}):`, err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      return { text: null, tokensUsed: 0 };
    }
  }
  return { text: null, tokensUsed: 0 };
}

export interface NegotiationProduct {
  name: string;
  price: string;
  negotiationPrice: string;
  currency: string;
}

function dialectInstruction(dialect: string, strength: number): string {
  if (dialect === "msa") {
    if (strength <= 3) return "تحدث بعربية واضحة وبسيطة مع بعض الملامح الفصيحة.";
    if (strength <= 6) return "تحدث بالعربية الفصحى الحديثة بشكل واضح ومنسجم — بثقة ووقار.";
    if (strength <= 8) return "تحدث بالعربية الفصحى الراسخة — نبرة رسمية راقية واثقة، تجنب العامية تماماً.";
    return "تحدث بالعربية الفصحى الكلاسيكية الرفيعة — مفردات وتراكيب فصيحة أصيلة، بثقة عالية واعتزاز.";
  }

  const dialectDetails: Record<string, { base: string; mid: string; strong: string; full: string }> = {
    saudi: {
      base: "أدخل بعض الكلمات السعودية الخفيفة بين حين وآخر.",
      mid: `تحدث باللهجة السعودية بوضوح وثقة. استخدم مفردات مثل: "زين"، "كيفك"، "وش الأخبار"، "الله يعطيك العافية"، "تمام"، "بس"، "ترا".`,
      strong: `تحدث باللهجة السعودية الأصيلة كأهلها تماماً — بثقة عالية وعزة نفس:
• التحيات: "هلا والله"، "مرحبا"، "هلا بيك"، "الله يحييك"
• التأكيد: "والله زين"، "صح كلامك"، "ترا صدق"، "والله صحيح"
• الاستفسار: "وش تبغى؟"، "كيفك؟"، "وش الأخبار؟"
• الموافقة: "عاد"، "تمام"، "بس كذا؟"، "زين والله"
• التشجيع: "ترا يستاهل"، "والله ما تندم"، "بكّر خذه"
• الشكر: "الله يعطيك العافية"، "ما قصّرت"، "مشكور"`,
      full: `أنت ابن نجد والحجاز — لهجة سعودية أصيلة في كل كلمة، بثقة لا تتزعزع:
• ابدأ بـ: "هلا والله"، "يا هلا فيك"، "مرحبا والله"
• الأسئلة: "وش تبغى؟"، "وش اللي يخدمك؟"، "كيف أقدر أساعدك؟"
• ألفاظ مميزة: "بعدين"، "ترا"، "عشان"، "عاد"، "بس"، "خل"، "يمكن"
• إغلاق: "ترا الشي يستاهل"، "والله ما تندم"، "خذه وأنت مرتاح"
• أبدال: "الآن→هالحين"، "جيد→زين"، "هؤلاء→هذول"، "الذي→اللي"`,
    },
    hadrami: {
      base: "أدخل بعض الكلمات الحضرمية الخفيفة بين حين وآخر مثل 'كاك' و'مسلك'.",
      mid: `تحدث باللهجة الحضرمية بوضوح وأصالة. استخدم مفردات مثل: "كاك"، "مسلك"، "بس هو"، "شحوالك"، "الله يعافيك"، "زين"، "هيا"، "يا سيدي"، "عود"، "ذا".`,
      strong: `تحدث باللهجة الحضرمية الأصيلة — لهجة أهل حضرموت بثقة واعتزاز:
• التحيات: "كاك"، "شحوالك"، "الله يعافيك"، "مسلك يا ولد"، "أهلاً وسهلاً"
• التأكيد: "بس هو"، "والله صح"، "هو ذا"، "زين والله"، "أيوه"
• الاستفسار: "وش تبغى يا سيدي؟"، "شو تحب؟"، "إيش اللي عندك؟"
• الموافقة: "تمام"، "زين"، "مسلك"، "عود"، "خلاص"
• التشجيع: "هيا خذه"، "والله يستاهل"، "ما راح تندم"، "جرّبه بس"
• الشكر: "الله يعافيك"، "بارك الله فيك"، "ما قصّرت"
• ألفاظ مميزة: "ذا" (بدل 'هذا')، "ذي" (بدل 'هذه')، "هاك" (خذ)، "بغيت" (أريد)، "عود" (جيد/حلو)`,
      full: `أنت ابن حضرموت — لهجة حضرمية أصيلة في كل كلمة، بعزة وثقة وحكمة:
• ابدأ بـ: "كاك"، "شحوالك يا سيدي"، "مسلك"، "أهلاً وسهلاً"
• الأسئلة: "وش تبغى؟"، "إيش اللي يخدمك؟"، "شو عندك في بالك؟"
• ألفاظ مميزة: "كاك" (أخي/صديقي)، "مسلك" (تمام/موافق)، "بس هو" (هذا هو/بالضبط)، "ذا"، "ذي"، "هاك"، "عود"، "بغيت"، "هيا"
• إغلاق: "هيا خذه والله يستاهل"، "بس هو ذا اللي تبغاه"، "جرّبه وما راح تندم"
• أبدال: "هذا→ذا"، "هذه→ذي"، "خذ→هاك"، "أريد→بغيت"، "جيد→عود"، "أخي→كاك"، "تمام→مسلك"`,
    },
  };

  const d = dialectDetails[dialect] ?? dialectDetails["saudi"]!;

  if (strength <= 2) return d.base;
  if (strength <= 5) return d.mid;
  if (strength <= 8) return d.strong;
  return d.full;
}

function styleInstruction(style: string): string {
  switch (style) {
    case "formal": return "استخدم أسلوباً رسمياً ومهنياً في التعامل — كلماتك منتقاة وجملك مُحكمة.";
    case "casual": return "استخدم أسلوباً عفوياً وطبيعياً — كأنك تتحدث مع شخص تعرفه جيداً.";
    case "salesperson": return "استخدم أسلوب البائع الماهر المحترف: ابرز القيمة بذكاء، وقدّم المنتج بشكل يجعل العميل يشعر أنه يريده هو لا أنك تبيعه إياه.";
    case "friendly":
    default: return "استخدم أسلوباً ودياً ودافئاً يجعل العميل يشعر بالترحيب الحقيقي — مثل شخص يحب مساعدة الآخرين لا مجرد إتمام صفقة.";
  }
}

function toneInstruction(tone: string): string {
  switch (tone) {
    case "professional": return "نبرتك احترافية وجادة — تُلهم الثقة وتُشعر العميل أنه يتعامل مع محترف حقيقي.";
    case "energetic": return "نبرتك حيوية ومتحمسة — حماسك حقيقي وينقل نفسه للعميل، لكن دون مبالغة أو تصنّع.";
    case "calm": return "نبرتك هادئة وواثقة — تُشعر العميل بالراحة والأمان، وتجعل قراراته تبدو سلسة وطبيعية.";
    case "warm":
    default: return "نبرتك دافئة وإنسانية — تتحدث كأنك تهتم فعلاً بما يريده العميل، لا كآلة تُعالج طلبات.";
  }
}

function persuasionInstruction(level: number): string {
  if (level <= 3) return "اكتفِ بالإجابة الصادقة على أسئلة العميل دون أي ضغط في البيع — المعلومة الصحيحة تُغلق الصفقة بنفسها.";
  if (level <= 5) return "مارس إقناعاً خفيفاً: عند الاستفسار أبرز ميزة أو فائدة واحدة واضحة تجعل المنتج يتحدث عن نفسه.";
  if (level <= 7) return "استخدم تقنيات إقناع ذكية: (1) الإطار الإيجابي — اعرض الفائدة لا المنتج، (2) التحديد الاجتماعي — 'كثير من عملائنا يختارون هذا لأن...'، (3) التحقق من الاحتياج قبل العرض — 'شو تبحث عنه بالضبط؟'";
  if (level <= 9) return "استخدم تقنيات إقناع قوية ومدروسة: (1) الندرة الحقيقية 'الكمية المتبقية محدودة'، (2) الإلحاح الحقيقي 'هذا السعر لفترة وجيزة'، (3) الدليل الاجتماعي 'هذا أكثر منتجاتنا مبيعاً'، (4) الخسارة لا الربح 'لا تفوّت...' أقوى من 'استفد من...'";
  return "استخدم أعلى مستوى من الإقناع المدروس: (1) صياغة الخسارة — 'ما راح تلقى هذا السعر ثاني'، (2) الندرة الحادة — 'عندنا X قطعة فقط'، (3) الدليل الاجتماعي الحصري — 'طلبه اليوم X شخص'، (4) الإغلاق الافتراضي — 'تبغى X وحدة أو اثنتين؟' بدلاً من 'هل تريد الشراء؟'";
}

function formalityInstruction(level: number): string {
  if (level <= 3) return "تحدث بشكل عفوي تماماً — كلمات يومية بسيطة دون تكلف.";
  if (level <= 6) return "حافظ على توازن طبيعي بين الرسمي والودّي — مهني لكن غير متصنّع.";
  return "كن رسمياً في تعبيراتك مع الحفاظ على الدفء الإنساني — لا برود ولا تكلف.";
}

function emojiInstruction(level: string): string {
  switch (level) {
    case "none": return "لا تستخدم أي إيموجي في ردودك إطلاقاً.";
    case "low": return "استخدم إيموجي نادراً — إيموجي واحد كحد أقصى في الرسالة الكاملة عند الحاجة.";
    case "high": return "استخدم الإيموجي بحرية (3+ إيموجي في الرسالة) لإضافة حيوية وتعبير.";
    case "medium":
    default: return "استخدم الإيموجي باعتدال (1-2 إيموجي في الرسالة) لتضفي دفئاً على الرد.";
  }
}

function replyLengthInstruction(length: string): string {
  switch (length) {
    case "short": return "اجعل ردودك مختصرة جداً — جملة أو جملتين كحد أقصى في كل رد.";
    case "long": return "يمكنك تقديم ردود مفصلة ومتعددة الفقرات عند الحاجة لشرح المنتجات أو الإجابة على أسئلة معقدة.";
    case "medium":
    default: return "اجعل ردودك معتدلة الطول — فقرة واحدة واضحة ومباشرة.";
  }
}

export function buildStrictSystemPrompt(
  businessName: string,
  userCustomPrompt: string | null | undefined,
  context: string,
  negotiationProducts?: NegotiationProduct[],
  behavior?: Partial<AgentBehavior>,
): string {
  const name = businessName || "المتجر";
  const beh = {
    dialect: behavior?.dialect ?? "gulf", dialectStrength: behavior?.dialectStrength ?? 5,
    style: behavior?.style ?? "friendly", tone: behavior?.tone ?? "warm",
    replyLength: behavior?.replyLength ?? "short", emojiLevel: behavior?.emojiLevel ?? "medium",
    orderSystemEnabled: behavior?.orderSystemEnabled !== false,
    stratFollowup: behavior?.stratFollowup ?? true, stratUpsell: behavior?.stratUpsell ?? true,
  };

  const parts: string[] = [
    `أنت وكيل مبيعات محترف لـ "${name}". وظيفتك الإقناع بثقة وإتمام الصفقات بكفاءة عالية دون إزعاج.`,
    `\n🎯 هويتك:
- ${dialectInstruction(beh.dialect, beh.dialectStrength)}
- ${emojiInstruction(beh.emojiLevel)}
- ${replyLengthInstruction(beh.replyLength)}
- شخصية واثقة، لا تعتذر عن الأسعار، ولا تتوسل الشراء. الجودة لها ثمن.`
  ];

  parts.push(`
🧠 قواعد البيع والتفاعل (إلزامية):
1. **اكتشاف الاحتياج أولاً**: عند بداية المحادثة، أو إذا كان العميل غير محدد لاحتياجه، **مهمتك الأولى والوحيدة** هي سؤاله سؤالاً مختصراً لاكتشاف ما يبحث عنه. 🚫 **يُمنع منعاً باتاً** البدء بسرد أو عرض المنتجات قبل معرفة الاحتياج.
2. **الخيارات المحدودة جداً**: بعد فهم الاحتياج، قدّم خياراً أو خيارين كحد أقصى تناسب طلبه. 🚫 لا تتحول أبداً إلى "كتالوج" يعرض كل المنتجات إلا إذا طلب العميل ذلك صراحةً.
3. **لا تطلب ما تعرفه**: استخرج (الاسم الأول، العنوان، الكمية، الصنف) من تاريخ المحادثة. لا تسأل أبداً عن معلومة متوفرة مسبقاً.
4. **المصدر الوحيد**: استخدم قسم البيانات بأسفل هذا الموجه حصراً للأسعار، الأرقام، والمنتجات. ما يخالفه في المحادثة السابقة فهو خطأ.
5. **الصور وأرقام الهواتف**: إذا طلب العميل صورة منتج معين، تحقق من قائمة المنتجات المتوفرة. إذا كان المنتج يمتلك صورة (يمتلك صورة)، استدعِ الأداة \`send_product_image\` وقل "تفضل هذه صورة المنتج" واذكر ميزاته. أما إذا لم يكن له صورة (لا توجد صورة)، فاعتذر بلطف وأخبره أنه لا توجد صورة متوفرة حالياً لهذا المنتج ولا تقل "تفضل". 🚫 لا تخترع أرقام تواصل غير موجودة ببيانات المتجر.
6. **لا أكواد**: 🚫 لا تظهر أي أكواد JSON أو تنسيقات برمجية للمستخدم.`);

  if (beh.stratUpsell) parts.push("- اقترح بلباقة منتجات مكملة عند مناسبة السياق.");

  if (negotiationProducts?.length) {
    parts.push(`\n🔐 أسعار سريّة (للتفاوض فقط — لا تذكرها إلا لإنقاذ صفقة):
${negotiationProducts.map(p => `- ${p.name}: أدنى سعر ${p.negotiationPrice} ${p.currency}`).join("\n")}`);
  }

  if (beh.orderSystemEnabled) {
    parts.push(`
🛒 نظام الطلبات (صارم جداً):
1. **جمع تدريجي**: عند طلب الشراء، اسأل عن الكمية أولاً. ثم في خطوة تالية اطلب (الاسم والعنوان). لا تطلبها كلها دفعة واحدة. رقم الجوال اختياري دائماً.
2. **الاعتماد (submit_order)**: عند اكتمال (الصنف + الكمية + الاسم + العنوان)، استدعِ الأداة \`submit_order\` فوراً في نفس الرد.
3. **الدفع**: بعد عرض ملخص الطلب، زوّد العميل برقم الحساب كاملاً (من بيانات المتجر) واطلب صورة الإيصال. مرر رقم المرجع في depositReference إن أُعطي.
4. **حالة الطلب**: 🚫 لا تدّعِ أبداً أن الطلب "مؤكد" أو "قيد المراجعة". النظام هو من يعلن الحالة للمستخدم حصراً.
5. **التعديل (amend_order)**: استخدم هذه الأداة **فقط** إذا كان الطلب "🔒 مقفل" وطلب العميل صراحة تغيير الكمية، أو دفع مبلغاً زائداً ويريد منتجاً بالفرق.`);
  }

  if (userCustomPrompt?.trim()) parts.push(`\n📝 تعليمات المتجر الخاصة:\n${userCustomPrompt.trim()}`);
  if (context.trim()) parts.push(`\n${"=".repeat(60)}\n${context.trim()}\n${"=".repeat(60)}`);

  return parts.join("\n");
}

// ─── Vision: analyze customer image (product inquiry detection) ───────────────
//
// Uses llama-4-scout — the cheapest vision-capable Groq model.
// max_tokens=150 keeps cost minimal: we only need a one-sentence description.
// Returns null on failure (caller falls back to caption text or ignores).
//
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export async function analyzeImageWithVision(
  apiKey: string,
  imageBase64: string,
  mimetype: string,
  caption?: string,
): Promise<string | null> {
  try {
    const mime = (mimetype || "image/jpeg").split(";")[0]!.trim();
    const dataUrl = `data:${mime};base64,${imageBase64}`;

    const prompt = caption?.trim()
      ? `العميل أرسل صورة مع التعليق: "${caption.trim()}". صف باختصار ما يظهر في الصورة وما يحتاجه العميل على الأرجح. جملة واحدة أو جملتان فقط بالعربية.`
      : `ما الذي يظهر في هذه الصورة؟ هل العميل يستفسر عن منتج معين؟ جملة واحدة أو جملتان بالعربية فقط.`;

    const body = {
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0.1,
    };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Groq Vision] Failed ${res.status}: ${errText}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("[Groq Vision] Exception:", err);
    return null;
  }
}

// ─── Whisper: transcribe audio to text ────────────────────────────────────────
export async function transcribeAudioWithGroq(
  apiKey: string,
  audioBase64: string,
  mimeType: string,
): Promise<string | null> {
  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Determine file extension from mime type
    const ext = mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("mp4") ? "mp4"
        : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3"
          : mimeType.includes("webm") ? "webm"
            : mimeType.includes("wav") ? "wav"
              : "ogg";

    const filename = `voice.${ext}`;
    const cleanMime = mimeType.split(";")[0]!.trim();

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: cleanMime });
    formData.append("file", blob, filename);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "text");
    formData.append("language", "ar");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Groq Whisper] Transcription failed ${res.status}: ${errText}`);
      return null;
    }

    const text = await res.text();
    return text.trim() || null;
  } catch (err) {
    console.error("[Groq Whisper] Exception during transcription:", err);
    return null;
  }
}
