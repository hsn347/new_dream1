import { useState } from "react";
import { Copy, RefreshCw, Check, AlertCircle, Wifi, Info, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";

interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

interface WhatsAppEvolutionSettingsProps {
  config?: Partial<EvolutionConfig>;
  userId?: number;
  onSave?: (config: EvolutionConfig) => void;
  compact?: boolean;
}

type ConnectionStatus = "idle" | "testing" | "connected" | "disconnected" | "error";

export function generateWebhookUrl(userId?: number): string {
  const domain = window.location.hostname;
  const proto = window.location.protocol;
  const port = window.location.port;
  const base = port ? `${proto}//${domain}:${port}` : `${proto}//${domain}`;
  return `${base}/api/webhooks/evolution/${userId ?? "USER_ID"}`;
}

export default function WhatsAppEvolutionSettings({ config, userId, onSave, compact }: WhatsAppEvolutionSettingsProps) {
  const [form, setForm] = useState<EvolutionConfig>({
    baseUrl: config?.baseUrl ?? "",
    apiKey: config?.apiKey ?? "",
    instanceName: config?.instanceName ?? "",
  });
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const webhookUrl = generateWebhookUrl(userId);

  const handleTest = async () => {
    if (!form.baseUrl || !form.apiKey || !form.instanceName) return;
    setConnStatus("testing");
    setTestMessage("");
    try {
      let result: { success: boolean; message: string };
      if (userId !== undefined) {
        await api.admin.saveWhatsApp(userId, {
          provider: "evolution",
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          instanceName: form.instanceName,
        });
        result = await api.admin.testWhatsApp(userId);
      } else {
        await api.user.updateWhatsApp({
          provider: "evolution",
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          instanceName: form.instanceName,
        });
        result = await api.user.testWhatsApp();
      }
      setConnStatus(result.success ? "connected" : "error");
      setTestMessage(result.message);
    } catch {
      setConnStatus("error");
      setTestMessage("فشل الاتصال بالخادم");
    }
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!form.baseUrl || !form.apiKey || !form.instanceName) return;
    setSaving(true);
    try {
      if (userId !== undefined) {
        await api.admin.saveWhatsApp(userId, {
          provider: "evolution",
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          instanceName: form.instanceName,
        });
      } else {
        await api.user.updateWhatsApp({
          provider: "evolution",
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          instanceName: form.instanceName,
        });
      }
      onSave?.(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const statusConfig = {
    idle:         { Icon: Wifi,          label: "لم يتم الاختبار بعد",    color: "text-muted-foreground", bg: "bg-muted/40",    border: "border-border" },
    testing:      { Icon: RefreshCw,     label: "جاري اختبار الاتصال...", color: "text-blue-600",         bg: "bg-blue-50",     border: "border-blue-200" },
    connected:    { Icon: Check,         label: testMessage || "متصل بنجاح ✓",           color: "text-emerald-700",      bg: "bg-emerald-50",  border: "border-emerald-200" },
    disconnected: { Icon: AlertCircle,   label: testMessage || "غير متصل",              color: "text-amber-700",        bg: "bg-amber-50",    border: "border-amber-200" },
    error:        { Icon: AlertCircle,   label: testMessage || "خطأ في الاتصال",         color: "text-red-700",          bg: "bg-red-50",      border: "border-red-200" },
  };
  const { Icon: StatusIcon, label: statusLabel, color: statusColor, bg: statusBg, border: statusBorder } = statusConfig[connStatus];

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${statusBorder} ${statusBg} transition-all`}>
        <StatusIcon className={`w-5 h-5 shrink-0 ${statusColor} ${connStatus === "testing" ? "animate-spin" : ""}`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${statusColor}`}>{statusLabel}</p>
        </div>
        <button
          data-testid="btn-test-evolution"
          onClick={handleTest}
          disabled={!form.baseUrl || !form.apiKey || !form.instanceName || connStatus === "testing"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sidebar text-sidebar-foreground text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-40 shrink-0"
        >
          <Wifi className="w-3.5 h-3.5" />اختبار الاتصال
        </button>
      </div>

      <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
        <div className={compact ? "" : "md:col-span-2"}>
          <label className="block text-sm font-medium text-foreground mb-1.5">Base URL</label>
          <input
            data-testid="input-evo-baseurl"
            value={form.baseUrl}
            onChange={e => setForm(p => ({ ...p, baseUrl: e.target.value }))}
            placeholder="https://your-evolution-server.com"
            dir="ltr"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring placeholder:font-sans"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">API Key</label>
          <input
            data-testid="input-evo-apikey"
            value={form.apiKey}
            onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
            placeholder="••••••••••••••••"
            type="password"
            dir="ltr"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Instance Name</label>
          <input
            data-testid="input-evo-instance"
            value={form.instanceName}
            onChange={e => setForm(p => ({ ...p, instanceName: e.target.value }))}
            placeholder="my-store"
            dir="ltr"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
          <Info className="w-4 h-4 text-amber-700 shrink-0" />
          <p className="text-xs font-semibold text-amber-800">رابط الـ Webhook</p>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 bg-card rounded-lg border border-amber-200 font-mono text-xs break-all" dir="ltr">
              {webhookUrl}
            </div>
            <button
              data-testid="btn-copy-webhook"
              onClick={handleCopyWebhook}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all shrink-0 ${copied ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-card border-amber-200 text-amber-700 hover:bg-amber-500/10"}`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "تم!" : "نسخ"}
            </button>
          </div>
          <a href="https://doc.evolution-api.com/v2/pt/webhooks/websocket" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline font-medium">
            <ExternalLink className="w-3 h-3" />وثائق Evolution API
          </a>
        </div>
      </div>

      {!compact && (
        <div className="flex justify-end">
          <button
            data-testid="btn-save-evolution"
            onClick={handleSave}
            disabled={!form.baseUrl || !form.apiKey || !form.instanceName || saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {saved ? <Check className="w-4 h-4" /> : null}
            {saving ? "جاري الحفظ..." : saved ? "تم الحفظ!" : "حفظ إعدادات واتساب"}
          </button>
        </div>
      )}
    </div>
  );
}
