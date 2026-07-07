import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  ArrowRight, Edit2, Save, X, Power, RefreshCw, Wifi, Activity,
  Cpu, Clock, Check, AlertCircle, TrendingUp, Key, ShieldCheck, Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import { api, type ApiKey } from "@/lib/api";

const MAX_TOKENS = 2_000_000;

export default function KeyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const [keyData, setKeyData] = useState<ApiKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ name: "", model: "", provider: "", type: "chat", newApiKey: "" });

  useEffect(() => {
    api.keys.list().then(keys => {
      const found = keys.find(k => k.id === Number(id)) ?? null;
      setKeyData(found);
      if (found) setForm({ name: found.name, model: found.model, provider: found.provider, type: found.type, newApiKey: "" });
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">جاري التحميل...</div>;

  if (!keyData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">المفتاح غير موجود</p>
        <button onClick={() => setLocation("/admin/keys")} className="text-sm text-primary hover:underline">العودة للمفاتيح</button>
      </div>
    );
  }

  const usagePct = Math.min(100, Math.round(keyData.tokensUsed / MAX_TOKENS * 100));

  const handleTest = async () => {
    setTesting("testing");
    setTestMsg("");
    try {
      const result = await api.keys.test(keyData.id);
      setTesting(result.success ? "ok" : "fail");
      setTestMsg(result.message);
      if (result.success && result.latencyMs) {
        setKeyData(k => k ? { ...k, avgLatencyMs: result.latencyMs! } : k);
      }
    } catch {
      setTesting("fail");
      setTestMsg("فشل الاتصال");
    }
    setTimeout(() => { setTesting("idle"); setTestMsg(""); }, 5000);
  };

  const handleToggle = async () => {
    const newStatus = keyData.status === "active" ? "disabled" : "active";
    await api.keys.update(keyData.id, { status: newStatus });
    setKeyData(k => k ? { ...k, status: newStatus as "active" | "disabled" } : k);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: Record<string, unknown> = { name: form.name, model: form.model, provider: form.provider };
    if (form.newApiKey.trim()) payload.apiKey = form.newApiKey;
    await api.keys.update(keyData.id, payload);
    setKeyData(k => k ? { ...k, name: form.name, model: form.model, provider: form.provider } : k);
    setSaved(true);
    setEditMode(false);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.keys.remove(keyData.id);
      setLocation("/admin/keys");
    } finally {
      setDeleting(false);
    }
  };

  const testConfig = {
    idle:    { label: "اختبار الاتصال", Icon: Wifi,         cls: "bg-sidebar text-sidebar-foreground hover:opacity-90" },
    testing: { label: "جاري الاختبار...", Icon: RefreshCw,  cls: "bg-blue-500 text-white opacity-70 cursor-not-allowed" },
    ok:      { label: testMsg || "الاتصال ناجح ✓",  Icon: Check,       cls: "bg-emerald-500 text-white" },
    fail:    { label: testMsg || "فشل الاتصال ✗",   Icon: AlertCircle, cls: "bg-red-500 text-white" },
  };
  const tc = testConfig[testing];

  const mockWeekData = Array.from({ length: 7 }, (_, i) => ({
    date: `يوم ${i + 1}`,
    tokens: Math.floor(Math.random() * 60000 + 5000),
    requests: Math.floor(Math.random() * 400 + 50),
  }));

  return (
    <div className="space-y-5 max-w-4xl">
      <button data-testid="btn-back-keys" onClick={() => setLocation("/admin/keys")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowRight className="w-4 h-4" />العودة لإدارة المفاتيح
      </button>

      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${keyData.type === "chat" ? "bg-blue-500/10" : "bg-purple-500/10"}`}>
            <Key className={`w-7 h-7 ${keyData.type === "chat" ? "text-blue-500" : "text-purple-500"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                {editMode ? (
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none text-foreground w-full" />
                ) : (
                  <h2 className="text-xl font-bold text-foreground">{keyData.name}</h2>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge variant={keyData.type === "chat" ? "default" : "secondary"} className="text-xs">
                    {keyData.type === "chat" ? "Chat" : "Embedding"}
                  </Badge>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{keyData.model}</span>
                  <Badge className={`text-xs ${keyData.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" : "bg-red-500/15 text-red-600 hover:bg-red-500/20"}`}>
                    {keyData.status === "active" ? "نشط" : "معطل"}
                  </Badge>
                  {saved && <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">تم الحفظ ✓</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{keyData.provider} · أُنشئ {new Date(keyData.createdAt).toLocaleDateString("ar")}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button data-testid="btn-test-key-detail" onClick={handleTest} disabled={testing === "testing"}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${tc.cls}`}>
                  <tc.Icon className={`w-3.5 h-3.5 ${testing === "testing" ? "animate-spin" : ""}`} />
                  {tc.label}
                </button>
                <button data-testid="btn-toggle-key-detail" onClick={handleToggle}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${keyData.status === "active" ? "border-red-500/20 text-red-600 hover:bg-red-500/10" : "border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10"}`}>
                  <Power className="w-3.5 h-3.5" />
                  {keyData.status === "active" ? "تعطيل" : "تفعيل"}
                </button>
                {!editMode ? (
                  <>
                    <button data-testid="btn-edit-key-detail" onClick={() => setEditMode(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-all">
                      <Edit2 className="w-3.5 h-3.5" />تعديل
                    </button>
                    <button data-testid="btn-delete-key-detail" onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 text-xs font-medium transition-all">
                      <Trash2 className="w-3.5 h-3.5" />حذف
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setEditMode(false)} className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted">
                      <X className="w-3.5 h-3.5" />إلغاء
                    </button>
                    <button data-testid="btn-save-key-detail" onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
                      <Save className="w-3.5 h-3.5" />{saving ? "..." : saved ? "تم!" : "حفظ"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
          {[
            { label: "التوكن المستهلكة", value: (keyData.tokensUsed / 1000).toFixed(0) + "K", icon: Cpu, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "إجمالي الطلبات", value: keyData.requestsCount.toLocaleString("ar"), icon: Activity, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "متوسط التأخير", value: keyData.avgLatencyMs > 0 ? keyData.avgLatencyMs + "ms" : "—", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "الحالة", value: keyData.status === "active" ? "نشط" : "معطل", icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-muted/30 rounded-xl p-3 text-center">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mx-auto mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="font-bold text-foreground text-sm">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground text-sm">استهلاك التوكن</h3>
          <span className="text-xs text-muted-foreground">{usagePct}% من الحد الشهري</span>
        </div>
        <Progress value={usagePct} className="h-2.5 mb-4" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{(keyData.tokensUsed / 1000000).toFixed(2)}M مستهلك</span>
          <span>{((MAX_TOKENS - keyData.tokensUsed) / 1000000).toFixed(2)}M متبقٍ</span>
          <span>{(MAX_TOKENS / 1000000).toFixed(0)}M الحد الأقصى</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />التوكن - آخر 7 أيام
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={mockWeekData}>
              <defs>
                <linearGradient id="tokensGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: 11 }} />
              <Area type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" fill="url(#tokensGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
          <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />الطلبات - آخر 7 أيام
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={mockWeekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: 11 }} />
              <Bar dataKey="requests" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {editMode && (
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground text-sm">تعديل بيانات المفتاح</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "اسم المفتاح", field: "name" as const, placeholder: "Groq الرئيسي" },
              { label: "اسم المزود", field: "provider" as const, placeholder: "Groq" },
              { label: "اسم النموذج", field: "model" as const, placeholder: "openai/gpt-oss-120b" },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
                <input value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">مفتاح API الجديد (اتركه فارغاً للإبقاء على الحالي)</label>
            <input type="password" value={form.newApiKey} onChange={e => setForm(p => ({ ...p, newApiKey: e.target.value }))}
              placeholder="gsk-••••••••••••••••" dir="ltr"
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex justify-end">
            <button data-testid="btn-save-key-form" onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : saved ? "تم الحفظ!" : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">حذف المفتاح</h3>
                <p className="text-xs text-muted-foreground mt-0.5">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <p className="text-sm text-foreground">
              هل أنت متأكد من حذف المفتاح <span className="font-semibold text-red-600">"{keyData.name}"</span>؟
              سيتوقف أي مستخدم يعتمد عليه عن العمل بشكل صحيح.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm transition-all disabled:opacity-50">
                إلغاء
              </button>
              <button data-testid="btn-confirm-delete" onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all disabled:opacity-50 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? "جاري الحذف..." : "نعم، احذف المفتاح"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
