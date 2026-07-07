import { useState, useEffect } from "react";
import { Plus, RefreshCw, Edit2, Power, Wifi, Filter, Key, Cpu, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";
import { api, type ApiKey } from "@/lib/api";

const MAX_TOKENS = 2000000;

type ProviderKey = "groq" | "gemini" | "cohere";

const PROVIDERS: Record<ProviderKey, {
  label: string; emoji: string; color: string; border: string; bg: string;
  types: Array<"chat" | "embedding">;
  models: Array<{ id: string; label: string; type: "chat" | "embedding"; desc?: string }>;
  placeholder: string; docsUrl: string;
}> = {
  groq: {
    label: "Groq", emoji: "⚡", color: "text-orange-600", border: "border-orange-300", bg: "bg-orange-50",
    types: ["chat"],
    models: [
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B", type: "chat", desc: "سريع وفعّال — موصى به" },
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick 17B", type: "chat", desc: "أقوى — سياق أطول" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", type: "chat", desc: "متوازن — جودة عالية" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", type: "chat", desc: "الأسرع" },
    ],
    placeholder: "gsk_••••••••••••••••••••••••••••••••••••••••••••••••••••••••",
    docsUrl: "https://console.groq.com/keys",
  },
  gemini: {
    label: "Google Gemini", emoji: "✨", color: "text-blue-600", border: "border-blue-300", bg: "bg-blue-500/10",
    types: ["chat"],
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", type: "chat", desc: "الأحدث — سريع جداً — موصى به" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", type: "chat", desc: "الأخف والأسرع" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", type: "chat", desc: "الأقوى — سياق مليون توكن" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", type: "chat", desc: "سريع ومتوازن" },
      { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B", type: "chat", desc: "خفيف وسريع" },
    ],
    placeholder: "AIza••••••••••••••••••••••••••••••••••••••",
    docsUrl: "https://aistudio.google.com/app/apikey",
  },
  cohere: {
    label: "Cohere", emoji: "🔍", color: "text-purple-600", border: "border-purple-300", bg: "bg-purple-500/10",
    types: ["embedding"],
    models: [
      { id: "embed-multilingual-v3.0", label: "Embed Multilingual v3.0", type: "embedding", desc: "متعدد اللغات — موصى به" },
      { id: "embed-multilingual-light-v3.0", label: "Embed Multilingual Light v3.0", type: "embedding", desc: "خفيف وسريع" },
    ],
    placeholder: "••••••••••••••••••••••••••••••••••••••••••••",
    docsUrl: "https://dashboard.cohere.com/api-keys",
  },
};

export default function KeysPage() {
  const [filter, setFilter] = useState<"all" | "chat" | "embedding">("all");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testMsg, setTestMsg] = useState<{ id: number; ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("groq");
  const [form, setForm] = useState({ name: "", type: "chat" as "chat" | "embedding", provider: "Groq", model: "", apiKey: "" });
  const [, setLocation] = useLocation();

  const currentProviderConfig = PROVIDERS[selectedProvider];
  const availableModels = currentProviderConfig.models.filter(m => m.type === form.type);

  const loadKeys = async () => {
    try {
      const data = await api.keys.list();
      setKeys(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, []);

  const filtered = filter === "all" ? keys : keys.filter(k => k.type === filter);
  const totalTokens = keys.reduce((a, k) => a + k.tokensUsed, 0);
  const totalRequests = keys.reduce((a, k) => a + k.requestsCount, 0);
  const activeKeys = keys.filter(k => k.status === "active").length;

  const testConnection = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTesting(id);
    setTestMsg(null);
    try {
      const result = await api.keys.test(id);
      setTestMsg({ id, ok: result.success, msg: result.message });
      setTimeout(() => setTestMsg(null), 4000);
    } finally {
      setTesting(null);
    }
  };

  const toggleKey = async (id: number, current: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = current === "active" ? "disabled" : "active";
    await api.keys.update(id, { status: newStatus });
    setKeys(prev => prev.map(k => k.id === id ? { ...k, status: newStatus as "active" | "disabled" } : k));
  };

  const selectProvider = (p: ProviderKey) => {
    const cfg = PROVIDERS[p];
    const defaultType = cfg.types[0]!;
    const defaultModel = cfg.models.find(m => m.type === defaultType)?.id ?? "";
    setSelectedProvider(p);
    setForm(prev => ({ ...prev, provider: cfg.label, type: defaultType, model: defaultModel }));
  };

  const handleAdd = async () => {
    if (!form.name || !form.provider || !form.model || !form.apiKey) return;
    setSaving(true);
    try {
      const created = await api.keys.create({
        name: form.name,
        type: form.type,
        provider: form.provider,
        model: form.model,
        apiKey: form.apiKey,
      });
      setKeys(prev => [...prev, created]);
      setSelectedProvider("groq");
      setForm({ name: "", type: "chat", provider: "Groq", model: "", apiKey: "" });
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {testMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${testMsg.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"}`}>
          {testMsg.ok ? "✓" : "✗"} {testMsg.msg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "إجمالي المفاتيح",   value: keys.length,                                    icon: Key,       color: "text-primary" },
          { label: "المفاتيح النشطة",   value: activeKeys,                                     icon: Activity,  color: "text-emerald-500" },
          { label: "إجمالي التوكن",     value: (totalTokens / 1000000).toFixed(1) + "M",       icon: Cpu,       color: "text-blue-500" },
          { label: "إجمالي الطلبات",   value: totalRequests.toLocaleString("ar"),              icon: RefreshCw, color: "text-amber-500" },
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {(["all", "chat", "embedding"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {f === "all" ? "الكل" : f === "chat" ? "Chat" : "Embedding"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-all">
              <Filter className="w-3.5 h-3.5" /><span>فلترة</span>
            </button>
            <button data-testid="btn-add-key" onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all">
              <Plus className="w-3.5 h-3.5" /><span>إضافة مفتاح</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["اسم المفتاح", "النوع", "المزود", "النموذج", "الحالة", "استهلاك التوكن", "الطلبات", "الإجراءات"].map((h, i) => (
                  <th key={h} className={`text-right px-4 py-3 text-xs text-muted-foreground font-semibold ${i > 1 && i < 4 ? "hidden md:table-cell" : ""} ${i > 3 && i < 7 ? "hidden lg:table-cell" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">لا توجد مفاتيح بعد</td></tr>
              )}
              {filtered.map((key, i) => (
                <tr
                  key={key.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  onClick={() => setLocation(`/admin/keys/${key.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${key.type === "chat" ? "bg-blue-500/10" : "bg-purple-500/10"}`}>
                        <Key className={`w-3.5 h-3.5 ${key.type === "chat" ? "text-blue-500" : "text-purple-500"}`} />
                      </div>
                      <span className="font-medium text-foreground">{key.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={key.type === "chat" ? "default" : "secondary"} className="text-[10px]">
                      {key.type === "chat" ? "Chat" : "Embedding"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{key.provider}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{key.model}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-[10px] ${key.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" : "bg-red-500/15 text-red-600 hover:bg-red-500/20"}`}>
                      {key.status === "active" ? "نشط" : "معطل"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="space-y-1 w-32">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{(key.tokensUsed / 1000).toFixed(0)}K</span>
                        <span>{Math.min(100, Math.round(key.tokensUsed / MAX_TOKENS * 100))}%</span>
                      </div>
                      <Progress value={Math.min(100, Math.round(key.tokensUsed / MAX_TOKENS * 100))} className="h-1.5" />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{key.requestsCount.toLocaleString("ar")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button data-testid={`btn-test-${key.id}`} onClick={e => testConnection(key.id, e)} title="اختبار الاتصال"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-100 text-blue-500 transition-colors">
                        {testing === key.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      </button>
                      <button data-testid={`btn-edit-${key.id}`} onClick={() => setLocation(`/admin/keys/${key.id}`)} title="تعديل"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button data-testid={`btn-toggle-${key.id}`} onClick={e => toggleKey(key.id, key.status, e)}
                        title={key.status === "active" ? "تعطيل" : "تفعيل"}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${key.status === "active" ? "hover:bg-red-500/20 text-red-400 hover:text-red-600" : "hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-600"}`}>
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>إضافة مفتاح API جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            {/* Provider selector */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">المزود</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(PROVIDERS) as [ProviderKey, typeof PROVIDERS[ProviderKey]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectProvider(key)}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all ${
                      selectedProvider === key
                        ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                        : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                    }`}
                  >
                    <span className="text-xl">{cfg.emoji}</span>
                    <span className="text-xs font-semibold leading-tight">{cfg.label}</span>
                  </button>
                ))}
              </div>
              <a
                href={currentProviderConfig.docsUrl}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-1 text-xs mt-2 hover:underline ${currentProviderConfig.color}`}
              >
                الحصول على مفتاح {currentProviderConfig.label} ←
              </a>
            </div>

            {/* Key name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">اسم المفتاح</label>
              <input
                data-testid="input-key-name"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={`مثال: ${currentProviderConfig.label} الرئيسي`}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">النموذج</label>
              <div className="space-y-1.5">
                {currentProviderConfig.models.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, model: m.id, type: m.type }))}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-right transition-all ${
                      form.model === m.id
                        ? `${currentProviderConfig.border} ${currentProviderConfig.bg}`
                        : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-medium ${form.model === m.id ? currentProviderConfig.color : "text-foreground"}`}>{m.label}</p>
                      {m.desc && <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 ms-2 hidden sm:block">
                      {m.type === "chat" ? "Chat" : "Embedding"}
                    </span>
                  </button>
                ))}
                {/* Custom model input */}
                <div className="relative">
                  <input
                    data-testid="input-key-model"
                    value={currentProviderConfig.models.some(m => m.id === form.model) ? "" : form.model}
                    onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="أو أدخل اسم نموذج مخصص..."
                    className="w-full h-9 px-3 rounded-lg border border-dashed border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground placeholder:text-muted-foreground/60"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">مفتاح API</label>
              <input
                data-testid="input-key-apikey"
                type="password"
                value={form.apiKey}
                onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={currentProviderConfig.placeholder}
                dir="ltr"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm transition-all">إلغاء</button>
            <button
              data-testid="btn-save-key"
              onClick={handleAdd}
              disabled={saving || !form.name || !form.model || !form.apiKey}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : "حفظ المفتاح"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
