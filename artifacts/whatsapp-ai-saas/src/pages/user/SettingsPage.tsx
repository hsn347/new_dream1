import { useState, useEffect, useMemo, useRef } from "react";
import {
  Save, Bot, Check, Sparkles, MessageSquare, TrendingUp,
  Sliders, Loader2, Image, ShoppingBag, Bell, ChevronDown, ChevronUp,
  BarChart2, Send, Clock, Users, Search, X as XIcon, FileText,
} from "lucide-react";
import SmartPhoneInput from "@/components/SmartPhoneInput";
import { api, type UserSettings, type GroupConversation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const DEFAULT: UserSettings = {
  agentEnabled: true,
  systemPrompt: null,
  chatKeyId: null,
  embeddingKeyId: null,
  currency: "SAR",
  dialect: "saudi",
  dialectStrength: 5,
  style: "friendly",
  tone: "warm",
  persuasion: 7,
  formality: 5,
  responseDelay: 3,
  messageAggregationDelay: 15,
  emojiLevel: "medium",
  replyLength: "medium",
  openingMessage: "أهلاً وسهلاً! 👋 كيف يمكنني مساعدتك اليوم؟",
  closingMessage: "شكراً لك! سيسعدنا خدمتك دائماً 😊",
  stratFollowup: true,
  stratCart: true,
  stratUpsell: true,
  stratPromo: true,
  stratReview: true,
  sendProductImages: true,
  orderSystemEnabled: true,
  reviewWhatsappNumber: null,
  approvedOrderMessage: null,
  deliveredOrderMessage: null,
  lowStockThreshold: 5,
  reportEnabled: false,
  reportFrequency: "daily",
  reportTime: "08:00",
  reportManagerPhone: null,
  groupReplyMode: "disabled",
  allowedGroupIds: "[]",
  returnSystemEnabled: true,
  maxTokens: 1500,
  depositTolerance: 5,
  invoiceColor: "#16a34a",
  invoiceEnabled: true,
  omqiVerificationEnabled: true,
};

const SECTION_FIELDS: Record<string, (keyof UserSettings)[]> = {
  personality: ["currency", "dialect", "dialectStrength", "responseDelay", "emojiLevel", "replyLength"],
  orders: ["orderSystemEnabled", "approvedOrderMessage", "deliveredOrderMessage", "lowStockThreshold"],
  review_number: ["reviewWhatsappNumber"],
  reports: ["reportEnabled", "reportFrequency", "reportTime", "reportManagerPhone"],
  groups: ["groupReplyMode", "allowedGroupIds"],
  invoice: ["invoiceColor", "invoiceEnabled"],
};

const SEARCH_INDEX: { section: string; terms: string[] }[] = [
  {
    section: "personality",
    terms: [
      "شخصية", "شخصيه", "لهجة", "لهجه", "لغة", "لغه",
      "خليجية", "سعودية", "مصرية", "شامية", "فصحى",
      "قوة اللهجة", "كثافة", "حديث", "كلام", "طريقة الكلام",
      "تأخير", "وقت الرد", "سرعة الرد", "تأخر",
      "إيموجي", "ايموجي", "emoji", "رموز", "تعبيرات",
      "طول الرد", "مختصر", "تفصيلي", "قصير", "طويل",
      "dialect", "personality", "delay",
    ],
  },


  {
    section: "orders",
    terms: [
      "طلبات", "طلب", "طلبيات", "order", "orders",
      "إيداع", "سند", "دفع", "تحويل",
      "قبول", "تأكيد", "موافقة", "approved",
      "توصيل", "توصل", "شحن", "تسليم", "delivered",
      "مخزون", "stock", "كمية", "كميه", "نفاد",
      "تنبيه", "إشعار", "حد المخزون", "منخفض",
      "رسائل الطلبات", "نظام الطلبات",
    ],
  },
  {
    section: "review_number",
    terms: [
      "رقم المراجعة", "رقم الواتساب", "رقم واتساب",
      "إشعار فوري", "إشعار", "تنبيه فوري",
      "مراجعة", "مشرف", "واتساب", "رقم",
      "phone", "whatsapp", "notification",
    ],
  },
  {
    section: "prompt",
    terms: [
      "موجّه", "موجه", "system prompt", "prompt", "تعليمات",
      "ذكاء اصطناعي", "AI", "نموذج", "مخصص",
      "أوامر", "توجيهات", "متقدم", "برومبت",
    ],
  },
  {
    section: "reports",
    terms: [
      "تقارير", "تقرير", "تقاريرتقرير", "reports", "report",
      "مبيعات", "إيرادات", "دخل", "أرباح",
      "يومي", "أسبوعي", "شهري", "جدولة", "مجدول",
      "مدير", "رقم المدير", "مدير العمل",
      "نمو", "إحصاء", "إحصائيات", "توصيات", "ذكية",
      "وقت الإرسال", "واتساب المدير", "ارسال تلقائي",
    ],
  },
  {
    section: "groups",
    terms: [
      "مجموعات", "مجموعه", "مجموعة", "groups", "group",
      "جروب", "غروب", "واتساب جروب",
      "ردود المجموعات", "رد على مجموعة",
      "تحكم في المجموعات", "السماح",
    ],
  },
  {
    section: "invoice",
    terms: [
      "فاتورة", "فواتير", "invoice", "pdf",
      "لون الفاتورة", "إرسال فاتورة", "PDF",
      "إيصال", "وثيقة", "طباعة", "تصدير",
    ],
  },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<UserSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<string>("personality");
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [sendingReport, setSendingReport] = useState<string | null>(null);
  const [knownGroups, setKnownGroups] = useState<GroupConversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.user.settings(),
      api.user.groups(),
    ])
      .then(([s, groups]) => {
        setForm({
          ...DEFAULT, ...s,
          openingMessage: s.openingMessage ?? DEFAULT.openingMessage,
          closingMessage: s.closingMessage ?? DEFAULT.closingMessage,
          stratFollowup: true,
          stratCart: true,
          stratUpsell: true,
          stratPromo: true,
          stratReview: true,
        });
        setKnownGroups(groups);
        
        // فرض تفعيل جميع استراتيجيات البيع وتحديثها في الخلفية
        api.user.updateSettings({
          stratFollowup: true,
          stratCart: true,
          stratUpsell: true,
          stratPromo: true,
          stratReview: true,
        }).catch(() => {});
      })
      .catch(() => toast({ title: "تعذّر تحميل الإعدادات", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const activeQuery = searchQuery.trim();

  const matchedSections = useMemo(() => {
    if (!activeQuery) return new Set<string>();
    const q = activeQuery.toLowerCase();
    const matched = new Set<string>();
    for (const entry of SEARCH_INDEX) {
      const allTerms = entry.terms.join(" ").toLowerCase();
      if (allTerms.includes(q)) {
        matched.add(entry.section);
      }
    }
    return matched;
  }, [activeQuery]);

  const isSectionOpen = (id: string) => {
    if (activeQuery) return matchedSections.has(id);
    return openSection === id;
  };

  const showSection = (id: string) => {
    if (!activeQuery) return true;
    return matchedSections.has(id);
  };

  const handleSectionToggle = (id: string) => {
    if (activeQuery) {
      setSearchQuery("");
      setOpenSection(id);
    } else {
      setOpenSection(openSection === id ? "" : id);
    }
  };

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const sendReportNow = async (period: "daily" | "weekly" | "monthly") => {
    setSendingReport(period);
    try {
      const result = await api.user.reports.sendNow(period);
      toast({ title: result.message ?? "تم إرسال التقرير ✓" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل إرسال التقرير";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSendingReport(null);
    }
  };

  const saveSection = async (sectionId: string) => {
    const fields = SECTION_FIELDS[sectionId] ?? [];
    const partial: Partial<UserSettings> = {};
    fields.forEach((f) => { (partial as Record<string, unknown>)[f] = form[f]; });

    setSavingSection(sectionId);
    try {
      await api.user.updateSettings(partial as UserSettings);
      setSavedSection(sectionId);
      toast({ title: "✓ تم حفظ التغييرات" });
      setTimeout(() => setSavedSection(null), 2500);
    } catch {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    } finally {
      setSavingSection(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- مكوّنات مساعدة ----
  const ToggleRow = ({ id, label, desc }: { id: keyof UserSettings; label: string; desc: string }) => (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      <div className="flex-1 pe-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={() => set(id, !form[id] as UserSettings[typeof id])}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form[id] ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form[id] ? "right-0.5" : "left-0.5"}`} />
      </button>
    </div>
  );

  const ChoiceGroup = ({ label, field, options }: {
    label: string; field: keyof UserSettings;
    options: { value: string; label: string; emoji?: string }[];
  }) => (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.value}
            onClick={() => set(field, o.value as UserSettings[typeof field])}
            className={`px-3.5 py-2 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 ${form[field] === o.value
              ? "border-primary bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
          >
            {o.emoji && <span>{o.emoji}</span>}{o.label}
          </button>
        ))}
      </div>
    </div>
  );

  const RangeSlider = ({ label, sub, field, min, max, leftLabel, rightLabel }: {
    label: string; sub?: string; field: keyof UserSettings;
    min: number; max: number; leftLabel: string; rightLabel: string;
  }) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-medium text-foreground">{label}</span>
          {sub && <span className="text-xs text-muted-foreground me-2"> {sub}</span>}
        </div>
        <span className="text-sm font-bold text-primary bg-primary/10 w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
          {form[field] as number}
        </span>
      </div>
      <input type="range" min={min} max={max}
        value={form[field] as number}
        onChange={(e) => set(field, Number(e.target.value) as UserSettings[typeof field])}
        className="w-full h-2 rounded-full accent-primary cursor-pointer"
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{leftLabel}</span><span>{rightLabel}</span>
      </div>
    </div>
  );

  // ---- زر الحفظ لكل قسم ----
  const SaveBtn = ({ sectionId }: { sectionId: string }) => {
    const saving = savingSection === sectionId;
    const saved = savedSection === sectionId;
    return (
      <button
        onClick={() => saveSection(sectionId)}
        disabled={saving}
        className={cn(
          "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60",
          saved
            ? "bg-emerald-500 text-white"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
          saved ? <Check className="w-3.5 h-3.5" /> :
            <Save className="w-3.5 h-3.5" />}
        {saving ? "جاري الحفظ..." : saved ? "تم الحفظ!" : "حفظ"}
      </button>
    );
  };

  // ---- رأس القسم القابل للطي ----
  const SectionHeader = ({
    id, icon: Icon, iconBg, iconColor, title, desc,
  }: {
    id: string; icon: React.ElementType; iconBg: string; iconColor: string; title: string; desc: string;
  }) => {
    const isOpen = isSectionOpen(id);
    return (
      <button
        onClick={() => handleSectionToggle(id)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-right"
      >
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-4 h-4", iconColor)} />
        </div>
        <div className="flex-1 text-right">
          <div className="flex items-center gap-2 justify-end flex-row-reverse">
            <h3 className="font-semibold text-foreground text-sm">{title}</h3>
            {activeQuery && matchedSections.has(id) && (
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full shrink-0">
                نتيجة
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 text-right">{desc}</p>
        </div>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
    );
  };

  const hasNoResults = activeQuery && matchedSections.size === 0;

  return (
    <div className="space-y-3">

      {/* ===== شريط البحث ===== */}
      <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في الإعدادات... (مثال: لهجة، تقارير، إيموجي)"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            dir="rtl"
          />
          {searchQuery ? (
            <button
              onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <XIcon className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0 hidden sm:block">
              Ctrl+K
            </span>
          )}
        </div>
        {activeQuery && (
          <div className={cn(
            "px-4 py-2 border-t border-border text-xs",
            hasNoResults ? "text-destructive" : "text-muted-foreground",
          )}>
            {hasNoResults
              ? `لا توجد نتائج لـ "${searchQuery}"`
              : `${matchedSections.size} قسم مطابق لـ "${searchQuery}"`}
          </div>
        )}
      </div>

      {/* ===== لا توجد نتائج ===== */}
      {hasNoResults && (
        <div className="bg-card border border-card-border rounded-2xl shadow-sm p-10 text-center">
          <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm font-medium text-foreground">لا توجد إعدادات مطابقة</p>
          <p className="text-xs text-muted-foreground mt-1">جرب كلمة أخرى مثل "لهجة" أو "تقرير" أو "مجموعة"</p>
          <button
            onClick={() => setSearchQuery("")}
            className="mt-4 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm text-muted-foreground transition-colors"
          >
            مسح البحث
          </button>
        </div>
      )}

      {/* ===== 1. شخصية الوكيل ===== */}
      {showSection("personality") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <SectionHeader
          id="personality" icon={Bot}
          iconBg="bg-primary/10" iconColor="text-primary"
          title="شخصية الوكيل ونبرة الحديث"
          desc="اللهجة والأسلوب الذي يتحدث به الوكيل"
        />
        {isSectionOpen("personality") && (
          <div className="border-t border-border p-5 space-y-5">
            <ChoiceGroup label="العملة" field="currency" options={[
              { value: "YER", label: "ريال يمني", emoji: "🇾🇪" },
              { value: "SAR", label: "ريال سعودي", emoji: "🇸🇦" },
              { value: "AED", label: "درهم إماراتي", emoji: "🇦🇪" },
              { value: "USD", label: "دولار أمريكي", emoji: "💵" },
            ]} />
            <ChoiceGroup label="اللهجة" field="dialect" options={[
              { value: "saudi", label: "سعودية", emoji: "🇸🇦" },
              { value: "hadrami", label: "حضرمية", emoji: "🇾🇪" },
              { value: "msa", label: "فصحى", emoji: "📖" },
            ]} />
            <div>
              <p className="text-sm font-medium mb-2">قوة اللهجة</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 3, l: "خفيفة", d: "كلمات بسيطة" },
                  { v: 7, l: "متوسطة", d: "لهجة واضحة" },
                  { v: 10, l: "كثيفة", d: "لهجة أصيلة" },
                ]).map(({ v, l, d }) => {
                  const isActive =
                    (v === 3 && form.dialectStrength <= 4) ||
                    (v === 7 && form.dialectStrength > 4 && form.dialectStrength <= 8) ||
                    (v === 10 && form.dialectStrength > 8);
                  return (
                    <button key={v}
                      onClick={() => set("dialectStrength", v)}
                      className={`flex flex-col items-center py-3 px-2 rounded-xl border text-center transition-all ${isActive ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 text-muted-foreground"
                        }`}
                    >
                      <span className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}>{l}</span>
                      <span className="text-[10px] mt-0.5">{d}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <RangeSlider label="تأخير الرد" field="responseDelay" min={0} max={15} leftLabel="فوري" rightLabel="15 ثانية" sub="(ثانية)" />
            <div>
              <p className="text-sm font-medium text-foreground mb-2">استخدام الإيموجي</p>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { value: "none", label: "بدون", preview: "—" },
                  { value: "low", label: "قليل", preview: "😊" },
                  { value: "medium", label: "متوسط", preview: "😊✨" },
                  { value: "high", label: "كثير", preview: "😊✨🎉" },
                ] as const).map((e) => (
                  <button key={e.value}
                    onClick={() => set("emojiLevel", e.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${form.emojiLevel === e.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}
                  >
                    <span className="text-lg leading-none">{e.preview}</span>
                    <span className={`text-xs font-medium ${form.emojiLevel === e.value ? "text-primary" : "text-muted-foreground"}`}>{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">طول الرد المثالي</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "short", l: "مختصر", d: "جملة-جملتين" },
                  { v: "medium", l: "متوسط", d: "فقرة واحدة" },
                  { v: "long", l: "تفصيلي", d: "عدة فقرات" },
                ]).map(({ v, l, d }) => (
                  <button key={v}
                    onClick={() => set("replyLength", v)}
                    className={`flex flex-col items-center py-3 px-2 rounded-xl border text-center transition-all ${form.replyLength === v ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 text-muted-foreground"
                      }`}
                  >
                    <span className={`text-sm font-semibold ${form.replyLength === v ? "text-primary" : ""}`}>{l}</span>
                    <span className="text-[10px] mt-0.5">{d}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <SaveBtn sectionId="personality" />
            </div>
          </div>
        )}
      </div>}






      {/* ===== 6. نظام الطلبات ===== */}
      {showSection("orders") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <SectionHeader
          id="orders" icon={ShoppingBag}
          iconBg="bg-emerald-500/10" iconColor="text-emerald-600"
          title="نظام الطلبات والإشعارات"
          desc="تفعيل النظام ورسائل القبول والتوصيل"
        />
        {isSectionOpen("orders") && (
          <div className="border-t border-border">
            <div className="px-5">
              <ToggleRow
                id="orderSystemEnabled"
                label="تفعيل نظام الطلبات"
                desc="يسمح للوكيل بجمع بيانات الطلب وسند الإيداع وحفظها في لوحة التحكم"
              />
            </div>

            {/* رسائل الطلبات */}
            <div className="px-5 py-4 space-y-4">
              <div className="bg-muted/40 border border-border rounded-xl px-4 py-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  المتغيرات المتاحة:
                  <span className="inline-flex flex-wrap gap-1.5 mt-1.5">
                    {["{{name}}", "{{orderId}}", "{{total}}", "{{address}}"].map((v) => (
                      <code key={v} className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] font-mono text-primary">{v}</code>
                    ))}
                  </span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">✅ رسالة قبول الطلب</label>
                <textarea rows={4}
                  value={form.approvedOrderMessage ?? ""}
                  onChange={(e) => set("approvedOrderMessage", e.target.value || null)}
                  placeholder={`✅ تم قبول طلبك #{{orderId}}\nمرحباً {{name}}، الإجمالي: {{total}}\nسيتم التواصل معك قريباً 🙏`}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">🚚 رسالة التوصيل</label>
                <textarea rows={4}
                  value={form.deliveredOrderMessage ?? ""}
                  onChange={(e) => set("deliveredOrderMessage", e.target.value || null)}
                  placeholder={`🚚 تم توصيل طلبك #{{orderId}}\nمرحباً {{name}}، نتمنى رضاك!\nشكراً لثقتك ⭐`}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* حد المخزون المنخفض */}
            <div className="px-5 pb-4">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                  عند الموافقة على طلب وانخفاض كمية أي منتج إلى هذا الحد أو أقل، يُرسل إشعار تلقائي على رقم المراجعة.
                </p>
              </div>
              <label className="block text-sm font-medium text-foreground mb-2">
                🔔 حد تنبيه المخزون المنخفض
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={form.lowStockThreshold}
                  onChange={(e) => set("lowStockThreshold", Math.max(0, Number(e.target.value)))}
                  className="w-28 h-11 px-4 rounded-xl border border-input bg-background text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">وحدة — عند الوصول لهذا العدد أو أقل يصلك تنبيه</span>
              </div>
            </div>



            <div className="flex justify-end px-5 py-4 border-t border-border">
              <SaveBtn sectionId="orders" />
            </div>
          </div>
        )}
      </div>}

      {/* ===== 6b. رقم واتساب المراجعة ===== */}
      {showSection("review_number") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <SectionHeader
          id="review_number" icon={Bell}
          iconBg="bg-blue-500/10" iconColor="text-blue-600"
          title="رقم واتساب المراجعة"
          desc="يستقبل إشعاراً فورياً عند كل طلب جديد"
        />
        {isSectionOpen("review_number") && (
          <div className="border-t border-border p-5 space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-800 leading-relaxed">
                يُرسل إشعار تلقائي على هذا الرقم فور وصول طلب جديد من أي عميل.
                اتركه فارغاً إذا لم تحتج لإشعارات واتساب.
              </p>
            </div>
            <SmartPhoneInput
              value={form.reviewWhatsappNumber ?? null}
              onChange={(normalized) => set("reviewWhatsappNumber", normalized)}
            />
            <div className="flex justify-end pt-1">
              <SaveBtn sectionId="review_number" />
            </div>
          </div>
        )}
      </div>}

      {/* ===== 7. موجّه الذكاء الاصطناعي ===== */}
      {showSection("prompt") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <SectionHeader
          id="prompt" icon={Sparkles}
          iconBg="bg-amber-500/10" iconColor="text-amber-500"
          title="الموجّه المخصص (System Prompt)"
          desc="تعليمات إضافية مباشرة للذكاء الاصطناعي"
        />
        {isSectionOpen("prompt") && (
          <div className="border-t border-border p-5 space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                هذا الحقل لمستخدمي الذكاء الاصطناعي المتقدمين — أضف توجيهات خاصة تُرسل مباشرة للنموذج في كل محادثة.
                اتركه فارغاً للعمل بالتوجيهات الافتراضية المثبّتة.
              </p>
            </div>
            <textarea
              rows={6}
              value={form.systemPrompt ?? ""}
              onChange={(e) => set("systemPrompt", e.target.value || null)}
              placeholder="مثال: أجب دائماً بالعربية الفصحى الموجزة. لا تذكر الأسعار بشكل مباشر إلا إذا سأل العميل صراحةً..."
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed font-mono"
            />
            <div className="flex justify-end">
              <SaveBtn sectionId="prompt" />
            </div>
          </div>
        )}
      </div>}

      {/* ===== 8. التقارير الذكية ===== */}
      {showSection("reports") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <SectionHeader
          id="reports" icon={BarChart2}
          iconBg="bg-violet-500/10" iconColor="text-violet-600 dark:text-violet-400"
          title="التقارير الذكية للمدير"
          desc="تقارير مبيعات تفصيلية وتوصيات ذكية ترسل تلقائياً على واتساب"
        />
        {isSectionOpen("reports") && (
          <div className="border-t border-border">

            {/* Preview card */}
            <div className="mx-5 mt-5 rounded-2xl bg-violet-500/10 border border-violet-500/20 p-4">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-2">📊 ماذا يحتوي التقرير؟</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: "💰", text: "الإيرادات والطلبات مع نسبة النمو" },
                  { icon: "💬", text: "نشاط العملاء ومعدل التحويل" },
                  { icon: "🏆", text: "أفضل المنتجات مبيعاً" },
                  { icon: "⚠️", text: "تنبيهات المخزون المنخفض" },
                  { icon: "⏳", text: "الطلبات التي تنتظر مراجعتك" },
                  { icon: "💡", text: "توصيات ذكية مخصصة" },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-1.5">
                    <span className="text-sm leading-none mt-0.5">{item.icon}</span>
                    <span className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Enable toggle */}
            <div className="px-5 pt-4">
              <ToggleRow
                id="reportEnabled"
                label="تفعيل التقارير التلقائية"
                desc="يُرسل الوكيل تقارير مجدولة تلقائياً على واتساب مدير العمل"
              />
            </div>

            <div className={cn("px-5 pb-5 space-y-5 transition-opacity", !form.reportEnabled && "opacity-40 pointer-events-none")}>

              {/* Frequency — multi-select */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">🗓️ نوع التقرير المجدول</label>
                <p className="text-xs text-muted-foreground mb-3">اختر نوعاً واحداً أو أكثر — يمكن الجمع بينها</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "daily", label: "يومي", emoji: "📅", desc: "كل يوم" },
                    { value: "weekly", label: "أسبوعي", emoji: "📆", desc: "كل أحد" },
                    { value: "monthly", label: "شهري", emoji: "🗓️", desc: "أول الشهر" },
                  ] as const).map(({ value, label, emoji, desc }) => {
                    const selected = (form.reportFrequency === "all"
                      ? ["daily", "weekly", "monthly"]
                      : (form.reportFrequency ?? "").split(",").map((s) => s.trim()).filter(Boolean)
                    );
                    const isOn = selected.includes(value);
                    const toggle = () => {
                      const next = isOn
                        ? selected.filter((v) => v !== value)
                        : [...selected, value];
                      set("reportFrequency", next.join(",") || "daily");
                    };
                    return (
                      <button key={value} onClick={toggle}
                        className={cn(
                          "relative flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-center transition-all",
                          isOn
                            ? "border-violet-400 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            : "border-border hover:border-violet-500/30 text-muted-foreground",
                        )}
                      >
                        <span className={cn(
                          "absolute top-2 end-2 w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                          isOn ? "border-violet-500 bg-violet-500" : "border-muted-foreground/30",
                        )}>
                          {isOn && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        <span className="text-xl mt-1">{emoji}</span>
                        <span className={cn("text-sm font-semibold", isOn ? "text-violet-600 dark:text-violet-400" : "")}>{label}</span>
                        <span className="text-[10px] leading-tight">{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Report time */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Clock className="inline w-3.5 h-3.5 me-1 opacity-70" />
                  ساعة إرسال التقرير
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={form.reportTime}
                    onChange={(e) => set("reportTime", e.target.value)}
                    className="h-11 px-4 rounded-xl border border-input bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                    dir="ltr"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    يُرسل التقرير يومياً في هذا الوقت تحديداً
                  </span>
                </div>
              </div>

              {/* Manager phone */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  📱 رقم واتساب مدير العمل
                </label>
                <SmartPhoneInput
                  value={form.reportManagerPhone ?? null}
                  onChange={(normalized) => set("reportManagerPhone", normalized)}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  يُرسل التقرير على هذا الرقم — غيّره متى أردت
                </p>
              </div>

              {/* Send now test buttons */}
              <div className="bg-muted/40 border border-border rounded-xl p-4">
                <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  إرسال تقرير الآن (للاختبار)
                </p>
                <div className="flex flex-wrap gap-2">
                  {([
                    { period: "daily" as const, label: "تقرير يومي", color: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20" },
                    { period: "weekly" as const, label: "تقرير أسبوعي", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" },
                    { period: "monthly" as const, label: "تقرير شهري", color: "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20" },
                  ]).map(({ period, label, color }) => (
                    <button
                      key={period}
                      onClick={() => sendReportNow(period)}
                      disabled={sendingReport !== null || !form.reportManagerPhone}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                        color,
                      )}
                    >
                      {sendingReport === period
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Send className="w-3.5 h-3.5" />}
                      {sendingReport === period ? "جاري الإرسال..." : label}
                    </button>
                  ))}
                </div>
                {!form.reportManagerPhone && (
                  <p className="text-xs text-orange-600 mt-2">أدخل رقم المدير أولاً لاختبار الإرسال</p>
                )}
              </div>

            </div>

            <div className="flex justify-end px-5 py-4 border-t border-border">
              <SaveBtn sectionId="reports" />
            </div>
          </div>
        )}
      </div>}

      {/* ===== 9. ردود المجموعات ===== */}
      {showSection("groups") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <SectionHeader
          id="groups" icon={Users}
          iconBg="bg-teal-500/10" iconColor="text-teal-600"
          title="ردود المجموعات"
          desc="تحكّم في كيفية تعامل الوكيل مع رسائل مجموعات الواتساب"
        />
        {isSectionOpen("groups") && (
          <div className="border-t border-border p-5 space-y-5">

            {/* وضع الرد */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">وضع الرد على المجموعات</label>
              <div className="space-y-2">
                {([
                  { value: "disabled", label: "لا يرد على المجموعات", desc: "الوكيل يتجاهل كل رسائل المجموعات (افتراضي)", emoji: "🚫" },
                  { value: "all", label: "يرد على جميع المجموعات", desc: "الوكيل يرد على أي مجموعة تُرسل رسائل للرقم", emoji: "✅" },
                  { value: "selected", label: "مجموعات محددة فقط", desc: "اختر المجموعات التي تريد أن يرد عليها الوكيل", emoji: "🎯" },
                ] as { value: string; label: string; desc: string; emoji: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => set("groupReplyMode", opt.value)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border text-right transition-all",
                      form.groupReplyMode === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <span className="text-lg shrink-0 mt-0.5">{opt.emoji}</span>
                    <div className="flex-1">
                      <p className={cn("text-sm font-semibold", form.groupReplyMode === opt.value ? "text-primary" : "text-foreground")}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 mt-1 transition-all",
                      form.groupReplyMode === opt.value
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30",
                    )} />
                  </button>
                ))}
              </div>
            </div>

            {/* قائمة المجموعات — تظهر فقط عند اختيار "selected" */}
            {form.groupReplyMode === "selected" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  المجموعات المسموح لها
                  {knownGroups.length > 0 && (
                    <span className="text-xs text-muted-foreground font-normal me-2">
                      — اختر من المجموعات التي راسلتك سابقاً
                    </span>
                  )}
                </label>

                {knownGroups.length === 0 ? (
                  <div className="bg-muted/40 border border-border rounded-xl p-4 text-center">
                    <p className="text-sm text-muted-foreground">لا توجد مجموعات معروفة بعد</p>
                    <p className="text-xs text-muted-foreground mt-1">ستظهر هنا المجموعات التي تُرسل رسائل لرقمك بعد تفعيل الوضع "يرد الكل" مؤقتاً</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {knownGroups.map((group) => {
                      let allowed: string[] = [];
                      try { allowed = JSON.parse(form.allowedGroupIds || "[]"); } catch { /* empty */ }
                      const isAllowed = allowed.includes(group.customerPhone);
                      const toggleGroup = () => {
                        const updated = isAllowed
                          ? allowed.filter((id) => id !== group.customerPhone)
                          : [...allowed, group.customerPhone];
                        set("allowedGroupIds", JSON.stringify(updated));
                      };
                      return (
                        <button
                          key={group.customerPhone}
                          onClick={toggleGroup}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-right transition-all",
                            isAllowed
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30",
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold",
                            isAllowed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}>
                            {(group.customerName ?? group.customerPhone).charAt(0)}
                          </div>
                          <div className="flex-1 text-right">
                            <p className={cn("text-sm font-medium", isAllowed ? "text-primary" : "text-foreground")}>
                              {group.customerName ?? group.customerPhone}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">{group.customerPhone}</p>
                          </div>
                          <div className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                            isAllowed ? "border-primary bg-primary" : "border-muted-foreground/30",
                          )}>
                            {isAllowed && <Check className="w-3 h-3 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* إدخال يدوي لمعرف مجموعة */}
                <div className="mt-3">
                  <label className="block text-xs text-muted-foreground mb-1">أو أضف معرّف مجموعة يدوياً</label>
                  <div className="flex gap-2">
                    <input
                      id="manual-group-input"
                      type="text"
                      dir="ltr"
                      placeholder="120363XXXXXXXXXX"
                      className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById("manual-group-input") as HTMLInputElement;
                        const val = input?.value.trim().replace("@g.us", "");
                        if (!val) return;
                        let allowed: string[] = [];
                        try { allowed = JSON.parse(form.allowedGroupIds || "[]"); } catch { /* empty */ }
                        if (!allowed.includes(val)) {
                          set("allowedGroupIds", JSON.stringify([...allowed, val]));
                        }
                        if (input) input.value = "";
                      }}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
                    >
                      إضافة
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <SaveBtn sectionId="groups" />
            </div>
          </div>
        )}
      </div>}

      {/* ── قسم الفاتورة PDF ─────────────────────────────────────────────── */}
      {showSection("invoice") && <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => handleSectionToggle("invoice")}
          className="w-full flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors text-right"
        >
          <FileText size={18} className="shrink-0 text-emerald-600" />
          <div className="flex-1 min-w-0 text-right">
            <p className="font-semibold text-foreground text-sm">الفاتورة الإلكترونية (PDF)</p>
            <p className="text-xs text-muted-foreground mt-0.5">إرسال فاتورة PDF تلقائياً للعميل عند الموافقة على طلبه</p>
          </div>
          {savedSection === "invoice" && <Check size={16} className="text-emerald-500 shrink-0" />}
          {isSectionOpen("invoice") ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
        </button>

        {isSectionOpen("invoice") && (
          <div className="border-t border-border px-6 pb-6 pt-5 space-y-6">
            {/* تفعيل/إيقاف الفاتورة */}
            <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-xl">
              <div>
                <p className="text-sm font-medium text-foreground">إرسال فاتورة PDF تلقائياً</p>
                <p className="text-xs text-muted-foreground mt-0.5">عند الموافقة على أي طلب، تُرسَل فاتورة PDF للعميل عبر واتساب</p>
              </div>
              <button
                type="button"
                onClick={() => set("invoiceEnabled", !form.invoiceEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${form.invoiceEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${form.invoiceEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {/* لون الفاتورة */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">اللون الرئيسي للفاتورة</p>
                <p className="text-xs text-muted-foreground mt-0.5">يظهر في رأس الفاتورة، جدول المنتجات، وإجمالي السعر</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { color: "#16a34a", label: "أخضر" },
                  { color: "#2563eb", label: "أزرق" },
                  { color: "#9333ea", label: "بنفسجي" },
                  { color: "#dc2626", label: "أحمر" },
                  { color: "#ea580c", label: "برتقالي" },
                  { color: "#ca8a04", label: "ذهبي" },
                  { color: "#0891b2", label: "سماوي" },
                  { color: "#374151", label: "رمادي" },
                  { color: "#be185d", label: "وردي" },
                  { color: "#1e293b", label: "أسود" },
                ].map(({ color, label }) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => set("invoiceColor", color)}
                    title={label}
                    className={cn(
                      "w-9 h-9 rounded-xl border-2 transition-all",
                      form.invoiceColor === color ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                {/* Custom color input */}
                <div className="relative">
                  <input
                    type="color"
                    value={form.invoiceColor || "#16a34a"}
                    onChange={(e) => set("invoiceColor", e.target.value)}
                    className="w-9 h-9 rounded-xl border-2 border-border cursor-pointer p-0.5"
                    title="لون مخصص"
                  />
                </div>
              </div>
              {/* Preview */}
              <div
                className="rounded-xl p-4 text-white text-sm font-medium flex items-center justify-between"
                style={{ backgroundColor: form.invoiceColor || "#16a34a" }}
              >
                <span className="opacity-80">فاتورة رقم #00001</span>
                <span>{form.invoiceColor || "#16a34a"}</span>
              </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400 text-xs">
                <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">تفاصيل الفاتورة</p>
                  <p className="mt-0.5">تتضمن الفاتورة: اسم المتجر، بيانات العميل، قائمة المنتجات، الإجمالي، ورقم الإيصال. يتحكم المسؤول في تخطيط الفاتورة وإعداداتها المتقدمة.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <SaveBtn sectionId="invoice" />
            </div>
          </div>
        )}
      </div>}

    </div>
  );
}
