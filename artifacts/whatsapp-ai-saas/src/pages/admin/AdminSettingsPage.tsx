import { useState, useEffect } from "react";
import { Save, Phone, Send, CheckCircle, XCircle, Loader2, Info, Timer, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

function normalizeYemenPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00967")) return digits.slice(2);
  if (digits.startsWith("967")) return digits;
  if (digits.startsWith("0")) return "967" + digits.slice(1);
  if (digits.length === 9) return "967" + digits;
  return digits;
}

function isValidYemenPhone(normalized: string): boolean {
  return /^9677\d{8}$/.test(normalized);
}

function formatDisplay(normalized: string): string {
  if (!normalized) return "";
  const local = normalized.startsWith("967") ? normalized.slice(3) : normalized;
  return local.replace(/(\d{2})(\d{4})(\d{3})/, "$1 $2 $3");
}

const DEFAULTS = { message_wait_s: 6, composing_wait_s: 15 };

const OMQI_DEFAULTS = {
  omqi_enabled: "false",
  omqi_min_score: "80",
  omqi_file_size_min_kb: "50",
  omqi_file_size_max_kb: "700",
  omqi_object_count_min: "10",
  omqi_object_count_max: "25",
  omqi_stream_count_min: "4",
  omqi_stream_count_max: "12",
  omqi_max_receipt_age_days: "3",
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBuffer, setSavingBuffer] = useState(false);
  const [savingOmqi, setSavingOmqi] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [rawInput, setRawInput] = useState("");
  const [normalizedNumber, setNormalizedNumber] = useState("");

  const [messageWaitS, setMessageWaitS] = useState(DEFAULTS.message_wait_s);
  const [composingWaitS, setComposingWaitS] = useState(DEFAULTS.composing_wait_s);

  const [omqiEnabled,        setOmqiEnabled]        = useState(false);
  const [omqiMinScore,       setOmqiMinScore]        = useState(80);
  const [omqiFileSizeMin,    setOmqiFileSizeMin]     = useState(50);
  const [omqiFileSizeMax,    setOmqiFileSizeMax]     = useState(700);
  const [omqiObjCountMin,    setOmqiObjCountMin]     = useState(10);
  const [omqiObjCountMax,    setOmqiObjCountMax]     = useState(25);
  const [omqiStreamCountMin, setOmqiStreamCountMin]  = useState(4);
  const [omqiStreamCountMax, setOmqiStreamCountMax]  = useState(12);
  const [omqiMaxReceiptAgeDays, setOmqiMaxReceiptAgeDays] = useState(3);

  useEffect(() => {
    api.adminSettings.get().then(settings => {
      const stored = settings["admin_whatsapp_number"] ?? "";
      setNormalizedNumber(stored);
      setRawInput(stored ? formatDisplay(stored) : "");

      const mw = Number(settings["buffer_message_wait_ms"]);
      const cw = Number(settings["buffer_composing_wait_ms"]);
      if (mw > 0) setMessageWaitS(Math.round(mw / 1000));
      if (cw > 0) setComposingWaitS(Math.round(cw / 1000));

      setOmqiEnabled(settings["omqi_enabled"] === "true");
      if (settings["omqi_min_score"])        setOmqiMinScore(Number(settings["omqi_min_score"]));
      if (settings["omqi_file_size_min_kb"]) setOmqiFileSizeMin(Number(settings["omqi_file_size_min_kb"]));
      if (settings["omqi_file_size_max_kb"]) setOmqiFileSizeMax(Number(settings["omqi_file_size_max_kb"]));
      if (settings["omqi_object_count_min"]) setOmqiObjCountMin(Number(settings["omqi_object_count_min"]));
      if (settings["omqi_object_count_max"]) setOmqiObjCountMax(Number(settings["omqi_object_count_max"]));
      if (settings["omqi_stream_count_min"]) setOmqiStreamCountMin(Number(settings["omqi_stream_count_min"]));
      if (settings["omqi_stream_count_max"]) setOmqiStreamCountMax(Number(settings["omqi_stream_count_max"]));
      if (settings["omqi_max_receipt_age_days"]) setOmqiMaxReceiptAgeDays(Number(settings["omqi_max_receipt_age_days"]));

      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRawInput(value);
    setNormalizedNumber(normalizeYemenPhone(value));
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!isValidYemenPhone(normalizedNumber)) {
      toast({ title: "رقم غير صحيح", description: "يرجى إدخال رقم واتساب يمني صحيح (10 أرقام تبدأ بـ 7)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.adminSettings.update({ admin_whatsapp_number: normalizedNumber });
      toast({ title: "تم الحفظ", description: "تم حفظ رقم واتساب الإدارة بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBuffer = async () => {
    const mw = Number(messageWaitS);
    const cw = Number(composingWaitS);
    if (!Number.isInteger(mw) || mw < 1 || mw > 120) {
      toast({ title: "قيمة غير صحيحة", description: "انتظار الرسالة يجب أن يكون بين 1 و120 ثانية", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(cw) || cw < 1 || cw > 120) {
      toast({ title: "قيمة غير صحيحة", description: "انتظار الكتابة يجب أن يكون بين 1 و120 ثانية", variant: "destructive" });
      return;
    }
    setSavingBuffer(true);
    try {
      await api.adminSettings.update({
        buffer_message_wait_ms:   String(mw * 1000),
        buffer_composing_wait_ms: String(cw * 1000),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ توقيتات الانتظار — تُطبَّق خلال 30 ثانية" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSavingBuffer(false);
    }
  };

  const handleSaveOmqi = async () => {
    setSavingOmqi(true);
    try {
      await api.adminSettings.update({
        omqi_enabled:          String(omqiEnabled),
        omqi_min_score:        String(omqiMinScore),
        omqi_file_size_min_kb: String(omqiFileSizeMin),
        omqi_file_size_max_kb: String(omqiFileSizeMax),
        omqi_object_count_min: String(omqiObjCountMin),
        omqi_object_count_max: String(omqiObjCountMax),
        omqi_stream_count_min:      String(omqiStreamCountMin),
        omqi_stream_count_max:      String(omqiStreamCountMax),
        omqi_max_receipt_age_days:  String(omqiMaxReceiptAgeDays),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات التحقق من إيصالات العمقي" });
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSavingOmqi(false);
    }
  };

  const handleResetOmqi = () => {
    setOmqiMinScore(Number(OMQI_DEFAULTS.omqi_min_score));
    setOmqiFileSizeMin(Number(OMQI_DEFAULTS.omqi_file_size_min_kb));
    setOmqiFileSizeMax(Number(OMQI_DEFAULTS.omqi_file_size_max_kb));
    setOmqiObjCountMin(Number(OMQI_DEFAULTS.omqi_object_count_min));
    setOmqiObjCountMax(Number(OMQI_DEFAULTS.omqi_object_count_max));
    setOmqiStreamCountMin(Number(OMQI_DEFAULTS.omqi_stream_count_min));
    setOmqiStreamCountMax(Number(OMQI_DEFAULTS.omqi_stream_count_max));
    setOmqiMaxReceiptAgeDays(Number(OMQI_DEFAULTS.omqi_max_receipt_age_days));
  };

  const handleTest = async () => {
    if (!isValidYemenPhone(normalizedNumber)) {
      toast({ title: "رقم غير صحيح", description: "يرجى حفظ رقم صحيح أولاً", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.adminSettings.testWhatsapp(normalizedNumber);
      setTestResult(result);
      toast({
        title: result.success ? "تم الإرسال" : "فشل الإرسال",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع";
      setTestResult({ success: false, message: msg });
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin me-2" />جاري التحميل…
      </div>
    );
  }

  const valid = isValidYemenPhone(normalizedNumber);

  return (
    <div className="max-w-2xl space-y-6">

      {/* ─── Buffer timing settings ────────────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-3">
          <Timer className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-foreground">توقيت انتظار الردود</h2>
            <p className="text-sm text-muted-foreground mt-1">
              يتحكم بمدة انتظار الوكيل قبل الرد — يمنع الرد على رسالة ناقصة بينما العميل لا يزال يكتب.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* After message */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              الانتظار بعد وصول رسالة
            </label>
            <div className="flex items-center gap-0 rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <input
                type="number"
                min={1}
                max={120}
                value={messageWaitS}
                onChange={(e) => setMessageWaitS(Number(e.target.value))}
                className="flex-1 h-10 px-3 bg-transparent text-sm focus:outline-none text-center"
                dir="ltr"
              />
              <span className="shrink-0 h-10 flex items-center px-3 bg-muted/50 border-s border-input text-xs text-muted-foreground select-none">ثانية</span>
            </div>
            <p className="text-xs text-muted-foreground">
              إذا وصل حدث رسالة — ينتظر هذا الوقت ثم يرد. الافتراضي: {DEFAULTS.message_wait_s}ث
            </p>
          </div>

          {/* After composing */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              الانتظار بعد حدث الكتابة
            </label>
            <div className="flex items-center gap-0 rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <input
                type="number"
                min={1}
                max={120}
                value={composingWaitS}
                onChange={(e) => setComposingWaitS(Number(e.target.value))}
                className="flex-1 h-10 px-3 bg-transparent text-sm focus:outline-none text-center"
                dir="ltr"
              />
              <span className="shrink-0 h-10 flex items-center px-3 bg-muted/50 border-s border-input text-xs text-muted-foreground select-none">ثانية</span>
            </div>
            <p className="text-xs text-muted-foreground">
              إذا كان العميل يكتب (composing) — يُمدَّد الانتظار لهذه المدة. الافتراضي: {DEFAULTS.composing_wait_s}ث
            </p>
          </div>
        </div>

        {/* Flow diagram */}
        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2.5">
          <p className="text-xs font-semibold text-foreground">كيف يعمل النظام؟</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">رسالة</span>
              <span>يبدأ عداد مدته <span className="font-semibold text-foreground">الانتظار بعد الرسالة</span> — إذا وصلت رسالة أخرى أو حدث كتابة أُعيد العداد من الصفر</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded text-[10px]">يكتب…</span>
              <span>يُعاد ضبط العداد إلى <span className="font-semibold text-foreground">الانتظار بعد الكتابة</span> — إذا ظهر حدث كتابة جديد أُعيد من الصفر أيضاً</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded text-[10px]">ينتهي</span>
              <span>يرد الوكيل على كل الرسائل المتراكمة دفعة واحدة</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSaveBuffer}
            disabled={savingBuffer}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {savingBuffer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingBuffer ? "جاري الحفظ…" : "حفظ التوقيتات"}
          </button>
          <button
            type="button"
            onClick={() => { setMessageWaitS(DEFAULTS.message_wait_s); setComposingWaitS(DEFAULTS.composing_wait_s); }}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            استعادة الافتراضية
          </button>
        </div>
      </div>

      {/* ─── WhatsApp notification number ─────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">إشعارات المفاتيح</h2>
          <p className="text-sm text-muted-foreground mt-1">
            عند فشل مفتاح AI لمستخدم ما، يتم إرسال إشعار فوري على هذا الرقم.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">رقم واتساب الإدارة</label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border border-border rounded-lg shrink-0 text-sm font-medium text-foreground">
              <span className="text-base leading-none">🇾🇪</span>
              <span className="text-muted-foreground">+967</span>
            </div>
            <input
              type="tel"
              dir="ltr"
              placeholder="7X XXXX XXX"
              value={rawInput}
              onChange={handlePhoneChange}
              className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-left"
            />
          </div>

          {rawInput && (
            <div className={`flex items-center gap-1.5 text-xs ${valid ? "text-emerald-600" : "text-amber-600"}`}>
              {valid ? (
                <><CheckCircle className="w-3.5 h-3.5" /><span>الرقم صحيح — سيُخزَّن كـ: <span className="font-mono">{normalizedNumber}</span></span></>
              ) : (
                <><Info className="w-3.5 h-3.5" /><span>الرقم يجب أن يكون 9 أرقام يبدأ بـ 7 (مثال: 777123456)</span></>
              )}
            </div>
          )}

          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${testResult.success ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"}`}>
              {testResult.success ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !valid}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "جاري الحفظ…" : "حفظ"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !valid}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-all"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? "جاري الاختبار…" : "إرسال رسالة اختبار"}
          </button>
        </div>
      </div>

      {/* ─── Info card ─────────────────────────────────────────────────────────── */}
      <div className="bg-muted/30 border border-border rounded-2xl p-5">
        <div className="flex items-start gap-2">
          <Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">كيف تعمل إشعارات المفاتيح؟</p>
            <p>عندما يفشل مفتاح AI لأي مستخدم بعد استنفاد جميع المحاولات، يتحول النظام تلقائياً للمفتاح الاحتياطي التالي ويرسل إشعار واتساب على هذا الرقم.</p>
            <p>يتطلب الإرسال وجود اتصال واتساب نشط في النظام.</p>
          </div>
        </div>
      </div>

      {/* ─── Omqi Verification Settings ────────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-foreground">التحقق من إيصالات العمقي</h2>
            <p className="text-sm text-muted-foreground mt-1">
              عند إرسال العميل إيصال PDF من بنك العمقي، يتحقق النظام تلقائياً من صحته عبر 9 طبقات ويوافق على الطلب أو يرفضه.
            </p>
          </div>
        </div>

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border">
          <div>
            <p className="text-sm font-medium text-foreground">تفعيل التحقق التلقائي</p>
            <p className="text-xs text-muted-foreground mt-0.5">يطبّق على جميع المستخدمين الذين لديهم حساب عمقي مضاف</p>
          </div>
          <button
            type="button"
            onClick={() => setOmqiEnabled(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${omqiEnabled ? "bg-violet-600" : "bg-muted-foreground/30"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${omqiEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {omqiEnabled && (
          <>
            {/* Min score */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                الحد الأدنى لنسبة الثقة الكلية
              </label>
              <div className="flex items-center gap-0 rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <input
                  type="number" min={50} max={100}
                  value={omqiMinScore}
                  onChange={e => setOmqiMinScore(Number(e.target.value))}
                  className="flex-1 h-10 px-3 bg-transparent text-sm focus:outline-none text-center" dir="ltr"
                />
                <span className="shrink-0 h-10 flex items-center px-3 bg-muted/50 border-s border-input text-xs text-muted-foreground select-none">%</span>
              </div>
              <p className="text-xs text-muted-foreground">يُقبل الإيصال فقط إذا تجاوزت نسبة الثقة هذه القيمة. الافتراضي: 80%</p>
            </div>

            {/* File size range */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">نطاق حجم الملف (كيلوبايت)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحد الأدنى</p>
                  <input type="number" min={1} value={omqiFileSizeMin}
                    onChange={e => setOmqiFileSizeMin(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center" dir="ltr" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحد الأقصى</p>
                  <input type="number" min={1} value={omqiFileSizeMax}
                    onChange={e => setOmqiFileSizeMax(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center" dir="ltr" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">الافتراضي: 50 – 700 كيلوبايت</p>
            </div>

            {/* Object count range */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">نطاق عدد كائنات PDF</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحد الأدنى</p>
                  <input type="number" min={1} value={omqiObjCountMin}
                    onChange={e => setOmqiObjCountMin(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center" dir="ltr" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحد الأقصى</p>
                  <input type="number" min={1} value={omqiObjCountMax}
                    onChange={e => setOmqiObjCountMax(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center" dir="ltr" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">الافتراضي: 10 – 25 كائن</p>
            </div>

            {/* Stream count range */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">نطاق عدد تدفقات PDF</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحد الأدنى</p>
                  <input type="number" min={1} value={omqiStreamCountMin}
                    onChange={e => setOmqiStreamCountMin(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center" dir="ltr" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحد الأقصى</p>
                  <input type="number" min={1} value={omqiStreamCountMax}
                    onChange={e => setOmqiStreamCountMax(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center" dir="ltr" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">الافتراضي: 4 – 12 تدفق</p>
            </div>

            {/* Max receipt age */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                أقصى عمر مسموح للإيصال (بالأيام)
              </label>
              <div className="flex items-center gap-0 rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <input
                  type="number" min={1} max={30}
                  value={omqiMaxReceiptAgeDays}
                  onChange={e => setOmqiMaxReceiptAgeDays(Number(e.target.value))}
                  className="flex-1 h-10 px-3 bg-transparent text-sm focus:outline-none text-center" dir="ltr"
                />
                <span className="shrink-0 h-10 flex items-center px-3 bg-muted/50 border-s border-input text-xs text-muted-foreground select-none">يوم</span>
              </div>
              <p className="text-xs text-muted-foreground">يُرفض الإيصال إذا كان تاريخه أقدم من هذا العدد من الأيام. الافتراضي: 3 أيام</p>
            </div>

          </>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSaveOmqi}
            disabled={savingOmqi}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-all"
          >
            {savingOmqi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingOmqi ? "جاري الحفظ…" : "حفظ إعدادات العمقي"}
          </button>
          {omqiEnabled && (
            <button type="button" onClick={handleResetOmqi}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
              استعادة الافتراضية
            </button>
          )}
        </div>

        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground">كيف يعمل التحقق التلقائي؟</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-violet-500/10 text-violet-600 px-1.5 py-0.5 rounded text-[10px]">PDF</span>
              <span>يُرسل العميل إيصال PDF من تطبيق بنك العمقي — يكتشفه النظام تلقائياً</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded text-[10px]">9 طبقات</span>
              <span>يُحلَّل الملف عبر 9 طبقات: البنية التقنية · الأمان · نوع الإيصال · هوية المستلم · العملة · المبلغ وغيرها</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded text-[10px]">قبول</span>
              <span>إذا اجتاز جميع الطبقات الحرجة بنسبة 100% والنتيجة الكلية أعلى من الحد الأدنى — يُوافَق على الطلب تلقائياً</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-mono bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded text-[10px]">رفض</span>
              <span>أي فشل في طبقة حرجة = رفض فوري مع إبلاغ العميل بالسبب</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
