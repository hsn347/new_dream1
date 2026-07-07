import { useState } from "react";
import {
  CheckCircle2, AlertCircle, Copy, Check, RefreshCw,
  Save, ExternalLink, Info, ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  WA_PROVIDERS, PROVIDER_FIELDS, getWebhookUrl,
} from "@/lib/waProviders";

// ── ProviderSelector ──────────────────────────────────────────────────────────
export function ProviderSelector({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const prov = WA_PROVIDERS.find(p => p.id === value) ?? WA_PROVIDERS[0]!;

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-muted-foreground mb-2">مزود واتساب</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-11 ps-10 pe-9 rounded-xl border border-input bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring appearance-none disabled:opacity-60"
        >
          {WA_PROVIDERS.map(p => (
            <option key={p.id} value={p.id}>{p.logo} {p.name} — {p.desc}</option>
          ))}
        </select>
        <span className="absolute inset-y-0 start-3 flex items-center text-base pointer-events-none">{prov.logo}</span>
        <ChevronDown className="absolute inset-y-0 end-3 my-auto w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {prov.docsUrl && (
        <a href={prov.docsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
          <ExternalLink className="w-3 h-3" />التوثيق الرسمي لـ {prov.name}
        </a>
      )}
    </div>
  );
}

// ── ProviderFields (reusable form) ────────────────────────────────────────────
export function ProviderFields({
  provider, config, onChange, readOnly,
}: {
  provider: string;
  config: Record<string, string>;
  onChange: (key: string, value: string) => void;
  readOnly?: boolean;
}) {
  const fields = PROVIDER_FIELDS[provider];
  if (!fields || provider === "evolution") return null;

  return (
    <div className="space-y-3">
      {fields.map(f => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            {f.label}
            {f.required && <span className="text-red-500 ms-0.5">*</span>}
          </label>
          <input
            type={f.type ?? "text"}
            value={config[f.key] ?? ""}
            onChange={e => onChange(f.key, e.target.value)}
            placeholder={f.placeholder}
            readOnly={readOnly}
            dir="ltr"
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring read-only:opacity-60 read-only:bg-muted/40"
          />
          {f.hint && <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// ── WebhookUrlBox ─────────────────────────────────────────────────────────────
function WebhookUrlBox({ provider, userId }: { provider: string; userId: number }) {
  const [copied, setCopied] = useState(false);
  if (provider === "evolution") return null;

  const url = getWebhookUrl(provider, userId);
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const notes: Record<string, string> = {
    twilio:      "أدخل هذا الرابط في حقل «Webhook URL» في إعدادات WhatsApp Sandbox/Sender في Twilio.",
    "360dialog": "أدخل هذا الرابط في إعدادات الـ Webhook في لوحة 360dialog.",
    meta:        "أدخل هذا الرابط في إعدادات Webhook في Meta Developer Console، مع استخدام الـ Verify Token أعلاه.",
    gupshup:     "أدخل هذا الرابط كـ Callback URL في إعدادات التطبيق في Gupshup.",
  };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/20">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
        <p className="text-xs font-semibold text-amber-600 dark:text-amber-300">رابط الـ Webhook الخاص بهذا المستخدم</p>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 bg-card rounded-lg border border-amber-500/20 font-mono text-xs break-all text-foreground" dir="ltr">
            {url}
          </div>
          <button onClick={copy}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all shrink-0 ${copied ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-card border-amber-500/20 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10"}`}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "تم!" : "نسخ"}
          </button>
        </div>
        {notes[provider] && <p className="text-xs text-amber-600 dark:text-amber-300">{notes[provider]}</p>}
      </div>
    </div>
  );
}

// ── Main full component (for UserDetailPage) ──────────────────────────────────
interface WhatsAppProviderConfigProps {
  userId: number;
  initialProvider: string;
  initialConfig: Record<string, string>;
  onSaved?: (provider: string, config: Record<string, string>) => void;
}

export default function WhatsAppProviderConfig({
  userId, initialProvider, initialConfig, onSaved,
}: WhatsAppProviderConfigProps) {
  const { toast } = useToast();
  const [provider, setProvider] = useState(initialProvider || "evolution");
  const [config, setConfig] = useState<Record<string, string>>(initialConfig ?? {});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [providerChanged, setProviderChanged] = useState(false);

  const handleProviderChange = (p: string) => {
    setProvider(p);
    setConfig({});
    setTestResult(null);
    setProviderChanged(p !== initialProvider);
  };

  const handleFieldChange = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.admin.saveWhatsApp(userId, {
        provider,
        config: provider !== "evolution" ? config : undefined,
        baseUrl: provider === "evolution" ? config["baseUrl"] : undefined,
        apiKey: provider === "evolution" ? config["apiKey"] : undefined,
        instanceName: provider === "evolution" ? config["instanceName"] : undefined,
      });
      toast({ title: "تم الحفظ ✓", description: `إعدادات ${WA_PROVIDERS.find(p => p.id === provider)?.name} تم حفظها بنجاح` });
      setProviderChanged(false);
      onSaved?.(provider, config);
    } catch {
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.admin.testWhatsApp(userId);
      setTestResult(result);
      if (result.success) {
        toast({ title: "الاتصال ناجح ✓", description: result.message });
      } else {
        toast({ title: "فشل الاتصال", description: result.message, variant: "destructive" });
      }
    } catch {
      setTestResult({ success: false, message: "خطأ في الاختبار" });
    } finally {
      setTesting(false);
    }
  };

  const prov = WA_PROVIDERS.find(p => p.id === provider);
  const hasRequiredFields = provider === "evolution" || (
    PROVIDER_FIELDS[provider]?.filter(f => f.required).every(f => config[f.key]?.trim())
  );

  return (
    <div className="space-y-5" dir="rtl">

      {/* Provider selector */}
      <ProviderSelector value={provider} onChange={handleProviderChange} />

      {/* Provider info banner */}
      {prov && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${prov.bg}`}>
          <span className="text-xl">{prov.logo}</span>
          <div className="flex-1">
            <p className={`font-semibold text-sm ${prov.color}`}>{prov.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{prov.desc}</p>
          </div>
          {providerChanged && (
            <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20 px-2 py-1 rounded-full font-semibold">
              تغيير معلّق
            </span>
          )}
        </div>
      )}

      {/* Evolution note */}
      {provider === "evolution" && (
        <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-muted-foreground">
          <p className="font-semibold text-violet-600 dark:text-violet-400 mb-1">⚡ Evolution API</p>
          <p className="text-xs">يتم الإعداد عبر معالج الربط أدناه — أدخل بيانات الخادم ثم امسح QR Code لربط الهاتف.</p>
        </div>
      )}

      {/* Provider-specific fields */}
      {provider !== "evolution" && (
        <ProviderFields provider={provider} config={config} onChange={handleFieldChange} />
      )}

      {/* Webhook URL box */}
      {provider !== "evolution" && <WebhookUrlBox provider={provider} userId={userId} />}

      {/* Test result */}
      {testResult && (
        <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${testResult.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"}`}>
          {testResult.success
            ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <p>{testResult.message}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !hasRequiredFields}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "جاري الحفظ…" : providerChanged ? "حفظ المزود الجديد" : "حفظ الإعدادات"}
        </button>
        {provider !== "evolution" && (
          <button
            onClick={handleTest}
            disabled={testing || !hasRequiredFields}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />
            {testing ? "جاري الاختبار…" : "اختبار الاتصال"}
          </button>
        )}
      </div>

      {!hasRequiredFields && provider !== "evolution" && (
        <p className="text-xs text-amber-600 dark:text-amber-300">
          * يرجى تعبئة جميع الحقول المطلوبة قبل الحفظ أو الاختبار
        </p>
      )}
    </div>
  );
}
