import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  ArrowRight, Edit2, Save, MessageCircle,
  Activity, Clock, Shield, X,
  Mail, Phone, Calendar, RefreshCw
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import WhatsAppConnectionWizard from "@/components/WhatsAppConnectionWizard";
import WhatsAppProviderConfig from "@/components/WhatsAppProviderConfig";
import { WA_PROVIDERS } from "@/lib/waProviders";
import { api, type AdminUser, type ApiKey } from "@/lib/api";

const statusCfg: Record<string, { label: string; cls: string }> = {
  active:   { label: "نشط",    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" },
  pending:  { label: "معلق",   cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20" },
  disabled: { label: "موقوف", cls: "bg-red-500/15 text-red-600 hover:bg-red-500/20" },
};

const waCls: Record<string, string> = {
  connected:    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  disconnected: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20",
  error:        "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  idle:         "bg-muted text-muted-foreground border-border",
  not_found:    "bg-orange-50 text-orange-700 border-orange-200",
};

const waLabels: Record<string, string> = {
  connected: "متصل", disconnected: "غير متصل", error: "خطأ", idle: "لم يُعد", not_found: "غير موجود",
};

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", status: "active", chatKeyId: "", embeddingKeyId: "", chatFallbackKeyIds: [] as number[] });

  const load = async () => {
    const [u, k] = await Promise.all([api.users.get(Number(id)), api.keys.list()]);
    setUser(u);
    setApiKeys(k);
    let parsedFallbacks: number[] = [];
    try { parsedFallbacks = JSON.parse((u as any).chatFallbackKeyIds ?? "[]") as number[]; } catch { parsedFallbacks = []; }
    setForm({
      name: u.name,
      email: u.email,
      phone: u.phone ?? "",
      status: u.status,
      chatKeyId: u.chatKeyId ? String(u.chatKeyId) : "",
      embeddingKeyId: u.embeddingKeyId ? String(u.embeddingKeyId) : "",
      chatFallbackKeyIds: parsedFallbacks,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin me-2" />جاري التحميل…</div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">المستخدم غير موجود</p>
        <button onClick={() => setLocation("/admin/users")} className="text-sm text-primary hover:underline">العودة للقائمة</button>
      </div>
    );
  }

  const waStatus = user.waStatus ?? "idle";
  const waCl = waCls[waStatus] ?? waCls.idle;
  const waLabel = waLabels[waStatus] ?? "لم يُعد";

  const handleSave = async () => {
    setSaving(true);
    await api.users.update(Number(id), {
      name: form.name,
      phone: form.phone,
      status: form.status,
      chatKeyId: form.chatKeyId ? Number(form.chatKeyId) : null,
      embeddingKeyId: form.embeddingKeyId ? Number(form.embeddingKeyId) : null,
      chatFallbackKeyIds: form.chatFallbackKeyIds,
    });
    setUser(u => u ? { ...u, name: form.name, phone: form.phone, status: form.status } : u);
    setSaved(true);
    setEditMode(false);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const chatKeys = apiKeys.filter(k => k.type === "chat" && k.status === "active");
  const embeddingKeys = apiKeys.filter(k => k.type === "embedding" && k.status === "active");

  const mockActivity = Array.from({ length: 7 }, (_, i) => ({
    date: `يوم ${i + 1}`,
    conversations: Math.floor(Math.random() * 30 + 5),
  }));

  const tabs = [
    { id: "overview", label: "نظرة عامة" },
    { id: "whatsapp", label: "🔗 ربط واتساب" },
    { id: "models",   label: "النماذج" },
    { id: "activity", label: "النشاط" },
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      <button data-testid="btn-back-users" onClick={() => setLocation("/admin/users")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowRight className="w-4 h-4" />العودة للمستخدمين
      </button>

      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-foreground">{user.name}</h2>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><Mail className="w-3.5 h-3.5" />{user.email}</span>
                  {user.phone && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Phone className="w-3.5 h-3.5" />{user.phone}</span>}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge className={`text-xs ${statusCfg[user.status]?.cls}`}>{statusCfg[user.status]?.label}</Badge>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${waCl}`}>
                    {waLabel}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />منذ {new Date(user.createdAt).toLocaleDateString("ar")}
                  </span>
                  {saved && <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">تم الحفظ ✓</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <button data-testid="btn-edit-user-detail" onClick={() => setEditMode(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all">
                    <Edit2 className="w-4 h-4" />تعديل
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditMode(false)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-all">
                      <X className="w-4 h-4" />إلغاء
                    </button>
                    <button data-testid="btn-save-user-detail" onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                      <Save className="w-4 h-4" />{saving ? "…" : "حفظ"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border">
          {[
            { label: "المحادثات الكلية", value: (user.conversations ?? 0).toLocaleString("ar"), icon: MessageCircle, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "نموذج الشات", value: user.chatKeyName ?? "—", icon: Activity, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "نموذج التضمين", value: user.embeddingKeyName ?? "—", icon: Shield, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "آخر دخول", value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("ar") : "—", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-muted/30 rounded-xl p-3 text-center">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mx-auto mb-2`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="font-bold text-foreground text-sm truncate">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto bg-muted rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} data-testid={`tab-user-${t.id}`} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm space-y-5">
          <h3 className="font-semibold text-foreground text-sm">البيانات الأساسية</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "الاسم الكامل", field: "name" as const },
              { label: "رقم الهاتف", field: "phone" as const },
            ].map(({ label, field }) => (
              <div key={field}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                {editMode ? (
                  <input value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                ) : (
                  <p className="text-sm font-medium text-foreground px-3 py-2 bg-muted/30 rounded-lg">{form[field] || "—"}</p>
                )}
              </div>
            ))}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">البريد الإلكتروني</label>
              <p className="text-sm font-medium text-foreground px-3 py-2 bg-muted/30 rounded-lg">{user.email}</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">حالة الحساب</label>
              {editMode ? (
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="active">نشط</option>
                  <option value="pending">معلق</option>
                  <option value="disabled">موقوف</option>
                </select>
              ) : (
                <div className="px-3 py-2 bg-muted/30 rounded-lg">
                  <Badge className={`text-xs ${statusCfg[form.status]?.cls}`}>{statusCfg[form.status]?.label}</Badge>
                </div>
              )}
            </div>
          </div>
          {editMode && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-4 h-4" />{saving ? "جاري الحفظ…" : "حفظ"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "whatsapp" && (
        <div className="space-y-5">
          {/* Status header */}
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-foreground">ربط واتساب</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  المزود الحالي:{" "}
                  <span className="font-semibold text-foreground">
                    {WA_PROVIDERS.find(p => p.id === (user.waProvider ?? "evolution"))?.name ?? user.waProvider ?? "Evolution API"}
                  </span>
                </p>
              </div>
              <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${waCl}`}>
                {waLabel}
              </span>
            </div>
          </div>

          {/* Provider config & switcher — always visible */}
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
            <h4 className="font-semibold text-foreground text-sm mb-4">إعدادات المزود</h4>
            <WhatsAppProviderConfig
              userId={user.id}
              initialProvider={user.waProvider ?? "evolution"}
              initialConfig={user.waConfig ?? {}}
              onSaved={(provider, cfg) => setUser(u => u ? { ...u, waProvider: provider, waConfig: cfg, waStatus: "idle" } : u)}
            />
          </div>

          {/* Evolution wizard — only shown when provider is evolution */}
          {(user.waProvider ?? "evolution") === "evolution" && (
            <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
              <h4 className="font-semibold text-foreground text-sm mb-4">⚡ معالج ربط Evolution API</h4>
              <WhatsAppConnectionWizard
                userId={user.id}
                waBaseUrl={user.waBaseUrl}
                waApiKey=""
                waInstanceName={user.waInstanceName}
                waStatus={user.waStatus}
                onConnected={() => setUser(u => u ? { ...u, waStatus: "connected" } : u)}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "models" && (
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm space-y-5">
          <h3 className="font-semibold text-foreground text-sm">إعدادات نماذج الذكاء الاصطناعي</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">نموذج الشات الرئيسي (Chat)</label>
              {editMode ? (
                <select value={form.chatKeyId} onChange={e => setForm(p => ({ ...p, chatKeyId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">بدون</option>
                  {chatKeys.map(k => <option key={k.id} value={k.id}>{k.name} — {k.model}</option>)}
                </select>
              ) : (
                <p className="text-sm font-medium text-foreground px-3 py-2 bg-muted/30 rounded-lg">{user.chatKeyName ?? "—"}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">نموذج التضمين (Embedding)</label>
              {editMode ? (
                <select value={form.embeddingKeyId} onChange={e => setForm(p => ({ ...p, embeddingKeyId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">بدون</option>
                  {embeddingKeys.map(k => <option key={k.id} value={k.id}>{k.name} — {k.model}</option>)}
                </select>
              ) : (
                <p className="text-sm font-medium text-foreground px-3 py-2 bg-muted/30 rounded-lg">{user.embeddingKeyName ?? "—"}</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <label className="block text-xs text-muted-foreground mb-2">مفاتيح الشات الاحتياطية (Fallback) — تُجرَّب بالترتيب عند فشل الرئيسي</label>
            {editMode ? (
              <div className="space-y-1.5">
                {chatKeys
                  .filter(k => !form.chatKeyId || String(k.id) !== form.chatKeyId)
                  .map(k => {
                    const checked = form.chatFallbackKeyIds.includes(k.id);
                    return (
                      <label key={k.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            if (e.target.checked) {
                              setForm(p => ({ ...p, chatFallbackKeyIds: [...p.chatFallbackKeyIds, k.id] }));
                            } else {
                              setForm(p => ({ ...p, chatFallbackKeyIds: p.chatFallbackKeyIds.filter(id => id !== k.id) }));
                            }
                          }}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm text-foreground">{k.name}</span>
                        <span className="text-xs text-muted-foreground ms-auto">{k.model}</span>
                      </label>
                    );
                  })
                }
                {chatKeys.filter(k => !form.chatKeyId || String(k.id) !== form.chatKeyId).length === 0 && (
                  <p className="text-xs text-muted-foreground px-3 py-2 bg-muted/20 rounded-lg">لا توجد مفاتيح إضافية لتعيينها كاحتياطية</p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {form.chatFallbackKeyIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-3 py-2 bg-muted/30 rounded-lg">لا توجد مفاتيح احتياطية</p>
                ) : (
                  form.chatFallbackKeyIds.map(id => {
                    const k = chatKeys.find(k => k.id === id);
                    return k ? (
                      <span key={id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {k.name}
                      </span>
                    ) : null;
                  })
                )}
              </div>
            )}
          </div>
          {!editMode && (
            <button onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all">
              <Edit2 className="w-4 h-4" />تعديل النماذج
            </button>
          )}
          {editMode && (
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-4 h-4" />{saving ? "جاري الحفظ…" : "حفظ"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-4">
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-foreground text-sm mb-4">محادثات آخر 7 أيام</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mockActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.75rem", fontSize: 12, direction: "rtl" }} />
                <Bar dataKey="conversations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-foreground text-sm mb-3">معلومات النشاط</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "تاريخ التسجيل", value: new Date(user.createdAt).toLocaleDateString("ar") },
                { label: "آخر تسجيل دخول", value: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString("ar") : "—" },
                { label: "إجمالي المحادثات", value: (user.conversations ?? 0).toLocaleString("ar") },
                { label: "نموذج الشات", value: user.chatKeyName ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/30 rounded-xl p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                  <p className="text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
