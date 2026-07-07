import { useState, useRef, useEffect } from "react";
import { X, Settings, ChevronLeft, Info, Zap, GitBranch, Mic, Shield, Brain, Bot, Wrench, Send, Image, Filter, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CANVAS_W = 1780;
const CANVAS_H = 720;
const NW = 190;
const NH = 72;

type NodeType = "trigger" | "router" | "process" | "ai" | "action" | "conditional";
type SettingType = "info" | "text" | "number" | "toggle" | "select";

interface NodeSetting {
  key: string;
  label: string;
  type: SettingType;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  description?: string;
  editable?: boolean;
}

interface WorkflowNode {
  id: string;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  type: NodeType;
  description: string;
  settings?: NodeSetting[];
  badge?: string;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

const nodeColor: Record<NodeType, { bg: string; border: string; icon: string; text: string }> = {
  trigger:     { bg: "#16a34a", border: "#15803d", icon: "#dcfce7", text: "#fff" },
  router:      { bg: "#2563eb", border: "#1d4ed8", icon: "#dbeafe", text: "#fff" },
  process:     { bg: "#6d28d9", border: "#5b21b6", icon: "#ede9fe", text: "#fff" },
  ai:          { bg: "#dc2626", border: "#b91c1c", icon: "#fee2e2", text: "#fff" },
  action:      { bg: "#0891b2", border: "#0e7490", icon: "#cffafe", text: "#fff" },
  conditional: { bg: "#d97706", border: "#b45309", icon: "#fef3c7", text: "#fff" },
};

const NODES: WorkflowNode[] = [
  {
    id: "trigger", x: 60, y: 324,
    title: "استقبال رسالة واتساب", subtitle: "WhatsApp Webhook",
    icon: <Zap size={16} />, type: "trigger",
    description: "يستقبل الوكيل الرسائل الواردة من واتساب عبر Evolution API. يتم إرسال بيانات كل رسالة إلى /api/webhook/evolution/:userId فور وصولها.",
    settings: [
      { key: "url", label: "رابط الـ Webhook", type: "info", value: "/api/webhook/evolution/{userId}" },
      { key: "events", label: "الأحداث المدعومة", type: "info", value: "MESSAGES_UPSERT" },
      { key: "response", label: "الاستجابة الفورية", type: "info", value: "{ received: true } — بدون انتظار" },
    ],
  },
  {
    id: "router", x: 310, y: 324,
    title: "كشف نوع الرسالة", subtitle: "Message Router",
    icon: <GitBranch size={16} />, type: "router",
    description: "يحدد نوع الرسالة الواردة ويوجهها للمسار الصحيح. الأنواع المدعومة: نص عادي، رسالة صوتية (PTT/Audio)، صورة أو مستند.",
    settings: [
      { key: "text", label: "نص عادي", type: "info", value: "conversation / extendedTextMessage" },
      { key: "voice", label: "رسالة صوتية", type: "info", value: "audioMessage / pttMessage" },
      { key: "media", label: "وسائط", type: "info", value: "imageMessage / documentMessage" },
      { key: "fromMe", label: "رسائل الوكيل", type: "info", value: "تُتجاهل تلقائياً (fromMe: true)" },
    ],
  },
  {
    id: "voice", x: 560, y: 160,
    title: "تفريغ الصوت", subtitle: "Groq Whisper",
    icon: <Mic size={16} />, type: "process",
    description: "عند استقبال رسالة صوتية، يتم تحميل ملف الصوت من Evolution API ثم إرساله لنموذج Whisper في Groq لتحويله إلى نص عربي.",
    badge: "صوت فقط",
    settings: [
      { key: "model", label: "نموذج التفريغ", type: "info", value: "whisper-large-v3-turbo" },
      { key: "language", label: "اللغة المستهدفة", type: "info", value: "العربية (ar)" },
      { key: "fallback", label: "عند الفشل", type: "info", value: "إرسال رسالة عذر للعميل" },
      { key: "key_req", label: "المتطلبات", type: "info", value: "مفتاح Groq نشط" },
    ],
  },
  {
    id: "dedup", x: 560, y: 324,
    title: "فحص التكرار", subtitle: "Deduplication",
    icon: <Filter size={16} />, type: "process",
    description: "يتحقق من أن الرسالة لم تُعالَج مسبقاً خلال آخر 60 ثانية للحماية من إرسال ردود مكررة في حالة الأخطاء أو الإعادة.",
    settings: [
      { key: "window", label: "نافذة التكرار", type: "info", value: "60 ثانية" },
      { key: "key", label: "مفتاح الكشف", type: "info", value: "userId + هاتف + أول 200 حرف" },
      { key: "cleanup", label: "تنظيف الذاكرة", type: "info", value: "كل 30 ثانية تلقائياً" },
    ],
  },
  {
    id: "media", x: 560, y: 488,
    title: "فحص إيداع الوسائط", subtitle: "Media / Deposit",
    icon: <Image size={16} />, type: "conditional",
    description: "عند وصول صورة أو مستند، يتحقق إذا كان هناك طلب بحالة 'انتظار الدفع'. إذا كان كذلك، يُحفظ كسند إيداع وتُرسل رسالة تأكيد.",
    badge: "وسائط فقط",
    settings: [
      { key: "trigger", label: "يُفعَّل عند", type: "info", value: "وجود طلب pending_payment نشط" },
      { key: "action", label: "الإجراء", type: "info", value: "حفظ رابط الوسائط كسند إيداع" },
      { key: "reply", label: "الرد التلقائي", type: "info", value: "✅ تم استلام سند الإيداع" },
    ],
  },
  {
    id: "config", x: 810, y: 324,
    title: "تحميل إعدادات الوكيل", subtitle: "Agent Configuration",
    icon: <Settings size={16} />, type: "process",
    description: "يتحقق من أن الوكيل مفعّل للمستخدم ويحمّل إعداداته: مفتاح الذكاء الاصطناعي، تأخير الرد، إعدادات السلوك، وحالة اتصال واتساب.",
    settings: [
      { key: "agent_check", label: "فحص تفعيل الوكيل", type: "info", value: "agentEnabled = true مطلوب" },
      { key: "wa_check", label: "فحص واتساب", type: "info", value: "baseUrl + apiKey + instanceName" },
      { key: "pause_check", label: "فحص الإيقاف المؤقت", type: "info", value: "agentPaused — يحفظ الرسالة بدون رد" },
    ],
  },
  {
    id: "context", x: 1060, y: 170,
    title: "بناء السياق (RAG)", subtitle: "Vector Search + Context",
    icon: <Brain size={16} />, type: "process",
    description: "يجمع بيانات المتجر الكاملة (منتجات، كوبونات، ساعات العمل، الفروع، الحسابات البنكية) ويبحث في قاعدة المعرفة باستخدام Vector Search لإيجاد أكثر المعلومات صلة.",
    settings: [
      { key: "products", label: "المنتجات", type: "info", value: "الاسم، السعر، الكمية، الوحدة" },
      { key: "coupons", label: "الكوبونات", type: "info", value: "عند الطلب فقط (intent detection)" },
      { key: "vector", label: "البحث الدلالي", type: "info", value: "يتطلب مفتاح Cohere Embedding" },
      { key: "order_ctx", label: "سياق الطلب النشط", type: "info", value: "يمنع الوكيل من إعادة السؤال" },
      { key: "history", label: "تاريخ المحادثة", type: "info", value: "آخر 15 رسالة" },
    ],
  },
  {
    id: "ai", x: 1060, y: 360,
    title: "توليد الرد بالذكاء الاصطناعي", subtitle: "LLM Generation",
    icon: <Bot size={16} />, type: "ai",
    description: "يرسل النص للنموذج المحدد (Groq أو Gemini) مع System Prompt مفصّل يتضمن شخصية الوكيل، اللهجة، أسلوب المبيعات، والسياق الكامل للمتجر.",
    settings: [
      { key: "primary_key", label: "المفتاح الأساسي", type: "info", value: "chatKeyId في الإعدادات" },
      { key: "fallback", label: "مفاتيح الاحتياط", type: "info", value: "تجريب تلقائي عند الفشل" },
      { key: "tokens", label: "الحد الأقصى للتوكنز", type: "info", value: "1500 توكن لكل رد" },
      { key: "temp", label: "درجة الإبداع", type: "info", value: "0.3 (دقيق ومتحكم)" },
      { key: "tools", label: "أدوات الوكيل", type: "info", value: "submit_order, request_return" },
    ],
  },
  {
    id: "tools", x: 1060, y: 550,
    title: "معالجة أوامر الوكيل", subtitle: "Tool Call Dispatch",
    icon: <Wrench size={16} />, type: "process",
    description: "يعالج طلبات الأدوات التي أصدرها نموذج الذكاء الاصطناعي: حفظ الطلبات في قاعدة البيانات، تسجيل طلبات الإرجاع، وتحديث حالة الطلبات.",
    settings: [
      { key: "submit_order", label: "submit_order", type: "info", value: "حفظ طلب جديد / إضافة رقم الإيداع" },
      { key: "request_return", label: "request_return", type: "info", value: "تسجيل طلب إرجاع أو استبدال" },
    ],
  },
  {
    id: "send", x: 1360, y: 324,
    title: "إرسال الرد", subtitle: "Evolution API",
    icon: <Send size={16} />, type: "action",
    description: "يرسل الرد النصي للعميل عبر Evolution API مع تأثير 'جاري الكتابة...' لمدة 1.2 ثانية قبل الإرسال لإيحاء طبيعي.",
    settings: [
      { key: "typing", label: "تأثير الكتابة", type: "info", value: "1200ms composing قبل الإرسال" },
      { key: "save", label: "حفظ الرسالة", type: "info", value: "في جدول messages + تحديث المحادثة" },
      { key: "fallback_msg", label: "رسالة الفشل", type: "info", value: "شكراً لتواصلك معنا! سنرد قريباً." },
    ],
  },
  {
    id: "image", x: 1360, y: 520,
    title: "إرسال صورة المنتج", subtitle: "Product Image (اختياري)",
    icon: <Image size={16} />, type: "conditional",
    description: "إذا ذكر العميل منتجاً ولم تُرسل صورته مسبقاً في هذه المحادثة، يتم إرسال صورة المنتج تلقائياً بعد 800ms من الرد النصي.",
    badge: "اختياري",
    settings: [
      { key: "trigger", label: "يُفعَّل عند", type: "info", value: "ذكر منتج + وجود صورة + لم تُرسل مسبقاً" },
      { key: "delay", label: "التأخير", type: "info", value: "800ms بعد الرد النصي" },
      { key: "track", label: "تتبع الإرسال", type: "info", value: "sentImageProductIds في المحادثة" },
    ],
  },
  {
    id: "profile", x: 1360, y: 700,
    title: "تحديث ملف العميل", subtitle: "Profile Extractor",
    icon: <Shield size={16} />, type: "process",
    description: "بعد كل رد ناجح، يستخرج بيانات العميل (اسم، هاتف، عنوان) من المحادثة ويحدّث ملفه في قاعدة البيانات تلقائياً في الخلفية.",
    settings: [
      { key: "data", label: "البيانات المُستخرجة", type: "info", value: "الاسم، الهاتف، العنوان، تفضيلات الشراء" },
      { key: "mode", label: "طريقة التحديث", type: "info", value: "في الخلفية — لا تؤثر على سرعة الرد" },
    ],
  },
];

const EDGES: Edge[] = [
  { from: "trigger", to: "router" },
  { from: "router", to: "voice", label: "صوت", style: "dashed" },
  { from: "router", to: "dedup", label: "نص" },
  { from: "router", to: "media", label: "وسائط", style: "dashed" },
  { from: "voice", to: "dedup" },
  { from: "media", to: "dedup", style: "dashed" },
  { from: "dedup", to: "config" },
  { from: "config", to: "context" },
  { from: "config", to: "ai" },
  { from: "config", to: "tools" },
  { from: "context", to: "send" },
  { from: "ai", to: "send" },
  { from: "tools", to: "send" },
  { from: "send", to: "image", style: "dashed" },
  { from: "send", to: "profile", style: "dashed" },
];

function getNodeCenter(id: string): { x: number; y: number } {
  const node = NODES.find((n) => n.id === id);
  if (!node) return { x: 0, y: 0 };
  return { x: node.x + NW / 2, y: node.y + NH / 2 };
}

function EdgePath({ edge }: { edge: Edge }) {
  const from = getNodeCenter(edge.from);
  const to = getNodeCenter(edge.to);
  const fromRight = { x: from.x + NW / 2, y: from.y };
  const toLeft = { x: to.x - NW / 2, y: to.y };
  const dx = (toLeft.x - fromRight.x) * 0.5;
  const cp1 = { x: fromRight.x + dx, y: fromRight.y };
  const cp2 = { x: toLeft.x - dx, y: toLeft.y };
  const path = `M ${fromRight.x} ${fromRight.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toLeft.x} ${toLeft.y}`;
  const isDashed = edge.style === "dashed";
  const midX = (fromRight.x + toLeft.x) / 2;
  const midY = (fromRight.y + toLeft.y) / 2 - 8;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={isDashed ? "#94a3b8" : "#64748b"}
        strokeWidth={isDashed ? 1.5 : 2}
        strokeDasharray={isDashed ? "5,4" : undefined}
        markerEnd="url(#arrow)"
      />
      {edge.label && (
        <>
          <rect x={midX - 18} y={midY - 10} width={36} height={18} rx={9} fill="#f1f5f9" stroke="#e2e8f0" />
          <text x={midX} y={midY + 4} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="sans-serif">{edge.label}</text>
        </>
      )}
    </g>
  );
}

function NodeCard({ node, selected, onClick }: { node: WorkflowNode; selected: boolean; onClick: () => void }) {
  const colors = nodeColor[node.type];
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <rect
        width={NW} height={NH} rx={10}
        fill="white"
        stroke={selected ? colors.border : "#e2e8f0"}
        strokeWidth={selected ? 2.5 : 1.5}
        filter="url(#shadow)"
      />
      <rect width={NW} height={4} rx={2} fill={colors.bg} />
      <rect x={12} y={14} width={32} height={32} rx={8} fill={colors.bg} />
      <foreignObject x={12} y={14} width={32} height={32}>
        <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: colors.icon }}>
          {node.icon}
        </div>
      </foreignObject>
      <foreignObject x={52} y={10} width={130} height={52}>
        <div style={{ fontFamily: "sans-serif", direction: "rtl" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", lineHeight: 1.3, whiteSpace: "normal" }}>{node.title}</div>
          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>{node.subtitle}</div>
          {node.badge && (
            <div style={{ display: "inline-block", marginTop: 3, fontSize: 8, background: colors.bg, color: colors.icon, padding: "1px 6px", borderRadius: 99, fontWeight: 600 }}>
              {node.badge}
            </div>
          )}
        </div>
      </foreignObject>
      {selected && (
        <rect width={NW} height={NH} rx={10} fill="none" stroke={colors.border} strokeWidth={2.5} strokeDasharray="5,3" opacity={0.4} />
      )}
    </g>
  );
}

function SettingsPanel({ node, onClose }: { node: WorkflowNode; onClose: () => void }) {
  const colors = nodeColor[node.type];
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);

  const typeLabels: Record<NodeType, string> = {
    trigger: "محفّز",
    router: "موجّه",
    process: "معالجة",
    ai: "ذكاء اصطناعي",
    action: "إجراء",
    conditional: "شرطي",
  };

  const handleSave = () => {
    setSaved(true);
    toast({ title: "تم الحفظ", description: "تم تحديث الإعدادات بنجاح" });
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="w-96 h-full bg-card border-r border-border flex flex-col shadow-xl overflow-hidden" dir="rtl">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3" style={{ background: colors.bg }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.25)" }}>
          <span style={{ color: "#fff" }}>{node.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{node.title}</p>
          <p className="text-white/70 text-xs">{typeLabels[node.type]} — {node.subtitle}</p>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="bg-muted/50 rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Info size={14} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">وصف المرحلة</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{node.description}</p>
        </div>

        {node.settings && node.settings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Settings size={14} className="text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">الخصائص والإعدادات</span>
            </div>
            <div className="space-y-2">
              {node.settings.map((s) => (
                <div key={s.key} className="bg-card border border-border rounded-lg p-3 flex items-start justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground shrink-0">{s.label}</span>
                  <span className="text-xs text-foreground text-left font-mono bg-muted px-2 py-0.5 rounded border border-border break-all">{String(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-muted/40">
        <p className="text-[11px] text-muted-foreground text-center">
          هذه المرحلة محددة في كود الخادم (webhook.ts)
        </p>
      </div>
    </div>
  );
}

export default function WorkflowPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<WorkflowNode | null>(null);
  const [scale, setScale] = useState(0.85);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(1.5, Math.max(0.3, s - e.deltaY * 0.001)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest("g[data-node]")) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="flex h-full overflow-hidden" dir="rtl">
      {selected && (
        <SettingsPanel node={selected} onClose={() => setSelected(null)} />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
              <GitBranch size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm">مسار عمل الوكيل</h2>
              <p className="text-xs text-muted-foreground">اضغط على أي مرحلة لرؤية تفاصيلها</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">التكبير: {Math.round(scale * 100)}%</span>
            <button onClick={() => { setScale(0.85); setOffset({ x: 0, y: 0 }); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted text-muted-foreground font-medium transition-colors">
              إعادة ضبط
            </button>
            <button onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
              className="w-7 h-7 rounded-lg bg-muted hover:bg-muted text-muted-foreground font-bold text-sm flex items-center justify-center">+</button>
            <button onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}
              className="w-7 h-7 rounded-lg bg-muted hover:bg-muted text-muted-foreground font-bold text-sm flex items-center justify-center">−</button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative bg-[#f8fafc]"
          style={{ backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          ref={canvasRef}
        >
          <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "0 0", width: CANVAS_W, height: CANVAS_H }}>
            <svg
              width={CANVAS_W} height={CANVAS_H}
              style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                </marker>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.08" />
                </filter>
              </defs>
              {EDGES.map((edge) => (
                <EdgePath key={`${edge.from}-${edge.to}`} edge={edge} />
              ))}
            </svg>

            <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", top: 0, left: 0 }}>
              <defs>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.08" />
                </filter>
              </defs>
              {NODES.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  selected={selected?.id === node.id}
                  onClick={() => setSelected(selected?.id === node.id ? null : node)}
                />
              ))}
            </svg>
          </div>
        </div>

        <div className="px-5 py-2 border-t border-border bg-card flex items-center gap-6 text-xs text-muted-foreground shrink-0">
          {(Object.entries(nodeColor) as [NodeType, typeof nodeColor[NodeType]][]).map(([type, c]) => {
            const labels: Record<NodeType, string> = { trigger: "محفّز", router: "موجّه", process: "معالجة", ai: "ذكاء اصطناعي", action: "إجراء", conditional: "شرطي" };
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: c.bg }} />
                <span>{labels[type]}</span>
              </div>
            );
          })}
          <div className="mr-auto flex items-center gap-1.5">
            <span className="border-b-2 border-dashed border-slate-400 w-5 inline-block" />
            <span>مسار شرطي</span>
          </div>
        </div>
      </div>
    </div>
  );
}
