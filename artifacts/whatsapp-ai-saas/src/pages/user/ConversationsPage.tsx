import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Phone, ChevronRight, Bot, Pause, Play,
  MessageCircle, RefreshCw, WifiOff, User,
  ShoppingBag, X, Loader2, Send, Trash2,
  Clock, MapPin, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type Conversation, type Message, type CustomerProfile } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/* ─── helpers ─────────────────────────────────────────────── */
function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000) return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

const AVATAR_COLORS = [
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-blue-100 text-blue-600 dark:text-blue-400",
  "bg-purple-100 text-purple-700",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
];

function Avatar({ name, phone, size = "md", avatarUrl }: { name?: string; phone: string; size?: "sm" | "md" | "lg"; avatarUrl?: string | null }) {
  const [imgErr, setImgErr] = useState(false);
  const letter = (name ?? phone).charAt(0).toUpperCase();
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  const color = AVATAR_COLORS[phone.charCodeAt(phone.length - 1) % AVATAR_COLORS.length]!;
  if (avatarUrl && !imgErr) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? phone}
        className={cn("rounded-full object-cover shrink-0", sz)}
        onError={() => setImgErr(true)}
      />
    );
  }
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", sz, color)}>
      {letter}
    </div>
  );
}

const STATUS_CFG = {
  active:  { label: "نشط",  dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  pending: { label: "معلق", dot: "bg-amber-400",   pill: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20" },
  closed:  { label: "مغلق", dot: "bg-slate-300",   pill: "bg-muted text-muted-foreground border-border" },
} as const;


/* ─── conversation row ────────────────────────────────────── */
function ConvRow({
  conv, selected, pausingId, clearingId, confirmClearId, onSelect, onPause, onClear,
}: {
  conv: Conversation;
  selected: boolean;
  pausingId: number | null;
  clearingId: number | null;
  confirmClearId: number | null;
  onSelect: () => void;
  onPause: (e: React.MouseEvent) => void;
  onClear: (e: React.MouseEvent) => void;
}) {
  const st = STATUS_CFG[conv.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
  const isPausing = pausingId === conv.id;
  const isClearing = clearingId === conv.id;
  const awaitingConfirm = confirmClearId === conv.id;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors",
        "border-b border-border last:border-0",
        selected ? "bg-primary/5 border-r-2 border-r-primary" : "hover:bg-muted/40 active:bg-muted/60",
      )}
    >
      {/* Avatar with status dot */}
      <div className="relative mt-0.5 shrink-0">
        <Avatar name={conv.customerName} phone={conv.customerPhone} avatarUrl={conv.avatarUrl} />
        <span className={cn(
          "absolute -bottom-0.5 -end-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-card flex items-center justify-center",
          conv.agentPaused ? "bg-amber-400" : st.dot,
        )}>
          {conv.agentPaused && <Pause className="w-1.5 h-1.5 text-white fill-white" />}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <p className="font-semibold text-sm text-foreground truncate">
            {conv.customerName ?? conv.customerPhone}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {formatTime(conv.updatedAt)}
          </span>
        </div>
        {conv.customerName && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 mb-0.5">
            <Phone className="w-2.5 h-2.5 shrink-0" />
            {conv.customerPhone}
          </p>
        )}
        <p className="text-xs text-muted-foreground truncate leading-relaxed">
          {conv.lastMessage ?? "—"}
        </p>

        {/* Status + Pause button row — always visible */}
        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
              st.pill,
            )}>
              {st.label}
            </span>
            {conv.agentPaused ? (
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                <Pause className="w-2.5 h-2.5 fill-current" /> إيقاف مؤقت
              </span>
            ) : (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                <Bot className="w-2.5 h-2.5" /> يعمل
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Clear history button */}
            <button
              onClick={onClear}
              disabled={isClearing}
              title={awaitingConfirm ? "اضغط مرة أخرى للتأكيد" : "تنظيف ذاكرة المحادثة"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-50 disabled:cursor-wait",
                awaitingConfirm
                  ? "bg-red-600 border-red-700 text-white hover:bg-red-700 scale-105"
                  : "bg-red-500/10 border-red-500/20 text-red-600 hover:bg-red-500/20 active:bg-red-200",
              )}
            >
              {isClearing
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : awaitingConfirm
                  ? <span className="whitespace-nowrap">تأكيد؟</span>
                  : <Trash2 className="w-3 h-3" />
              }
            </button>

            {/* Pause / Resume — always visible, tap-friendly */}
            <button
              onClick={onPause}
              disabled={isPausing}
              title={conv.agentPaused ? "استئناف الوكيل" : "إيقاف مؤقت"}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors shrink-0",
                "disabled:opacity-50 disabled:cursor-wait",
                conv.agentPaused
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:bg-emerald-200"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 active:bg-amber-200",
              )}
            >
              {isPausing
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : conv.agentPaused
                  ? <><Play className="w-3 h-3 fill-current" /><span>استئناف</span></>
                  : <><Pause className="w-3 h-3" /><span>إيقاف</span></>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────── */
export default function ConversationsPage() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "pending" | "closed">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [pausingId, setPausingId] = useState<number | null>(null);
  const [clearingId, setClearingId] = useState<number | null>(null);
  const [confirmClearId, setConfirmClearId] = useState<number | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  const fetchConversations = useCallback(async (silent = false) => {
    try {
      const convs = await api.user.conversations();
      setConversations(convs);
      if (!silent) setLoading(false);
    } catch {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: number, silent = false) => {
    if (!silent) setLoadingMsgs(true);
    try {
      const msgs = await api.user.messages(convId);
      setMessages(msgs);
    } catch {}
    if (!silent) setLoadingMsgs(false);
  }, []);

  const fetchCustomerProfile = useCallback(async (phone: string) => {
    try {
      const p = await api.user.customers.get(phone);
      setCustomerProfile(p);
    } catch {
      setCustomerProfile(null);
    }
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    fetchConversations();
    convPollRef.current = setInterval(() => fetchConversations(true), 5000);
    return () => { if (convPollRef.current) clearInterval(convPollRef.current); };
  }, [fetchConversations]);

  useEffect(() => {
    if (msgPollRef.current) clearInterval(msgPollRef.current);
    if (selected === null) { setMessages([]); setCustomerProfile(null); setShowProfile(false); return; }
    fetchMessages(selected);
    msgPollRef.current = setInterval(() => {
      if (selectedRef.current !== null) fetchMessages(selectedRef.current, true);
    }, 3000);
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [selected, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (selected !== null) {
      const conv = conversations.find(c => c.id === selected);
      if (conv) fetchCustomerProfile(conv.customerPhone);
    }
  }, [selected, conversations, fetchCustomerProfile]);

  const handleSend = async () => {
    if (!messageInput.trim() || selected === null || sending) return;
    setSending(true);
    const text = messageInput.trim();
    setMessageInput("");
    try {
      const msg = await api.user.sendMessage(selected, text);
      setMessages(prev => [...prev, msg]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      setConversations(prev => prev.map(c => c.id === selected ? { ...c, lastMessage: text, updatedAt: new Date().toISOString() } : c));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "فشل إرسال الرسالة";
      toast({ title: "خطأ في الإرسال", description: errorMsg, variant: "destructive" });
      setMessageInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = async (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    if (clearingId === conv.id) return;
    if (confirmClearId !== conv.id) {
      setConfirmClearId(conv.id);
      setTimeout(() => setConfirmClearId(null), 3000);
      return;
    }
    setConfirmClearId(null);
    setClearingId(conv.id);
    try {
      await api.user.clearMessages(conv.id);
      if (selected === conv.id) setMessages([]);
      setConversations(prev =>
        prev.map(c =>
          c.id === conv.id
            ? { ...c, lastMessage: undefined, status: "active" as const }
            : c,
        ),
      );
      toast({ title: "✅ تم تنظيف ذاكرة المحادثة" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ غير متوقع";
      toast({ title: "حدث خطأ أثناء التنظيف", description: msg, variant: "destructive" });
    } finally {
      setClearingId(null);
      setConfirmClearId(null);
    }
  };

  const handlePause = async (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    if (pausingId === conv.id) return;
    setPausingId(conv.id);
    try {
      const newPaused = !conv.agentPaused;
      await api.user.pauseConversation(conv.id, newPaused);
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, agentPaused: newPaused } : c));
      toast({ title: newPaused ? "تم إيقاف الوكيل مؤقتاً" : "تم استئناف الوكيل" });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setPausingId(null);
    }
  };

  const filtered = conversations.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (c.customerName ?? "").toLowerCase();
      const phone = c.customerPhone.toLowerCase();
      if (!name.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });

  const activeConv = selected !== null ? conversations.find(c => c.id === selected) ?? null : null;

  const counts = {
    all: conversations.length,
    active: conversations.filter(c => c.status === "active").length,
    pending: conversations.filter(c => c.status === "pending").length,
    closed: conversations.filter(c => c.status === "closed").length,
  };

  const FILTERS = [
    { key: "all",     label: "الكل" },
    { key: "active",  label: "نشط" },
    { key: "pending", label: "معلق" },
    { key: "closed",  label: "مغلق" },
  ] as const;

  return (
    <div className="flex h-[calc(100vh-4.5rem)] -m-4 md:-m-6 overflow-hidden" dir="rtl">

      {/* ── Sidebar ────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col bg-card border-l border-border shrink-0 transition-all duration-200",
        "w-full md:w-80 lg:w-96",
        selected !== null ? "hidden md:flex" : "flex",
      )}>
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-border shrink-0 space-y-2 bg-card/90 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base text-foreground">المحادثات</h2>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full tabular-nums">
                {conversations.length}
              </span>
              <button
                onClick={() => fetchConversations()}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم..."
              className="w-full h-8 ps-8 pe-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                  filter === f.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {f.label}
                {counts[f.key] > 0 && (
                  <span className={cn(
                    "text-[10px] rounded-full min-w-[16px] px-1 tabular-nums",
                    filter === f.key ? "bg-white/20" : "bg-background",
                  )}>
                    {counts[f.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin opacity-40" />
              جاري التحميل...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-14 text-center text-muted-foreground flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-muted/60 flex items-center justify-center">
                <MessageCircle className="w-6 h-6 opacity-25" />
              </div>
              <p className="text-sm font-medium">
                {search ? "لا توجد نتائج" : "لا توجد محادثات"}
              </p>
              <p className="text-xs opacity-60">
                {search ? "جرّب مصطلح بحث مختلف" : "ستظهر هنا عند وصول رسائل واتساب"}
              </p>
            </div>
          )}
          {!loading && filtered.map(c => (
            <ConvRow
              key={c.id}
              conv={c}
              selected={selected === c.id}
              pausingId={pausingId}
              clearingId={clearingId}
              confirmClearId={confirmClearId}
              onSelect={() => setSelected(c.id)}
              onPause={e => handlePause(e, c)}
              onClear={e => handleClear(e, c)}
            />
          ))}
        </div>
      </div>

      {/* ── Chat Panel ─────────────────────────────────────── */}
      {/* On mobile: fixed full-screen overlay (above TopBar z-20) so header never overlaps */}
      {/* On desktop: normal flex panel inside the layout */}
      <div className={cn(
        selected !== null ? "flex" : "hidden md:flex",
        isMobile && selected !== null
          ? "fixed inset-0 z-50 bg-background"
          : "flex-1 min-w-0 overflow-hidden",
      )}>
        <div className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
          {activeConv ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-card border-b border-border shrink-0 shadow-sm">
                <button
                  className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                  onClick={() => setSelected(null)}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <Avatar name={activeConv.customerName} phone={activeConv.customerPhone} />

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">
                    {activeConv.customerName ?? activeConv.customerPhone}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />{activeConv.customerPhone}
                    </span>
                    {(() => {
                      const s = STATUS_CFG[activeConv.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
                      return (
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", s.pill)}>
                          {s.label}
                        </span>
                      );
                    })()}
                    {customerProfile?.isBuyer && (
                      <span className="text-[10px] font-medium flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <ShoppingBag className="w-3 h-3" /> مشترٍ
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile toggle */}
                <button
                  onClick={() => setShowProfile(v => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0",
                    showProfile
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{customerProfile ? "الملف" : "بدون ملف"}</span>
                </button>

                {/* Pause/Resume in header — always visible & clear */}
                <button
                  onClick={e => handlePause(e, activeConv)}
                  disabled={pausingId === activeConv.id}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0 disabled:opacity-60 disabled:cursor-wait",
                    activeConv.agentPaused
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20",
                  )}
                >
                  {pausingId === activeConv.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : activeConv.agentPaused
                      ? <><Play className="w-3.5 h-3.5 fill-current" /><span>استئناف</span></>
                      : <><Pause className="w-3.5 h-3.5" /><span>إيقاف</span></>
                  }
                </button>
              </div>

              {/* Paused banner */}
              {activeConv.agentPaused && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <WifiOff className="w-3.5 h-3.5 shrink-0" />
                  <span>الوكيل متوقف مؤقتاً — لن يرد على الرسائل الواردة حتى تستأنف عمله</span>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2.5" style={{ direction: "ltr" }}>
                {loadingMsgs && (
                  <div className="text-center text-muted-foreground text-sm py-10 flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin opacity-40" />
                    جاري تحميل الرسائل...
                  </div>
                )}
                {!loadingMsgs && messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
                    <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center">
                      <MessageCircle className="w-7 h-7 opacity-30" />
                    </div>
                    <p className="text-sm font-medium">لا توجد رسائل بعد</p>
                    <p className="text-xs opacity-60">الرسائل ستظهر هنا عند وصولها</p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isAgent = msg.from === "agent";
                  const prev = messages[i - 1];
                  const next = messages[i + 1];
                  const showTime = !next
                    || next.from !== msg.from
                    || (new Date(next.createdAt).getTime() - new Date(msg.createdAt).getTime() > 60_000);
                  const showLabel = isAgent && (!prev || prev.from !== "agent");

                  return (
                    <div key={msg.id} className={cn("flex", isAgent ? "justify-start" : "justify-end")} style={{ direction: "rtl" }}>
                      <div className={cn(
                        "max-w-[80%] md:max-w-sm lg:max-w-md",
                        i > 0 && prev?.from === msg.from ? "mt-0.5" : "mt-2.5",
                      )}>
                        {showLabel && (
                          <p className="text-[10px] text-muted-foreground mb-1 px-1 flex items-center gap-1">
                            <Bot className="w-2.5 h-2.5" /> الوكيل الذكي
                          </p>
                        )}
                        <div className={cn(
                          "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                          isAgent
                            ? "bg-card border border-border text-foreground rounded-2xl rounded-tr-md"
                            : "bg-primary text-primary-foreground rounded-2xl rounded-tl-md",
                        )}>
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          {showTime && (
                            <p className={cn(
                              "text-[10px] mt-1.5 flex items-center gap-1",
                              isAgent ? "text-muted-foreground" : "text-primary-foreground/70",
                            )}>
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(msg.createdAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Footer — message input */}
              <div className="px-3 py-2.5 bg-card border-t border-border shrink-0 space-y-2">
                {/* Agent status bar */}
                <div className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5",
                  activeConv.agentPaused
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                )}>
                  {activeConv.agentPaused
                    ? <><WifiOff className="w-3 h-3" /> الوكيل متوقف — يمكنك الرد يدوياً</>
                    : <><Bot className="w-3 h-3" /> الوكيل يرد تلقائياً — يمكنك التدخل وإرسال رسالة مباشرة</>
                  }
                </div>
                {/* Input row */}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="اكتب رسالة وأرسلها مباشرة عبر واتساب..."
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[38px] max-h-28 leading-snug"
                    style={{ overflowY: "auto" }}
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !messageInput.trim()}
                    className={cn(
                      "h-[38px] w-[38px] rounded-xl flex items-center justify-center shrink-0 transition-all",
                      "bg-primary text-primary-foreground hover:bg-primary/90",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                    title="إرسال (Enter)"
                  >
                    {sending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Empty state — no conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 p-8">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
                <MessageCircle className="w-9 h-9 opacity-25" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">اختر محادثة</p>
                <p className="text-xs mt-1 opacity-70">ستظهر الرسائل هنا</p>
              </div>
              {conversations.length > 0 && (
                <p className="text-xs text-muted-foreground/60">
                  {conversations.length} محادثة متاحة
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Customer Profile Panel ──────────────────────── */}
        {showProfile && activeConv && (
          <div className={cn(
            "flex flex-col bg-card border-r border-border overflow-y-auto",
            isMobile
              ? "fixed inset-0 z-[60] w-full"
              : "w-72 shrink-0",
          )} dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> ملف العميل
              </h3>
              <button
                onClick={() => setShowProfile(false)}
                className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {customerProfile ? (
              <div className="p-4 space-y-4 text-right">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-2 py-2">
                  <Avatar name={activeConv.customerName} phone={activeConv.customerPhone} size="lg" />
                  <div className="text-center">
                    <p className="font-bold text-sm text-foreground">
                      {customerProfile.detectedName ?? activeConv.customerName ?? activeConv.customerPhone}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{activeConv.customerPhone}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{customerProfile.totalOrders}</p>
                    <p className="text-[10px] text-muted-foreground">طلب</p>
                  </div>
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{customerProfile.inquiredProducts.length}</p>
                    <p className="text-[10px] text-muted-foreground">منتج سأل عنه</p>
                  </div>
                </div>

                {/* Info fields */}
                <div className="space-y-2.5">
                  {customerProfile.city && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">المدينة</p>
                        <p className="text-xs font-semibold text-foreground">{customerProfile.city}</p>
                      </div>
                    </div>
                  )}
                  {customerProfile.isBuyer && (
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">مشترٍ (لديه طلبات مقبولة)</p>
                    </div>
                  )}
                </div>

                {/* Inquired products */}
                {customerProfile.inquiredProducts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                      <Package className="w-3 h-3 text-blue-500" /> منتجات سأل عنها
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {customerProfile.inquiredProducts.map((p, i) => (
                        <span key={i} className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center">
                  <User className="w-5 h-5 opacity-30" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium">لا يوجد ملف بعد</p>
                  <p className="text-[10px] mt-1 opacity-70">يُنشأ الملف تلقائياً من المحادثات</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
