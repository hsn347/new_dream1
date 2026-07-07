import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageCircle, Search, Send, Loader2, RefreshCw,
  User, Bot, Pause, Play, ChevronDown, Users, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ──────────────────────────────────────────────────── */
interface AdminConv {
  id: number;
  userId: number;
  customerPhone: string;
  customerName?: string;
  status: string;
  lastMessage?: string;
  agentPaused: boolean;
  isGroup: boolean;
  avatarUrl?: string | null;
  updatedAt: string;
  userEmail: string;
  userName?: string;
}

interface Message {
  id: number;
  conversationId: number;
  from: "customer" | "agent";
  text: string;
  createdAt: string;
}

interface UserOption {
  id: number;
  email: string;
  name?: string;
}

/* ─── API helpers ────────────────────────────────────────────── */
async function fetchUsers(): Promise<UserOption[]> {
  const r = await fetch("/api/admin/users", { credentials: "include" });
  if (!r.ok) return [];
  const data = await r.json() as Array<{ id: number; email: string; name?: string }>;
  return data;
}

async function fetchConversations(userId?: number): Promise<AdminConv[]> {
  const url = userId ? `/api/admin/conversations?userId=${userId}` : "/api/admin/conversations";
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) return [];
  return r.json() as Promise<AdminConv[]>;
}

async function fetchMessages(convId: number): Promise<Message[]> {
  const r = await fetch(`/api/admin/conversations/${convId}/messages`, { credentials: "include" });
  if (!r.ok) return [];
  return r.json() as Promise<Message[]>;
}

async function injectMessage(convId: number, text: string): Promise<{ ok: boolean; sent: boolean }> {
  const r = await fetch(`/api/admin/conversations/${convId}/inject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text }),
  });
  return r.json() as Promise<{ ok: boolean; sent: boolean }>;
}

async function togglePause(convId: number): Promise<{ agentPaused: boolean }> {
  const r = await fetch(`/api/admin/conversations/${convId}/pause`, {
    method: "PATCH",
    credentials: "include",
  });
  return r.json() as Promise<{ agentPaused: boolean }>;
}

/* ─── Format helpers ─────────────────────────────────────────── */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "الآن";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}د`;
  if (diff < 86400000) return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA", {
    hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
  });
}

const STATUS_CFG: Record<string, { label: string; dot: string }> = {
  active:  { label: "نشط",  dot: "bg-emerald-500" },
  pending: { label: "معلق", dot: "bg-amber-400" },
  closed:  { label: "مغلق", dot: "bg-slate-300" },
};

/* ─── Avatar ─────────────────────────────────────────────────── */
const COLORS = ["bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700", "bg-amber-100 text-amber-700"];
function Avatar({ name, phone, url, size = "md" }: { name?: string; phone: string; url?: string | null; size?: "sm" | "md" }) {
  const [err, setErr] = useState(false);
  const letter = (name ?? phone).charAt(0).toUpperCase();
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const col = COLORS[phone.charCodeAt(phone.length - 1) % COLORS.length]!;
  if (url && !err) return <img src={url} alt={letter} className={cn("rounded-full object-cover shrink-0 font-bold", sz)} onError={() => setErr(true)} />;
  return <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", sz, col)}>{letter}</div>;
}

/* ─── Main Page ──────────────────────────────────────────────── */
export default function AdminConversationsPage() {
  const { toast } = useToast();

  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<AdminConv[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [convLoading, setConvLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [correction, setCorrection] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  // Load users
  useEffect(() => {
    fetchUsers().then(setUsers);
  }, []);

  // Load conversations when user changes
  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    setSelectedConvId(null);
    setMessages([]);
    const data = await fetchConversations(selectedUserId ?? undefined);
    setConversations(data);
    setConvLoading(false);
  }, [selectedUserId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!selectedConvId) { setMessages([]); return; }
    setMsgLoading(true);
    fetchMessages(selectedConvId).then((data) => {
      setMessages(data);
      setMsgLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  }, [selectedConvId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!selectedConvId || !correction.trim() || sending) return;
    setSending(true);
    try {
      const result = await injectMessage(selectedConvId, correction.trim());
      if (result.ok) {
        const newMsg: Message = {
          id: Date.now(),
          conversationId: selectedConvId,
          from: "agent",
          text: correction.trim(),
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newMsg]);
        setConversations((prev) =>
          prev.map((c) => c.id === selectedConvId ? { ...c, lastMessage: correction.trim() } : c),
        );
        setCorrection("");
        toast({ title: result.sent ? "✅ تم إرسال الرسالة عبر واتساب وحفظها" : "⚠️ تم الحفظ فقط (واتساب غير متصل)" });
      }
    } finally {
      setSending(false);
    }
  };

  const handlePause = async () => {
    if (!selectedConvId || pausing) return;
    setPausing(true);
    try {
      const result = await togglePause(selectedConvId);
      setConversations((prev) =>
        prev.map((c) => c.id === selectedConvId ? { ...c, agentPaused: result.agentPaused } : c),
      );
      toast({ title: result.agentPaused ? "⏸ تم إيقاف الوكيل مؤقتاً لهذه المحادثة" : "▶️ تم تفعيل الوكيل مجدداً" });
    } finally {
      setPausing(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.customerName ?? "").toLowerCase().includes(q) || c.customerPhone.includes(q);
  });

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-0 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h1 className="text-base font-bold">مراقبة المحادثات وتصحيح الوكيل</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* User selector */}
          <div className="relative">
            <select
              value={selectedUserId ?? ""}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
              className="h-8 ps-3 pe-7 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            >
              <option value="">كل المستخدمين</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
            <ChevronDown className="absolute top-1/2 -translate-y-1/2 end-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <button
            onClick={loadConversations}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: split pane */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: conversation list ── */}
        <div className="w-72 shrink-0 border-e border-border flex flex-col bg-card overflow-hidden">
          <div className="p-3 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 start-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full h-8 ps-8 pe-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convLoading && (
              <div className="py-10 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin opacity-40" />
                جاري التحميل...
              </div>
            )}
            {!convLoading && filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-xs">لا توجد محادثات</div>
            )}
            {!convLoading && filtered.map((c) => {
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.closed!;
              const isSelected = selectedConvId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedConvId(c.id)}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border last:border-0 transition-colors",
                    isSelected ? "bg-primary/5 border-e-2 border-e-primary" : "hover:bg-muted/40",
                  )}
                >
                  <div className="relative mt-0.5 shrink-0">
                    <Avatar name={c.customerName} phone={c.customerPhone} url={c.avatarUrl} size="sm" />
                    <span className={cn("absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full ring-1 ring-card", c.agentPaused ? "bg-amber-400" : st.dot)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold truncate">{c.customerName ?? c.customerPhone}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(c.updatedAt)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{c.lastMessage ?? "—"}</p>
                    <p className="text-[10px] text-primary/70 mt-0.5 truncate">{c.userEmail}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground shrink-0">
            {filtered.length} محادثة
          </div>
        </div>

        {/* ── Right: message view ── */}
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-15" />
              <p className="text-sm font-medium">اختر محادثة لعرضها</p>
              <p className="text-xs mt-1 opacity-60">يمكنك مراقبة المحادثة وإرسال تصحيح للوكيل</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Conversation header */}
            <div className="px-4 py-2.5 border-b border-border bg-card shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={selectedConv.customerName} phone={selectedConv.customerPhone} url={selectedConv.avatarUrl} />
                <div>
                  <p className="font-semibold text-sm">{selectedConv.customerName ?? selectedConv.customerPhone}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedConv.customerPhone} · {selectedConv.userEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedConv.agentPaused ? (
                  <span className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <Pause className="w-3 h-3 fill-current" /> الوكيل متوقف
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <Bot className="w-3 h-3" /> الوكيل يعمل
                  </span>
                )}
                <button
                  onClick={handlePause}
                  disabled={pausing}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                    selectedConv.agentPaused
                      ? "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      : "border-amber-500/30 text-amber-600 hover:bg-amber-500/10",
                  )}
                >
                  {pausing ? <Loader2 className="w-3 h-3 animate-spin" /> : selectedConv.agentPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {selectedConv.agentPaused ? "تشغيل الوكيل" : "إيقاف الوكيل"}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {msgLoading && (
                <div className="py-8 text-center text-muted-foreground text-xs flex flex-col items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin opacity-40" />
                  جاري تحميل الرسائل...
                </div>
              )}
              {!msgLoading && messages.length === 0 && (
                <div className="py-10 text-center text-muted-foreground text-xs">لا توجد رسائل</div>
              )}
              {!msgLoading && messages.map((msg) => {
                const isAgent = msg.from === "agent";
                return (
                  <div key={msg.id} className={cn("flex gap-2", isAgent ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-auto",
                      isAgent ? "bg-primary/10" : "bg-muted",
                    )}>
                      {isAgent ? <Bot className="w-3.5 h-3.5 text-primary" /> : <User className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className={cn(
                      "max-w-[70%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      isAgent
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm",
                    )}>
                      {msg.text}
                      <div className={cn("text-[10px] mt-1 opacity-60", isAgent ? "text-end" : "text-start")}>
                        {fmtFull(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Correction input */}
            <div className="px-4 py-3 border-t border-border bg-card shrink-0">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">إرسال تصحيح — ستُرسَل الرسالة إلى العميل كرد من الوكيل</span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="اكتب رسالة التصحيح... (Enter للإرسال، Shift+Enter لسطر جديد)"
                    rows={2}
                    className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !correction.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors self-end shrink-0"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    إرسال
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
