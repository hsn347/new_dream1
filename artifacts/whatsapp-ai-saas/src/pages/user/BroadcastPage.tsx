import { useState, useEffect, useCallback } from "react";
import {
  Send, Users, Target, MessageSquare, Calendar,
  ShoppingBag, TrendingUp, UserX, Wallet,
  RefreshCw, History, AlertCircle, Zap,
  ChevronDown, ChevronUp, BadgeCheck, XCircle,
  CheckCircle2, ArrowLeft, ArrowRight, Globe, Heart,
} from "lucide-react";
import { api, type BroadcastCampaign, type BroadcastSegmentCount, type BroadcastProductItem } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/components/SmartPhoneInput";

type SegmentId = "all" | "active" | "buyers" | "notBought";

const SEGMENT_DEFS: {
  id: SegmentId;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}[] = [
  { id: "all",       label: "كل العملاء",     desc: "كل من تحدث معك",              icon: Users,       color: "text-primary",     bg: "bg-primary/10",  border: "border-primary/30" },
  { id: "active",    label: "النشطون",         desc: "تفاعلوا خلال 30 يوم",          icon: Zap,         color: "text-emerald-600", bg: "bg-emerald-500/10",  border: "border-emerald-500/20" },
  { id: "buyers",    label: "اشتروا من قبل",   desc: "لديهم طلبات مكتملة مقبولة",    icon: ShoppingBag, color: "text-blue-600",    bg: "bg-blue-500/10",     border: "border-blue-500/20" },
  { id: "notBought", label: "لم يشتروا بعد",   desc: "تحدثوا ولم يُكملوا طلباً",     icon: UserX,       color: "text-amber-600",   bg: "bg-amber-500/10",    border: "border-amber-500/20" },
];

function statusLabel(s: string) {
  switch (s) {
    case "sending":   return { text: "يُرسَل الآن", cls: "bg-blue-100 text-blue-600 dark:text-blue-400" };
    case "done":      return { text: "مكتمل",        cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "failed":    return { text: "فشل",          cls: "bg-red-500/15 text-red-600 dark:text-red-400" };
    case "scheduled": return { text: "مجدوَل",       cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300" };
    default:          return { text: "انتظار",       cls: "bg-muted text-muted-foreground" };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CampaignCard({ campaign }: { campaign: BroadcastCampaign }) {
  const [open, setOpen] = useState(false);
  const { text, cls } = statusLabel(campaign.status);
  const segs: SegmentId[] = (() => { try { return JSON.parse(campaign.segments); } catch { return []; } })();
  const successRate = campaign.recipientCount > 0
    ? Math.round((campaign.sentCount / campaign.recipientCount) * 100)
    : 0;

  return (
    <div className="bg-background border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/20 transition-colors text-right"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-full", cls)}>{text}</span>
            <span className="text-[11px] text-muted-foreground">{formatDate(campaign.createdAt)}</span>
          </div>
          <p className="text-sm text-foreground line-clamp-1 text-right">{campaign.message}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{campaign.recipientCount}</span>
            {campaign.status === "done" && (
              <span className="flex items-center gap-1 text-emerald-600"><BadgeCheck className="w-3 h-3" />{successRate}% وصلت</span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <p className="text-xs text-foreground bg-muted/40 p-3 rounded-xl whitespace-pre-wrap leading-relaxed">{campaign.message}</p>
          <div className="flex flex-wrap gap-1.5">
            {segs.map((s) => {
              const def = SEGMENT_DEFS.find((d) => d.id === s);
              return def ? (
                <span key={s} className={cn("text-[11px] font-medium px-2.5 py-0.5 rounded-full border", def.bg, def.color, def.border)}>
                  {def.label}
                </span>
              ) : null;
            })}
          </div>
          {campaign.status === "done" && campaign.recipientCount > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">نسبة الوصول</span>
                <span className="font-bold text-emerald-600">{successRate}%</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${successRate}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 text-emerald-600"><BadgeCheck className="w-3 h-3" />{campaign.sentCount} وصل</span>
                {campaign.failedCount > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{campaign.failedCount} فشل</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- مؤشر الخطوات ----
function StepIndicator({ step }: { step: number }) {
  const steps = ["الرسالة", "الجمهور", "الإرسال"];
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((label, i) => {
        const num = i + 1;
        const active = step === num;
        const done = step > num;
        return (
          <div key={num} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                done ? "bg-primary text-primary-foreground" :
                active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110" :
                "bg-muted text-muted-foreground",
              )}>
                {done ? <CheckCircle2 className="w-4 h-4" /> : num}
              </div>
              <span className={cn(
                "text-[10px] font-medium",
                active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground",
              )}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                "w-12 h-0.5 mb-4 mx-1 transition-colors",
                step > num ? "bg-primary" : "bg-muted",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- فلتر الاهتمامات بالمنتجات ----
function ProductInterestFilter({
  products,
  selected,
  onToggle,
  loading,
}: {
  products: BroadcastProductItem[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isAll = selected.size === 0;
  const totalInterested = [...selected].reduce((acc, name) => {
    const p = products.find((x) => x.name === name);
    return acc + (p?.interestedCount ?? 0);
  }, 0);

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors text-right"
      >
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-rose-500" />
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              فلتر الاهتمامات
              <span className="text-xs font-normal text-muted-foreground me-1"> — اختياري</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAll
                ? "كل العملاء بدون تصفية"
                : `${selected.size} منتج محدد — ~${totalInterested} مهتم`}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">لا توجد منتجات نشطة بعد</p>
            </div>
          ) : (
            <>
              <button
                onClick={() => { if (!isAll) [...selected].forEach((n) => onToggle(n)); }}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right",
                  isAll ? "border-rose-400 bg-rose-500/10" : "border-border hover:border-rose-200",
                )}
              >
                <span className="text-xl">🛍️</span>
                <div className="flex-1">
                  <p className={cn("text-sm font-semibold", isAll ? "text-rose-600" : "text-foreground")}>كل المنتجات</p>
                  <p className="text-[11px] text-muted-foreground">بدون تصفية — يشمل كل العملاء</p>
                </div>
                {isAll && <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />}
              </button>

              <div className="space-y-2">
                {products.map((p) => {
                  const isSelected = selected.has(p.name);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onToggle(p.name)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border-2 text-right transition-all active:scale-[0.97]",
                        isSelected
                          ? "border-rose-400 bg-rose-500/10 shadow-sm"
                          : "border-border hover:border-rose-200",
                      )}
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        isSelected ? "bg-rose-500/15" : "bg-muted",
                      )}>
                        <ShoppingBag className={cn("w-4 h-4", isSelected ? "text-rose-500" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold truncate", isSelected ? "text-rose-600" : "text-foreground")}>
                          {p.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.interestedCount > 0 ? `${p.interestedCount} عميل مهتم` : "لا يوجد بيانات اهتمام بعد"}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {!isAll && (
                <button
                  onClick={() => [...selected].forEach((n) => onToggle(n))}
                  className="w-full text-xs text-muted-foreground hover:text-red-500 transition-colors py-1 text-center"
                >
                  إلغاء كل التحديدات
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- قائمة الدول (تُعرض في step 2 — مطوية بالافتراضي) ----
const TOP_COUNTRIES = COUNTRIES.slice(0, 12);

function CountryFilter({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isAll = selected.size === 0;
  const displayList = expanded ? COUNTRIES : TOP_COUNTRIES;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* رأس قابل للنقر */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors text-right"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">
              فلتر الدولة
              <span className="text-xs font-normal text-muted-foreground me-1"> — اختياري</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAll ? "جميع الدول" : `${selected.size} دول محددة: ${[...selected].map((c) => COUNTRIES.find((x) => x.code === c)?.flag).join(" ")}`}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {/* المحتوى عند الفتح */}
      {open && (
        <div className="border-t border-border p-4 space-y-3">
          {/* خيار "كل الدول" */}
          <button
            onClick={() => { if (!isAll) [...selected].forEach((c) => onToggle(c)); }}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right",
              isAll ? "border-primary bg-primary/5" : "border-border hover:border-primary/30",
            )}
          >
            <span className="text-xl">🌍</span>
            <div className="flex-1">
              <p className={cn("text-sm font-semibold", isAll ? "text-primary" : "text-foreground")}>جميع الدول</p>
              <p className="text-[11px] text-muted-foreground">بدون تصفية — يشمل كل الأرقام</p>
            </div>
            {isAll && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
          </button>

          {/* شبكة الدول */}
          <div className="grid grid-cols-2 gap-1.5">
            {displayList.map((c) => {
              const isSelected = selected.has(c.code);
              return (
                <button
                  key={c.code}
                  onClick={() => onToggle(c.code)}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border-2 text-right transition-all active:scale-[0.97]",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/20",
                  )}
                >
                  <span className="text-lg">{c.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-semibold truncate", isSelected ? "text-primary" : "text-foreground")}>
                      {c.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground" dir="ltr">+{c.code}</p>
                  </div>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          {!expanded && COUNTRIES.length > TOP_COUNTRIES.length && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full text-xs text-primary hover:underline py-1 text-center"
            >
              عرض المزيد ({COUNTRIES.length - TOP_COUNTRIES.length} دولة إضافية)...
            </button>
          )}

          {!isAll && (
            <button
              onClick={() => [...selected].forEach((c) => onToggle(c))}
              className="w-full text-xs text-muted-foreground hover:text-red-500 transition-colors py-1 text-center"
            >
              إلغاء كل التحديدات
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BroadcastPage() {
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [selectedSegments, setSelectedSegments] = useState<Set<SegmentId>>(new Set(["all"]));
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("10:00");

  const getTodayStr = () => new Date().toISOString().split("T")[0]!;

  const getDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0]!;
  };

  const DATE_PRESETS = [
    { label: "اليوم",        days: 0 },
    { label: "بكرة",         days: 1 },
    { label: "بعد يومين",   days: 2 },
    { label: "بعد أسبوع",   days: 7 },
    { label: "بعد أسبوعين", days: 14 },
  ];

  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({});
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [products, setProducts] = useState<BroadcastProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  const loadSegments = useCallback(async () => {
    setLoadingSegments(true);
    try {
      const data = await api.user.broadcast.segments();
      const map: Record<string, number> = {};
      data.forEach((s: BroadcastSegmentCount) => { map[s.id] = s.count; });
      setSegmentCounts(map);
    } catch {
      toast({ title: "تعذّر تحميل الشرائح", variant: "destructive" });
    } finally {
      setLoadingSegments(false);
    }
  }, [toast]);

  const loadCampaigns = useCallback(async () => {
    try {
      const data = await api.user.broadcast.campaigns();
      setCampaigns(data);
    } catch {
      toast({ title: "تعذّر تحميل سجل الحملات", variant: "destructive" });
    } finally {
      setLoadingCampaigns(false);
    }
  }, [toast]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await api.user.broadcast.products();
      setProducts(data);
    } catch {
      // تجاهل الخطأ — المنتجات اختيارية
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
    loadCampaigns();
    loadProducts();
  }, [loadSegments, loadCampaigns, loadProducts]);

  const toggleSegment = (id: SegmentId) => {
    if (id === "all") { setSelectedSegments(new Set(["all"])); return; }
    setSelectedSegments((prev) => {
      const next = new Set(prev);
      next.delete("all");
      if (next.has(id)) { next.delete(id); if (next.size === 0) next.add("all"); }
      else next.add(id);
      return next;
    });
  };

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleProduct = (name: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalCount = selectedSegments.has("all")
    ? (segmentCounts["all"] ?? 0)
    : [...selectedSegments].reduce((acc, id) => acc + (segmentCounts[id] ?? 0), 0);

  const handleSend = async () => {
    if (!message.trim()) return;
    if (scheduleMode === "later" && !scheduleDate) {
      toast({ title: "حدّد تاريخ الإرسال", variant: "destructive" });
      return;
    }
    if (totalCount === 0) {
      toast({ title: "لا يوجد عملاء في الشريحة المختارة", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      let scheduledAt: string | undefined;
      if (scheduleMode === "later" && scheduleDate) {
        scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
      }

      const result = await api.user.broadcast.send({
        message: message.trim(),
        segments: [...selectedSegments],
        scheduleMode,
        scheduledAt,
        countryCodes: selectedCountries.size > 0 ? [...selectedCountries] : undefined,
        productInterests: selectedProducts.size > 0 ? [...selectedProducts] : undefined,
      });

      toast({
        title: scheduleMode === "now" ? "بدأ الإرسال!" : "تمّت الجدولة!",
        description: scheduleMode === "now"
          ? `جاري إرسال الرسالة لـ ${result.recipientCount} عميل`
          : `سيُرسَل يوم ${scheduleDate} الساعة ${scheduleTime}`,
      });

      setMessage("");
      setSelectedSegments(new Set(["all"]));
      setSelectedCountries(new Set());
      setSelectedProducts(new Set());
      setScheduleMode("now");
      setScheduleDate("");
      setStep(1);
      await loadCampaigns();
      setShowHistory(true);
    } catch (err) {
      toast({
        title: "فشل الإرسال",
        description: err instanceof Error ? err.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const minDate = getTodayStr();

  const selectedSegmentLabels = selectedSegments.has("all")
    ? "كل العملاء"
    : [...selectedSegments].map((id) => SEGMENT_DEFS.find((s) => s.id === id)?.label).filter(Boolean).join("، ");

  const countryLabel = selectedCountries.size === 0
    ? "جميع الدول"
    : [...selectedCountries].map((code) => COUNTRIES.find((c) => c.code === code)).filter(Boolean).map((c) => c!.flag + " " + c!.name).join("، ");

  const productInterestLabel = selectedProducts.size === 0
    ? "كل المنتجات"
    : [...selectedProducts].join("، ");

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {/* ---- مؤشر الخطوات ---- */}
      <StepIndicator step={step} />

      {/* ===================== خطوة 1: الرسالة ===================== */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold text-foreground text-base mb-1 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />اكتب رسالتك
            </h2>
            <p className="text-xs text-muted-foreground mb-4">ستصل لعملائك مباشرة على واتساب</p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              placeholder={"السلام عليكم 👋\n\nلدينا عرض خاص اليوم فقط!\nاحصل على خصم 25% على جميع المنتجات.\n\nتواصل معنا الآن 📲"}
              rows={7}
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
              dir="rtl"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={cn("text-xs tabular-nums", message.length > 900 ? "text-red-500 font-bold" : "text-muted-foreground")}>
                {message.length} / 1000
              </span>
              {message.trim() && (
                <button onClick={() => setMessage("")} className="text-xs text-muted-foreground hover:text-red-500 transition-colors">
                  مسح
                </button>
              )}
            </div>
          </div>

          {/* معاينة واتساب */}
          {message.trim() && (
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                معاينة الرسالة
              </p>
              <div className="bg-[#e5ddd5] rounded-xl p-3">
                <div className="flex justify-end">
                  <div className="bg-[#dcf8c6] rounded-2xl rounded-bl-none px-3.5 py-2.5 shadow-sm max-w-[85%]">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{message}</p>
                    <p className="text-[10px] text-gray-400 mt-1 text-left">
                      {new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!message.trim()}
            className={cn(
              "w-full h-14 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all",
              message.trim()
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98]"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            التالي — اختر الجمهور
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ===================== خطوة 2: الجمهور والدول ===================== */}
      {step === 2 && (
        <div className="space-y-3">
          {/* الشرائح */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-foreground text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />من تريد إرسالها؟
              </h2>
              <button
                onClick={loadSegments}
                className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loadingSegments && "animate-spin")} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">اضغط على الشريحة لاختيارها — يمكنك تعدد الاختيار</p>

            <div className="space-y-2">
              {SEGMENT_DEFS.map((s) => {
                const Icon = s.icon;
                const isSelected = selectedSegments.has(s.id);
                const count = segmentCounts[s.id] ?? 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSegment(s.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-right transition-all active:scale-[0.98]",
                      isSelected
                        ? `${s.border} ${s.bg} shadow-sm`
                        : "border-border hover:border-border/60 bg-background",
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                      isSelected ? s.bg : "bg-muted",
                    )}>
                      <Icon className={cn("w-5 h-5", isSelected ? s.color : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-semibold", isSelected ? s.color : "text-foreground")}>
                        {s.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
                    </div>
                    <div className="shrink-0">
                      {loadingSegments ? (
                        <div className="w-8 h-5 bg-muted rounded animate-pulse" />
                      ) : (
                        <span className={cn(
                          "text-sm font-bold tabular-nums",
                          isSelected ? s.color : "text-muted-foreground",
                        )}>
                          {count.toLocaleString("ar")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {!loadingSegments && totalCount === 0 && (
              <div className="mt-3 flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-300">لا يوجد عملاء في هذه الشريحة بعد</p>
              </div>
            )}
          </div>

          {/* فلتر الاهتمامات */}
          <ProductInterestFilter
            products={products}
            selected={selectedProducts}
            onToggle={toggleProduct}
            loading={loadingProducts}
          />

          {/* فلتر الدولة */}
          <CountryFilter selected={selectedCountries} onToggle={toggleCountry} />

          {/* ملخص الاختيار */}
          {totalCount > 0 && !loadingSegments && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary">
                  {totalCount.toLocaleString("ar")} عميل
                  {(selectedCountries.size > 0 || selectedProducts.size > 0) && (
                    <span className="font-normal text-xs text-muted-foreground"> (قبل الفلاتر)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">{selectedSegmentLabels}</p>
                {selectedProducts.size > 0 && (
                  <p className="text-xs text-rose-600 truncate mt-0.5">
                    🛍️ {productInterestLabel}
                  </p>
                )}
                {selectedCountries.size > 0 && (
                  <p className="text-xs text-primary/80 truncate mt-0.5">
                    🌍 {countryLabel}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStep(1)}
              className="h-12 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1.5 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              رجوع
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={totalCount === 0 && !loadingSegments}
              className={cn(
                "h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all",
                totalCount > 0 || loadingSegments
                  ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              التالي
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================== خطوة 3: الإرسال ===================== */}
      {step === 3 && (
        <div className="space-y-3">
          {/* ملخص */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
            <h2 className="font-bold text-foreground text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />مراجعة وإرسال
            </h2>

            <div className="bg-muted/40 rounded-xl p-3 space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">الجمهور</span>
                <span className="font-semibold text-foreground text-xs max-w-[55%] text-right truncate">{selectedSegmentLabels}</span>
              </div>
              {selectedProducts.size > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">الاهتمام</span>
                  <span className="font-semibold text-rose-600 text-xs max-w-[55%] text-right truncate">🛍️ {productInterestLabel}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">الدولة</span>
                <span className="font-semibold text-foreground text-xs max-w-[55%] text-right truncate">{countryLabel}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">المستلمون</span>
                <span className="font-bold text-primary text-lg">{totalCount.toLocaleString("ar")} عميل</span>
              </div>
            </div>

            <div className="bg-[#e5ddd5] rounded-xl p-3">
              <div className="flex justify-end">
                <div className="bg-[#dcf8c6] rounded-2xl rounded-bl-none px-3.5 py-2.5 shadow-sm max-w-[90%]">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed line-clamp-4">{message}</p>
                  <p className="text-[10px] text-gray-400 mt-1 text-left">
                    {new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })} ✓✓
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* وقت الإرسال */}
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground mb-3">متى ترسل؟</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { value: "now" as const,   label: "الآن فوراً",    emoji: "⚡" },
                { value: "later" as const, label: "جدولة لاحقاً",  emoji: "📅" },
              ].map(({ value, label, emoji }) => (
                <button
                  key={value}
                  onClick={() => {
                    setScheduleMode(value);
                    if (value === "later" && !scheduleDate) setScheduleDate(getTodayStr());
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-4 rounded-xl border-2 transition-all font-semibold text-sm active:scale-[0.97]",
                    scheduleMode === value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30",
                  )}
                >
                  <span className="text-2xl">{emoji}</span>
                  {label}
                </button>
              ))}
            </div>

            {scheduleMode === "later" && (
              <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2">اختر سريعاً</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {DATE_PRESETS.map(({ label, days }) => {
                      const val = getDateOffset(days);
                      const isActive = scheduleDate === val;
                      return (
                        <button
                          key={days}
                          onClick={() => setScheduleDate(val)}
                          className={cn(
                            "px-3.5 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all active:scale-[0.96]",
                            isActive
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border text-muted-foreground hover:border-primary/40 bg-background",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="block text-xs font-semibold text-foreground mb-2">أو اختر تاريخاً محدداً</label>
                  <input
                    type="date"
                    lang="en"
                    value={scheduleDate}
                    min={minDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2">الوقت</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["08:00","10:00","12:00","15:00","18:00","20:00","21:00","22:00"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setScheduleTime(t)}
                        className={cn(
                          "py-2.5 rounded-xl border text-xs font-semibold transition-all",
                          scheduleTime === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {scheduleDate && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">سيُرسَل في {scheduleDate} الساعة {scheduleTime}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setStep(2)}
              className="h-12 rounded-2xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted/50 flex items-center justify-center gap-1 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              رجوع
            </button>
            <button
              onClick={handleSend}
              disabled={sending || (scheduleMode === "later" && !scheduleDate)}
              className={cn(
                "col-span-2 h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
                !sending && (scheduleMode === "now" || scheduleDate)
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {sending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />جاري الإرسال...</>
              ) : scheduleMode === "now" ? (
                <><Send className="w-4 h-4" />إرسال الآن</>
              ) : (
                <><Calendar className="w-4 h-4" />جدولة الإرسال</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ===================== سجل الحملات ===================== */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
        >
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            سجل الحملات
            {campaigns.length > 0 && (
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{campaigns.length}</span>
            )}
          </h3>
          {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showHistory && (
          <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
            {loadingCampaigns && (
              <div className="py-10 text-center text-muted-foreground">
                <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin opacity-40" />
                <p className="text-sm">جاري التحميل...</p>
              </div>
            )}
            {!loadingCampaigns && campaigns.length === 0 && (
              <div className="py-10 text-center text-muted-foreground">
                <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">لا توجد حملات بعد</p>
                <p className="text-xs mt-1 opacity-60">أرسل أولى حملاتك الآن</p>
              </div>
            )}
            {!loadingCampaigns && campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
