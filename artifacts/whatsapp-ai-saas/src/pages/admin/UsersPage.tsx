import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Users, UserCheck, Clock, Wifi, WifiOff, AlertCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { api, type AdminUser, type ApiKey } from "@/lib/api";
import { WA_PROVIDERS } from "@/lib/waProviders";
import { ProviderSelector, ProviderFields } from "@/components/WhatsAppProviderConfig";
import { useToast } from "@/hooks/use-toast";

const statusConfig = {
  active:   { label: "نشط",   className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" },
  pending:  { label: "معلق",  className: "bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20" },
  disabled: { label: "موقوف", className: "bg-red-500/15 text-red-600 hover:bg-red-500/20" },
};

const waStatusConfig = {
  connected:    { label: "متصل",      Icon: Wifi,         cls: "text-emerald-600" },
  disconnected: { label: "غير متصل", Icon: WifiOff,      cls: "text-amber-500" },
  error:        { label: "خطأ",       Icon: AlertCircle,  cls: "text-red-500" },
  idle:         { label: "لم يُعد",   Icon: WifiOff,      cls: "text-muted-foreground" },
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", phone: "",
    chatKeyId: "", embeddingKeyId: "",
    waProvider: "evolution",
  });
  const [waConfig, setWaConfig] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const load = async () => {
    try {
      const [u, k] = await Promise.all([api.users.list(), api.keys.list()]);
      setUsers(u);
      setApiKeys(k);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const chatKeys = apiKeys.filter(k => k.type === "chat" && k.status === "active");
  const embeddingKeys = apiKeys.filter(k => k.type === "embedding" && k.status === "active");

  const activeUsers = users.filter(u => u.status === "active").length;
  const pendingUsers = users.filter(u => u.status === "pending").length;
  const connectedWa = users.filter(u => u.waStatus === "connected").length;

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return;
    setSaving(true);
    try {
      const created = await api.users.create({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        chatKeyId: form.chatKeyId ? Number(form.chatKeyId) : undefined,
        embeddingKeyId: form.embeddingKeyId ? Number(form.embeddingKeyId) : undefined,
        waProvider: form.waProvider,
        waConfig: Object.keys(waConfig).length > 0 ? waConfig : undefined,
      });
      setUsers(prev => [...prev, created]);
      setForm({ name: "", email: "", password: "", phone: "", chatKeyId: "", embeddingKeyId: "", waProvider: "evolution" });
      setWaConfig({});
      setShowModal(false);
      setStep(1);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.users.delete(deleteTarget.id);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "تم الحذف", description: `تم حذف المستخدم "${deleteTarget.name}" وجميع بياناته بنجاح` });
    } catch {
      toast({ title: "خطأ", description: "فشل حذف المستخدم، حاول مجدداً", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const providerMeta = WA_PROVIDERS.find(p => p.id === form.waProvider) ?? WA_PROVIDERS[0]!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "إجمالي المستخدمين",  value: users.length, icon: Users,     color: "text-primary" },
          { label: "المستخدمون النشطون", value: activeUsers,  icon: UserCheck, color: "text-emerald-500" },
          { label: "في انتظار الإعداد",  value: pendingUsers, icon: Clock,     color: "text-amber-500" },
          { label: "واتساب متصل",        value: connectedWa,  icon: Wifi,      color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-xl font-bold text-foreground">{loading ? "..." : value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground text-sm">قائمة المستخدمين</h2>
          <button data-testid="btn-add-user" onClick={() => { setShowModal(true); setStep(1); setWaConfig({}); setForm({ name: "", email: "", password: "", phone: "", chatKeyId: "", embeddingKeyId: "", waProvider: "evolution" }); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all">
            <Plus className="w-3.5 h-3.5" /><span>إضافة مستخدم</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">المستخدم</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">الحالة</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold hidden md:table-cell">نموذج الشات</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold hidden lg:table-cell">مزود واتساب</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">واتساب</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold hidden md:table-cell">تاريخ الإنشاء</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">لا يوجد مستخدمون بعد</td></tr>}
              {users.map((user, i) => {
                const waKey = (user.waStatus ?? "idle") as keyof typeof waStatusConfig;
                const wa = waStatusConfig[waKey] ?? waStatusConfig.idle;
                const WaIcon = wa.Icon;
                const prov = WA_PROVIDERS.find(p => p.id === (user.waProvider ?? "evolution"));
                return (
                  <tr key={user.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    onClick={() => setLocation(`/admin/users/${user.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusConfig[user.status as keyof typeof statusConfig]?.className}`}>
                        {statusConfig[user.status as keyof typeof statusConfig]?.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">{user.chatKeyName ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-medium text-muted-foreground">
                        {prov ? `${prov.logo} ${prov.name}` : (user.waProvider ?? "evolution")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1 text-xs font-medium ${wa.cls}`}>
                        <WaIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{wa.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString("ar")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button data-testid={`btn-edit-user-${user.id}`} onClick={() => setLocation(`/admin/users/${user.id}`)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button data-testid={`btn-delete-user-${user.id}`}
                          onClick={() => setDeleteTarget(user)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Delete confirmation dialog ────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <TriangleAlert className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-base">حذف المستخدم</DialogTitle>
            </div>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-4">
              {/* User card */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {deleteTarget.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{deleteTarget.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{deleteTarget.email}</p>
                </div>
              </div>

              {/* Warning list */}
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">سيتم حذف جميع البيانات التالية نهائياً:</p>
                {[
                  "المحادثات والرسائل",
                  "الطلبات والعملاء",
                  "المنتجات والكوبونات",
                  "بيانات المتجر والتوصيل",
                  "إعداد واتساب والوكيل",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center">لا يمكن التراجع عن هذا الإجراء</p>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <button onClick={() => setDeleteTarget(null)} disabled={deleting}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm transition-colors disabled:opacity-50">
              إلغاء
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {deleting ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />جاري الحذف...</>
              ) : (
                <><Trash2 className="w-4 h-4" />حذف نهائياً</>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add user dialog ───────────────────────────────────────── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</div>
                <span className={`text-xs hidden sm:block ${step >= s ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {s === 1 ? "البيانات الأساسية" : s === 2 ? "اختيار النماذج" : "واتساب"}
                </span>
                {s < 3 && <div className={`h-0.5 w-8 ${step > s ? "bg-primary" : "bg-muted"} hidden sm:block`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Basic info */}
          {step === 1 && (
            <div className="space-y-4">
              {[
                { label: "الاسم الكامل", field: "name", placeholder: "محمد العمري", type: "text" },
                { label: "البريد الإلكتروني", field: "email", placeholder: "user@store.sa", type: "email" },
                { label: "كلمة المرور", field: "password", placeholder: "••••••••", type: "password" },
                { label: "رقم الهاتف (اختياري)", field: "phone", placeholder: "+966501234567", type: "text" },
              ].map(({ label, field, placeholder, type }) => (
                <div key={field}>
                  <label className="block text-sm font-medium mb-1.5">{label}</label>
                  <input data-testid={`input-user-${field}`} type={type}
                    value={form[field as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
            </div>
          )}

          {/* Step 2: AI keys */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">نموذج الشات (Chat)</label>
                <select data-testid="select-user-chatKeyId" value={form.chatKeyId}
                  onChange={e => setForm(p => ({ ...p, chatKeyId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">بدون (اختياري)</option>
                  {chatKeys.map(k => <option key={k.id} value={k.id}>{k.name} — {k.model}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">نموذج التضمين (Embedding)</label>
                <select data-testid="select-user-embeddingKeyId" value={form.embeddingKeyId}
                  onChange={e => setForm(p => ({ ...p, embeddingKeyId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">بدون (اختياري)</option>
                  {embeddingKeys.map(k => <option key={k.id} value={k.id}>{k.name} — {k.model}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 3: WhatsApp provider config */}
          {step === 3 && (
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pe-1">
              {/* Provider picker */}
              <ProviderSelector
                value={form.waProvider}
                onChange={v => { setForm(p => ({ ...p, waProvider: v })); setWaConfig({}); }}
              />

              {/* Provider-specific fields */}
              {form.waProvider !== "evolution" && (
                <ProviderFields
                  provider={form.waProvider}
                  config={waConfig}
                  onChange={(k, v) => setWaConfig(p => ({ ...p, [k]: v }))}
                />
              )}

              {/* Evolution note */}
              {form.waProvider === "evolution" && (
                <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${providerMeta.bg} text-sm`}>
                  <span className="text-base">{providerMeta.logo}</span>
                  <div>
                    <p className={`font-semibold text-xs ${providerMeta.color}`}>Evolution API — ربط عبر QR Code</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      بعد إنشاء المستخدم، ادخل على صفحته واضغط على تبويب «ربط واتساب» لإدخال بيانات الخادم ومسح الـ QR Code.
                    </p>
                  </div>
                </div>
              )}

              {/* Webhook info for non-evolution */}
              {form.waProvider !== "evolution" && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-300 mb-1">معلومة مهمة</p>
                  <p className="text-xs text-muted-foreground">
                    بعد إنشاء المستخدم ستجد في صفحته رابط الـ Webhook الخاص به — أدخله في إعدادات {providerMeta.name} لاستقبال الرسائل.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 mt-4">
            {step > 1 && <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm">السابق</button>}
            <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm">إلغاء</button>
            {step < 3
              ? <button data-testid="btn-next-step" onClick={() => setStep(s => s + 1)} disabled={step === 1 && (!form.name || !form.email || !form.password)}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">التالي</button>
              : <button data-testid="btn-save-user" onClick={handleCreate} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                  {saving ? "جاري الإنشاء..." : "إنشاء المستخدم"}
                </button>
            }
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
