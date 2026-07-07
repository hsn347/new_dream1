# وثيقة وكيل المبيعات — WhatsApp AI Agent

> هذا الملف موجّه لأي مطوّر أو AI سيعمل على تحسين الوكيل مستقبلاً.  
> يشرح كيفية عمل الوكيل من البداية للنهاية، المشاكل المرصودة، والإصلاحات المُطبَّقة.

---

## 1. نظرة عامة على المعمارية

```
واتساب (عميل)
    ↓
Evolution API (webhook)
    ↓
POST /api/webhooks/evolution/:userId/:event
    ↓
processEvolutionPayload()          ← artifacts/api-server/src/routes/webhook.ts
    ├── 0. deduplication — تجاهل نفس الرسالة من نفس الرقم خلال 60 ثانية
    ├── 1. التحقق من المستخدم والإعدادات
    ├── 2. جلب أو إنشاء محادثة
    ├── 3. حفظ رسالة العميل في DB
    ├── 4. جلب آخر 40 رسالة من المحادثة (DESC → reverse)
    ├── 5. بناء system prompt (buildStrictSystemPrompt)
    ├── 6. بناء context المتجر (buildAgentContext)
    ├── 7. بحث vector (searchChunks) إن كان embedding key متوفراً
    ├── 8. بناء order context (getActiveOrder + buildActiveOrderContext)
    ├── 9. استدعاء LLM (Groq أو Gemini) — مع retry تلقائي حتى 3 مرات
    ├── 10. تحليل ORDER_ACTION tags (parseOrderActions)
    ├── 11. تحليل RETURN_ACTION tags (parseReturnActions)
    ├── 12. إرسال الرد عبر Evolution API
    ├── 13. إرسال صورة المنتج إن لزم
    └── 14. استخراج ملف العميل (extractAndUpdateProfile) — fire-and-forget
```

---

## 2. الملفات الأساسية

| الملف | الوظيفة |
|-------|---------|
| `artifacts/api-server/src/routes/webhook.ts` | معالجة كل webhook قادم — القلب الرئيسي |
| `artifacts/api-server/src/lib/providers/groq.ts` | بناء system prompt + استدعاء Groq/Gemini |
| `artifacts/api-server/src/lib/agentContext.ts` | بناء context المتجر (منتجات، كوبونات، توصيل) |
| `artifacts/api-server/src/lib/orderActions.ts` | معالجة نظام الطلبات (parse/save/update) |
| `artifacts/api-server/src/lib/returnActions.ts` | معالجة نظام الاسترجاعات (parse/save/notify) |
| `artifacts/api-server/src/lib/profileExtractor.ts` | استخراج ملف العميل من المحادثة بالذكاء الاصطناعي |
| `artifacts/api-server/src/lib/vectorSearch.ts` | البحث الدلالي في قاعدة المعرفة |
| `lib/db/src/schema/index.ts` | مصدر الحقيقة الوحيد لجداول قاعدة البيانات |

---

## 3. كيف يُبنى system prompt

الدالة: `buildStrictSystemPrompt()` في `groq.ts`

يُبنى الـ prompt من أقسام بهذا الترتيب:

```
1. الهوية         → "أنت وكيل مبيعات لـ [اسم المتجر]..."
2. الأسلوب        → لهجة، نبرة، إيموجي، طول الرد
3. قواعد التفاعل  → التحية، الأسئلة الشخصية، لا تخترع، ردود ملائمة
4. الذاكرة        → القاعدة الذهبية: "أي معلومة ذُكرت → استخدمها"
5. كيفية استخدام البيانات
6. قواعد صارمة    → لا تخترع أسعار، لا تكشف أنك AI، الصور تلقائية
7. التفاوض        → متى تعطي سعر مساومة
8. استراتيجيات البيع (upsell, followup, promo, cart, review)
9. رسالة الافتتاح / الإغلاق
10. الأسعار السرية للتفاوض
11. نظام الطلبات  → ORDER_ACTION tags + مراحل إتمام الطلب
12. تعليمات خاصة من إدارة المتجر (custom prompt)
13. بيانات المتجر الفعلية (context)
```

---

## 4. نظام الطلبات (ORDER_ACTION) ونظام الاسترجاعات (RETURN_ACTION)

الوكيل يكتب tags مخفية في ردوده يعالجها النظام تلقائياً ويزيلها قبل إرسالها للعميل:

### 4.1 نظام الطلبات

```
[ORDER_ACTION:{"action":"save_draft","customerName":"...","customerPhone":"...","customerAddress":"...","items":[...],"subtotal":"...","deliveryCost":"...","total":"..."}]
[ORDER_ACTION:{"action":"set_deposit_ref","reference":"..."}]
```

**المراحل:**
1. جمع المعلومات الناقصة (اسم + جوال + عنوان + منتج + كمية)
2. عرض ملخص الطلب + كتابة `save_draft` + إرسال طرق الدفع المتاحة (الحسابات البنكية من بيانات المتجر) وطلب سند الإيداع في نفس الرسالة
3. استلام رقم الإيداع أو صورة السند + كتابة `set_deposit_ref`
4. صاحب العمل يراجع ويؤكد من لوحة التحكم

**ملاحظة المرحلة 2:** الوكيل ملزَم بعد عرض ملخص الطلب بذكر الحسابات البنكية الموجودة فعلاً في بيانات المتجر فقط، وطلب إرسال المبلغ وسند الإيداع. لا يخترع أي طريقة دفع غير موجودة في البيانات.

### 4.2 نظام الاسترجاعات

```
[RETURN_ACTION:{"action":"request_return","customerName":"...","customerPhone":"...","orderId":"رقم الطلب","reason":"...","items":"..."}]
```

**المراحل:**
1. العميل يطلب إرجاع → الوكيل يطلب رقم الطلب (إلزامي)
2. الوكيل يجمع: جوال + سبب + المنتجات المراد إرجاعها (في سؤال واحد)
3. الوكيل يُطلق `RETURN_ACTION` فوراً عند اكتمال المعلومات — "الطلب كله" مقبول كإجابة للمنتجات
4. النظام يحفظ الاسترجاع في DB (مع `customerPhone` و`customerName` احتياطي من الـ webhook) ويُرسل إشعار واتساب لرقم المراجعة
5. صاحب العمل يراجع من لوحة التحكم (تبويب "الاسترجاعات" في صفحة الطلبات)
6. عند الموافقة: يتغير حالة الطلب المرتبط إلى "مُسترجَع" + يُعاد مخزون المنتجات تلقائياً

**الجدول:** `returns` — حقول: `order_id` (نص, اختياري), `customer_name`, `customer_phone`, `reason`, `items`, `status` (enum: pending_review/approved/rejected/completed)

**ملاحظة:** الاسترجاعات مدمجة في صفحة الطلبات كتبويب — لا صفحة منفصلة.

### 4.4 تأثير قبول الاسترجاع على الطلب والمخزون

عند تغيير حالة الاسترجاع إلى `approved` من لوحة التحكم يحدث تلقائياً:

1. **تحديث حالة الطلب المرتبط** → `returned` (حالة جديدة في `order_status` enum)
2. **استعادة مخزون المنتجات** → يُحلَّل `items` في الطلب المرتبط كـ JSON ← لكل منتج يُزاد الـ qty بمقدار الكمية المُرجَعة

**الملاحظات:**
- استعادة المخزون تعتمد على حقل `items` في الطلب (وليس في الاسترجاع) — لأن الاسترجاع يحفظ المنتجات كنص حر
- إذا تعذّر تحليل `items` (ليس JSON)، يُكتفى بتحديث الطلب فقط مع warning في السجل
- المطابقة بالمنتجات تتم بـ `ilike` (case-insensitive) على الاسم

### 4.3 parsing الـ tags — نقاط حرجة

**المشكلة المرصودة:** الـ LLM قد يكتب `{[RETURN_ACTION:{...}]` بحيث يضع `{` منفردة قبل الـ tag مباشرة، مما يُبقي `{` يتيمة في النص بعد إزالة الـ tag.

**الإصلاح المُطبَّق في `returnActions.ts`:**
- الـ parser يفحص الحرف قبل الـ tag مباشرة — إذا كان `{` يتيمة يُزيلها معه
- يتجاوز whitespace بما فيها newlines عند البحث عن بداية JSON (سابقاً كان يتجاوز spaces فقط)
- تنظيف نهائي بعد الـ parsing: يُزيل الأسطر التي تحتوي فقط على `{` أو `}` أو `]`

**نفس الأسلوب يُستخدم في `orderActions.ts`** — أي مشكلة مشابهة ستظهر هناك أيضاً.

---

## 5. بناء تاريخ المحادثة

```typescript
// webhook.ts السطر ~148
const recentMessages = await db
  .select()
  .from(messagesTable)
  .where(eq(messagesTable.conversationId, conversation.id))
  .orderBy(desc(messagesTable.createdAt))  // الأحدث أولاً
  .limit(40);                               // آخر 40 رسالة

const chronological = recentMessages.reverse();  // إعادة الترتيب
const conversationHistory = chronological
  .slice(0, -1)   // استثناء آخر رسالة (المُضافة للتو)
  .map(...)
```

**لماذا 40 وليس أكثر؟** توازن بين السياق الكافي وعدد tokens المُرسَلة للـ LLM.

---

## 6. استخراج ملف العميل (Customer Intelligence)

بعد كل رد للوكيل، يُشغَّل `extractAndUpdateProfile()` بشكل **غير متزامن** (fire-and-forget):

```
extractAndUpdateProfile(userId, customerPhone, customerName, {
  customerMessage, agentReply, conversationHistory, chatApiKey, chatModel
})
```

يُرسل prompt للـ LLM يطلب استخراج: الاسم، المهنة، المدينة، المستوى المادي، الاهتمامات، المنتجات المفضلة، التصنيفات، ملاحظات — ثم يحفظ/يحدّث في جدول `customer_profiles`.

---

## 7. بيانات المتجر (Context)

تُبنى بـ `buildAgentContext(userId)` وتشمل:
- معلومات النشاط التجاري (اسم، وصف، أرقام، فروع، ساعات، بنوك)
- المنتجات النشطة (الاسم، السعر، الكمية، الوصف)
- الكوبونات الفعالة (الكود، نوع الخصم، تواريخ الصلاحية)
- سياسة التوصيل (مناطق + تكاليف حسب الكيلو/الطلب)

---

## 8. البحث الدلالي (Vector Search)

إذا كان لدى المستخدم embedding key مُفعَّل:
- يُحسب embedding لرسالة العميل
- يُبحث في `knowledge_chunks` عن أقرب 10 قطع (threshold: 0.15)
- إذا وُجدت قطع → تُوضع في `📌 الأكثر صلة` ثم `📦 بيانات المتجر الكاملة`
- إذا لم توجد → `📦 بيانات المتجر الكاملة` فقط

---

## 9. المشاكل المرصودة من المحادثات الفعلية

### 9.1 التحية → المنتجات (BUG — تم الإصلاح جزئياً)

**المشكلة:** عندما يقول العميل "السلام عليكم" فقط، خاصةً إذا كانت هناك رسائل قديمة في تاريخ المحادثة عن منتجات، يبدأ الوكيل بعرض المنتجات والمخزون تلقائياً.

**السبب:** نافذة الـ 40 رسالة تجلب رسائل قديمة عن عسل السمرة، فيعتقد الوكيل أن هناك طلباً جارياً.

**الإصلاح:** تشديد قاعدة التحية في system prompt — إذا كانت رسالة العميل الحالية فقط تحية → رد بترحيب بسيط بغض النظر عن تاريخ المحادثة.

### 9.2 إعادة طلب معلومات أُعطيت مسبقاً (BUG — مستمر)

**المثال:** العميل أعطى اسمه (حسن محمد بارجاء) ورقم جواله (778076543) وعنوانه (تريم) في رسالة سابقة. بعد عدة رسائل يقول "ابغاك ترسله الى تريم" فيطلب الوكيل: نوع العسل + الكمية + رقم الجوال + العنوان — رغم أن الجوال والعنوان موجودان في السياق!

**السبب:** الموديل لا يطبق قاعدة "لا تطلب ما ذُكر" بشكل صارم لأن القاعدة مكتوبة بشكل عام وغير محدد.

**الإصلاح المقترح:** في system prompt، إضافة تعليمات أكثر إلزامية مع أمثلة واضحة.

### 9.3 استخدام الاسم الكامل بدل الاسم الأول (BUG — تم الإصلاح)

**المثال:** "هلا يا حسن محمد بارجاء!" — يجب أن يكون "هلا يا حسن!"

**الإصلاح:** تعليمات صريحة باستخدام الاسم الأول فقط.

### 9.4 خلط المهنة مع الاسم (BUG — تم الإصلاح جزئياً)

**المثال:** العميل قال "انا مهندس" → الوكيل رد "اسمك كما ذكرته هو حسن"

**السبب:** القاعدة القديمة كانت تطلب من الوكيل البحث في السياق عن الاسم إذا سُئل، فبحث عن أي سياق ذكر الاسم.

**الإصلاح:** الوكيل يجب أن يفهم السياق الحرفي — "انا مهندس" لا يُعادل سؤالاً عن الاسم.

### 9.5 رسالة الخطأ العامة (BUG — تم الإصلاح)

**المشكلة:** عند فشل API (429 rate limit, timeout)، يُرسل "شكراً لتواصلك معنا! سنرد عليك في أقرب وقت ممكن." — يبدو وكأن إنساناً سيرد.

**الإصلاح المُطبَّق:**
- Retry تلقائي حتى 3 مرات مع exponential backoff في `generateGroqReply()`
- عند 429: ينتظر قيمة `retry-after` header + buffer ثم يُعيد المحاولة
- عند 500+: ينتظر `attempt × 2` ثانية ثم يُعيد المحاولة
- Deduplication في الـ webhook: نفس الرسالة من نفس الرقم خلال 60 ثانية تُتجاهل تلقائياً (يمنع مضاعفة الطلبات على Groq)

### 9.7 RETURN_ACTION — الـ tag لا يُفعَّل لأن الوكيل يطلب تفاصيل زائدة (BUG — تم الإصلاح)

**المشكلة:** العميل يقول "ارجع الطلب كله" فيُطلب الوكيل أسماء المنتجات بالتفصيل.

**السبب:** prompt غير واضح — "المنتجات المراد إرجاعها" كان يُفسَّر على أنه يتطلب أسماء محددة.

**الإصلاح:** تعديل system prompt ليُوضّح صراحة:
- "الطلب كله" أو "كل المنتجات" مقبول تماماً كإجابة لحقل المنتجات
- أطلق RETURN_ACTION في أول فرصة — لا تماطل ولا تطلب تأكيداً

### 9.10 RETURN_ACTION — parseOrderActions يمسح حقول الاسترجاع قبل أن يُعالجها parseReturnActions (BUG — تم الإصلاح)

**المشكلة:** `returnActionsCount: 0` رغم أن `rawReply` يحتوي على `[RETURN_ACTION:{...}]` كاملاً وصحيحاً — الاسترجاع لا يُحفظ أبداً.

**السبب الجذري:** في `webhook.ts` كان الترتيب:
```javascript
const { actions, cleanText: afterOrders } = parseOrderActions(rawReply);        // أولاً
const { actions: returnActions, cleanText } = parseReturnActions(afterOrders);  // ثانياً
```
`parseOrderActions` تنتهي بـ cleanup regex عدواني:
```javascript
.replace(/,?\s*"(?:...|items|customerName|customerPhone|...)"\s*:\s*"[^"]*"[\s\S]{0,500}$/m, "")
.replace(/[,}[\]]+\s*$/, "")
```
هذا الـ regex يبحث عن حقول مثل `"items"` و`"customerName"` و`"customerPhone"` في نهاية النص — وهي بالضبط الحقول الموجودة داخل `[RETURN_ACTION:{...}]`! فيقتطع جزءاً من الـ tag ثم يُزيل الأقواس المتبقية، فيصل `afterOrders` إلى `parseReturnActions` وقد اختفى الـ tag.

**الإصلاح:** قلب الترتيب في `webhook.ts` — تُعالَج RETURN_ACTION أولاً قبل ORDER_ACTION:
```javascript
const { actions: returnActions, cleanText: afterReturns } = parseReturnActions(rawReply);  // أولاً
const { actions, cleanText } = parseOrderActions(afterReturns);                             // ثانياً
```
بهذا لا تصل `[RETURN_ACTION:{...}]` إلى cleanup الخاصة بـ ORDER_ACTION.

### 9.9 RETURN_ACTION — customerName و customerPhone مفقودان في JSON مما يمنع حفظ الاسترجاع (BUG — تم الإصلاح)

**المشكلة:** الوكيل يؤكد استلام الاسترجاع ("تم استلام طلب الإرجاع ✅...") لكن لا يُحفظ شيء في جدول `returns`. يؤكد المستخدم عدم ظهور الاسترجاع في لوحة التحكم حتى بعد إصلاح مشكلة الـ `{` اليتيمة.

**السبب:** عندما لا يُعطي العميل اسمه أو جواله صراحةً في رسالة الاسترجاع (يقول فقط "ارجع طلبي رقم 3")، يُنتج الـ LLM JSON بدون حقلي `customerName` و`customerPhone` — أو يضعهما كـ `undefined`. الكود القديم مرّر هذه القيم مباشرةً لـ Drizzle فيفشل الـ insert صامتاً بسبب انتهاك قاعدة `NOT NULL`.

**الإصلاح:**
- `processReturnAction()` تقبل الآن `fallbackPhone` و`fallbackName` من الـ webhook (أي من بيانات الـ webhook مباشرةً — رقم الهاتف الذي أرسل الرسالة)
- استدعاء في `webhook.ts`: `processReturnAction(userId, conversation.id, action, customerPhone, customerName)`
- قيم احتياطية إضافية: إذا كان الحقل فارغاً يُستخدم "غير محدد" بدلاً من `undefined`

### 9.8 RETURN_ACTION — `{` يتيمة تبقى في الرد المُرسَل للعميل (BUG — تم الإصلاح)

**المشكلة:** العميل يستلم رسالة تنتهي بـ `{` مثل "تم استلام طلب الاسترجاع ✅...\n{"

**السبب:** الـ LLM يكتب أحياناً `{[RETURN_ACTION:{...}]` — حرف `{` منفرد قبل الـ tag. الـ parser يُزيل `[RETURN_ACTION:{...}]` لكن يُبقي الـ `{` التي قبله.

**الإصلاح:** `parseReturnActions()` الآن يفحص الحرف قبل موقع الـ tag — إذا كان `{` يتيمة يُزيله معه، مع تنظيف نهائي لأي أسطر تحتوي على أقواس منفردة فقط.

### 9.6 الوكيل يذكر الكوبونات بشكل مبكر (BUG — مستمر)

**المثال:** رسائل 211, 212 - عند التحية يذكر "يمكنك الاستفادة من كوبون AAA123 (خصم 20%)" — يجب ألا يذكر الكوبون إلا عند قرب الشراء.

---

## 10. تحسينات مستقبلية مقترحة

### أولوية عالية

1. **Retry للـ Rate Limit**: عند 429 من Groq، انتظر المدة المطلوبة وأعد المحاولة بدل إرسال رسالة خطأ
2. **تمييز "جلسة جديدة"**: اكتشاف إذا كانت آخر رسالة من العميل قبل أكثر من X ساعة → معاملة المحادثة كبداية جديدة بدون تحميل السياق القديم
3. **تضمين customer profile في system prompt**: حقن ملف العميل المحفوظ (اسم، مهنة، تفضيلات) في بداية كل محادثة

### أولوية متوسطة

4. **كشف اللغة**: إذا كتب العميل بالإنجليزية → رد بالإنجليزية
5. **حالة "لم أفهم"**: بدلاً من رسالة عامة، اطرح سؤالاً يوجّه العميل لاختيار من قائمة
6. **تقليص context**: عند محادثات طويلة جداً، اضغط الرسائل القديمة في ملخص بدلاً من حذفها

### أولوية منخفضة

7. **تعدد اللهجات**: كشف لهجة العميل والتكيّف معها تلقائياً
8. **ذاكرة بين المحادثات**: حقن الملاحظات من `customer_profiles` في system prompt

---

## 11. إعداد البيئة

```bash
# تشغيل التطبيق
PORT=8080 pnpm --filter @workspace/api-server run dev
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-ai-saas run dev

# بعد أي تغيير في schema
pnpm --filter @workspace/db run push

# بناء API server
cd artifacts/api-server && pnpm run build
```

**متغيرات البيئة المطلوبة:**
- `DATABASE_URL` — PostgreSQL connection string
- مفاتيح API تُدار من لوحة الإدارة في DB (جدول `api_keys`)، لا تُخزَّن في `.env`

---

## 12. قاعدة البيانات — الجداول المتعلقة بالوكيل

| الجدول | الوظيفة |
|--------|---------|
| `users` | المستأجرون متعددو المستويات (admin/user) |
| `api_keys` | مفاتيح Groq/Gemini للـ chat والـ embedding |
| `user_settings` | إعدادات الوكيل: prompt، لهجة، استراتيجيات، responseDelay |
| `conversations` | محادثات واتساب لكل مستخدم |
| `messages` | الرسائل الفردية (from: customer/agent) |
| `products` | كتالوج المنتجات (اسم، سعر، كمية، صورة) |
| `coupons` | كوبونات الخصم (كود، نوع، قيمة، تواريخ) |
| `businesses` | بيانات المتجر (اسم، ساعات، فروع، بنوك) |
| `orders` | الطلبات المُنشأة عبر الوكيل |
| `delivery_zones` + `delivery_zone_rates` | مناطق التوصيل وتكاليفها |
| `customer_profiles` | ملفات العملاء المُستخرجة تلقائياً من المحادثات |
| `knowledge_chunks` | قاعدة المعرفة المُجزَّأة للبحث الدلالي |

---

## 13. تغييرات الواجهة — سجل جلسة التحسينات

### 13.1 إعادة تصميم DashboardPage
**الملفات:** `artifacts/whatsapp-ai-saas/src/pages/user/DashboardPage.tsx`، `artifacts/api-server/src/routes/user/index.ts`، `artifacts/whatsapp-ai-saas/src/lib/api.ts`

**Backend:**
- استعلامات متوازية (`Promise.all`) لجلب توزيع المحادثات (نشطة/معلقة/مغلقة)، إحصائيات الطلبات (مسودة/قيد المراجعة/مقبول/تم التسليم)، وعدد المنتجات النشطة
- إصلاح حساب `messagesToday` عبر `innerJoin` الصحيح

**Frontend:**
- بانر ترحيب مع تحية مخصصة بالوقت (صباح الخير / مرحباً / مساء الخير)
- 4 بطاقات KPI: محادثات اليوم، رسائل اليوم، طلبات قيد المراجعة، منتجات نشطة
- شريط توزيع المحادثات المرئي (ألوان + أرقام)
- ملخص الطلبات بـ 4 بطاقات ملونة
- قائمة آخر المحادثات مع اختصارات سريعة
- حالات تحميل بـ skeleton animation

---

### 13.2 إعادة تصميم ConversationsPage
**الملف:** `artifacts/whatsapp-ai-saas/src/pages/user/ConversationsPage.tsx`

- إزالة `opacity-0 group-hover:opacity-100` — زر إيقاف/استئناف الوكيل **دائماً مرئي** في كل صف
- نقطة حالة ملونة على الأفاتار (نشط/معلق/موقوف)، شارة حالة الوكيل دائماً مرئية
- ألوان أفاتار متنوعة بناءً على رقم الهاتف
- **إصلاح الجوال:** لوح الدردشة على الجوال يُعرض كـ `fixed inset-0 z-50` (overlay كامل الشاشة) فوق الـ TopBar (`z-20`) لمنع أي تداخل — يتم تتبع `isMobile` عبر `window.innerWidth < 768` مع مراقب `resize`

---

### 13.3 إعادة تصميم CustomersPage
**الملف:** `artifacts/whatsapp-ai-saas/src/pages/user/CustomersPage.tsx`

- ملف العميل على الجوال كشاشة كاملة (`absolute inset-0 z-30`) مع زر رجوع
- تتبع `isMobile` بـ `window.innerWidth < 1024`
- بطاقات الإحصائيات: `grid-cols-2 md:grid-cols-4`
- أيقونة التعديل وزر `ChevronLeft` دائماً مرئيان (بدون hover فقط)
- فلاتر قابلة للتمرير أفقياً على الجوال

---

### 13.4 إعادة تصميم BusinessPage
**الملف:** `artifacts/whatsapp-ai-saas/src/pages/user/BusinessPage.tsx`

- **كمبيوتر:** شريط تنقل عمودي بأيقونات ملونة + نقطة خضراء للقسم الحالي + زر حفظ ثابت أسفله
- **جوال:** تبويبات أفقية قابلة للتمرير (أيقونة + نص) + زر حفظ كامل العرض أسفل الشاشة
- حقول الفورمات في شبكة عمودين على الكمبيوتر، مفردة على الجوال
- استبدال `🐦` بـ `𝕏` في حقول التواصل الاجتماعي

---

### 13.6 إضافة إرسال رسالة مباشر من لوحة الدردشة
**الملفات:** `artifacts/api-server/src/routes/user/index.ts`، `artifacts/whatsapp-ai-saas/src/pages/user/ConversationsPage.tsx`، `artifacts/whatsapp-ai-saas/src/lib/api.ts`

**Backend:**
- `POST /api/user/conversations/:id/send` — يُرسل الرسالة عبر Evolution API ويحفظها في DB كـ `from: "agent"`، يُحدّث `lastMessage` في المحادثة

**Frontend:**
- استبدال Footer الثابت بـ textarea + زر إرسال (Send icon)
- `Enter` يُرسل الرسالة، `Shift+Enter` سطر جديد
- رسالة الحالة تُوضح أن الوكيل يعمل تلقائياً مع إمكانية التدخل اليدوي

---

### 13.7 إصلاح ملف العميل في الدردشة
**الملف:** `artifacts/whatsapp-ai-saas/src/pages/user/ConversationsPage.tsx`

- **الجوال:** تغيير من `hidden lg:flex` إلى `fixed inset-0 z-[60] w-full` على الجوال — overlay كامل الشاشة فوق كل العناصر
- **كمبيوتر:** يظل `w-72 shrink-0` كلوح جانبي ثابت

---

### 13.8 إعادة تصميم فلاتر صفحة الطلبات
**الملف:** `artifacts/whatsapp-ai-saas/src/pages/user/OrdersPage.tsx`

- فصل حقل البحث في صف مستقل
- الفلاتر أصبحت أزرار pill مستديرة مع شارات العدد، في صف منفصل
- إصلاح شبكة الإحصائيات: `grid-cols-2 sm:grid-cols-4` (4 أعمدة على الشاشات الكبيرة، 2 على الجوال)

---

### 13.9 قواعد تصميم مستخلصة

| القاعدة | التفاصيل |
|---------|---------|
| **نمط الجوال للصفحات الفرعية** | `fixed inset-0 z-[30\|50]` بدلاً من `hidden` |
| **أزرار وظيفية** | لا يُستخدم `opacity-0 group-hover:opacity-100` — يجب أن تكون دائماً مرئية |
| **كشف الجوال** | `window.innerWidth < 768` للمحادثات، `< 1024` للعملاء، مع مراقب `resize` |
| **الأيقونات** | لا emojis لشبكات التواصل — رموز نصية (`𝕏`) أو SVG |
| **z-index المستخدمة** | TopBar: `z-20`، قوائم الجوال: `z-30`، overlays الدردشة: `z-50` |

---

## 14. ميزة الـ PWA (Progressive Web App)

**الملفات:**
- `artifacts/whatsapp-ai-saas/public/manifest.json` — Web App Manifest
- `artifacts/whatsapp-ai-saas/public/sw.js` — Service Worker (cache-first)
- `artifacts/whatsapp-ai-saas/public/icon-192.svg` + `icon-512.svg` — أيقونات SVG
- `artifacts/whatsapp-ai-saas/index.html` — تسجيل Service Worker + meta tags
- `artifacts/whatsapp-ai-saas/src/main.tsx` — تسجيل SW برمجياً

**السلوك:**
- التطبيق قابل للتثبيت على الجوال والكمبيوتر كتطبيق مستقل
- Service Worker يُخزّن الأصول (cache-first) للعمل offline
- اتجاه RTL (`"dir": "rtl"`) في الـ manifest

---

## 15. نظام الـ Debounce للرسائل المتعددة

**الملف:** `artifacts/api-server/src/routes/webhook.ts` (أعلى الملف)

**المشكلة:** العملاء يُرسلون الرسالة على عدة أجزاء ("عايز" ثم "كيلو عسل" ثم "بكم؟") فيرد الوكيل على كل جزء منفصلاً.

**الحل:** buffer زمني يجمع الرسائل المتتالية قبل الإرسال للـ LLM.

### الثوابت

```typescript
const DEBOUNCE_MS = 7_000;    // ينتظر 7 ثوانٍ بعد آخر نشاط قبل المعالجة
const MAX_WAIT_MS = 100_000;  // حد أقصى مطلق (100 ثانية)
```

### آلية العمل

```
رسالة تصل → bufferAndProcess()
  ├── إذا buffer موجود → أضف النص وأعد تشغيل timer (7ث)
  └── إذا لا يوجد   → أنشئ buffer جديد (timer 7ث + maxTimer 100ث)

حدث PRESENCE_UPDATE "composing" → handleCustomerTyping()
  ├── إذا وُجد buffer مباشر برقم الهاتف → أعد تشغيل timer
  └── إذا لم يُوجد (LID mismatch) → امدد كل buffers المستخدم (LID fallback)

بعد 7ث من الصمت → flushBuffer() → processTextFlow(combinedText)
```

### مشكلة LID (الإصلاح الجذري)

**الجذر:** WhatsApp يرسل أحداث Presence بـ **LID** (معرّف داخلي للخصوصية) مثل `61718763929682@lid` — لكن الرسائل تصل بالرقم الحقيقي مثل `967778076543`.  
لا يوجد mapping مباشر بين LID ورقم الهاتف في بيانات الـ webhook.

**الإصلاح:**
```typescript
function handleCustomerTyping(userId: number, customerPhone: string): void {
  const key = `${userId}:${customerPhone}`;
  if (textBuffers.has(key)) {
    // مطابقة مباشرة (يحدث عندما يأتي الـ presence بالرقم الحقيقي)
    resetDebounce(key, userId, customerPhone);
    return;
  }
  // LID fallback: امدد كل buffers هذا المستخدم النشطة
  // (عملياً دائماً محادثة واحدة نشطة في نفس الوقت)
  for (const [bKey] of textBuffers) {
    if (bKey.startsWith(`${userId}:`)) {
      const bPhone = bKey.slice(`${userId}:`.length);
      resetDebounce(bKey, userId, bPhone);
    }
  }
}
```

**استخراج بيانات Presence (صيغ متعددة):**
دالة `extractPresencePhone()` تتعامل مع 4 صيغ من Evolution API:
- **A**: `data.id` + `data.presences.{jid}.lastKnownPresence`
- **B**: `data.remoteJid` + `data.presence`
- **C**: `data = [{jid, presence}]` (مصفوفة)
- **D**: `data.from` + `data.type`

---

## 16. إصلاح صور سندات الإيداع

**الملفات:** `artifacts/api-server/src/lib/orderActions.ts`، `artifacts/whatsapp-ai-saas/src/pages/user/OrdersPage.tsx`

**المشكلة:** روابط صور واتساب تنتهي صلاحيتها بعد دقائق (CDN مؤقت).

**الإصلاح:**
- الصور تُحمَّل فوراً عبر `downloadEvolutionMedia()` وتُحفظ في `public/uploads/` بـ UUID
- يُخزَّن الـ URL المحلي في DB: `/api/uploads/{uuid}.jpg`
- `GET /api/uploads/*` يخدم الملفات عبر static middleware في Express
- صفحة الطلبات تعرض صورة مصغّرة قابلة للنقر بدل رابط نصي

---

## 17. تقليل الـ Tokens

**الملف:** `artifacts/api-server/src/lib/providers/groq.ts`

- تاريخ المحادثة: من 8 رسائل → 6 رسائل (توفير ~20% tokens)
- `MAX_MSG_CHARS`: من 600 → 350 حرف لكل رسالة في التاريخ

---

## 18. مؤشر الكتابة (Typing Indicator)

**الملف:** `artifacts/api-server/src/lib/providers/evolution.ts`

دالة `sendEvolutionTyping(config, phone, durationMs)`:
- تُرسل حالة "composing" عبر Evolution API قبل إرسال الرد
- المدة تتناسب مع طول الرد (حد أقصى 8 ثوانٍ)
- تُستدعى مباشرة قبل بناء الـ system prompt في `processTextFlow`

---

## 19. فلتر الاهتمامات بالمنتجات في صفحة الرسائل الجماعية

**الملفات:**
- `artifacts/api-server/src/routes/user/broadcast.ts`
- `artifacts/whatsapp-ai-saas/src/lib/api.ts`
- `artifacts/whatsapp-ai-saas/src/pages/user/BroadcastPage.tsx`

**Backend:**
- `GET /api/user/broadcast/products` — يُعيد قائمة المنتجات النشطة مع عدد العملاء المهتمين بكل منتج (يتم المطابقة بـ case-insensitive partial match بين `inquiredProducts` في `customer_profiles` وأسماء المنتجات)
- `POST /api/user/broadcast/send` — يقبل الآن `productInterests?: string[]` — قائمة أسماء المنتجات المُختارة. يُفلتر الأرقام باستخدام PostgreSQL array overlap operator (`&&`) قبل تطبيق فلتر الدولة

**دالة مساعدة جديدة:**
```typescript
getPhonesInterestedInProducts(userId, productNames) // تستخدم sql`... && ARRAY[...]::text[]`
```

**Frontend:**
- مكوّن `ProductInterestFilter` جديد (مطوي بالافتراضي) في الخطوة الثانية من معالج الإرسال
- يُظهر كل منتج نشط مع عدد العملاء المهتمين به
- يظهر في الملخص (الخطوة الثالثة) إذا كان محدداً: "🛍️ اسم المنتج"
- إضافة `productInterests` في `BroadcastSendPayload` و `BroadcastProductItem` interface جديد في `api.ts`

**ملاحظة:** الفلتر يعمل بالتسلسل: الشريحة → الاهتمامات → الدولة

---

## 20. إصلاح: إلغاء التعديل عند إرسال رقم الإيداع

**الملف المُصلح:** `artifacts/api-server/src/routes/webhook.ts` (معالج `submit_order` tool call)

**المشكلة:**
عند تعديل طلب قائم (مثلاً: تغيير الكمية)، يُحدَّث الطلب في DB بحالة `pending_payment`. لكن عندما يرسل العميل رقم الإيداع، كان الوكيل يستدعي `submit_order` مجدداً بـ **كل** تفاصيل الطلب (أسماء المنتجات + الكميات + الأسعار) يُعيد توليدها من السياق — مما يُشغّل `save_draft` أولاً ويُلغي التعديل بالبيانات القديمة، ثم `set_deposit_ref` يُغلق الطلب بالبيانات الملغاة.

**الإصلاح:**
```
عند وجود depositReference في submit_order:
  إذا كان يوجد طلب نشط (pending_payment) → تجاوز save_draft تماماً، استدعِ set_deposit_ref فقط
  إذا لم يكن يوجد طلب نشط → أنشئ الطلب أولاً (save_draft) ثم set_deposit_ref
عند غياب depositReference:
  استدعِ save_draft فقط (إنشاء أو تحديث الطلب)
```

**السبب الجذري:** `submit_order` مُصمَّم للإنشاء الأولي، لكنه كان يُشغَّل مجدداً عند الإيداع مما يُلغي التعديلات. الإصلاح يحمي الطلبات الموجودة من الكتابة فوقها في مرحلة الإيداع.

---

## 21. إصلاح: الوكيل يمنع الطلبات الجديدة بعد انتهاء الطلب القديم

**الملف المُصلح:** `artifacts/api-server/src/routes/webhook.ts`

**المشكلة:**
عندما ينتهي الطلب (يصبح `delivered` أو `approved`)، لا يوجد سياق طلب مُحقن في الـ system prompt. الوكيل كان يعوّض غياب السياق بالاتكاء على **تاريخ المحادثة** الذي يحتوي رسائل "الطلب مقفل" فيكررها ويرفض الطلبات الجديدة حتى لو لم يكن هناك أي `pending_review` في DB.

**الإصلاح:**
بدلاً من حقن سياق فارغ عند غياب الطلب النشط، يُحقن الآن رسالة صريحة:

```
✅ حالة الطلبات: لا يوجد أي طلب نشط أو مقفل لهذا العميل حالياً —
يمكنك استقبال طلب جديد بحرية تامة. تجاهل أي ذكر لطلبات سابقة في تاريخ المحادثة.
```

هذه الرسالة تتغلب على تحيز الوكيل من المحادثات القديمة وتُخبره صراحةً بأنه حر لقبول طلب جديد. تُطبَّق في موضعين:
1. السياق الأساسي (قبل طلب LLM الأول)
2. سياق المتابعة بعد تنفيذ Tool calls

---

## 22. ردود المجموعات (Group Reply)

**التاريخ:** مايو 2026

### الوصف
أُضيفت ميزة التحكم في ردود الوكيل على رسائل مجموعات الواتساب. يستطيع المستخدم اختيار أحد ثلاثة أوضاع:

| الوضع | السلوك |
|-------|--------|
| `disabled` (افتراضي) | الوكيل لا يرد على أي رسالة من مجموعة |
| `all` | الوكيل يرد على رسائل جميع المجموعات |
| `selected` | الوكيل يرد فقط على المجموعات المحددة من القائمة |

### الملفات المعدّلة

#### قاعدة البيانات — `lib/db/src/schema/index.ts`
- `conversationsTable`: أُضيف `isGroup boolean("is_group").default(false).notNull()`
- `userSettingsTable`: أُضيف `groupReplyMode text("group_reply_mode").default("disabled").notNull()`
- `userSettingsTable`: أُضيف `allowedGroupIds text("allowed_group_ids").default("[]").notNull()`

#### الخادم — `artifacts/api-server/src/routes/webhook.ts`
- `TextBuffer` interface: أُضيف `isGroup: boolean`
- `bufferAndProcess()`: أُضيف معامل `isGroup = false` يُخزَّن في الـ buffer ويُمرَّر عبر `flushBuffer` → `processTextFlow`
- `processTextFlow()`: أُضيف معامل `isGroup = false` يُستخدم عند إنشاء المحادثة (`isGroup` مُحفَظة في DB)
- `processEvolutionPayload()`: بعد استخراج `remoteJid`، يتم كشف `@g.us` مبكراً:
  - `const isGroup = remoteJid.endsWith("@g.us")`
  - إذا كان `mode === "disabled"` → يُعاد فوراً (لا معالجة)
  - إذا كان `mode === "selected"` → يُفحص `allowedGroupIds` JSON array
  - اسم المجموعة يُستخرج من `data.groupName` إذا كان متاحاً
- جميع استدعاءات `processTextFlow` (نص + صوت + وسائط) تُمرِّر `isGroup`

#### الخادم — `artifacts/api-server/src/routes/user/index.ts`
- `GET /user/settings`: يُعيد `groupReplyMode` و`allowedGroupIds`
- `PUT /user/settings`: يقبل ويحفظ الحقلين
- `GET /user/groups` (جديد): يُعيد `{ customerPhone, customerName }[]` للمحادثات ذات `isGroup = true`

#### الواجهة — `artifacts/whatsapp-ai-saas/src/lib/api.ts`
- `UserSettings`: أُضيف `groupReplyMode: string` و`allowedGroupIds: string`
- `GroupConversation` interface جديد: `{ customerPhone, customerName }`
- `api.user.groups()`: دالة جديدة تجلب قائمة المجموعات المعروفة

#### الواجهة — `artifacts/whatsapp-ai-saas/src/pages/user/SettingsPage.tsx`
- أُضيف `groupReplyMode: "disabled"` و`allowedGroupIds: "[]"` في `DEFAULT`
- أُضيف `groups: ["groupReplyMode", "allowedGroupIds"]` في `SECTION_FIELDS`
- أُضيف state `knownGroups: GroupConversation[]`
- `useEffect` يجلب `settings` و`groups` معاً بـ `Promise.all`
- قسم جديد "ردود المجموعات" (القسم التاسع) يحتوي:
  - 3 خيارات radio-style: لا يرد / يرد الكل / مجموعات محددة
  - عند "مجموعات محددة": قائمة المجموعات المعروفة مع checkboxes
  - حقل إدخال يدوي لإضافة معرف مجموعة بالـ JID مباشرة

### آلية الكشف التقني
- رسائل المجموعات: `remoteJid.endsWith("@g.us")`
- رسائل الأفراد: `remoteJid.endsWith("@s.whatsapp.net")`
- معرّف المجموعة المحفوظ = `customerPhone` (بعد حذف `@g.us`)
- الفلترة تتم قبل أي Debounce أو DB operations → أداء مثالي
