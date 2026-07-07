import { useAuth } from "@/hooks/useAuth";
import {
  MessageCircle, Send, Bot, Wifi, WifiOff, AlertCircle,
  ShoppingBag, Package, ChevronLeft, Clock, CheckCircle2,
  Truck, FileText, TrendingUp, Users, Zap, ArrowUpRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { api, type DashboardStats, type Conversation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

const waStatusCfg: Record<string, { label: string; Icon: React.ElementType; cls: string; dot: string }> = {
  connected:    { label: "واتساب متصل",    Icon: Wifi,        cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",  dot: "bg-emerald-500" },
  disconnected: { label: "غير متصل",       Icon: WifiOff,     cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",         dot: "bg-amber-400" },
  error:        { label: "خطأ في الاتصال", Icon: AlertCircle, cls: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20",               dot: "bg-red-500" },
  idle:         { label: "لم يُعد بعد",    Icon: WifiOff,     cls: "text-muted-foreground bg-muted/40 border-border",         dot: "bg-muted-foreground/60" },
};

const convStatusCfg = [
  { key: "convActive",  label: "نشطة",   color: "bg-emerald-500", light: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "convPending", label: "معلقة",  color: "bg-amber-400",   light: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "convClosed",  label: "مغلقة",  color: "bg-muted-foreground/40",   light: "bg-muted text-muted-foreground" },
];

const orderStatsCfg = [
  { key: "ordersDraft",         label: "مسودة",         icon: FileText,      cls: "text-muted-foreground", bg: "bg-muted/40" },
  { key: "ordersPendingReview", label: "قيد المراجعة", icon: Clock,         cls: "text-amber-600", bg: "bg-amber-500/10" },
  { key: "ordersApproved",      label: "مقبول",          icon: CheckCircle2,  cls: "text-blue-600 dark:text-blue-400",  bg: "bg-blue-500/10" },
  { key: "ordersDelivered",     label: "تم التسليم",    icon: Truck,         cls: "text-emerald-600", bg: "bg-emerald-500/10" },
];

function StatCard({
  label, value, icon: Icon, iconColor, iconBg, loading, badge, href,
}: {
  label: string; value: number | string; icon: React.ElementType;
  iconColor: string; iconBg: string; loading: boolean;
  badge?: { text: string; cls: string }; href?: string;
}) {
  const inner = (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer group">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        {badge && (
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", badge.cls)}>
            {badge.text}
          </span>
        )}
        {href && !badge && (
          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        )}
      </div>
      <p className="text-2xl font-bold text-foreground tracking-tight">
        {loading ? <span className="inline-block w-12 h-6 bg-muted animate-pulse rounded" /> : value.toLocaleString("ar")}
      </p>
      <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Skeleton({ className }: { className?: string }) {
  return <span className={cn("inline-block bg-muted animate-pulse rounded", className)} />;
}

function ConvBar({ stats }: { stats: DashboardStats }) {
  const total = stats.convActive + stats.convPending + stats.convClosed;
  if (total === 0) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex-1 h-2 rounded-full bg-muted" />
      <span>لا توجد محادثات بعد</span>
    </div>
  );
  return (
    <div className="space-y-2.5">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
        {convStatusCfg.map(s => {
          const val = stats[s.key as keyof DashboardStats] as number;
          const pct = total > 0 ? (val / total) * 100 : 0;
          if (pct === 0) return null;
          return <div key={s.key} className={cn("transition-all", s.color)} style={{ width: `${pct}%` }} />;
        })}
      </div>
      <div className="flex items-center gap-3">
        {convStatusCfg.map(s => {
          const val = stats[s.key as keyof DashboardStats] as number;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", s.color)} />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
              <span className="text-[11px] font-semibold text-foreground">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    Promise.all([api.user.dashboard(), api.user.conversations()])
      .then(([s, c]) => {
        setStats(s);
        setConversations(c.slice(0, 6));
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleAgent = async () => {
    if (!stats || toggling) return;
    setToggling(true);
    const newVal = !stats.agentEnabled;
    await api.user.updateSettings({ agentEnabled: newVal });
    setStats(s => s ? { ...s, agentEnabled: newVal } : s);
    setToggling(false);
  };

  const waKey = (stats?.waStatus ?? "idle") as keyof typeof waStatusCfg;
  const wa = waStatusCfg[waKey] ?? waStatusCfg.idle;
  const WaIcon = wa.Icon;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "صباح الخير" : hour < 18 ? "مرحباً" : "مساء الخير";

  const totalOrders = (stats?.ordersDraft ?? 0) + (stats?.ordersPendingReview ?? 0) + (stats?.ordersApproved ?? 0) + (stats?.ordersDelivered ?? 0);

  return (
    <div className="space-y-5 pb-6">

      {/* ── Hero Banner ── */}
      <div className="relative bg-gradient-to-l from-primary/5 via-primary/10 to-primary/20 border border-primary/15 rounded-2xl px-5 py-4 overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none select-none"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, var(--primary) 0%, transparent 60%)" }} />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-primary/70 mb-0.5">{greeting} 👋</p>
            <h2 className="text-lg font-bold text-foreground">{user?.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? <Skeleton className="w-32 h-3" /> : `${stats?.conversations ?? 0} محادثة • ${stats?.productsActive ?? 0} منتج نشط`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium", wa.cls)}>
              <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", wa.dot)} />
              <WaIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{wa.label}</span>
            </div>
            <button
              onClick={toggleAgent}
              disabled={loading || toggling}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-60",
                stats?.agentEnabled
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                  : "border-border bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{stats?.agentEnabled ? "الوكيل نشط" : "الوكيل متوقف"}</span>
              <div
                data-testid="btn-toggle-agent"
                className={cn(
                  "relative w-8 h-4 rounded-full transition-colors",
                  stats?.agentEnabled ? "bg-emerald-500" : "bg-muted-foreground/30",
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all",
                  stats?.agentEnabled ? "right-0.5" : "left-0.5",
                )} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="محادثات اليوم"
          value={stats?.activeToday ?? 0}
          icon={MessageCircle}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-500/10"
          loading={loading}
          href="/conversations"
          badge={stats && stats.activeToday > 0 ? { text: "نشط", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" } : undefined}
        />
        <StatCard
          label="رسائل اليوم"
          value={stats?.messagesToday ?? 0}
          icon={Send}
          iconColor="text-violet-600 dark:text-violet-400"
          iconBg="bg-violet-500/10"
          loading={loading}
        />
        <StatCard
          label="طلبات قيد المراجعة"
          value={stats?.ordersPendingReview ?? 0}
          icon={ShoppingBag}
          iconColor="text-amber-600"
          iconBg="bg-amber-500/10"
          loading={loading}
          href="/orders"
          badge={stats && stats.ordersPendingReview > 0 ? { text: "يحتاج انتباه!", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300" } : undefined}
        />
        <StatCard
          label="منتجات نشطة"
          value={stats?.productsActive ?? 0}
          icon={Package}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-500/10"
          loading={loading}
          href="/products"
        />
      </div>

      {/* ── Middle Row: Conversations Distribution + Orders Summary ── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Conversations distribution */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">المحادثات</h3>
                <p className="text-[11px] text-muted-foreground">
                  {loading ? "—" : `${stats?.conversations ?? 0} إجمالاً`}
                </p>
              </div>
            </div>
            <Link href="/conversations"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium">
              عرض الكل <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="w-full h-2.5" />
              <div className="flex gap-3">
                <Skeleton className="w-16 h-3" />
                <Skeleton className="w-16 h-3" />
                <Skeleton className="w-16 h-3" />
              </div>
            </div>
          ) : stats ? <ConvBar stats={stats} /> : null}

          {/* Total stat */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>نشطة اليوم</span>
            </div>
            <span className="text-sm font-bold text-foreground">
              {loading ? "—" : stats?.activeToday ?? 0}
            </span>
          </div>
        </div>

        {/* Orders Summary */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">الطلبات</h3>
                <p className="text-[11px] text-muted-foreground">
                  {loading ? "—" : `${totalOrders} إجمالاً`}
                </p>
              </div>
            </div>
            <Link href="/orders"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium">
              إدارة <ChevronLeft className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {orderStatsCfg.map(({ key, label, icon: Icon, cls, bg }) => {
              const val = stats ? (stats[key as keyof DashboardStats] as number) : 0;
              return (
                <div key={key} className={cn("rounded-xl px-3 py-2.5 flex items-center gap-2.5", bg)}>
                  <Icon className={cn("w-4 h-4 shrink-0", cls)} />
                  <div>
                    <p className={cn("text-base font-bold leading-tight", cls)}>
                      {loading ? <Skeleton className="w-6 h-4" /> : val}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Recent Conversations ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">آخر المحادثات</h3>
          </div>
          <Link href="/conversations"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium">
            عرض الكل <ChevronLeft className="w-3 h-3" />
          </Link>
        </div>

        {loading && (
          <div className="divide-y divide-border">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="w-28 h-3" />
                  <Skeleton className="w-48 h-2.5" />
                </div>
                <Skeleton className="w-12 h-5 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!loading && conversations.length === 0 && (
          <div className="py-10 text-center text-muted-foreground">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm font-medium">لا توجد محادثات بعد</p>
            <p className="text-xs mt-1 opacity-70">ستظهر رسائل واتساب هنا فور وصولها</p>
          </div>
        )}

        {!loading && conversations.length > 0 && (
          <div className="divide-y divide-border">
            {conversations.map(c => {
              const name = c.customerName ?? c.customerPhone;
              const initial = name.charAt(0).toUpperCase();
              const statusColor =
                c.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                c.status === "pending" ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" :
                "bg-muted text-muted-foreground";
              const statusLabel =
                c.status === "active" ? "نشط" :
                c.status === "pending" ? "معلق" : "مغلق";
              return (
                <Link key={c.id} href="/conversations">
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground truncate">{name}</p>
                        <time className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(c.updatedAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.lastMessage ?? "—"}
                      </p>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", statusColor)}>
                      {statusLabel}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-0.5">إجراءات سريعة</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: "إضافة منتج",       href: "/products",       icon: Package,      color: "text-emerald-600", bg: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20" },
            { label: "عرض الطلبات",      href: "/orders",         icon: ShoppingBag,  color: "text-orange-600 dark:text-orange-400",  bg: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20" },
            { label: "المحادثات",         href: "/conversations",  icon: MessageCircle, color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20" },
            { label: "الإعدادات",         href: "/settings",       icon: Bot,          color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20" },
          ].map(({ label, href, icon: Icon, color, bg }) => (
            <Link key={href} href={href}>
              <div className={cn(
                "flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-colors cursor-pointer",
                bg,
              )}>
                <Icon className={cn("w-4 h-4 shrink-0", color)} />
                <span className="text-xs font-semibold text-foreground">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
