import { useState, useEffect } from "react";
import { api, type AnalyticsData } from "@/lib/api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, ShoppingBag, MessageCircle,
  DollarSign, Percent, ArrowUpRight, ArrowDownRight, Package, Star,
} from "lucide-react";

type Period = "7" | "30" | "90";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft:           { bg: "bg-muted dark:bg-gray-800",   text: "text-muted-foreground dark:text-gray-300", label: "مسودة" },
  pending_payment: { bg: "bg-amber-500/15 dark:bg-amber-900/40", text: "text-amber-600 dark:text-amber-300", label: "بانتظار الدفع" },
  pending_review:  { bg: "bg-blue-100 dark:bg-blue-900/40",  text: "text-blue-600 dark:text-blue-400",  label: "قيد المراجعة" },
  approved:        { bg: "bg-emerald-500/15 dark:bg-emerald-900/40", text: "text-emerald-600 dark:text-emerald-400", label: "موافق عليه" },
  delivered:       { bg: "bg-primary/10",  text: "text-primary",  label: "تم التسليم" },
  rejected:        { bg: "bg-red-500/15 dark:bg-red-900/40",   text: "text-red-600 dark:text-red-300",   label: "مرفوض" },
  cancelled:       { bg: "bg-muted dark:bg-slate-800",  text: "text-muted-foreground dark:text-slate-300", label: "ملغي" },
  returned:        { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-600 dark:text-orange-300", label: "مُرتجع" },
};

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

function StatCard({
  label, value, sub, icon: Icon, trend, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: number; accent?: boolean;
}) {
  const positive = trend !== undefined && trend >= 0;
  return (
    <div className={`rounded-2xl p-4 flex items-start gap-3 border ${accent ? "bg-primary text-primary-foreground border-primary/20 shadow-lg shadow-primary/10" : "bg-card border-border"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent ? "bg-white/20" : "bg-primary/10"}`}>
        <Icon className={`w-4 h-4 ${accent ? "text-white" : "text-primary"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs mb-0.5 leading-tight ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</p>
        <p className={`text-xl font-extrabold leading-tight ${accent ? "text-primary-foreground" : "text-foreground"}`}>{value}</p>
        {sub && <p className={`text-[11px] mt-0.5 leading-tight ${accent ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{sub}</p>}
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 mt-1 text-[11px] font-semibold ${positive ? "text-emerald-500" : "text-red-400"}`}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            <span>{positive ? "+" : ""}{trend.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-xl text-sm" dir="rtl">
      <p className="text-muted-foreground text-xs mb-2 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
          <span className="text-muted-foreground text-xs">{entry.name}:</span>
          <span className="font-bold text-foreground text-xs">{Number(entry.value).toLocaleString("ar-SA")}</span>
        </div>
      ))}
    </div>
  );
};

function ProductRankList({
  title, subtitle, products, icon: Icon, emptyMsg,
}: {
  title: string; subtitle: string;
  products: Array<{ name: string; count: number; revenue: string }>;
  icon: React.ElementType; emptyMsg: string;
}) {
  if (products.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="py-8 text-center text-muted-foreground text-sm">{emptyMsg}</div>
      </div>
    );
  }

  const max = Math.max(...products.map(p => p.count), 1);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">
        {products.map((p, i) => (
          <div key={p.name} className="group">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base shrink-0 w-6 text-center">
                {i < 3 ? RANK_MEDAL[i] : <span className="text-xs font-bold text-muted-foreground">{i + 1}</span>}
              </span>
              <span className="flex-1 text-sm font-semibold text-foreground truncate">{p.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
                  {p.count} وحدة
                </span>
                {Number(p.revenue) > 0 && (
                  <span className="text-xs font-bold text-primary whitespace-nowrap">
                    {Number(p.revenue).toLocaleString("ar-SA")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 ps-8">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(p.count / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    setLoading(true);
    api.user.analytics(period)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const periodLabel = period === "7" ? "آخر 7 أيام" : period === "30" ? "آخر 30 يوماً" : "آخر 90 يوماً";

  const statusEntries = data
    ? Object.entries(data.orderStatusBreakdown)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  const totalStatusOrders = statusEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-5" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">التحليلات والمبيعات</h1>
          <p className="text-xs text-muted-foreground mt-0.5">أداء المتجر ومؤشرات المبيعات</p>
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden text-sm bg-card">
          {(["7", "30", "90"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 font-medium transition-colors ${
                period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p === "7" ? "٧ أيام" : p === "30" ? "٣٠ يوماً" : "٩٠ يوماً"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="py-24 flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">جاري تحميل البيانات...</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ── Stats ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="إجمالي الإيرادات"
              value={`${Number(data.summary.totalRevenue).toLocaleString("ar-SA")}`}
              sub={periodLabel}
              icon={DollarSign}
              trend={data.summary.revenueGrowth}
              accent
            />
            <StatCard
              label="إجمالي الطلبات"
              value={String(data.summary.totalOrders)}
              sub={periodLabel}
              icon={ShoppingBag}
              trend={data.summary.ordersGrowth}
            />
            <StatCard
              label="معدل التحويل"
              value={`${data.summary.conversionRate.toFixed(1)}%`}
              sub="من المحادثات"
              icon={Percent}
            />
            <StatCard
              label="متوسط الطلب"
              value={`${Number(data.summary.avgOrderValue).toLocaleString("ar-SA")}`}
              sub="لكل طلب"
              icon={TrendingUp}
            />
          </div>

          {/* ── Revenue chart ──────────────────────────────────── */}
          <div className="bg-card border border-border rounded-2xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">مسار الإيرادات والطلبات</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary rounded-full inline-block" />الإيرادات</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 rounded-full inline-block" />الطلبات</span>
              </div>
            </div>
            {data.dailyData.length === 0 || data.dailyData.every(d => d.orders === 0) ? (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <TrendingUp className="w-8 h-8 opacity-20" />
                <p className="text-sm">لا توجد طلبات في هذه الفترة</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
                <AreaChart data={data.dailyData} margin={{ top: 5, right: isMobile ? 45 : 50, left: isMobile ? 0 : 40, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval={isMobile ? "preserveStartEnd" : 0}
                  />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    tickCount={4}
                  />
                  <YAxis
                    yAxisId="orders"
                    orientation="left"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={36}
                    tickCount={4}
                    hide={isMobile}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="الإيرادات" stroke="#16a34a" fill="url(#gRevenue)" strokeWidth={2.5} dot={false} />
                  <Area yAxisId="orders" type="monotone" dataKey="orders" name="الطلبات" stroke="#4ade80" fill="url(#gOrders)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Top products (sold vs requested) ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ProductRankList
              title="أكثر المنتجات مبيعاً"
              subtitle="من الطلبات المكتملة والموافق عليها"
              products={data.topProducts}
              icon={Star}
              emptyMsg="لا توجد طلبات مكتملة بعد"
            />
            <ProductRankList
              title="أكثر المنتجات طلباً"
              subtitle="مؤشر الاهتمام الحقيقي"
              products={data.topRequestedProducts}
              icon={Package}
              emptyMsg="لا توجد طلبات في هذه الفترة"
            />
          </div>

          {/* ── Funnel + Status breakdown ──────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Funnel */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-sm font-bold text-foreground mb-4">مسار البيع</h2>
              <div className="space-y-3">
                {[
                  { label: "إجمالي المحادثات", value: data.funnel.totalConversations, icon: MessageCircle, color: "bg-blue-500" },
                  { label: "محادثات فيها طلبات", value: data.funnel.conversationsWithOrders, icon: ShoppingBag, color: "bg-amber-500" },
                  { label: "طلبات موافق عليها", value: data.funnel.ordersApproved, icon: TrendingUp, color: "bg-primary" },
                  { label: "تم التسليم", value: data.funnel.ordersDelivered, icon: TrendingDown, color: "bg-emerald-600" },
                ].map(({ label, value, icon: Icon, color }, i, arr) => {
                  const base = arr[0]!.value || 1;
                  const pct = Math.round((value / base) * 100);
                  return (
                    <div key={label}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                        <span className="flex-1 text-xs text-foreground font-medium">{label}</span>
                        <span className="text-base font-extrabold text-foreground">{value.toLocaleString("ar-SA")}</span>
                        <span className="text-xs text-muted-foreground w-9 text-end">{pct}%</span>
                      </div>
                      <div className="ms-4 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.funnel.totalConversations > 0 && (
                <div className="mt-4 flex items-center gap-2 text-xs bg-primary/5 border border-primary/10 rounded-xl p-3">
                  <Percent className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    معدل التحويل:{" "}
                    <strong className="text-primary font-bold">
                      {((data.funnel.ordersApproved / data.funnel.totalConversations) * 100).toFixed(1)}%
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Status breakdown */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="text-sm font-bold text-foreground mb-4">توزيع حالات الطلبات</h2>
              {statusEntries.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">لا توجد طلبات</div>
              ) : (
                <div className="space-y-3">
                  {statusEntries.map(([status, count]) => {
                    const s = STATUS_COLORS[status] ?? { bg: "bg-muted", text: "text-foreground", label: status };
                    const pct = Math.round((count / totalStatusOrders) * 100);
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${s.bg} ${s.text}`}>
                          {s.label}
                        </span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-0">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-foreground w-5 text-end shrink-0">{count}</span>
                        <span className="text-xs text-muted-foreground w-8 text-end shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
}
