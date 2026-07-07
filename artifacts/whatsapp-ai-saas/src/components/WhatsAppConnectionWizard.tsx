import { useState, useEffect, useRef, useCallback } from "react";
import {
  Wifi, WifiOff, QrCode, RefreshCw, Check, AlertCircle,
  Copy, ExternalLink, Smartphone, Settings, ChevronRight,
  Loader2, CheckCircle2, XCircle, Info, Zap
} from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  userId: number;
  waBaseUrl?: string;
  waApiKey?: string;
  waInstanceName?: string;
  waStatus?: string;
  onConnected?: () => void;
}

type Step = "config" | "create" | "qr" | "connected";
type ConnectionState = "idle" | "not_found" | "connecting" | "open" | "close" | "error" | "timeout" | "auth_error";

function getWebhookUrl(userId: number): string {
  const h = window.location.hostname;
  const proto = window.location.protocol;
  const port = window.location.port;
  const base = port ? `${proto}//${h}:${port}` : `${proto}//${h}`;
  return `${base}/api/webhooks/evolution/${userId}`;
}

export default function WhatsAppConnectionWizard({ userId, waBaseUrl, waApiKey, waInstanceName, waStatus, onConnected }: Props) {
  const [step, setStep] = useState<Step>(waStatus === "connected" ? "connected" : "config");
  const [form, setForm] = useState({ baseUrl: waBaseUrl ?? "", apiKey: waApiKey ?? "", instanceName: waInstanceName ?? "" });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [connState, setConnState] = useState<ConnectionState>((waStatus as ConnectionState) ?? "idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [createOk, setCreateOk] = useState<boolean | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webhookUrl = getWebhookUrl(userId);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (qrRefreshTimer.current) { clearTimeout(qrRefreshTimer.current); qrRefreshTimer.current = null; }
    setPollingActive(false);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const checkState = useCallback(async () => {
    try {
      const result = await api.admin.getState(userId);
      const st = (result.state ?? "idle") as ConnectionState;
      setConnState(st);
      setStatusMsg(result.message);
      if (st === "open") {
        stopPolling();
        setStep("connected");
        setQrCode(null);
        onConnected?.();
      }
    } catch {}
  }, [userId, stopPolling, onConnected]);

  const startPolling = useCallback(() => {
    stopPolling();
    setPollingActive(true);
    pollTimer.current = setInterval(checkState, 4000);
  }, [checkState, stopPolling]);

  const handleSave = async () => {
    if (!form.baseUrl || !form.apiKey || !form.instanceName) return;
    setSaving(true);
    try {
      await api.admin.saveWhatsApp(userId, {
        provider: "evolution",
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        instanceName: form.instanceName,
      });
      const state = await api.admin.getState(userId);
      const st = (state.state ?? "idle") as ConnectionState;
      setConnState(st);
      setStatusMsg(state.message);
      if (st === "open") {
        setStep("connected");
        onConnected?.();
      } else if (st === "not_found") {
        setStep("create");
      } else {
        setStep("create");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInstance = async () => {
    setCreating(true);
    setCreateMsg("");
    setCreateOk(null);
    try {
      const result = await api.admin.createInstance(userId, webhookUrl);
      setCreateOk(result.success);
      setCreateMsg(result.message);
      if (result.success) {
        setTimeout(() => fetchQr(), 1200);
      }
    } finally {
      setCreating(false);
    }
  };

  const fetchQr = useCallback(async () => {
    setQrLoading(true);
    setQrError("");
    try {
      const result = await api.admin.getQr(userId);
      if (result.state === "open") {
        setStep("connected");
        stopPolling();
        onConnected?.();
        return;
      }
      if (result.success && result.qrCode) {
        setQrCode(result.qrCode);
        setStep("qr");
        startPolling();
        qrRefreshTimer.current = setTimeout(() => {
          if (step === "qr") fetchQr();
        }, 45000);
      } else {
        setQrError(result.message);
        if (step !== "qr") setStep("create");
      }
    } finally {
      setQrLoading(false);
    }
  }, [userId, step, stopPolling, startPolling, onConnected]);

  const handleSetWebhook = async () => {
    await api.admin.setWebhook(userId, webhookUrl);
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stateConfig: Record<ConnectionState, { label: string; color: string; bg: string; border: string }> = {
    open:         { label: "متصل",               color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    connecting:   { label: "جاري الاتصال…",     color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-500/10",    border: "border-blue-500/20" },
    close:        { label: "غير متصل",           color: "text-amber-600 dark:text-amber-300",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
    idle:         { label: "لم يُعد بعد",        color: "text-muted-foreground",                bg: "bg-muted/40",       border: "border-border" },
    not_found:    { label: "Instance غير موجود", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10",  border: "border-orange-500/20" },
    error:        { label: "خطأ",                color: "text-red-600 dark:text-red-400",        bg: "bg-red-500/10",     border: "border-red-500/20" },
    timeout:      { label: "انتهت المهلة",       color: "text-red-600 dark:text-red-400",        bg: "bg-red-500/10",     border: "border-red-500/20" },
    auth_error:   { label: "API Key خاطئ",       color: "text-red-600 dark:text-red-400",        bg: "bg-red-500/10",     border: "border-red-500/20" },
  };
  const sc = stateConfig[connState] ?? stateConfig.idle;

  const steps: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: "config",    label: "إعداد الخادم", icon: Settings },
    { id: "create",    label: "إنشاء Instance", icon: Zap },
    { id: "qr",        label: "ربط الرقم",     icon: QrCode },
    { id: "connected", label: "متصل",          icon: CheckCircle2 },
  ];
  const stepIdx = steps.findIndex(s => s.id === step);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = s.id === step;
          const done = i < stepIdx;
          return (
            <div key={s.id} className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                ${active ? "bg-primary text-primary-foreground shadow-sm" : done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            </div>
          );
        })}
      </div>

      {step === "config" && (
        <div className="space-y-5">
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700 space-y-1">
                <p className="font-semibold">كيفية الحصول على البيانات من Evolution API:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>افتح لوحة تحكم Evolution API الخاصة بك</li>
                  <li>انسخ رابط الخادم (Base URL) — مثال: <span className="font-mono bg-blue-100 px-1 rounded">https://evo.myserver.com</span></li>
                  <li>انسخ الـ Global API Key من الإعدادات</li>
                  <li>اختر اسماً للـ Instance — مثال: <span className="font-mono bg-blue-100 px-1 rounded">store-whatsapp</span></li>
                </ol>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Base URL <span className="text-xs text-muted-foreground font-normal">رابط خادم Evolution</span>
              </label>
              <input
                data-testid="input-evo-baseurl"
                value={form.baseUrl}
                onChange={e => setForm(p => ({ ...p, baseUrl: e.target.value.trim() }))}
                placeholder="https://your-evolution-server.com"
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring placeholder:font-sans"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Global API Key
              </label>
              <input
                data-testid="input-evo-apikey"
                type="password"
                value={form.apiKey}
                onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="••••••••••••••••••••••••••••"
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Instance Name <span className="text-xs text-muted-foreground font-normal">اسم الحساب</span>
              </label>
              <input
                data-testid="input-evo-instance"
                value={form.instanceName}
                onChange={e => setForm(p => ({ ...p, instanceName: e.target.value.trim() }))}
                placeholder="my-store"
                dir="ltr"
                className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">حروف وأرقام وشُرطة فقط — مثال: store1 أو ahmed-shop</p>
            </div>
          </div>

          <button
            data-testid="btn-save-evo-config"
            onClick={handleSave}
            disabled={saving || !form.baseUrl || !form.apiKey || !form.instanceName}
            className="w-full h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الحفظ والتحقق…</> : <><Check className="w-4 h-4" />حفظ والمتابعة</>}
          </button>
        </div>
      )}

      {step === "create" && (
        <div className="space-y-5">
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${sc.border} ${sc.bg}`}>
            <div className="w-10 h-10 rounded-full border-2 border-current flex items-center justify-center shrink-0">
              {connState === "not_found"
                ? <XCircle className={`w-5 h-5 ${sc.color}`} />
                : connState === "open"
                ? <CheckCircle2 className={`w-5 h-5 ${sc.color}`} />
                : <AlertCircle className={`w-5 h-5 ${sc.color}`} />}
            </div>
            <div>
              <p className={`font-semibold text-sm ${sc.color}`}>{sc.label}</p>
              <p className={`text-xs mt-0.5 ${sc.color} opacity-80`}>{statusMsg || "تحقق من حالة الاتصال"}</p>
            </div>
          </div>

          {createMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-xl border text-sm ${createOk ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"}`}>
              {createOk ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              {createMsg}
            </div>
          )}

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/20">
              <Info className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">رابط الـ Webhook الخاص بهذا المستخدم</p>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-card rounded-lg border border-amber-200 font-mono text-xs break-all" dir="ltr">
                  {webhookUrl}
                </div>
                <button
                  onClick={handleCopyWebhook}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all shrink-0 ${copied ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-card border-amber-200 text-amber-700 hover:bg-amber-500/10"}`}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "تم!" : "نسخ"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              data-testid="btn-create-instance"
              onClick={handleCreateInstance}
              disabled={creating}
              className="w-full h-11 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {creating ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الإنشاء…</> : <><Zap className="w-4 h-4" />إنشاء Instance الآن</>}
            </button>

            <button
              data-testid="btn-get-qr"
              onClick={fetchQr}
              disabled={qrLoading}
              className="w-full h-11 flex items-center justify-center gap-2 bg-sidebar text-sidebar-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
            >
              {qrLoading ? <><Loader2 className="w-4 h-4 animate-spin" />جاري جلب QR…</> : <><QrCode className="w-4 h-4" />Instance موجود — اجلب QR Code</>}
            </button>
          </div>

          {qrError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />{qrError}
            </div>
          )}

          <button onClick={() => setStep("config")} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            ← العودة لتعديل الإعدادات
          </button>
        </div>
      )}

      {step === "qr" && (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
              <Smartphone className="w-4 h-4 text-primary" />
              امسح QR Code بتطبيق واتساب
            </div>
            <p className="text-xs text-muted-foreground">افتح واتساب → الإعدادات → الأجهزة المرتبطة → ربط جهاز</p>
          </div>

          <div className="flex justify-center">
            <div className="relative">
              {qrCode ? (
                <div className="p-4 bg-card rounded-2xl border-2 border-border shadow-md inline-block">
                  <img src={qrCode} alt="QR Code" className="w-56 h-56 object-contain" />
                </div>
              ) : (
                <div className="w-64 h-64 rounded-2xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
              {pollingActive && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-primary text-primary-foreground text-[10px] font-semibold px-3 py-1 rounded-full shadow-sm">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  يتحقق من الاتصال…
                </div>
              )}
            </div>
          </div>

          <div className="bg-muted/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">خطوات المسح:</p>
            <ol className="space-y-1 text-xs text-muted-foreground">
              {["افتح واتساب على هاتفك", "اضغط على ⋮ (النقاط الثلاث) ← الأجهزة المرتبطة", "اضغط ربط جهاز", "وجّه الكاميرا نحو QR Code أعلاه"].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {qrError && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0" />{qrError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              data-testid="btn-refresh-qr"
              onClick={fetchQr}
              disabled={qrLoading}
              className="flex-1 h-10 flex items-center justify-center gap-2 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? "animate-spin" : ""}`} />
              تحديث QR Code
            </button>
            <button
              data-testid="btn-check-status"
              onClick={checkState}
              className="flex-1 h-10 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/90 transition-all"
            >
              <Wifi className="w-3.5 h-3.5" />
              التحقق من الاتصال
            </button>
          </div>

          <div className="text-center">
            <p className="text-[11px] text-muted-foreground">QR Code ينتهي بعد ~45 ثانية — اضغط تحديث إذا انتهى</p>
          </div>
        </div>
      )}

      {step === "connected" && (
        <div className="space-y-5">
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">واتساب متصل بنجاح!</h3>
              <p className="text-sm text-muted-foreground mt-1">الوكيل الآن يستقبل الرسائل ويرد عليها تلقائياً</p>
            </div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-emerald-800">معلومات الاتصال:</p>
            <div className="space-y-2 text-xs text-emerald-700">
              <div className="flex justify-between">
                <span className="text-emerald-600">الخادم</span>
                <span className="font-mono truncate max-w-48">{form.baseUrl || waBaseUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-600">Instance</span>
                <span className="font-mono">{form.instanceName || waInstanceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-600">Webhook</span>
                <span className="font-mono truncate max-w-48 text-[10px]">{webhookUrl}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={checkState}
              className="h-10 flex items-center justify-center gap-2 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />التحقق من الحالة
            </button>
            <button
              onClick={handleSetWebhook}
              className="h-10 flex items-center justify-center gap-2 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />تحديث Webhook
            </button>
          </div>

          <button
            onClick={() => { setStep("config"); setConnState("idle"); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            إعادة الإعداد من البداية
          </button>
        </div>
      )}
    </div>
  );
}
