import { db } from "@workspace/db";
import { usersTable, whatsappConnectionsTable, userSettingsTable, apiKeysTable, conversationsTable, messagesTable, businessesTable, productsTable, ordersTable } from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { generateGroqReply, buildStrictSystemPrompt, AGENT_TOOLS, transcribeAudioWithGroq, analyzeImageWithVision, type ConversationMessage, type NegotiationProduct, type AgentBehavior } from "./providers/groq.js";
import { generateGeminiReply, analyzeImageWithGemini, transcribeAudioWithGemini } from "./providers/gemini.js";
import { sendEvolutionMessage, sendEvolutionImage, sendEvolutionTyping, downloadEvolutionMedia, subscribeToPresence, fetchGroupName, fetchProfilePictureUrl } from "./providers/evolution.js";
import { generateAndSendInvoice } from "./invoice.js";
import { logger } from "./logger.js";
import { searchChunks, getEmbeddingKeyForUser } from "./vectorSearch.js";
import { processReturnAction } from "./returnActions.js";
import { extractAndUpdateProfile } from "./profileExtractor.js";
import { enqueueOutgoing, typingDuration } from "./antiBan.js";
import { createNotification } from "./notifications.js";
import { messageHasCouponIntent, buildCouponContext, buildAgentContext, getActiveOrder, getAnyOrderBySenderPhone, buildActiveOrderContext, processOrderAction, handleDepositMedia, getGlobalAgentSettings, isDuplicate, countRecentImages, trackImage, bufferAndProcess, handleCustomerTyping, saveDepositMediaLocally, getPublicImageUrl, humanCurrency, stripProductsFromContext, cleanReplyText, phonesMatch, notifyAdminKeyFailed, handleOwnerMessage, extractPresencePhone, extractPresenceStatus, IMAGE_FLOOD_LIMIT } from "./agent.js";

/**
 * هذه الوظيفة (processTextFlow) هي العقل المدبر لمعالجة الرسائل النصية القادمة من الواتساب.
 * تقوم بعدة خطوات رئيسية:
 * 1. التحقق من حالة المستخدم وإعدادات الوكيل (Agent).
 * 2. إدارة جلسات المحادثة وحفظ الرسائل في قاعدة البيانات.
 * 3. تحليل سياق المحادثة (الطلبات، المنتجات، الكوبونات).
 * 4. استخدام الذكاء الاصطناعي (Groq أو Gemini) لتوليد رد مناسب.
 * 5. معالجة الإجراءات التي يتخذها الذكاء الاصطناعي (مثل إنشاء طلب، أو طلب صورة).
 *
 * @param userId - معرف المستخدم (صاحب المتجر).
 * @param customerPhone - رقم هاتف العميل.
 * @param customerName - اسم العميل.
 * @param incomingText - نص الرسالة القادمة من العميل.
 * @param isGroup - هل الرسالة من مجموعة أم محادثة فردية.
 */
export async function processTextFlow(
  userId: number,
  customerPhone: string,
  customerName: string,
  incomingText: string,
  isGroup = false,
): Promise<void> {
  try {
    // 1. جلب بيانات المستخدم للتحقق من حالته (هل حسابه فعال أم لا)
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user || user.status !== "active") return;

    // 2. جلب إعدادات المستخدم للتحقق مما إذا كان الوكيل (الرد الآلي) مفعلاً
    const [settings] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    if (!settings?.agentEnabled) {
      logger.info({ userId }, "Agent disabled — skipping reply");
      return;
    }

    // 3. جلب الإعدادات العامة (Global) التي يحددها مدير النظام وتطبق كإعداد افتراضي
    const globalAgent = await getGlobalAgentSettings();

    // 4. جلب بيانات اتصال الواتساب الخاص بالمتجر لإرسال واستقبال الرسائل
    const [wa] = await db
      .select()
      .from(whatsappConnectionsTable)
      .where(eq(whatsappConnectionsTable.userId, userId))
      .limit(1);

    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;
    const waConfig = {
      baseUrl: wa.baseUrl,
      apiKey: wa.apiKey,
      instanceName: wa.instanceName,
    };

    // هل الرسالة من صاحب العمل؟ → وجّهها لمعالج خاص
    if (
      settings?.reviewWhatsappNumber &&
      phonesMatch(customerPhone, settings.reviewWhatsappNumber)
    ) {
      await handleOwnerMessage(userId, waConfig, customerPhone, incomingText);
      return;
    }

    // ── إنشاء أو تحديث المحادثة ──────────────────────────────────────────
    let conversation = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.userId, userId),
          eq(conversationsTable.customerPhone, customerPhone),
          eq(conversationsTable.status, "active"),
        ),
      )
      .limit(1)
      .then((r) => r[0]);

    let resolvedName = customerName;
    if (isGroup) {
      const realName = await fetchGroupName(waConfig, customerPhone).catch(
        () => null,
      );
      if (realName) resolvedName = realName;
    }

    if (!conversation) {
      const [created] = await db
        .insert(conversationsTable)
        .values({
          userId,
          customerPhone,
          customerName: resolvedName,
          status: "active",
          lastMessage: incomingText,
          agentPaused: false,
          sentImageProductIds: "[]",
          isGroup,
        })
        .returning();
      conversation = created!;
    } else {
      await db
        .update(conversationsTable)
        .set({
          lastMessage: incomingText,
          customerName: resolvedName,
          updatedAt: new Date(),
        })
        .where(eq(conversationsTable.id, conversation.id));
    }

    // 5. جلب صورة الملف الشخصي للعميل في الخلفية (لتحديثها في لوحة التحكم)
    if (!conversation.avatarUrl) {
      const convId = conversation.id;
      fetchProfilePictureUrl(waConfig, customerPhone)
        .then((url) => {
          if (url)
            db.update(conversationsTable)
              .set({ avatarUrl: url })
              .where(eq(conversationsTable.id, convId))
              .catch(() => { });
        })
        .catch(() => { });
    }

    // 6. إذا أوقف صاحب العمل الرد الآلي لهذه المحادثة (Agent Paused)، يتم حفظ الرسالة فقط والخروج
    if (conversation.agentPaused) {
      await db
        .insert(messagesTable)
        .values({
          conversationId: conversation.id,
          from: "customer",
          text: incomingText,
        });
      logger.info({ userId, customerPhone }, "Agent paused — skipping reply");
      return;
    }

    await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        from: "customer",
        text: incomingText,
      });

    // 7. ── جلب سجل المحادثة (نافذة قابلة للتخصيص من إعدادات الذكاء الاصطناعي) ────────
    const convWindowSize = globalAgent.convWindow ?? 6;
    const recentRows = await db
      .select({
        from: messagesTable.from,
        text: messagesTable.text,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(convWindowSize);

    const chronological = recentRows.reverse();
    const historyRows = chronological.slice(0, -1);

    // 8. ── تحديد جلسات المحادثة (فجوة زمنية = جلسة جديدة لبدء ترحيب جديد) ────────
    const SESSION_GAP_MS = (globalAgent.sessionGapHours ?? 6) * 60 * 60 * 1000;
    const lastRow = historyRows[historyRows.length - 1];
    const isNewSession =
      lastRow &&
      Date.now() - new Date(lastRow.createdAt).getTime() > SESSION_GAP_MS;

    const MAX_MSG_CHARS = 600;
    let conversationHistory: ConversationMessage[] = [];
    let sessionNote = "";

    if (isNewSession) {
      sessionNote =
        "[ملاحظة: جلسة جديدة. رحّب بالعميل بلهجة خليجية بشرية ولا تقول كيف اخدمك اليوم او اساعدك اليوم او ماشبه ذلك ولا تفترض استمرار طلب سابق]";
    } else {
      conversationHistory = historyRows.map((m) => ({
        role: m.from === "customer" ? "user" : ("assistant" as const),
        content:
          m.text.length > MAX_MSG_CHARS
            ? m.text.slice(0, MAX_MSG_CHARS) + "…"
            : m.text,
      }));
    }

    let replyText: string | null = null;
    let productImageToSend: {
      url: string;
      caption: string;
      productId: number;
    } | null = null;
    let replyResult: {
      text: string | null;
      toolCalls?: Array<{ name: string; arguments: unknown }>;
      tokensUsed?: number;
    } = { text: null };

    // 9. ── بناء قائمة مفاتيح الـ API (الأساسي ثم الاحتياطي لضمان عدم توقف الردود) ──────
    const primaryFallbackIds: number[] = [];
    if (settings?.chatKeyId) primaryFallbackIds.push(settings.chatKeyId);
    const extraFallbackIds: number[] = (() => {
      try {
        return JSON.parse(settings?.chatFallbackKeyIds ?? "[]") as number[];
      } catch {
        return [];
      }
    })();
    for (const id of extraFallbackIds) {
      if (!primaryFallbackIds.includes(id)) primaryFallbackIds.push(id);
    }

    let candidateChatKeys: Array<typeof apiKeysTable.$inferSelect> = [];
    if (primaryFallbackIds.length > 0) {
      const found = await db
        .select()
        .from(apiKeysTable)
        .where(
          and(
            inArray(apiKeysTable.id, primaryFallbackIds),
            eq(apiKeysTable.status, "active"),
          ),
        );
      candidateChatKeys = primaryFallbackIds
        .map((id) => found.find((k) => k.id === id))
        .filter((k): k is typeof apiKeysTable.$inferSelect => !!k);
    }
    if (candidateChatKeys.length === 0) {
      const [anyChat] = await db
        .select()
        .from(apiKeysTable)
        .where(
          and(eq(apiKeysTable.type, "chat"), eq(apiKeysTable.status, "active")),
        )
        .limit(1);
      if (anyChat) {
        candidateChatKeys = [anyChat];
        logger.info(
          { userId, keyId: anyChat.id },
          "Using global fallback chat key",
        );
      }
    }

    let chatKey: typeof apiKeysTable.$inferSelect | null = null;

    if (candidateChatKeys.length > 0) {
      // جلب عملة المستخدم الموحدة
      const userCurrency = settings.currency ?? "SAR";
      const currencyLabel = humanCurrency(userCurrency) || userCurrency;
      const fullContext = await buildAgentContext(userId, currencyLabel);

      // 10. جلب الطلب النشط للعميل إن وُجد (لإعلام الذكاء الاصطناعي بوجود طلب يحتاج للدفع أو المراجعة)
      const activeOrder =
        (await getActiveOrder(userId, conversation.id)) ??
        (await getAnyOrderBySenderPhone(userId, customerPhone));
      const orderContext = activeOrder
        ? buildActiveOrderContext(activeOrder)
        : `✅ حالة الطلبات: لا يوجد أي طلب نشط أو مقفل لهذا العميل حالياً — يمكنك استقبال طلب جديد بحرية تامة. تجاهل أي ذكر لطلبات سابقة في تاريخ المحادثة.`;

      const couponContext = messageHasCouponIntent(incomingText)
        ? await buildCouponContext(userId, currencyLabel)
        : "";

      const [biz] = await db
        .select({ name: businessesTable.name })
        .from(businessesTable)
        .where(eq(businessesTable.userId, userId))
        .limit(1);
      const businessName = biz?.name ?? "";

      const allActiveProds = await db
        .select({
          id: productsTable.id,
          name: productsTable.name,
          price: productsTable.price,
          negotiationPrice: productsTable.negotiationPrice,
          currency: productsTable.currency,
          imageUrl: productsTable.imageUrl,
        })
        .from(productsTable)
        .where(
          and(
            eq(productsTable.userId, userId),
            eq(productsTable.status, "active"),
          ),
        );

      const productCatalogText = allActiveProds.length > 0
        ? "\n\n📋 قائمة المنتجات المتوفرة (للرد بذكاء ولاقتراح منتجات، تذكر قاعدة الخيارات المحدودة):\n" +
        allActiveProds.slice(0, 30).map(p => `- [ID: ${p.id}] ${p.name}: ${p.price} ${currencyLabel} ${p.imageUrl ? "(يمتلك صورة)" : "(لا توجد صورة)"}`).join("\n")
        : "";

      let context = fullContext;
      let matchedProductIds: number[] = [];

      // 11. ── البحث المتجهي (Vector Search / RAG) عن المنتجات ذات الصلة بسؤال العميل ───
      const embKey = await getEmbeddingKeyForUser(userId).catch(() => null);
      if (embKey) {
        const chunks = await searchChunks(
          userId,
          incomingText,
          embKey.apiKey,
          embKey.model,
          10,
          0.15,
          embKey.id,
        );
        if (chunks.length > 0) {
          logger.info(
            { userId, chunksFound: chunks.length, topScore: chunks[0]?.score },
            "Vector search succeeded",
          );
          const relevantSection = chunks
            .map((c) => `[${c.type}]\n${c.content}`)
            .join("\n\n---\n\n");
          const compactStore = stripProductsFromContext(fullContext);
          const orderSection = orderContext ? `\n\n${orderContext}` : "";
          context = `📌 الأكثر صلة:\n${relevantSection}\n\n📦 المتجر:\n${compactStore}${productCatalogText}${couponContext}${orderSection}`;
          const productChunks = chunks.filter(
            (c) => c.type === "product" && c.score > 0.3,
          );
          matchedProductIds = productChunks
            .map((c) => {
              const m = c.refId.match(/^product-(\d+)$/);
              return m ? Number(m[1]) : null;
            })
            .filter((id): id is number => id !== null);
        } else {
          context = `📦 بيانات المتجر:\n${fullContext}${productCatalogText}${couponContext}\n\n${orderContext}`;
        }
      } else {
        context = `📦 بيانات المتجر:\n${fullContext}${productCatalogText}${couponContext}\n\n${orderContext}`;
      }



      const negotiationSource =
        matchedProductIds.length > 0
          ? allActiveProds.filter((p) => matchedProductIds.includes(p.id))
          : allActiveProds;

      const negotiationProducts: NegotiationProduct[] = negotiationSource
        .filter((p) => p.negotiationPrice)
        .map((p) => ({
          name: p.name,
          price: p.price,
          negotiationPrice: p.negotiationPrice!,
          currency: currencyLabel,
        }));


      // 12. ── منطق إرسال صور المنتجات ─────────────────────────────────────
      // تم نقل مسؤولية إرسال الصورة إلى أداة send_product_image التي يستدعيها الـ AI بناءً على طلب العميل
      // مما يجعل الحل جذرياً ويمنع إرسال صور خاطئة لمنتجات مشابهة.



      // ── دمج إعدادات المستخدم مع إعدادات الأدمن ──────────────────────
      // adminOverride = true  → إعدادات الأدمن تفوق إعدادات المستخدم
      // adminOverride = false → إعدادات المستخدم تفوق (الأدمن = افتراضيات)
      const adminOverride = globalAgent.adminOverride === true;
      const eff = <T>(
        globalVal: T | undefined,
        userVal: T | undefined,
        fallback: T,
      ): T =>
        adminOverride
          ? (globalVal ?? userVal ?? fallback)
          : (userVal ?? globalVal ?? fallback);
      const effBool = (
        globalVal: boolean | undefined,
        userVal: boolean | undefined,
        fallback: boolean,
      ): boolean =>
        adminOverride
          ? (globalVal ?? userVal ?? fallback)
          : (userVal ?? globalVal ?? fallback);

      const effectiveOrderSystem = effBool(
        globalAgent.orderSystemEnabled,
        settings.orderSystemEnabled,
        true,
      );
      const effectiveReturnSystem = effBool(
        globalAgent.returnSystemEnabled,
        settings.returnSystemEnabled,
        true,
      );
      const effectiveResponseDelay = eff(
        globalAgent.responseDelay,
        settings.responseDelay,
        0,
      );
      const effectiveMaxTokens = eff(
        globalAgent.maxTokens,
        settings.maxTokens,
        1500,
      );

      const behavior: AgentBehavior = {
        dialect: eff(globalAgent.dialect, settings.dialect, "gulf"),
        dialectStrength: eff(
          globalAgent.dialectStrength,
          settings.dialectStrength,
          5,
        ),
        style: eff(globalAgent.style, settings.style, "friendly"),
        tone: eff(globalAgent.tone, settings.tone, "warm"),
        persuasion: eff(globalAgent.persuasion, settings.persuasion, 7),
        formality: eff(globalAgent.formality, settings.formality, 5),
        emojiLevel: eff(globalAgent.emojiLevel, settings.emojiLevel, "medium"),
        replyLength: eff(
          globalAgent.replyLength,
          settings.replyLength,
          "medium",
        ),
        openingMessage: adminOverride
          ? (globalAgent.openingMessage ?? settings.openingMessage ?? null)
          : (settings.openingMessage ?? globalAgent.openingMessage ?? null),
        closingMessage: adminOverride
          ? (globalAgent.closingMessage ?? settings.closingMessage ?? null)
          : (settings.closingMessage ?? globalAgent.closingMessage ?? null),
        stratFollowup: effBool(
          globalAgent.stratFollowup,
          settings.stratFollowup,
          true,
        ),
        stratCart: effBool(globalAgent.stratCart, settings.stratCart, true),
        stratUpsell: effBool(
          globalAgent.stratUpsell,
          settings.stratUpsell,
          true,
        ),
        stratPromo: effBool(globalAgent.stratPromo, settings.stratPromo, false),
        stratReview: effBool(
          globalAgent.stratReview,
          settings.stratReview,
          true,
        ),
        orderSystemEnabled: effectiveOrderSystem,
      };

      // توجيهات العزة مدمجة الآن في buildStrictSystemPrompt مباشرة
      const enhancedSystemPrompt = settings.systemPrompt || "";
      const fullSystemPrompt = buildStrictSystemPrompt(
        businessName,
        enhancedSystemPrompt,
        context,
        negotiationProducts,
        behavior,
      );

      const delayMs = effectiveResponseDelay * 1000;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      const messageToSend = sessionNote
        ? `${sessionNote}\n\n${incomingText}`
        : incomingText;

      // ── تحديد الأدوات النشطة حسب إعدادات الوكيل ────────────────────
      const activeTools = (() => {
        if (effectiveOrderSystem === false) return undefined;
        const tools = AGENT_TOOLS.filter((t) => {
          if (
            t.function.name === "request_return" &&
            effectiveReturnSystem === false
          )
            return false;
          return true;
        });
        return tools.length > 0
          ? (tools as unknown as typeof AGENT_TOOLS)
          : undefined;
      })();

      sendEvolutionTyping(waConfig, customerPhone, 15_000).catch(() => { });

      // ── Multi-key failover: المفتاح الأول → المفتاح الثاني → ... ─────
      for (const key of candidateChatKeys) {
        if (replyText) break;
        const isGemini =
          key.provider.toLowerCase().includes("gemini") ||
          key.provider.toLowerCase().includes("google");
        const result = isGemini
          ? await generateGeminiReply(
            key.apiKey,
            key.model,
            messageToSend,
            fullSystemPrompt,
            conversationHistory,
            activeTools,
            effectiveMaxTokens,
          )
          : await generateGroqReply(
            key.apiKey,
            key.model,
            messageToSend,
            fullSystemPrompt,
            conversationHistory,
            activeTools,
            effectiveMaxTokens,
          );

        if (
          result.text !== null ||
          (result.toolCalls && result.toolCalls.length > 0)
        ) {
          chatKey = key;
          replyResult = result;
          break;
        }

        logger.warn(
          { userId, keyId: key.id, keyName: key.name },
          "Chat key failed — trying next",
        );
        await notifyAdminKeyFailed(wa, key.name, userId).catch(() => { });
      }

      if (chatKey && (replyResult.text || replyResult.toolCalls?.length)) {
        await db
          .update(apiKeysTable)
          .set({
            requestsCount: chatKey.requestsCount + 1,
            tokensUsed: chatKey.tokensUsed + (replyResult.tokensUsed ?? 0),
            lastUsedAt: new Date(),
          })
          .where(eq(apiKeysTable.id, chatKey.id));

        replyText = replyResult.text ? cleanReplyText(replyResult.text) : null;
        logger.info(
          {
            userId,
            rawReply: replyResult.text,
            toolCalls: replyResult.toolCalls,
          },
          "LLM raw reply",
        );

        // ── معالجة Tool Calls ────────────────────────────────────────────
        if (replyResult.toolCalls && replyResult.toolCalls.length > 0) {
          for (const tc of replyResult.toolCalls) {
            // أداة submit_order: إنشاء طلب أو تحديثه
            if (tc.name === "submit_order") {
              const args = tc.arguments as {
                customerName: string;
                customerPhone: string;
                customerAddress?: string;
                items: Array<{
                  name: string;
                  qty: number;
                  unit: string;
                  price: string;
                  total: string;
                }>;
                subtotal: string;
                deliveryCost: string;
                total: string;
                currency?: string;
                depositReference?: string;
              };
              if (args.depositReference) {
                const existingActiveOrder = await getActiveOrder(
                  userId,
                  conversation.id,
                );
                if (existingActiveOrder) {
                  await processOrderAction(
                    userId,
                    conversation.id,
                    {
                      action: "set_deposit_ref",
                      reference: args.depositReference,
                    },
                    customerPhone,
                  );
                } else {
                  await processOrderAction(
                    userId,
                    conversation.id,
                    {
                      action: "save_draft",
                      customerName: args.customerName,
                      customerPhone: args.customerPhone,
                      customerAddress: args.customerAddress,
                      items: args.items,
                      subtotal: args.subtotal,
                      deliveryCost: args.deliveryCost,
                      total: args.total,
                      currency: args.currency,
                      senderPhone: customerPhone,
                    },
                    customerPhone,
                  );
                  await processOrderAction(
                    userId,
                    conversation.id,
                    {
                      action: "set_deposit_ref",
                      reference: args.depositReference,
                    },
                    customerPhone,
                  );
                }
              } else {
                await processOrderAction(
                  userId,
                  conversation.id,
                  {
                    action: "save_draft",
                    customerName: args.customerName,
                    customerPhone: args.customerPhone,
                    customerAddress: args.customerAddress,
                    items: args.items,
                    subtotal: args.subtotal,
                    deliveryCost: args.deliveryCost,
                    total: args.total,
                    currency: args.currency,
                    senderPhone: customerPhone,
                  },
                  customerPhone,
                );
              }
              logger.info({ userId, args }, "Tool: submit_order processed");

              // أداة amend_order: تعديل طلب موجود
            } else if (tc.name === "amend_order") {
              const args = tc.arguments as {
                customerName: string;
                customerPhone?: string;
                customerAddress?: string;
                items: Array<{
                  name: string;
                  qty: number;
                  unit: string;
                  price: string;
                  total: string;
                }>;
                subtotal: string;
                deliveryCost: string;
                total: string;
                currency?: string;
                amendReason?: string;
              };
              await processOrderAction(
                userId,
                conversation.id,
                {
                  action: "save_draft",
                  customerName: args.customerName,
                  customerPhone: args.customerPhone,
                  customerAddress: args.customerAddress,
                  items: args.items,
                  subtotal: args.subtotal,
                  deliveryCost: args.deliveryCost,
                  total: args.total,
                  currency: args.currency,
                  senderPhone: customerPhone,
                },
                customerPhone,
              );
              logger.info(
                { userId, args },
                "Tool: amend_order processed",
              );

              // أداة request_return: طلب استرجاع
            } else if (tc.name === "request_return") {
              const args = tc.arguments as {
                orderId?: string;
                customerName?: string;
                customerPhone?: string;
                reason: string;
                items: string;
              };

              // Verify if customer has any accepted/approved order
              const [approvedOrder] = await db
                .select()
                .from(ordersTable)
                .where(
                  and(
                    eq(ordersTable.userId, userId),
                    eq(ordersTable.senderPhone, customerPhone),
                    inArray(ordersTable.status, ["approved", "delivered"])
                  )
                )
                .orderBy(desc(ordersTable.createdAt))
                .limit(1);

              if (approvedOrder) {
                // Pause agent
                await db
                  .update(conversationsTable)
                  .set({ agentPaused: true, updatedAt: new Date() })
                  .where(eq(conversationsTable.id, conversation.id));

                logger.info({ userId, conversationId: conversation.id }, "Agent paused due to return request");

                // Process return action (sends notification to business owner)
                const returnId = await processReturnAction(
                  userId,
                  conversation.id,
                  {
                    action: "request_return",
                    customerName: args.customerName ?? customerName,
                    customerPhone: args.customerPhone ?? customerPhone,
                    orderId: args.orderId || String(approvedOrder.id),
                    reason: args.reason || "غير محدد",
                    items: args.items || "غير محدد",
                    senderPhone: customerPhone,
                  },
                  customerPhone,
                  customerName,
                  customerPhone,
                );

                replyText = "تم تحويل طلب الاسترجاع للإدارة وسيتم التواصل معك قريباً لمعالجة طلبك.";
                if (returnId) {
                  logger.info({ userId, returnId }, "Tool: request_return processed");
                }
              } else {
                replyText = "عذراً، لم أتمكن من العثور على طلب مكتمل مرتبط برقمك لطلب الاسترجاع.";
              }
            } else if (tc.name === "send_product_image") {
              const sendImagesEnabled = settings.sendProductImages ?? globalAgent.sendProductImages ?? true;
              if (sendImagesEnabled) {
                const args = tc.arguments as { productId: number };
                const targetProduct = allActiveProds.find((p) => p.id === args.productId);
                if (targetProduct && targetProduct.imageUrl) {
                  const publicUrl = getPublicImageUrl(targetProduct.imageUrl);
                  if (publicUrl) {
                    productImageToSend = {
                      url: publicUrl,
                      caption: targetProduct.name,
                      productId: targetProduct.id,
                    };
                  }
                }
                logger.info({ userId, args }, "Tool: send_product_image processed");
              }
            }
          }
        }
      }

      // ── استدعاء AI إضافي بعد تنفيذ الأدوات لتوليد رد نصي ───────────
      if (
        !replyText &&
        replyResult.toolCalls &&
        replyResult.toolCalls.length > 0 &&
        chatKey
      ) {
        const updatedOrder =
          (await getActiveOrder(userId, conversation.id)) ??
          (await getAnyOrderBySenderPhone(userId, customerPhone));
        const updatedOrderCtx = updatedOrder
          ? `\n\n${buildActiveOrderContext(updatedOrder)}`
          : `\n\n✅ حالة الطلبات: لا يوجد أي طلب نشط أو مقفل لهذا العميل حالياً — يمكنك استقبال طلب جديد بحرية تامة.`;
        const followupSystemPrompt = buildStrictSystemPrompt(
          businessName,
          settings.systemPrompt,
          `${context}${updatedOrderCtx}`,
          negotiationProducts,
          behavior,
        );
        try {
          const isGemini =
            chatKey.provider.toLowerCase().includes("gemini") ||
            chatKey.provider.toLowerCase().includes("google");
          const followupResult = isGemini
            ? await generateGeminiReply(
              chatKey.apiKey,
              chatKey.model,
              messageToSend,
              followupSystemPrompt,
              conversationHistory,
              undefined,
              600,
            )
            : await generateGroqReply(
              chatKey.apiKey,
              chatKey.model,
              messageToSend,
              followupSystemPrompt,
              conversationHistory,
              undefined,
              600,
            );
          if (followupResult.text) {
            replyText = cleanReplyText(followupResult.text);
            logger.info(
              { userId },
              "Follow-up LLM call after tool execution generated reply",
            );
          }
        } catch (err) {
          logger.warn({ err, userId }, "Follow-up LLM call failed");
        }
      }

      // ── إرسال صورة المنتج بعد تأكيد AI ─────────────────────────────
      // (تم استبدال هذه الآلية بأداة send_product_image لضمان الدقة وتجنب التخمين)
    }

    if (!replyText)
      replyText = "شكراً لتواصلك معنا! سنرد عليك في أقرب وقت ممكن.";

    // ── إرسال الرد عبر قائمة الانتظار (anti-ban) ───────────────────────
    const _capturedReply = replyText;
    const _capturedImg = productImageToSend;
    const _capturedConvId = conversation.id;
    const _capturedSentIds = conversation.sentImageProductIds;

    enqueueOutgoing(
      userId,
      customerPhone,
      async () => {
        const sent = await sendEvolutionMessage(
          waConfig,
          customerPhone,
          _capturedReply,
        );

        if (sent) {
          await db
            .insert(messagesTable)
            .values({
              conversationId: _capturedConvId,
              from: "agent",
              text: _capturedReply,
            });
          await db
            .update(conversationsTable)
            .set({
              lastMessage: `الوكيل: ${_capturedReply.slice(0, 50)}`,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, _capturedConvId));
        }

        if (_capturedImg) {
          await new Promise((r) => setTimeout(r, 900));
          const imgSent = await sendEvolutionImage(
            waConfig,
            customerPhone,
            _capturedImg.url,
            _capturedImg.caption,
          ).catch((err) => {
            logger.error({ err, userId }, "sendEvolutionImage threw");
            return false;
          });
          if (imgSent) {
            let alreadySentIds: number[] = [];
            try {
              alreadySentIds = JSON.parse(_capturedSentIds ?? "[]") as number[];
            } catch {
              alreadySentIds = [];
            }
            if (!alreadySentIds.includes(_capturedImg.productId))
              alreadySentIds.push(_capturedImg.productId);
            await db
              .update(conversationsTable)
              .set({ sentImageProductIds: JSON.stringify(alreadySentIds) })
              .where(eq(conversationsTable.id, _capturedConvId));
          }
        }

        logger.info(
          { userId, customerPhone, sent, sentImage: !!_capturedImg },
          "Anti-ban: message sent",
        );
      },
      (jitter) => {
        const tMs = Math.max(jitter + 600, typingDuration(_capturedReply));
        sendEvolutionTyping(waConfig, customerPhone, tMs).catch(() => { });
      },
    );

    logger.info(
      { userId, customerPhone, queued: true },
      "Webhook processed — send enqueued",
    );

    if (incomingText) {
      extractAndUpdateProfile(
        userId,
        customerPhone,
        customerName,
        incomingText,
      ).catch(() => { });
    }
  } catch (err) {
    logger.error({ err, userId }, "processTextFlow error");
  }
}

/**
 * هذه الوظيفة (processEvolutionPayload) مسؤولة عن معالجة الأحداث (Webhooks) القادمة من Evolution API (مزود خدمة الواتساب).
 * وظيفتها الأساسية:
 * 1. استقبال الرسائل، الصور، والتسجيلات الصوتية.
 * 2. تتبع حالة المستخدم (مثال: هل العميل يكتب الآن - typing/composing).
 * 3. تجميع الرسائل المتتالية عبر Buffer (لمنع الرد على كل كلمة منفصلة).
 * 4. توجيه الرسالة النصية أو الصوتية (بعد تحويلها لنص) إلى processTextFlow ليرد عليها الذكاء الاصطناعي.
 *
 * @param userId - معرف المستخدم (صاحب المتجر).
 * @param body - جسم الطلب (Payload) القادم من Evolution.
 */
export async function processEvolutionPayload(
  userId: number,
  body: Record<string, unknown>,
) {
  try {
    const event = (body["event"] as string | undefined) ?? "";
    const normalizedEvent = event.toLowerCase().replace(/[._-]/g, "");

    // ── PRESENCE_UPDATE: العميل يكتب → امتد مؤقت الـ buffer ──────────
    if (
      normalizedEvent.includes("presenceupdate") ||
      normalizedEvent.includes("presence")
    ) {
      logger.info(
        { userId, event, rawBody: JSON.stringify(body).slice(0, 800) },
        "PRESENCE_UPDATE received",
      );
      const phone = extractPresencePhone(body);
      const status = extractPresenceStatus(body);
      logger.info({ userId, phone, status }, "Presence extracted");
      if (phone && status === "composing")
        handleCustomerTyping(userId, phone).catch(() => { });
      return;
    }

    if (
      !normalizedEvent.includes("messagesupsert") &&
      !normalizedEvent.includes("messagesupserted")
    ) {
      logger.info({ userId, event }, "Skipping non-message event");
      return;
    }

    const data = body["data"] as Record<string, unknown> | undefined;
    if (!data) return;

    const key = data["key"] as Record<string, unknown> | undefined;
    if (!key || key["fromMe"] === true) return;

    const remoteJid = key["remoteJid"] as string | undefined;
    if (!remoteJid || remoteJid.includes("status@broadcast")) return;

    const isGroup = remoteJid.endsWith("@g.us");
    const customerPhone = remoteJid
      .replace("@s.whatsapp.net", "")
      .replace("@g.us", "");
    const groupNameFromPayload =
      (data["groupName"] as string | undefined) ?? undefined;
    const customerName = isGroup
      ? (groupNameFromPayload ??
        (data["pushName"] as string | undefined) ??
        customerPhone)
      : ((data["pushName"] as string | undefined) ?? customerPhone);

    // ── فلتر المجموعات (disabled / all / selected) ───────────────────
    if (isGroup) {
      const [groupSettings] = await db
        .select({
          groupReplyMode: userSettingsTable.groupReplyMode,
          allowedGroupIds: userSettingsTable.allowedGroupIds,
        })
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);
      const mode = groupSettings?.groupReplyMode ?? "disabled";

      let shouldSkip = false;
      if (mode === "disabled") {
        shouldSkip = true;
      } else if (mode === "selected") {
        let allowed: string[] = [];
        try {
          allowed = JSON.parse(groupSettings?.allowedGroupIds ?? "[]");
        } catch { }
        if (!allowed.includes(customerPhone)) shouldSkip = true;
      }

      if (shouldSkip) {
        let resolvedGroupName = customerName;
        const [waConn] = await db
          .select({
            baseUrl: whatsappConnectionsTable.baseUrl,
            apiKey: whatsappConnectionsTable.apiKey,
            instanceName: whatsappConnectionsTable.instanceName,
          })
          .from(whatsappConnectionsTable)
          .where(eq(whatsappConnectionsTable.userId, userId))
          .limit(1);
        if (waConn?.baseUrl && waConn.apiKey && waConn.instanceName) {
          const realName = await fetchGroupName(
            {
              baseUrl: waConn.baseUrl,
              apiKey: waConn.apiKey,
              instanceName: waConn.instanceName,
            },
            remoteJid,
          );
          if (realName) resolvedGroupName = realName;
        }

        const existingConv = await db
          .select({ id: conversationsTable.id })
          .from(conversationsTable)
          .where(
            and(
              eq(conversationsTable.userId, userId),
              eq(conversationsTable.customerPhone, customerPhone),
            ),
          )
          .limit(1)
          .then((r) => r[0]);

        if (!existingConv) {
          await db.insert(conversationsTable).values({
            userId,
            customerPhone,
            customerName: resolvedGroupName,
            status: "active",
            lastMessage:
              ((data["message"] as Record<string, unknown> | undefined)?.[
                "conversation"
              ] as string) ?? "",
            agentPaused: false,
            sentImageProductIds: "[]",
            isGroup: true,
          });
        } else {
          await db
            .update(conversationsTable)
            .set({
              customerName: resolvedGroupName,
              isGroup: true,
              updatedAt: new Date(),
            })
            .where(eq(conversationsTable.id, existingConv.id));
        }
        logger.info(
          { userId, remoteJid, mode, resolvedGroupName },
          "Group message — not allowed, skipping reply but recorded",
        );
        return;
      }
    }

    const messageData = data["message"] as Record<string, unknown> | undefined;

    const imageMsg = messageData?.["imageMessage"] as
      | Record<string, unknown>
      | undefined;
    const docMsg = messageData?.["documentMessage"] as
      | Record<string, unknown>
      | undefined;
    const hasMedia = !!(imageMsg || docMsg);
    const mediaCaption =
      (imageMsg?.["caption"] as string | undefined) ??
      (docMsg?.["caption"] as string | undefined) ??
      "";

    const audioMsgData = (messageData?.["audioMessage"] ??
      messageData?.["pttMessage"]) as Record<string, unknown> | undefined;
    const isVoice = !!audioMsgData;

    let incomingText: string =
      (messageData?.["conversation"] as string | undefined) ??
      ((
        messageData?.["extendedTextMessage"] as
        | Record<string, unknown>
        | undefined
      )?.["text"] as string | undefined) ??
      mediaCaption ??
      "";

    if (!incomingText.trim() && !hasMedia && !isVoice) return;

    // ── رسالة نصية: أضفها للـ buffer ──────────────────────────────────
    if (!hasMedia && !isVoice && incomingText.trim()) {
      if (isDuplicate(userId, customerPhone, incomingText.trim())) {
        logger.info({ userId, customerPhone }, "Duplicate message — skipping");
        return;
      }
      const [waConnRow] = await db
        .select()
        .from(whatsappConnectionsTable)
        .where(eq(whatsappConnectionsTable.userId, userId))
        .limit(1);
      if (waConnRow?.baseUrl && waConnRow.apiKey && waConnRow.instanceName) {
        subscribeToPresence(
          {
            baseUrl: waConnRow.baseUrl,
            apiKey: waConnRow.apiKey,
            instanceName: waConnRow.instanceName,
          },
          customerPhone,
        ).catch(() => { });
      }
      bufferAndProcess(
        userId,
        customerPhone,
        customerName,
        incomingText.trim(),
        isGroup,
      ).catch((err) => logger.error({ err, userId }, "bufferAndProcess error"));
      return;
    }

    // ── رسالة صوتية: نقل للنص ثم معالجة ──────────────────────────────
    if (isVoice && audioMsgData && key && messageData) {
      logger.info({ userId, customerPhone }, "Voice message — transcribing");

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user || user.status !== "active") return;

      const [settings] = await db
        .select()
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);
      const [wa] = await db
        .select()
        .from(whatsappConnectionsTable)
        .where(eq(whatsappConnectionsTable.userId, userId))
        .limit(1);
      if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

      const waConfig = {
        baseUrl: wa.baseUrl,
        apiKey: wa.apiKey,
        instanceName: wa.instanceName,
      };

      const allChatKeys = await db
        .select({
          id: apiKeysTable.id,
          apiKey: apiKeysTable.apiKey,
          provider: apiKeysTable.provider,
          model: apiKeysTable.model,
        })
        .from(apiKeysTable)
        .where(
          and(eq(apiKeysTable.type, "chat"), eq(apiKeysTable.status, "active")),
        );

      const userKey = settings?.chatKeyId
        ? allChatKeys.find((k) => k.id === settings.chatKeyId)
        : undefined;
      const isProviderGroq = (p: string) => p.toLowerCase().includes("groq");
      const isProviderGemini = (p: string) =>
        p.toLowerCase().includes("gemini") ||
        p.toLowerCase().includes("google");

      const groqKey =
        (userKey && isProviderGroq(userKey.provider) ? userKey : null) ??
        allChatKeys.find((k) => isProviderGroq(k.provider)) ??
        null;
      const geminiKey =
        (userKey && isProviderGemini(userKey.provider) ? userKey : null) ??
        allChatKeys.find((k) => isProviderGemini(k.provider)) ??
        null;

      if (!groqKey && !geminiKey) {
        logger.warn(
          { userId },
          "No transcription key available for voice — skipping",
        );
        return;
      }

      const media = await downloadEvolutionMedia(
        waConfig,
        key as Record<string, unknown>,
        messageData,
      );
      if (!media?.base64) {
        await sendEvolutionMessage(
          waConfig,
          customerPhone,
          "عذراً، لم أتمكن من استقبال الرسالة الصوتية. هل يمكنك كتابة رسالتك؟ 🎤",
        );
        return;
      }

      let transcript: string | null = null;
      if (groqKey) {
        logger.info(
          { userId, customerPhone },
          "Voice — transcribing with Groq Whisper",
        );
        transcript = await transcribeAudioWithGroq(
          groqKey.apiKey,
          media.base64,
          media.mimetype,
        );
        if (!transcript)
          logger.warn(
            { userId },
            "Groq Whisper failed — trying Gemini fallback",
          );
      }
      if (!transcript && geminiKey) {
        logger.info(
          { userId, customerPhone, model: geminiKey.model },
          "Voice — transcribing with Gemini",
        );
        transcript = await transcribeAudioWithGemini(
          geminiKey.apiKey,
          geminiKey.model,
          media.base64,
          media.mimetype,
        );
      }

      if (!transcript) {
        await sendEvolutionMessage(
          waConfig,
          customerPhone,
          "عذراً، لم أستطع فهم الرسالة الصوتية. هل يمكنك إعادة إرسالها أو كتابة رسالتك؟ 🎤",
        );
        return;
      }
      logger.info(
        { userId, customerPhone, transcript },
        "Voice transcription succeeded",
      );
      await processTextFlow(
        userId,
        customerPhone,
        customerName,
        transcript,
        isGroup,
      );
      return;
    }

    // ── وسائط (صورة / مستند): معالجة الإيداع أو تحليل الصورة ─────────
    if (hasMedia && key && messageData) {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (!user || user.status !== "active") return;

      const [settings] = await db
        .select()
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, userId))
        .limit(1);
      const [wa] = await db
        .select()
        .from(whatsappConnectionsTable)
        .where(eq(whatsappConnectionsTable.userId, userId))
        .limit(1);
      if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

      const waConfig = {
        baseUrl: wa.baseUrl,
        apiKey: wa.apiKey,
        instanceName: wa.instanceName,
      };

      // إنشاء/تحديث المحادثة
      let conversation = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.userId, userId),
            eq(conversationsTable.customerPhone, customerPhone),
            eq(conversationsTable.status, "active"),
          ),
        )
        .limit(1)
        .then((r) => r[0]);

      if (!conversation) {
        const displayText = mediaCaption || "[صورة]";
        const [created] = await db
          .insert(conversationsTable)
          .values({
            userId,
            customerPhone,
            customerName,
            status: "active",
            lastMessage: displayText,
            agentPaused: false,
            sentImageProductIds: "[]",
          })
          .returning();
        conversation = created!;
      }

      // تحميل الوسائط وحفظها محلياً
      const mediaDownload = await downloadEvolutionMedia(
        waConfig,
        key as Record<string, unknown>,
        messageData,
      );
      let localMediaUrl: string | null = null;
      if (mediaDownload?.base64) {
        localMediaUrl = await saveDepositMediaLocally(
          mediaDownload.base64,
          mediaDownload.mimetype,
        );
      }

      if (localMediaUrl) {
        // ── إيداع عادي ─────────────────────────────────────
        const wasDeposit = await handleDepositMedia(
          userId,
          conversation.id,
          localMediaUrl,
        );
        if (wasDeposit) {
          if (mediaCaption.trim())
            await db
              .insert(messagesTable)
              .values({
                conversationId: conversation.id,
                from: "customer",
                text: mediaCaption,
              });
          const confirmMsg =
            "✅ تم استلام سند الإيداع بنجاح! سيتم مراجعة طلبك والتأكيد عليه خلال فترة وجيزة. شكراً لثقتك بنا!";
          await sendEvolutionMessage(waConfig, customerPhone, confirmMsg);
          await db
            .insert(messagesTable)
            .values({
              conversationId: conversation.id,
              from: "agent",
              text: confirmMsg,
            });
          return;
        }
      }

      // ── صورة غير إيداع: تحليل بـ vision ثم معالجة نصية ─────────────
      if (imageMsg && settings?.agentEnabled) {
        if (conversation.agentPaused) {
          const displayText = mediaCaption.trim() || "[صورة]";
          await db.insert(messagesTable).values({ conversationId: conversation.id, from: "customer", text: displayText });
          await db.update(conversationsTable).set({ lastMessage: displayText, updatedAt: new Date() }).where(eq(conversationsTable.id, conversation.id));
          return;
        }
        const recentCount = countRecentImages(userId, customerPhone);
        trackImage(userId, customerPhone);

        if (recentCount >= IMAGE_FLOOD_LIMIT) {
          logger.info(
            { userId, customerPhone, recentCount },
            "Image flood detected — skipping vision analysis",
          );
          const displayText = mediaCaption.trim() || "[صورة]";
          await db
            .update(conversationsTable)
            .set({ lastMessage: displayText, updatedAt: new Date() })
            .where(eq(conversationsTable.id, conversation.id));
          await db
            .insert(messagesTable)
            .values({
              conversationId: conversation.id,
              from: "customer",
              text: displayText,
            });
        } else if (mediaDownload?.base64) {
          type VisionKey = { apiKey: string; model: string; provider: string };
          let visionKey: VisionKey | null = null;

          if (settings?.chatKeyId) {
            const [pk] = await db
              .select({
                apiKey: apiKeysTable.apiKey,
                provider: apiKeysTable.provider,
                model: apiKeysTable.model,
              })
              .from(apiKeysTable)
              .where(
                and(
                  eq(apiKeysTable.id, settings.chatKeyId),
                  eq(apiKeysTable.status, "active"),
                ),
              )
              .limit(1);
            if (pk) visionKey = pk;
          }

          if (!visionKey) {
            const allChatKeys = await db
              .select({
                apiKey: apiKeysTable.apiKey,
                provider: apiKeysTable.provider,
                model: apiKeysTable.model,
              })
              .from(apiKeysTable)
              .where(
                and(
                  eq(apiKeysTable.type, "chat"),
                  eq(apiKeysTable.status, "active"),
                ),
              );
            visionKey =
              allChatKeys.find(
                (k) =>
                  k.provider.toLowerCase().includes("gemini") ||
                  k.provider.toLowerCase().includes("google"),
              ) ??
              allChatKeys.find((k) =>
                k.provider.toLowerCase().includes("groq"),
              ) ??
              null;
          }

          if (visionKey) {
            const isGemini =
              visionKey.provider.toLowerCase().includes("gemini") ||
              visionKey.provider.toLowerCase().includes("google");
            logger.info(
              {
                userId,
                customerPhone,
                provider: visionKey.provider,
                model: visionKey.model,
              },
              "Running vision analysis on customer image",
            );
            const visionDesc = isGemini
              ? await analyzeImageWithGemini(
                visionKey.apiKey,
                visionKey.model,
                mediaDownload.base64,
                mediaDownload.mimetype,
                mediaCaption,
              )
              : await analyzeImageWithVision(
                visionKey.apiKey,
                mediaDownload.base64,
                mediaDownload.mimetype,
                mediaCaption,
              );

            if (visionDesc) {
              const inputText = mediaCaption.trim()
                ? `[صورة من العميل — ${visionDesc} | تعليق العميل: "${mediaCaption.trim()}"]`
                : `[صورة من العميل — ${visionDesc}]`;
              logger.info(
                {
                  userId,
                  customerPhone,
                  provider: visionKey.provider,
                  visionDesc,
                },
                "Vision analysis done — processing as text",
              );
              await processTextFlow(
                userId,
                customerPhone,
                customerName,
                inputText,
                isGroup,
              );
            } else if (mediaCaption.trim()) {
              await processTextFlow(
                userId,
                customerPhone,
                customerName,
                mediaCaption.trim(),
                isGroup,
              );
            }
          } else if (mediaCaption.trim()) {
            await processTextFlow(
              userId,
              customerPhone,
              customerName,
              mediaCaption.trim(),
              isGroup,
            );
          }
        } else if (mediaCaption.trim()) {
          await processTextFlow(
            userId,
            customerPhone,
            customerName,
            mediaCaption.trim(),
            isGroup,
          );
        }
      } else if (!imageMsg && mediaCaption.trim() && settings?.agentEnabled) {
        // مستند/فيديو مع تعليق — عالج التعليق كنص
        await processTextFlow(
          userId,
          customerPhone,
          customerName,
          mediaCaption.trim(),
          isGroup,
        );
      }
    }
  } catch (err) {
    logger.error({ err, userId }, "processEvolutionPayload error");
  }
}
