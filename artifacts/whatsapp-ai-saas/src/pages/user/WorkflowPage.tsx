import { useState, useRef, useCallback, useEffect } from "react";
import {
  X, Settings, Info, Zap, GitBranch, Brain, Bot, Wrench, Send,
  Database, Search, Save, CheckCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CANVAS_W = 1650;
const CANVAS_H = 560;
const NW = 186;
const NH = 70;

type NodeType = "trigger" | "process" | "ai" | "action" | "info";

type SettingControl =
  | { type: "info"; label: string; value: string }
  | { type: "toggle"; key: string; label: string; description?: string }
  | { type: "slider"; key: string; label: string; min: number; max: number; step?: number; unit?: string }
  | { type: "select"; key: string; label: string; options: { value: string; label: string }[] }
  | { type: "textarea"; key: string; label: string; placeholder?: string; rows?: number };

interface WorkflowNode {
  id: string;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  type: NodeType;
  description: string;
  controls: SettingControl[];
  badge?: string;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

const nodeColor: Record<NodeType, { bg: string; border: string; iconBg: string; accent: string }> = {
  trigger: { bg: "#16a34a", border: "#15803d", iconBg: "#dcfce7", accent: "#22c55e" },
  process: { bg: "#7c3aed", border: "#6d28d9", iconBg: "#ede9fe", accent: "#a78bfa" },
  ai:      { bg: "#dc2626", border: "#b91c1c", iconBg: "#fee2e2", accent: "#f87171" },
  action:  { bg: "#0891b2", border: "#0e7490", iconBg: "#cffafe", accent: "#22d3ee" },
  info:    { bg: "#d97706", border: "#b45309", iconBg: "#fef3c7", accent: "#fbbf24" },
};

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
  const dx = (toLeft.x - fromRight.x) * 0.55;
  const cp1 = { x: fromRight.x + dx, y: fromRight.y };
  const cp2 = { x: toLeft.x - dx, y: toLeft.y };
  const path = `M ${fromRight.x} ${fromRight.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toLeft.x} ${toLeft.y}`;
  const isDashed = edge.style === "dashed";
  const midX = (fromRight.x + toLeft.x) / 2;
  const midY = (fromRight.y + toLeft.y) / 2 - 10;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={isDashed ? "#94a3b8" : "#64748b"}
        strokeWidth={isDashed ? 1.5 : 2}
        strokeDasharray={isDashed ? "6,4" : undefined}
        markerEnd="url(#arrowUser)"
      />
      {edge.label && (
        <>
          <rect x={midX - 20} y={midY - 9} width={40} height={18} rx={9} fill="#f1f5f9" stroke="#e2e8f0" />
          <text x={midX} y={midY + 4} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="sans-serif">{edge.label}</text>
        </>
      )}
    </g>
  );
}

function NodeCard({
  node, selected, onClick, liveValues,
}: {
  node: WorkflowNode;
  selected: boolean;
  onClick: () => void;
  liveValues: Record<string, unknown>;
}) {
  const colors = nodeColor[node.type];

  const editableKeys = node.controls
    .filter((c) => c.type !== "info")
    .map((c) => (c as { key: string }).key);

  const hasEditable = editableKeys.length > 0;

  return (
    <g transform={`translate(${node.x}, ${node.y})`} onClick={onClick} style={{ cursor: "pointer" }}>
      <rect
        width={NW} height={NH} rx={10}
        fill="white"
        stroke={selected ? colors.border : "#e2e8f0"}
        strokeWidth={selected ? 2.5 : 1.5}
        filter="url(#nodeShadow)"
      />
      <rect width={NW} height={3.5} rx={2} fill={colors.bg} />

      <rect x={10} y={13} width={34} height={34} rx={8} fill={colors.bg} />
      <foreignObject x={10} y={13} width={34} height={34}>
        <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: colors.iconBg }}>
          {node.icon}
        </div>
      </foreignObject>

      <foreignObject x={52} y={9} width={NW - 60} height={NH - 10}>
        <div style={{ fontFamily: "sans-serif", direction: "rtl", paddingRight: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", lineHeight: 1.35, whiteSpace: "normal" }}>{node.title}</div>
          <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 3 }}>{node.subtitle}</div>
          {node.badge && (
            <div style={{
              display: "inline-block", marginTop: 4, fontSize: 8,
              background: colors.bg, color: "white",
              padding: "1px 6px", borderRadius: 99, fontWeight: 600,
            }}>{node.badge}</div>
          )}
        </div>
      </foreignObject>

      {hasEditable && (
        <circle cx={NW - 10} cy={10} r={4.5} fill={colors.accent} />
      )}

      {selected && (
        <rect width={NW} height={NH} rx={10} fill="none" stroke={colors.border} strokeWidth={2.5} strokeDasharray="5,3" opacity={0.5} />
      )}
    </g>
  );
}

type UserSettings = Awaited<ReturnType<typeof api.user.settings>>;

function SettingsPanel({
  node,
  settings,
  onClose,
  onSave,
  isSaving,
}: {
  node: WorkflowNode;
  settings: UserSettings;
  onClose: () => void;
  onSave: (updates: Partial<UserSettings>) => void;
  isSaving: boolean;
}) {
  const colors = nodeColor[node.type];
  const [localValues, setLocalValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    node.controls.forEach((c) => {
      if (c.type !== "info" && "key" in c) {
        init[c.key] = (settings as unknown as Record<string, unknown>)[c.key];
      }
    });
    return init;
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (key: string, val: unknown) => {
    setLocalValues((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    onSave(localValues as Partial<UserSettings>);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="w-[340px] shrink-0 h-full bg-card border-r border-border flex flex-col shadow-2xl overflow-hidden" dir="rtl">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-3 shrink-0" style={{ background: colors.bg }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/20">
          <span className="text-white">{node.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm leading-tight">{node.title}</p>
          <p className="text-white/70 text-[11px]">{node.subtitle}</p>
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors shrink-0">
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-muted/50 rounded-xl p-3.5 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Info size={13} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">وصف المرحلة</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">{node.description}</p>
        </div>

        {node.controls.map((ctrl, i) => {
          if (ctrl.type === "info") {
            return (
              <div key={i} className="flex items-start justify-between gap-3 bg-card border border-border rounded-lg p-3">
                <span className="text-[11px] font-medium text-muted-foreground shrink-0">{ctrl.label}</span>
                <span className="text-[11px] text-foreground/80 font-mono bg-muted px-2 py-0.5 rounded border border-border text-left break-all">{ctrl.value}</span>
              </div>
            );
          }

          if (ctrl.type === "toggle") {
            const val = localValues[ctrl.key] as boolean ?? false;
            return (
              <div key={ctrl.key} className="bg-card border border-border rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-foreground/80">{ctrl.label}</p>
                    {ctrl.description && <p className="text-[11px] text-muted-foreground mt-0.5">{ctrl.description}</p>}
                  </div>
                  <button
                    onClick={() => set(ctrl.key, !val)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${val ? "bg-green-500" : "bg-muted"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${val ? "translate-x-0.5" : "translate-x-[22px]"}`} />
                  </button>
                </div>
              </div>
            );
          }

          if (ctrl.type === "slider") {
            const val = localValues[ctrl.key] as number ?? ctrl.min;
            return (
              <div key={ctrl.key} className="bg-card border border-border rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-foreground/80">{ctrl.label}</span>
                  <span className="text-[12px] font-bold text-foreground bg-muted px-2 py-0.5 rounded-lg">
                    {val}{ctrl.unit ?? ""}
                  </span>
                </div>
                <input
                  type="range" min={ctrl.min} max={ctrl.max} step={ctrl.step ?? 1} value={val}
                  onChange={(e) => set(ctrl.key, Number(e.target.value))}
                  className="w-full accent-violet-600"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>{ctrl.min}{ctrl.unit ?? ""}</span>
                  <span>{ctrl.max}{ctrl.unit ?? ""}</span>
                </div>
              </div>
            );
          }

          if (ctrl.type === "select") {
            const val = localValues[ctrl.key] as string ?? ctrl.options[0]?.value;
            return (
              <div key={ctrl.key} className="bg-card border border-border rounded-xl p-3.5">
                <p className="text-[12px] font-semibold text-foreground/80 mb-2">{ctrl.label}</p>
                <select
                  value={val}
                  onChange={(e) => set(ctrl.key, e.target.value)}
                  className="w-full text-[12px] border border-border rounded-lg px-3 py-2 bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ctrl.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (ctrl.type === "textarea") {
            const val = localValues[ctrl.key] as string ?? "";
            return (
              <div key={ctrl.key} className="bg-card border border-border rounded-xl p-3.5">
                <p className="text-[12px] font-semibold text-foreground/80 mb-2">{ctrl.label}</p>
                <textarea
                  value={val ?? ""}
                  onChange={(e) => set(ctrl.key, e.target.value)}
                  placeholder={ctrl.placeholder}
                  rows={ctrl.rows ?? 4}
                  className="w-full text-[12px] border border-border rounded-lg px-3 py-2 bg-muted/40 text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            );
          }

          return null;
        })}
      </div>

      {node.controls.some((c) => c.type !== "info") && (
        <div className="p-4 border-t border-border bg-muted/50 shrink-0">
          <button
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              saved
                ? "bg-green-500 text-white"
                : dirty
                ? "bg-violet-600 hover:bg-violet-700 text-white shadow-md"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saved ? "تم الحفظ!" : isSaving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>
      )}
    </div>
  );
}

const NODES: WorkflowNode[] = [
  {
    id: "trigger",
    x: 50, y: 245,
    title: "رسالة واتساب",
    subtitle: "Evolution API Webhook",
    icon: <Zap size={17} />, type: "trigger",
    description: "يستقبل الوكيل الرسائل الواردة من واتساب عبر Evolution API ويُفعّل مسار المعالجة فوراً.",
    controls: [
      { type: "info", label: "بروتوكول الاستقبال", value: "MESSAGES_UPSERT" },
      { type: "info", label: "نافذة مضادة التكرار", value: "60 ثانية" },
      { type: "info", label: "أنواع الرسائل", value: "نص، صوت، صور، مستندات" },
    ],
  },
  {
    id: "buffer",
    x: 280, y: 245,
    title: "تجميع الرسائل",
    subtitle: "Message Aggregation Buffer",
    icon: <GitBranch size={17} />, type: "process",
    description: "يجمع رسائل العميل المتتالية في رسالة واحدة قبل إرسالها للذكاء الاصطناعي — يمنع ردوداً ناقصة على رسائل مقطّعة.",
    controls: [
      {
        type: "slider", key: "messageAggregationDelay",
        label: "وقت الانتظار",
        min: 1, max: 60, unit: "ث",
      },
      { type: "info", label: "المنطق", value: "ينتظر توقف الكتابة ثم يُرسل كل الرسائل دفعة واحدة" },
    ],
  },
  {
    id: "context",
    x: 510, y: 245,
    title: "بناء السياق",
    subtitle: "Base Context Builder",
    icon: <Database size={17} />, type: "info",
    description: "يُحضّر المعلومات الأساسية للمتجر ويضخّها في مدخل الوكيل — هذه المعلومات ثابتة في كل رسالة.",
    controls: [
      { type: "info", label: "اسم المتجر + الوصف", value: "✓ مُدرج دائماً" },
      { type: "info", label: "سياسة الاسترجاع والاستبدال", value: "✓ مُدرجة دائماً" },
      { type: "info", label: "تكاليف التوصيل", value: "✓ مُدرجة دائماً" },
      { type: "info", label: "ساعات العمل / الفروع / البنك", value: "✗ محذوف (غير ضروري في كل رسالة)" },
      { type: "info", label: "قائمة المنتجات الكاملة", value: "✗ محذوفة (تُعاد عبر البحث الدلالي)" },
    ],
  },
  {
    id: "rag",
    x: 740, y: 245,
    title: "البحث الدلالي",
    subtitle: "Vector Search (RAG)",
    icon: <Search size={17} />, type: "process",
    description: "يبحث في قاعدة تضمينات المنتجات وقاعدة المعرفة للعثور على أكثر المعلومات صلة بسؤال العميل.",
    controls: [
      { type: "info", label: "مصدر المنتجات", value: "تضمينات Cohere — أفضل 5 نتائج" },
      { type: "info", label: "قاعدة المعرفة", value: "تضمينات Cohere — أفضل 5 نتائج" },
      { type: "info", label: "الكوبونات", value: "استعلام مباشر — عند ذكرها فقط" },
      { type: "info", label: "آخر رسائل المحادثة", value: "آخر 15 رسالة" },
    ],
  },
  {
    id: "ai",
    x: 970, y: 245,
    title: "نموذج الذكاء الاصطناعي",
    subtitle: "LLM Generation (Groq)",
    icon: <Bot size={17} />, type: "ai",
    description: "يُولّد الرد المناسب بناءً على سياق المتجر، تاريخ المحادثة، والإعدادات المحددة لشخصية الوكيل.",
    controls: [
      { type: "slider", key: "maxTokens", label: "الحد الأقصى للتوكن", min: 200, max: 4000, step: 100, unit: " توكن" },
      {
        type: "select", key: "currency", label: "العملة",
        options: [
          { value: "YER", label: "ريال يمني" },
          { value: "SAR", label: "ريال سعودي" },
          { value: "AED", label: "درهم إماراتي" },
          { value: "USD", label: "دولار أمريكي" },
        ],
      },
      {
        type: "select", key: "dialect", label: "اللهجة",
        options: [
          { value: "saudi", label: "سعودي" },
          { value: "hadrami", label: "حضرمي" },
          { value: "msa", label: "عربي فصيح" },
        ],
      },
      { type: "slider", key: "dialectStrength", label: "قوة اللهجة", min: 1, max: 10 },
      {
        type: "select", key: "style", label: "أسلوب التواصل",
        options: [
          { value: "friendly", label: "ودّي" },
          { value: "professional", label: "رسمي" },
          { value: "casual", label: "غير رسمي" },
          { value: "enthusiastic", label: "متحمّس" },
        ],
      },
      {
        type: "select", key: "tone", label: "نبرة الصوت",
        options: [
          { value: "warm", label: "دافئة" },
          { value: "neutral", label: "محايدة" },
          { value: "energetic", label: "نشطة" },
          { value: "calm", label: "هادئة" },
        ],
      },
      { type: "slider", key: "persuasion", label: "مستوى الإقناع", min: 1, max: 10 },
      { type: "slider", key: "formality", label: "مستوى الرسمية", min: 1, max: 10 },
      {
        type: "select", key: "emojiLevel", label: "مستوى الرموز التعبيرية",
        options: [
          { value: "none", label: "بدون" },
          { value: "low", label: "قليل" },
          { value: "medium", label: "متوسط" },
          { value: "high", label: "كثير" },
        ],
      },
      {
        type: "select", key: "replyLength", label: "طول الرد",
        options: [
          { value: "short", label: "قصير" },
          { value: "medium", label: "متوسط" },
          { value: "long", label: "مفصّل" },
        ],
      },
      {
        type: "textarea", key: "systemPrompt",
        label: "تعليمات إضافية للوكيل",
        placeholder: "أضف تعليمات خاصة لشخصية وكيلك (اختياري)...",
        rows: 4,
      },
    ],
  },
  {
    id: "tools",
    x: 1200, y: 245,
    title: "أدوات الوكيل",
    subtitle: "Tool Call Dispatch",
    icon: <Wrench size={17} />, type: "process",
    description: "يُنفّذ الإجراءات المنظّمة التي يطلبها الذكاء الاصطناعي — تسجيل الطلبات وطلبات الاسترجاع.",
    controls: [
      {
        type: "toggle", key: "orderSystemEnabled",
        label: "نظام الطلبات",
        description: "يُمكّن تسجيل الطلبات ومتابعتها",
      },
      {
        type: "toggle", key: "returnSystemEnabled",
        label: "نظام الاسترجاع",
        description: "يُمكّن قبول طلبات الإرجاع والاستبدال",
      },
      { type: "info", label: "أداة submit_order", value: "يحفظ الطلب ويُرسل للمراجعة" },
      { type: "info", label: "أداة request_return", value: "يسجّل طلب إرجاع أو استبدال" },
    ],
  },
  {
    id: "output",
    x: 1430, y: 245,
    title: "رد واتساب",
    subtitle: "Evolution API — Send Reply",
    icon: <Send size={17} />, type: "action",
    description: "يُرسل الرد المُولَّد للعميل عبر واتساب مع تأثير 'جاري الكتابة' لإيحاء طبيعي.",
    controls: [
      {
        type: "slider", key: "responseDelay",
        label: "تأخير الرد",
        min: 0, max: 15, unit: "ث",
      },
      { type: "info", label: "تأثير الكتابة", value: "1.2 ثانية composing قبل الإرسال" },
      { type: "info", label: "حفظ الرسائل", value: "يُحفظ في السجلات تلقائياً" },
    ],
  },
];

const EDGES: Edge[] = [
  { from: "trigger", to: "buffer" },
  { from: "buffer", to: "context" },
  { from: "context", to: "rag" },
  { from: "rag", to: "ai" },
  { from: "ai", to: "tools" },
  { from: "tools", to: "output" },
];

export default function UserWorkflowPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<WorkflowNode | null>(null);
  const [scale, setScale] = useState(0.9);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.user.settings(),
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<UserSettings>) => api.user.updateSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات الوكيل بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل الحفظ، حاول مرة أخرى", variant: "destructive" });
    },
  });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(1.6, Math.max(0.3, s - e.deltaY * 0.001)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("g")) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  }, [isDragging]);

  const handleMouseUp = () => setIsDragging(false);

  const liveValues = settings ? (settings as unknown as Record<string, unknown>) : ({} as Record<string, unknown>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        جارٍ التحميل...
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden" dir="rtl">
      {selected && settings && (
        <SettingsPanel
          node={selected}
          settings={settings}
          onClose={() => setSelected(null)}
          onSave={(updates) => mutation.mutate(updates)}
          isSaving={mutation.isPending}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-sm">مسار عمل الوكيل</h2>
              <p className="text-[11px] text-muted-foreground">اضغط على أي مرحلة لعرض إعداداتها وتعديلها</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              الوكيل نشط
            </div>
            <button
              onClick={() => { setScale(0.9); setOffset({ x: 0, y: 0 }); }}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-muted hover:bg-muted text-muted-foreground font-medium transition-colors"
            >
              إعادة ضبط
            </button>
            <button
              onClick={() => setScale((s) => Math.min(1.6, s + 0.1))}
              className="w-7 h-7 rounded-lg bg-muted hover:bg-muted text-foreground/80 font-bold text-sm flex items-center justify-center"
            >+</button>
            <button
              onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}
              className="w-7 h-7 rounded-lg bg-muted hover:bg-muted text-foreground/80 font-bold text-sm flex items-center justify-center"
            >−</button>
            <span className="text-[11px] text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
          </div>
        </div>

        <div
          className="flex-1 overflow-hidden relative select-none"
          style={{
            background: "#f8fafc",
            backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          ref={canvasRef}
        >
          <div
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "0 0",
              width: CANVAS_W,
              height: CANVAS_H,
            }}
          >
            <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
              <defs>
                <marker id="arrowUser" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                </marker>
                <filter id="nodeShadow" x="-10%" y="-10%" width="130%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.07" />
                </filter>
              </defs>
              {EDGES.map((edge) => (
                <EdgePath key={`${edge.from}-${edge.to}`} edge={edge} />
              ))}
            </svg>

            <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", top: 0, left: 0 }}>
              <defs>
                <filter id="nodeShadow" x="-10%" y="-10%" width="130%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.07" />
                </filter>
              </defs>
              {NODES.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  selected={selected?.id === node.id}
                  onClick={() => setSelected(selected?.id === node.id ? null : node)}
                  liveValues={liveValues}
                />
              ))}
            </svg>
          </div>
        </div>

        <div className="px-5 py-2.5 border-t border-border bg-card flex items-center gap-6 text-[11px] text-muted-foreground shrink-0">
          {(Object.entries(nodeColor) as [NodeType, typeof nodeColor[NodeType]][]).slice(0, 4).map(([type, c]) => {
            const labels: Record<string, string> = { trigger: "محفّز", process: "معالجة", ai: "ذكاء اصطناعي", action: "إجراء", info: "معلومات" };
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c.bg }} />
                <span>{labels[type]}</span>
              </div>
            );
          })}
          <div className="mr-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
            <span>الدوائر الصغيرة = إعدادات قابلة للتعديل</span>
          </div>
        </div>
      </div>
    </div>
  );
}
