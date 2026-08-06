import { useState, useEffect, useRef } from "react";
import { api, type Business, type WorkingHour, type Shift, type BankAccount } from "@/lib/api";
import {
  Building2, Plus, Trash2, Save, Check, Phone, GitBranch,
  Share2, Landmark, Clock, Globe, Loader2, Info, ChevronDown, ChevronUp,
  Upload, ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ── Real brand SVG icons ── */
function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
function IconInstagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
  );
}
function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
function IconSnapchat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.968 0C9.697 0 7.74.876 6.326 2.502 5.093 3.921 4.5 5.753 4.5 7.647c0 1.345.106 2.599.309 3.65.044.225.049.273.016.323-.044.067-.183.109-.348.134-.55.086-1.573.228-2.02.228-.609 0-1.026.315-1.118.847-.077.439.117.935.539 1.378l.064.062c.745.698 2.378 1.637 2.378 1.637.294.167.653.486.689 1.055.034.523-.274 1.258-.876 2.067-1.12 1.488-2.613 2.593-2.613 2.593-.418.303-.538.741-.334 1.189.178.396.653.649 1.365.649 1.246 0 2.591-.564 3.411-1.118.598-.403.953-.699 1.393-.564.332.103.882.385 1.428.665l.081.042c1.379.728 2.871 1.201 4.293 1.201 1.383 0 2.884-.453 4.248-1.178l.128-.069c.571-.3 1.144-.595 1.517-.698.423-.117.755.158 1.332.548.825.556 2.181 1.127 3.447 1.127.702 0 1.173-.245 1.362-.647.214-.46-.089-1.018-.535-1.346 0 0-1.503-1.112-2.63-2.61-.595-.796-.893-1.514-.85-2.03.04-.576.417-.905.727-1.082 0 0 1.624-.925 2.365-1.614l.064-.062c.414-.442.596-.92.518-1.353-.095-.53-.518-.845-1.115-.845-.445 0-1.464-.141-2.008-.225-.175-.027-.318-.071-.365-.14-.035-.052-.03-.1.016-.328.204-1.05.31-2.302.31-3.64 0-1.895-.595-3.731-1.83-5.151C16.208.875 14.24 0 11.968 0z"/>
    </svg>
  );
}
function IconFacebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

const SOCIAL_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  placeholder: string;
}> = {
  "واتساب":    { icon: IconWhatsApp,  color: "text-[#25D366]", bg: "bg-[#25D366]/10", placeholder: "+967701234567" },
  "فيسبوك":    { icon: IconFacebook,  color: "text-[#1877F2]", bg: "bg-[#1877F2]/10", placeholder: "https://facebook.com/yourpage" },
  "إنستقرام": { icon: IconInstagram, color: "text-[#E1306C]", bg: "bg-[#E1306C]/10", placeholder: "https://instagram.com/yourstore" },
  "تويتر / X": { icon: IconX,         color: "text-foreground",bg: "bg-foreground/10", placeholder: "https://x.com/yourhandle" },
  "سناب شات": { icon: IconSnapchat,  color: "text-[#FFFC00] dark:text-[#fffc00] drop-shadow-sm", bg: "bg-zinc-800", placeholder: "https://snapchat.com/add/username" },
};

const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const DEFAULT_SHIFT: Shift = { open: "08:00", close: "13:00" };
const DEFAULT_SHIFT2: Shift = { open: "16:00", close: "22:00" };

const DEFAULT_HOURS: WorkingHour[] = DAY_NAMES.map(day => ({
  day,
  enabled: day !== "الجمعة",
  shifts: [{ ...DEFAULT_SHIFT }, { ...DEFAULT_SHIFT2 }],
}));

/** Migrate old {open, close} format to new {shifts} format */
function normalizeHours(raw: WorkingHour[]): WorkingHour[] {
  return raw.map(wh => {
    if (!wh.shifts?.length) {
      return {
        day: wh.day,
        enabled: wh.enabled ?? true,
        shifts: wh.open || wh.close
          ? [{ open: wh.open ?? "09:00", close: wh.close ?? "22:00" }]
          : [{ ...DEFAULT_SHIFT }, { ...DEFAULT_SHIFT2 }],
      };
    }
    return { day: wh.day, enabled: wh.enabled, shifts: wh.shifts };
  });
}

const EMPTY_BUSINESS: Business = {
  name: "",
  description: "",
  storeUrl: "",
  logoUrl: "",
  phones: [],
  branches: [],
  socialLinks: { واتساب: "", فيسبوك: "", إنستقرام: "", "تويتر / X": "", "سناب شات": "" },
  bankAccounts: [],
  workingHours: DEFAULT_HOURS,
  returnPolicy: "",
};

const TABS = [
  { id: "general",  label: "المعلومات العامة",      icon: Building2,  color: "text-primary",    bg: "bg-primary/10" },
  { id: "hours",    label: "ساعات العمل",            icon: Clock,      color: "text-amber-600",  bg: "bg-amber-500/10" },
  { id: "contact",  label: "أرقام التواصل",          icon: Phone,      color: "text-green-600",  bg: "bg-green-500/10" },
  { id: "branches", label: "الفروع والمواقع",         icon: GitBranch,  color: "text-blue-600",   bg: "bg-blue-500/10" },
  { id: "social",   label: "السوشيال ميديا",          icon: Share2,     color: "text-pink-600",   bg: "bg-pink-500/10" },
  { id: "banking",  label: "الحسابات البنكية",        icon: Landmark,   color: "text-emerald-600",bg: "bg-emerald-500/10" },
];

const SOCIAL_KEYS = ["واتساب", "فيسبوك", "إنستقرام", "تويتر / X", "سناب شات"];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-foreground mb-1.5">
      {children}{required && <span className="text-red-500 ms-0.5">*</span>}
    </label>
  );
}

function InputBase({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full h-10 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all",
        className,
      )}
      {...props}
    />
  );
}

function TextAreaBase({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed transition-all",
        className,
      )}
      {...props}
    />
  );
}

function SectionTitle({ icon: Icon, iconBg, iconColor, title, desc }: {
  icon: React.ElementType; iconBg: string; iconColor: string; title: string; desc?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon className={cn("w-4.5 h-4.5", iconColor)} />
      </div>
      <div>
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
    </div>
  );
}

function LogoUploader({ logoUrl, onLogoChange }: { logoUrl: string; onLogoChange: (url: string) => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "نوع الملف غير مدعوم", description: "يرجى اختيار صورة (JPG, PNG, WebP)", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "الملف كبير جداً", description: "الحد الأقصى 5 ميغابايت", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { logoUrl: newUrl } = await api.user.business.uploadLogo(file);
      onLogoChange(newUrl);
      toast({ title: "تم رفع الشعار بنجاح ✓" });
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <FieldLabel>شعار العمل التجاري</FieldLabel>
      <p className="text-xs text-muted-foreground mb-3">يظهر في الفواتير الإلكترونية المُرسَلة للعملاء</p>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="w-20 h-20 rounded-full border-2 border-dashed border-border bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt="شعار المتجر" className="w-full h-full object-cover rounded-full" />
          ) : (
            <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
          )}
        </div>
        {/* Upload button */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "جارٍ الرفع…" : "رفع صورة الشعار"}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={() => onLogoChange("")}
              className="text-xs text-destructive hover:underline text-start"
            >
              حذف الشعار
            </button>
          )}
          <p className="text-xs text-muted-foreground">JPG, PNG, WebP — حد أقصى 5 MB</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

export default function BusinessPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [biz, setBiz] = useState<Business>(EMPTY_BUSINESS);
  const [openBankIdx, setOpenBankIdx] = useState<number | null>(null);
  const [quickShifts, setQuickShifts] = useState<Shift[]>([{ open: "08:00", close: "13:00" }, { open: "16:00", close: "22:00" }]);

  useEffect(() => {
    api.user.business.get()
      .then(data => {
        const wh = data.workingHours?.length ? normalizeHours(data.workingHours) : DEFAULT_HOURS;
        const sl = data.socialLinks && Object.keys(data.socialLinks).length
          ? data.socialLinks
          : { واتساب: "", فيسبوك: "", إنستقرام: "", "تويتر / X": "", "سناب شات": "" };
        setBiz({ ...data, workingHours: wh, socialLinks: sl });
      })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.user.business.save(biz);
      setSaved(true);
      toast({ title: "✓ تم حفظ بيانات العمل" });
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast({ title: "خطأ في الحفظ", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const upd = <K extends keyof Business>(key: K, value: Business[K]) =>
    setBiz(prev => ({ ...prev, [key]: value }));

  const updPhone  = (i: number, f: "label" | "value", v: string) => { const a = [...biz.phones]; a[i] = { ...a[i]!, [f]: v }; upd("phones", a); };
  const delPhone  = (i: number) => upd("phones", biz.phones.filter((_, j) => j !== i));
  const updBranch = (i: number, f: "label" | "value", v: string) => { const a = [...biz.branches]; a[i] = { ...a[i]!, [f]: v }; upd("branches", a); };
  const delBranch = (i: number) => upd("branches", biz.branches.filter((_, j) => j !== i));
  const updSocial = (k: string, v: string) => upd("socialLinks", { ...biz.socialLinks, [k]: v });
  const toggleDay   = (i: number) => {
    const wh = [...biz.workingHours]; wh[i] = { ...wh[i]!, enabled: !wh[i]!.enabled }; upd("workingHours", wh);
  };
  const updShift  = (dayI: number, shiftI: number, f: "open" | "close", v: string) => {
    const wh = [...biz.workingHours];
    const shifts = [...(wh[dayI]!.shifts ?? [])];
    shifts[shiftI] = { ...shifts[shiftI]!, [f]: v };
    wh[dayI] = { ...wh[dayI]!, shifts };
    upd("workingHours", wh);
  };
  const addShift  = (dayI: number) => {
    const wh = [...biz.workingHours];
    const shifts = [...(wh[dayI]!.shifts ?? [])];
    if (shifts.length >= 3) return;
    shifts.push({ open: "16:00", close: "22:00" });
    wh[dayI] = { ...wh[dayI]!, shifts };
    upd("workingHours", wh);
  };
  const delShift  = (dayI: number, shiftI: number) => {
    const wh = [...biz.workingHours];
    const shifts = (wh[dayI]!.shifts ?? []).filter((_, j) => j !== shiftI);
    wh[dayI] = { ...wh[dayI]!, shifts: shifts.length ? shifts : [{ open: "09:00", close: "22:00" }] };
    upd("workingHours", wh);
  };
  const updBank   = (i: number, f: keyof BankAccount, v: string) => {
    const ba = [...biz.bankAccounts]; ba[i] = { ...ba[i]!, [f]: v }; upd("bankAccounts", ba);
  };
  const delBank   = (i: number) => upd("bankAccounts", biz.bankAccounts.filter((_, j) => j !== i));
  const addYemeniBank = () => {
    const next = [...biz.bankAccounts, { type: "yemeni" as const, bank: "", owner: "", account: "", currency: "YER" }];
    upd("bankAccounts", next);
    setOpenBankIdx(next.length - 1);
  };
  const addInternationalBank = () => {
    const next = [...biz.bankAccounts, { type: "international" as const, bank: "", owner: "", account: "", currency: "USD", iban: "", swift: "", country: "" }];
    upd("bankAccounts", next);
    setOpenBankIdx(next.length - 1);
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentTab = TABS.find(t => t.id === tab)!;

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-5 h-full">

      {/* ── Sidebar navigation (desktop) / Horizontal tabs (mobile) ── */}
      <div className="md:w-52 shrink-0">
        {/* Mobile: horizontal scrollable pill tabs */}
        <div className="flex md:hidden gap-1.5 overflow-x-auto pb-3 px-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 border",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30",
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Desktop: vertical sidebar */}
        <div className="hidden md:flex flex-col gap-1 bg-card border border-card-border rounded-2xl p-2 shadow-sm">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-right transition-all w-full",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", active ? t.bg : "bg-muted/50")}>
                  <Icon className={cn("w-3.5 h-3.5", active ? t.color : "text-muted-foreground")} />
                </div>
                <span className="flex-1 text-right">{t.label}</span>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}

          {/* Save button in sidebar on desktop */}
          <div className="mt-3 pt-3 border-t border-border">
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60",
                saved
                  ? "bg-emerald-500 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
               saved   ? <Check   className="w-3.5 h-3.5" /> :
                         <Save    className="w-3.5 h-3.5" />}
              {saving ? "جاري الحفظ..." : saved ? "تم الحفظ!" : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Content panel ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="bg-card border border-card-border rounded-2xl p-4 sm:p-5 shadow-sm flex-1">
          <SectionTitle
            icon={currentTab.icon}
            iconBg={currentTab.bg}
            iconColor={currentTab.color}
            title={currentTab.label}
            desc={
              tab === "general"  ? "المعلومات الأساسية التي يستخدمها وكيل الذكاء الاصطناعي" :
              tab === "hours"    ? "أوقات فتح وإغلاق المتجر لكل يوم في الأسبوع" :
              tab === "contact"  ? "أرقام الهاتف الخاصة بالتواصل مع العملاء" :
              tab === "branches" ? "عناوين الفروع والمواقع المختلفة" :
              tab === "social"   ? "روابط حسابات التواصل الاجتماعي" :
              "بيانات الحسابات البنكية لاستلام المدفوعات" 
            }
          />

          {/* ── General Info ── */}
          {tab === "general" && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>اسم العمل التجاري</FieldLabel>
                  <InputBase
                    data-testid="input-biz-name"
                    value={biz.name}
                    onChange={e => upd("name", e.target.value)}
                    placeholder="مثال: متجر العسل الذهبي"
                  />
                </div>
                <div>
                  <FieldLabel>رابط المتجر الإلكتروني</FieldLabel>
                  <div className="relative">
                    <Globe className="absolute inset-y-0 end-3 my-auto w-4 h-4 text-muted-foreground pointer-events-none" />
                    <InputBase
                      value={biz.storeUrl}
                      onChange={e => upd("storeUrl", e.target.value)}
                      placeholder="https://yourstore.com"
                      dir="ltr"
                      className="pe-9"
                    />
                  </div>
                </div>

                <LogoUploader logoUrl={biz.logoUrl} onLogoChange={url => upd("logoUrl", url)} />
              </div>

              <div>
                <FieldLabel>وصف العمل</FieldLabel>
                <TextAreaBase
                  value={biz.description}
                  onChange={e => upd("description", e.target.value)}
                  placeholder="وصف مختصر عن نشاطكم التجاري، المنتجات التي تقدمونها، والميزات التي تميزكم"
                  rows={3}
                />
              </div>

              <div>
                <FieldLabel>سياسة الاسترجاع والاستبدال</FieldLabel>
                <TextAreaBase
                  value={biz.returnPolicy}
                  onChange={e => upd("returnPolicy", e.target.value)}
                  placeholder="مثال: يمكن استرجاع المنتج خلال 7 أيام من تاريخ الاستلام بشرط أن يكون بحالته الأصلية"
                  rows={2}
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex gap-2.5">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                  هذه المعلومات تُحقن تلقائياً في سياق وكيل الذكاء الاصطناعي، ويستخدمها لتزويد العملاء بإجابات دقيقة عن متجرك.
                </p>
              </div>
            </div>
          )}

          {/* ── Working Hours ── */}
          {tab === "hours" && (
            <div className="space-y-2">
              {/* Quick apply panel */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-primary">تطبيق سريع على جميع أيام العمل الفعّالة</span>
                  {quickShifts.length < 3 && (
                    <button
                      type="button"
                      onClick={() => setQuickShifts(s => [...s, { open: "16:00", close: "22:00" }])}
                      className="text-xs text-primary border border-primary/30 hover:bg-primary/10 px-2 py-0.5 rounded-lg transition-colors"
                    >+ فترة</button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {quickShifts.map((s, si) => (
                    <div key={si} className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-[11px] sm:text-xs text-muted-foreground w-10 shrink-0 text-end">
                        {si === 0 ? "صباحي" : si === 1 ? "مسائي" : "ليلي"}
                      </span>
                      <input type="time" value={s.open}
                        onChange={e => setQuickShifts(prev => prev.map((x, j) => j === si ? { ...x, open: e.target.value } : x))}
                        className="h-7 px-1 sm:px-2 flex-1 min-w-0 rounded-lg border border-input bg-background text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-ring text-center"
                      />
                      <span className="text-muted-foreground text-[10px] sm:text-xs shrink-0">—</span>
                      <input type="time" value={s.close}
                        onChange={e => setQuickShifts(prev => prev.map((x, j) => j === si ? { ...x, close: e.target.value } : x))}
                        className="h-7 px-1 sm:px-2 flex-1 min-w-0 rounded-lg border border-input bg-background text-[11px] sm:text-xs focus:outline-none focus:ring-1 focus:ring-ring text-center"
                      />
                      {quickShifts.length > 1 && (
                        <button type="button"
                          onClick={() => setQuickShifts(s => s.filter((_, j) => j !== si))}
                          className="text-muted-foreground hover:text-destructive p-0.5 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => upd("workingHours", biz.workingHours.map(wh => wh.enabled ? { ...wh, shifts: [...quickShifts] } : wh))}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 py-1.5 rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  تطبيق على كل أيام العمل الفعّالة
                </button>
              </div>

              {biz.workingHours.map((wh, i) => (
                <div
                  key={wh.day}
                  className={cn(
                    "p-3 rounded-xl border transition-all",
                    wh.enabled ? "bg-card border-border" : "bg-muted/30 border-border/50",
                  )}
                >
                  {/* Day header row */}
                  <div className="flex items-center justify-between mb-0">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={cn(
                          "relative w-9 h-5 rounded-full transition-colors shrink-0",
                          wh.enabled ? "bg-primary" : "bg-muted-foreground/30",
                        )}
                      >
                        <span className={cn(
                          "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                          wh.enabled ? "right-0.5" : "left-0.5",
                        )} />
                      </button>
                      <span className={cn(
                        "text-sm font-semibold w-20",
                        wh.enabled ? "text-foreground" : "text-muted-foreground",
                      )}>{wh.day}</span>
                    </div>

                    {wh.enabled && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {wh.shifts.length === 1 ? "فترة واحدة" : wh.shifts.length === 2 ? "فترتان" : "٣ فترات"}
                        </span>
                        {wh.shifts.length < 3 && (
                          <button
                            type="button"
                            onClick={() => addShift(i)}
                            className="flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 font-medium px-2 py-0.5 rounded-lg border border-primary/30 hover:bg-primary/5 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            فترة
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Shifts */}
                  {wh.enabled && (
                    <div className="mt-2 space-y-2">
                      {wh.shifts.map((shift, si) => (
                        <div key={si} className="flex items-center gap-1.5 sm:gap-2">
                          <span className="text-[11px] sm:text-xs text-muted-foreground w-10 sm:w-12 shrink-0 text-end">
                            {si === 0 ? "صباحي" : si === 1 ? "مسائي" : "ليلي"}
                          </span>
                          <input
                            type="time"
                            value={shift.open}
                            onChange={e => updShift(i, si, "open", e.target.value)}
                            className="h-8 px-1 sm:px-2 flex-1 min-w-0 rounded-lg border border-input bg-background text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center"
                          />
                          <span className="text-muted-foreground text-[10px] sm:text-xs shrink-0">—</span>
                          <input
                            type="time"
                            value={shift.close}
                            onChange={e => updShift(i, si, "close", e.target.value)}
                            className="h-8 px-1 sm:px-2 flex-1 min-w-0 rounded-lg border border-input bg-background text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring text-center"
                          />
                          {wh.shifts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => delShift(i, si)}
                              className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Contact Numbers ── */}
          {tab === "contact" && (
            <div className="space-y-3">
              {biz.phones.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">لا توجد أرقام تواصل بعد</p>
                  <p className="text-xs mt-1">اضغط "إضافة رقم" لإضافة رقم تواصل</p>
                </div>
              )}
              {biz.phones.map((ph, i) => (
                <div key={i} className="bg-card border border-border rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <InputBase
                      value={ph.label ?? ""}
                      onChange={e => updPhone(i, "label", e.target.value)}
                      placeholder="التسمية — مثال: رقم المدير"
                      dir="rtl"
                      className="flex-1 h-9 text-sm"
                    />
                    <button
                      onClick={() => delPhone(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <InputBase
                    value={ph.value ?? ""}
                    onChange={e => updPhone(i, "value", e.target.value)}
                    placeholder="+967771234567"
                    dir="ltr"
                    className="h-9 text-sm"
                  />
                </div>
              ))}
              <button
                onClick={() => upd("phones", [...biz.phones, { label: "", value: "" }])}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <div className="w-7 h-7 rounded-lg border-2 border-dashed border-primary/40 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                إضافة رقم تواصل
              </button>
            </div>
          )}

          {/* ── Branches ── */}
          {tab === "branches" && (
            <div className="space-y-3">
              {biz.branches.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">لا توجد فروع مسجلة بعد</p>
                  <p className="text-xs mt-1">اضغط "إضافة فرع" لإضافة موقع أو فرع</p>
                </div>
              )}
              {biz.branches.map((br, i) => (
                <div key={i} className="bg-card border border-border rounded-2xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                      <GitBranch className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <InputBase
                      value={br.label ?? ""}
                      onChange={e => updBranch(i, "label", e.target.value)}
                      placeholder="اسم الفرع — مثال: الفرع الرئيسي"
                      dir="rtl"
                      className="flex-1 h-9 text-sm"
                    />
                    <button
                      onClick={() => delBranch(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <InputBase
                    value={br.value ?? ""}
                    onChange={e => updBranch(i, "value", e.target.value)}
                    placeholder="العنوان التفصيلي أو رابط الخريطة"
                    className="h-9 text-sm"
                  />
                </div>
              ))}
              <button
                onClick={() => upd("branches", [...biz.branches, { label: "", value: "" }])}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <div className="w-7 h-7 rounded-lg border-2 border-dashed border-primary/40 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                إضافة فرع
              </button>
            </div>
          )}

          {/* ── Social Media ── */}
          {tab === "social" && (
            <div className="space-y-3">
              {SOCIAL_KEYS.map(key => {
                const cfg = SOCIAL_CONFIG[key];
                const Icon = cfg.icon;
                return (
                  <div key={key} className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-card">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                      <Icon className={cn("w-5 h-5", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{key}</p>
                      <InputBase
                        value={biz.socialLinks[key] ?? ""}
                        onChange={e => updSocial(key, e.target.value)}
                        placeholder={cfg.placeholder}
                        dir="ltr"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Bank Accounts ── */}
          {tab === "banking" && (
            <div className="space-y-3">
              {biz.bankAccounts.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <Landmark className="w-9 h-9 mx-auto mb-2 opacity-25" />
                  <p className="text-sm">لا توجد حسابات بنكية بعد</p>
                  <p className="text-xs mt-1 opacity-70">اختر نوع الحساب لإضافته</p>
                </div>
              )}

              {biz.bankAccounts.map((ba, i) => {
                const isYemeni = !ba.type || ba.type === "yemeni";
                const isOmqi   = ba.type === "omqi";
                const isIntl   = ba.type === "international";
                const isOpen   = openBankIdx === i;

                const CURRENCIES_YEM = [
                  { value: "YER", label: "ريال يمني",    flag: "🇾🇪" },
                  { value: "SAR", label: "ريال سعودي",   flag: "🇸🇦" },
                  { value: "AED", label: "درهم إماراتي", flag: "🇦🇪" },
                  { value: "USD", label: "دولار",        flag: "🇺🇸" },
                ];
                const CURRENCIES_INT = [
                  { value: "USD", label: "دولار",        flag: "🇺🇸" },
                  { value: "SAR", label: "ريال سعودي",   flag: "🇸🇦" },
                  { value: "AED", label: "درهم إماراتي", flag: "🇦🇪" },
                  { value: "YER", label: "ريال يمني",    flag: "🇾🇪" },
                ];
                const currencies = isYemeni ? CURRENCIES_YEM : CURRENCIES_INT;
                const activeCur  = ba.currency || (isYemeni ? "YER" : "USD");

                const headerBg    = isOmqi ? "bg-violet-500/10 border border-violet-500/20" : isYemeni ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-blue-500/10 border border-blue-500/20";
                const headerIcon  = isOmqi ? "text-violet-600" : isYemeni ? "text-emerald-600" : "text-blue-600";
                const typeLabel   = isOmqi ? "🏦 حساب عمقي (تحقق تلقائي)" : isYemeni ? "🇾🇪 حساب يمني" : "🌍 حساب خارجي";
                const defaultName = isOmqi ? "حساب عمقي جديد" : isYemeni ? "حساب يمني جديد" : "حساب خارجي جديد";

                return (
                  <div key={i} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

                    {/* ── Accordion Header ── */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenBankIdx(isOpen ? null : i)}
                      onKeyDown={e => e.key === "Enter" && setOpenBankIdx(isOpen ? null : i)}
                      className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer select-none"
                    >
                      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", headerBg)}>
                        <Landmark className={cn("w-4 h-4", headerIcon)} />
                      </div>
                      <div className="flex-1 text-right">
                        <h4 className="font-semibold text-foreground text-sm">
                          {isOmqi ? (ba.owner || defaultName) : (ba.bank || defaultName)}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {typeLabel}
                          {!isOmqi && ba.owner ? ` · ${ba.owner}` : ""}
                          {!isOmqi && activeCur ? ` · ${activeCur}` : ""}
                          {isOmqi && ba.account ? ` · ${ba.account}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); delBank(i); if (openBankIdx === i) setOpenBankIdx(null); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {isOpen
                        ? <ChevronUp   className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </div>

                    {/* ── Expanded Fields ── */}
                    {isOpen && (
                      <div className="border-t border-border p-5 space-y-4">

                        {/* Omqi fields */}
                        {isOmqi && (
                          <>
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-50 border border-violet-100 text-xs text-violet-700">
                              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>سيتحقق النظام تلقائياً من إيصالات PDF المُرسَلة عبر واتساب — يُقبل الإيصال فقط إذا تطابق رقم الحساب واسم صاحب الحساب.</span>
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                              {([
                                { label: "اسم صاحب الحساب",  field: "owner"   as keyof BankAccount, placeholder: "محمد أحمد علي",   dir: "rtl" },
                                { label: "رقم الحساب",        field: "account" as keyof BankAccount, placeholder: "1234567890",      dir: "ltr" },
                              ] as const).map(({ label, field, placeholder, dir }) => (
                                <div key={field}>
                                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
                                  <InputBase
                                    value={(ba[field] as string) ?? ""}
                                    onChange={e => updBank(i, field, e.target.value)}
                                    placeholder={placeholder}
                                    dir={dir}
                                    className="h-9 text-sm"
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Yemeni fields */}
                        {isYemeni && (
                          <div className="grid md:grid-cols-2 gap-4">
                            {([
                              { label: "اسم البنك",        field: "bank"    as keyof BankAccount, placeholder: "بنك اليمن والخليج", dir: "rtl" },
                              { label: "اسم صاحب الحساب",  field: "owner"   as keyof BankAccount, placeholder: "محمد أحمد",         dir: "rtl" },
                              { label: "رقم الحساب",        field: "account" as keyof BankAccount, placeholder: "1234567890",        dir: "ltr" },
                            ] as const).map(({ label, field, placeholder, dir }) => (
                              <div key={field}>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
                                <InputBase
                                  value={(ba[field] as string) ?? ""}
                                  onChange={e => updBank(i, field, e.target.value)}
                                  placeholder={placeholder}
                                  dir={dir}
                                  className="h-9 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* International fields */}
                        {isIntl && (
                          <div className="grid md:grid-cols-2 gap-4">
                            {([
                              { label: "اسم البنك",         field: "bank"    as keyof BankAccount, placeholder: "HSBC",                    dir: "ltr" },
                              { label: "اسم صاحب الحساب",   field: "owner"   as keyof BankAccount, placeholder: "Mohammed Ahmed",           dir: "ltr" },
                              { label: "رقم الحساب / IBAN", field: "iban"    as keyof BankAccount, placeholder: "GB29NWBK60161331926819",   dir: "ltr" },
                              { label: "SWIFT / BIC",        field: "swift"   as keyof BankAccount, placeholder: "HBUKGB4B",                dir: "ltr" },
                              { label: "دولة البنك",         field: "country" as keyof BankAccount, placeholder: "United Kingdom",          dir: "ltr" },
                            ] as const).map(({ label, field, placeholder, dir }) => (
                              <div key={field}>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
                                <InputBase
                                  value={(ba[field] as string) ?? ""}
                                  onChange={e => updBank(i, field, e.target.value)}
                                  placeholder={placeholder}
                                  dir={dir}
                                  className="h-9 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Currency selector — only for non-Omqi accounts */}
                        {!isOmqi && (
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">عملة الحساب</label>
                            <div className="flex gap-2 flex-wrap">
                              {currencies.map(c => {
                                const active = activeCur === c.value;
                                return (
                                  <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => updBank(i, "currency", c.value)}
                                    className={cn(
                                      "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all duration-150",
                                      active
                                        ? isYemeni
                                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200"
                                          : "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200"
                                        : "bg-background border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                                    )}
                                  >
                                    <span className="text-base leading-none">{c.flag}</span>
                                    <span>{c.label}</span>
                                    <span className={cn("opacity-60 text-[10px]", active && "opacity-80")}>({c.value})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add buttons */}
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  onClick={addYemeniBank}
                  className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg border-2 border-dashed border-emerald-400/60 flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  إضافة حساب يمني
                </button>
                <button
                  onClick={addInternationalBank}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-600 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg border-2 border-dashed border-blue-400/60 flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  إضافة حساب خارجي
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile save button — fixed at bottom */}
        <div className="md:hidden">
          <button
            data-testid="btn-save-business"
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all shadow-sm disabled:opacity-60",
              saved
                ? "bg-emerald-500 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> :
             saved   ? <Check   className="w-4 h-4" /> :
                       <Save    className="w-4 h-4" />}
            {saving ? "جاري الحفظ..." : saved ? "تم الحفظ!" : "حفظ التغييرات"}
          </button>
        </div>
      </div>
    </div>
  );
}
