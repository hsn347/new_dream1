import { useState, useEffect, useCallback } from "react";
import {
  Users, Search, Phone, MapPin,
  ShoppingBag, RefreshCw, Package,
  ChevronRight, X, Edit3, Check, Loader2, UserX,
} from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { api, type CustomerProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/* ─── helpers ──────────────────────────────────────────────── */
function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} دقيقة`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ساعة`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} يوم`;
  return d.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

const AVATAR_COLORS = [
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", "bg-blue-100 text-blue-600 dark:text-blue-400",
  "bg-purple-100 text-purple-700", "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700",
];

function Avatar({ name, phone, size = "md" }: { name?: string | null; phone: string; size?: "sm" | "md" | "lg" }) {
  const letter = (name ?? phone).charAt(0).toUpperCase();
  const sz = size === "sm" ? "w-9 h-9 text-sm" : size === "lg" ? "w-16 h-16 text-2xl" : "w-11 h-11 text-base";
  const color = AVATAR_COLORS[phone.charCodeAt(phone.length - 1) % AVATAR_COLORS.length]!;
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", sz, color)}>
      {letter}
    </div>
  );
}

/* ─── editable field ───────────────────────────────────────── */
function EditableField({ label, value, onSave, placeholder }: {
  label: string; value: string | null | undefined;
  onSave: (v: string) => void; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (editing) {
    return (
      <div>
        <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { onSave(draft); setEditing(false); }
              if (e.key === "Escape") setEditing(false);
            }}
            className="flex-1 text-xs h-8 px-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={placeholder}
          />
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setDraft(value ?? ""); setEditing(false); }}
            className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <button
        onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        className="flex items-center gap-2 w-full text-right group/field"
      >
        <p className="text-sm text-foreground flex-1">
          {value || <span className="text-muted-foreground italic text-xs">اضغط للإضافة...</span>}
        </p>
        <Edit3 className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      </button>
    </div>
  );
}

/* ─── profile panel ────────────────────────────────────────── */
function ProfilePanel({ profile, onClose, onUpdate, isMobile }: {
  profile: CustomerProfile;
  onClose: () => void;
  onUpdate: (p: CustomerProfile) => void;
  isMobile: boolean;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState(profile);
  useEffect(() => { setLocal(profile); }, [profile]);

  const save = async (updates: Partial<CustomerProfile>) => {
    setSaving(true);
    try {
      await api.user.customers.update(profile.customerPhone, updates as Record<string, unknown>);
      const updated = { ...local, ...updates };
      setLocal(updated);
      onUpdate(updated);
    } catch {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inner = (
    <div className="flex flex-col h-full overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-card sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {isMobile && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          <h3 className="font-bold text-sm text-foreground">ملف العميل</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          {!isMobile && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Avatar + name + buyer badge */}
          <div className="flex flex-col items-center text-center gap-2.5 pt-2">
            <Avatar name={local.detectedName} phone={local.customerPhone} size="lg" />
            <div>
              <p className="font-bold text-base text-foreground">
                {local.detectedName ?? local.customerPhone}
              </p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" />{local.customerPhone}
              </p>
            </div>
            {local.isBuyer && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" /> مشترٍ
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-muted/50 rounded-2xl p-3.5 text-center">
              <p className="text-2xl font-bold text-foreground">{local.totalOrders}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">طلبات</p>
            </div>
            <div className="bg-muted/50 rounded-2xl p-3.5 text-center">
              <p className="text-2xl font-bold text-foreground">{local.inquiredProducts.length}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">منتج سأل عنه</p>
            </div>
          </div>

          {/* Editable fields */}
          <div className="bg-muted/30 rounded-2xl p-4 space-y-4 border border-border">
            <EditableField
              label="الاسم"
              value={local.detectedName}
              placeholder="اسم العميل"
              onSave={v => save({ detectedName: v })}
            />
            <div className="border-t border-border/50" />
            <EditableField
              label="المدينة / المنطقة"
              value={local.city}
              placeholder="مثال: صنعاء، عدن"
              onSave={v => save({ city: v })}
            />
          </div>

          {/* Inquired products */}
          {local.inquiredProducts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-500" /> منتجات سأل عنها
              </p>
              <div className="flex flex-wrap gap-1.5">
                {local.inquiredProducts.map((p, i) => (
                  <span
                    key={i}
                    className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Location chip */}
          {local.city && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{local.city}</span>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-center pb-2">
            آخر نشاط منذ {formatRelative(local.lastActiveAt)}
          </p>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="absolute inset-0 z-30 bg-card flex flex-col">
        {inner}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card border-r border-border w-80 xl:w-96 shrink-0 overflow-hidden">
      {inner}
    </div>
  );
}

/* ─── main page ────────────────────────────────────────────── */
export default function CustomersPage() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  const [filterBuyer, setFilterBuyer] = useState<"all" | "buyers" | "notBought">("all");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.user.customers.list();
      setProfiles(data);
    } catch {
      toast({ title: "فشل تحميل بيانات العملاء", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const filtered = profiles.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      const name = (p.detectedName ?? "").toLowerCase();
      const phone = p.customerPhone.toLowerCase();
      const city = (p.city ?? "").toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !city.includes(q)) return false;
    }
    if (filterBuyer === "buyers" && !p.isBuyer) return false;
    if (filterBuyer === "notBought" && p.isBuyer) return false;
    return true;
  });

  const stats = {
    total:    profiles.length,
    buyers:   profiles.filter(p => p.isBuyer).length,
    noInfo:   profiles.filter(p => !p.detectedName && !p.city).length,
  };

  return (
    <div className="relative flex h-[calc(100vh-4.5rem)] -m-4 md:-m-6 overflow-hidden" dir="rtl">

      {/* ── Main List ──────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col flex-1 min-w-0 overflow-hidden transition-all",
        selected && isMobile ? "invisible" : "visible",
      )}>

        {/* Header */}
        <div className="px-4 md:px-5 pt-4 pb-3 bg-background border-b border-border shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> ملفات العملاء
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                بيانات مستخرجة تلقائياً من المحادثات
              </p>
            </div>
            <button
              onClick={() => fetchProfiles()}
              className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "إجمالي العملاء", value: stats.total,   icon: Users,       color: "text-primary",     bg: "bg-primary/5" },
              { label: "اشتروا",          value: stats.buyers,  icon: ShoppingBag, color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { label: "بدون بيانات",     value: stats.noInfo,  icon: UserX,       color: "text-amber-600",   bg: "bg-amber-500/10" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-xl p-3 flex items-center gap-2 border border-border bg-card">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-foreground leading-tight">{loading ? "—" : value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم، الهاتف، المدينة..."
              className="w-full h-9 ps-8 pe-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {([
              { id: "all",       label: "الكل" },
              { id: "buyers",    label: `🛍️ اشتروا (${stats.buyers})` },
              { id: "notBought", label: `👤 لم يشتروا` },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilterBuyer(id)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap shrink-0",
                  filterBuyer === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <PageLoader text="جاري تحميل ملفات العملاء..." />
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                <Users className="w-7 h-7 opacity-20" />
              </div>
              <div>
                <p className="text-sm font-semibold">لا توجد ملفات عملاء</p>
                <p className="text-xs mt-1 opacity-60">
                  {search ? "لا توجد نتائج لبحثك" : "ستظهر الملفات تلقائياً عند وصول رسائل"}
                </p>
              </div>
            </div>
          )}

          {!loading && filtered.map(p => (
            <button
              key={p.customerPhone}
              onClick={() => setSelected(p)}
              className={cn(
                "w-full text-right px-4 py-3 flex items-center gap-3 border-b border-border/50",
                "hover:bg-muted/40 active:bg-muted/60 transition-colors",
                selected?.customerPhone === p.customerPhone && "bg-primary/5 border-r-2 border-r-primary",
              )}
            >
              <Avatar name={p.detectedName} phone={p.customerPhone} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {p.detectedName ?? p.customerPhone}
                  </p>
                  {p.isBuyer && (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      مشترٍ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-[11px] text-muted-foreground">{p.customerPhone}</p>
                  {p.city && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                      <MapPin className="w-2.5 h-2.5" />{p.city}
                    </span>
                  )}
                  {p.inquiredProducts.length > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-blue-600">
                      <Package className="w-2.5 h-2.5" />{p.inquiredProducts.length} منتج
                    </span>
                  )}
                </div>
              </div>
              <div className="text-left shrink-0">
                <p className="text-[10px] text-muted-foreground">{formatRelative(p.lastActiveAt)}</p>
                {p.totalOrders > 0 && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-0.5">{p.totalOrders} طلب</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Profile Panel ──────────────────────────────────── */}
      {selected && (
        <ProfilePanel
          profile={selected}
          isMobile={isMobile}
          onClose={() => setSelected(null)}
          onUpdate={updated => {
            setProfiles(ps => ps.map(p => p.customerPhone === updated.customerPhone ? updated : p));
            setSelected(updated);
          }}
        />
      )}
    </div>
  );
}
