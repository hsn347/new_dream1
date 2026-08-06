import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  ShoppingBag, CheckCircle2, XCircle, Truck, Clock, Ban,
  ChevronDown, ChevronUp, Phone, MapPin, Receipt, Loader2,
  Search, Filter, FileText, Package, RotateCcw, StickyNote,
  User, FilePlus, ChevronLeft, Save,
} from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { api, type Return, type ReturnStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type OrderStatus = "draft" | "pending_payment" | "pending_review" | "approved" | "rejected" | "delivered" | "cancelled" | "returned";

interface OrderItem {
  name: string;
  qty: number;
  unit: string;
  price: string;
  total: string;
}

interface Order {
  id: number;
  conversationId: number | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  items: string;
  subtotal: string;
  deliveryCost: string;
  total: string;
  notes: string | null;
  status: OrderStatus;
  depositReference: string | null;
  depositMediaUrl: string | null;
  reviewSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft: { label: "مسودة", color: "text-muted-foreground", bg: "bg-muted/60", icon: <FileText className="w-3 h-3" /> },
  pending_payment: { label: "في انتظار الإيداع", color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-500/10 border border-amber-500/20", icon: <Clock className="w-3 h-3" /> },
  pending_review: { label: "قيد المراجعة", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border border-blue-500/20", icon: <Receipt className="w-3 h-3" /> },
  approved: { label: "تمت الموافقة", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "مرفوض", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  delivered: { label: "تم التوصيل", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 border border-violet-500/20", icon: <Truck className="w-3 h-3" /> },
  cancelled: { label: "ملغى", color: "text-muted-foreground", bg: "bg-muted", icon: <Ban className="w-3 h-3" /> },
  returned: { label: "مُسترجَع", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10 border border-orange-500/20", icon: <RotateCcw className="w-3 h-3" /> },
};

const RETURN_STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending_review: { label: "انتظار المراجعة", color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-500/10 border border-amber-500/20", icon: <Clock className="w-3 h-3" /> },
  approved: { label: "تمت الموافقة", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "مرفوض", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  completed: { label: "مكتمل", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border border-blue-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: Order }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(order.notes ?? "");

  let items: OrderItem[] = [];
  try { items = JSON.parse(order.items) as OrderItem[]; } catch {}

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.user.orders.updateStatus(order.id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "تم التحديث", description: "تم تغيير حالة الطلب" }); },
    onError: () => toast({ title: "خطأ", description: "فشل تحديث الحالة", variant: "destructive" }),
  });

  const notesMutation = useMutation({
    mutationFn: () => api.user.orders.updateNotes(order.id, notes),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["orders"] }); toast({ title: "تم الحفظ", description: "تم حفظ الملاحظات" }); },
    onError: () => toast({ title: "خطأ", description: "فشل حفظ الملاحظات", variant: "destructive" }),
  });

  const depositInfo = order.depositReference
    ? { type: "رقم مرجعي", value: order.depositReference }
    : order.depositMediaUrl
    ? { type: "صورة/ملف", value: order.depositMediaUrl }
    : null;

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-foreground">#{order.id} — {order.customerName}</p>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{fmt(order.createdAt)}</p>
        </div>
        <div className="text-left shrink-0">
          <p className="text-sm font-bold text-primary">{order.total} ر.س</p>
          <p className="text-[10px] text-muted-foreground">{items.length} منتج</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">الجوال</p>
                <p className="text-xs font-medium text-foreground">{order.customerPhone}</p>
              </div>
            </div>
            {order.customerAddress && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">العنوان</p>
                  <p className="text-xs font-medium text-foreground">{order.customerAddress}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">المنتجات</p>
            <div className="space-y-1">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground">× {item.qty} {item.unit}</span>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{item.total} ر.س</span>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{order.subtotal} ر.س</span></div>
              <div className="flex justify-between"><span>التوصيل:</span><span>{order.deliveryCost} ر.س</span></div>
              <div className="flex justify-between font-bold text-foreground text-sm pt-1 border-t border-border">
                <span>الإجمالي:</span><span>{order.total} ر.س</span>
              </div>
            </div>
          </div>

          {depositInfo ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">سند الإيداع</p>
              <div className="flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-[10px] text-emerald-600">{depositInfo.type}</p>
                  {depositInfo.type === "صورة/ملف" ? (
                    <a href={depositInfo.value} target="_blank" rel="noopener noreferrer" className="block mt-1">
                      <img
                        src={depositInfo.value}
                        alt="سند الإيداع"
                        className="max-w-[180px] max-h-[120px] rounded-lg border border-emerald-500/20 object-cover hover:opacity-90 transition-opacity cursor-pointer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          const link = document.createElement("a");
                          link.href = depositInfo.value;
                          link.target = "_blank";
                          link.textContent = "عرض الملف ↗";
                          link.className = "text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline";
                          e.currentTarget.parentNode?.appendChild(link);
                        }}
                      />
                    </a>
                  ) : (
                    <p className="text-xs font-mono font-bold text-emerald-800">{depositInfo.value}</p>
                  )}
                </div>
              </div>
              {order.reviewSentAt && <p className="text-[10px] text-emerald-600 mt-1">أُرسل للمراجعة: {new Date(order.reviewSentAt).toLocaleString("ar-SA")}</p>}
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-xs text-amber-600 dark:text-amber-300">لم يُرسل سند الإيداع بعد</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">ملاحظات داخلية</p>
            <div className="flex gap-2">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أضف ملاحظة للطلب..."
                className="flex-1 h-8 px-3 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => notesMutation.mutate()}
                disabled={notesMutation.isPending || notes === (order.notes ?? "")}
                className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {notesMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">تغيير الحالة</p>
            <div className="flex flex-wrap gap-2">
              {order.status === "pending_review" && (
                <>
                  <button onClick={() => statusMutation.mutate("approved")} disabled={statusMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-all disabled:opacity-50">
                    <CheckCircle2 className="w-3 h-3" />موافقة على الطلب
                  </button>
                  <button onClick={() => statusMutation.mutate("rejected")} disabled={statusMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-all disabled:opacity-50">
                    <XCircle className="w-3 h-3" />رفض
                  </button>
                </>
              )}
              {order.status === "approved" && (
                <button onClick={() => statusMutation.mutate("delivered")} disabled={statusMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-semibold hover:bg-violet-600 transition-all disabled:opacity-50">
                  <Truck className="w-3 h-3" />تم التوصيل
                </button>
              )}
              {!["cancelled", "delivered", "rejected", "returned"].includes(order.status) && (
                <button onClick={() => statusMutation.mutate("cancelled")} disabled={statusMutation.isPending} className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground rounded-lg text-xs hover:bg-muted transition-all disabled:opacity-50">
                  <Ban className="w-3 h-3" />إلغاء
                </button>
              )}
              {statusMutation.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Return Card ──────────────────────────────────────────────────────────────
function ReturnCard({ ret }: { ret: Return }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(ret.adminNotes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);

  let linkedItems: OrderItem[] = [];
  if (ret.linkedOrder) {
    try { linkedItems = JSON.parse(ret.linkedOrder.items) as OrderItem[]; } catch {}
  }

  const statusMut = useMutation({
    mutationFn: (status: string) => api.user.returns.updateStatus(ret.id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["returns"] }); toast({ title: "تم تحديث الحالة" }); },
    onError: () => toast({ title: "فشل التحديث", variant: "destructive" }),
  });

  const notesMut = useMutation({
    mutationFn: () => api.user.returns.updateNotes(ret.id, notes),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["returns"] }); setEditingNotes(false); toast({ title: "تم حفظ الملاحظات" }); },
    onError: () => toast({ title: "فشل الحفظ", variant: "destructive" }),
  });

  const cfg = RETURN_STATUS_CONFIG[ret.status];

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden shadow-sm">
      <button
        className="w-full text-start flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
          <RotateCcw className="w-4 h-4 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-foreground">استرجاع #{ret.id}</p>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
              {cfg.icon}{cfg.label}
            </span>
            {ret.linkedOrder && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-medium">
                طلب #{ret.linkedOrder.id}
              </span>
            )}
            {!ret.linkedOrder && ret.orderId && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-600 font-medium border border-red-500/20">
                <AlertCircle className="w-2.5 h-2.5" />
                طلب #{ret.orderId} غير موجود
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{ret.customerName} · {fmt(ret.createdAt)}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ret.reason}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Return details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">العميل</p>
              <p className="text-xs font-medium text-foreground">{ret.customerName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" />{ret.customerPhone}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">سبب الاسترجاع</p>
              <p className="text-xs text-foreground">{ret.reason}</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground mb-1">المنتجات المراد إرجاعها</p>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
              <p className="text-xs text-orange-700 dark:text-orange-300">{ret.items}</p>
            </div>
          </div>

          {/* Linked order */}
          {ret.linkedOrder ? (
            <div className="border border-primary/20 bg-primary/5 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                <ShoppingBag className="w-3 h-3" />
                الطلب الأصلي #{ret.linkedOrder.id}
              </p>
              <div className="space-y-1">
                {linkedItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-background/70 rounded-lg px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">× {item.qty} {item.unit}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{item.total} ر.س</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-primary/10">
                <span className="text-muted-foreground">إجمالي الطلب</span>
                <span className="font-bold text-primary">{ret.linkedOrder.total} ر.س</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">حالة الطلب:</span>
                {ret.linkedOrder.status in STATUS_CONFIG ? (
                  <StatusBadge status={ret.linkedOrder.status as OrderStatus} />
                ) : (
                  <span className="text-[10px] text-muted-foreground">{ret.linkedOrder.status}</span>
                )}
              </div>
            </div>
          ) : ret.orderId && (
            <div className="border border-red-500/20 bg-red-500/10 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                لم يُعثر على طلب بالرقم #{ret.orderId} — تحقق من صحة الرقم
              </p>
            </div>
          )}

          {/* Admin notes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                <StickyNote className="w-3 h-3" />ملاحظات داخلية
              </p>
              {!editingNotes && (
                <button onClick={() => setEditingNotes(true)} className="text-xs text-primary hover:underline">
                  {notes ? "تعديل" : "إضافة ملاحظة"}
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="أضف ملاحظة داخلية..."
                />
                <div className="flex gap-2">
                  <button onClick={() => notesMut.mutate()} disabled={notesMut.isPending} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60 flex items-center gap-1">
                    {notesMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}حفظ
                  </button>
                  <button onClick={() => { setEditingNotes(false); setNotes(ret.adminNotes ?? ""); }} className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                    إلغاء
                  </button>
                </div>
              </div>
            ) : notes ? (
              <p className="text-xs text-foreground bg-background rounded-xl px-3 py-2 border border-border">{notes}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">لا توجد ملاحظات</p>
            )}
          </div>

          {/* Actions */}
          {ret.status === "pending_review" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => statusMut.mutate("approved")} disabled={statusMut.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-all">
                {statusMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}موافقة
              </button>
              <button onClick={() => statusMut.mutate("rejected")} disabled={statusMut.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 disabled:opacity-50 transition-all">
                {statusMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}رفض
              </button>
            </div>
          )}
          {ret.status === "approved" && (
            <button onClick={() => statusMut.mutate("completed")} disabled={statusMut.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all">
              {statusMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}تم الاسترجاع
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Archive / Active split ────────────────────────────────────────────────────
const ACTIVE_STATUSES: OrderStatus[] = ["draft", "pending_payment", "pending_review", "approved"];
const ARCHIVE_STATUSES: OrderStatus[] = ["delivered", "rejected", "cancelled", "returned"];

// ─── Filters ──────────────────────────────────────────────────────────────────
const ACTIVE_FILTERS: { value: string; label: string }[] = [
  { value: "all",             label: "الكل" },
  { value: "pending_review",  label: "قيد المراجعة" },
  { value: "pending_payment", label: "انتظار الإيداع" },
  { value: "approved",        label: "موافق عليها" },
  { value: "draft",           label: "مسودات" },
];

const ARCHIVE_FILTERS: { value: string; label: string }[] = [
  { value: "all",       label: "الكل" },
  { value: "delivered", label: "تم التوصيل" },
  { value: "rejected",  label: "مرفوضة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "returned",  label: "مُسترجَعة" },
];

const RETURN_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "pending_review", label: "انتظار المراجعة" },
  { value: "approved", label: "موافق عليه" },
  { value: "rejected", label: "مرفوض" },
  { value: "completed", label: "مكتمل" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const [tab, setTab] = useState<"orders" | "returns">("orders");
  const [archiveView, setArchiveView] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.user.orders.list(),
    refetchInterval: 30000,
  });

  const { data: returns = [], isLoading: returnsLoading } = useQuery<Return[]>({
    queryKey: ["returns"],
    queryFn: () => api.user.returns.list(),
    refetchInterval: 30000,
  });

  const allOrders = orders as Order[];
  const allReturns = returns as Return[];

  const activeOrders  = allOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const archivedOrders = allOrders.filter((o) => ARCHIVE_STATUSES.includes(o.status));

  const pendingReturns = allReturns.filter((r) => r.status === "pending_review").length;

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteArchiveMut = useMutation({
    mutationFn: () => api.user.orders.deleteArchive(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setConfirmDelete(false);
      toast({ title: "تم مسح الأرشيف", description: "حُذفت جميع الطلبات المؤرشَفة" });
    },
    onError: () => toast({ title: "خطأ", description: "فشل مسح الأرشيف", variant: "destructive" }),
  });

  function exportArchiveXlsx() {
    setExportingXlsx(true);
    try {
      const HEADERS = [
        "رقم الطلب", "اسم العميل", "الجوال", "العنوان",
        "المنتجات", "المجموع الفرعي (ر.س)", "التوصيل (ر.س)", "الإجمالي (ر.س)",
        "الحالة", "تاريخ الطلب", "ملاحظات",
      ];

      const rows = archivedOrders.map((o) => {
        let items: Array<{ name: string; qty: number; unit: string }> = [];
        try { items = JSON.parse(o.items); } catch {}
        const productsSummary = items.map((i) => `${i.name} × ${i.qty} ${i.unit}`).join(" | ");
        return [
          o.id,
          o.customerName,
          o.customerPhone,
          o.customerAddress ?? "",
          productsSummary,
          parseFloat(o.subtotal) || 0,
          parseFloat(o.deliveryCost) || 0,
          parseFloat(o.total) || 0,
          STATUS_CONFIG[o.status]?.label ?? o.status,
          new Date(o.createdAt).toLocaleDateString("ar-SA"),
          o.notes ?? "",
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);

      ws["!cols"] = [
        { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 28 },
        { wch: 42 }, { wch: 18 }, { wch: 14 }, { wch: 16 },
        { wch: 18 }, { wch: 20 }, { wch: 30 },
      ];

      ws["!autofilter"] = { ref: `A1:K1` };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "أرشيف الطلبات");

      XLSX.writeFile(wb, `أرشيف-الطلبات-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "تم التصدير", description: `${archivedOrders.length} طلب في ملف Excel` });
    } catch (err) {
      console.error("Excel export error:", err);
      toast({ title: "خطأ", description: "فشل تصدير الملف", variant: "destructive" });
    } finally {
      setExportingXlsx(false);
    }
  }

  const handleTabChange = (t: "orders" | "returns") => {
    setTab(t);
    setArchiveView(false);
    setStatusFilter("all");
    setSearch("");
  };

  const handleArchiveToggle = (toArchive: boolean) => {
    setArchiveView(toArchive);
    setStatusFilter("all");
    setSearch("");
  };

  const currentOrderPool = archiveView ? archivedOrders : activeOrders;
  const currentOrderFilters = archiveView ? ARCHIVE_FILTERS : ACTIVE_FILTERS;

  const filteredOrders = currentOrderPool.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (!search.trim()) return true;
    return o.customerName.includes(search) || o.customerPhone.includes(search) || String(o.id).includes(search);
  });

  const filteredReturns = allReturns.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.customerName.toLowerCase().includes(q) || r.customerPhone.includes(q) || String(r.id).includes(q) || (r.orderId ?? "").includes(q);
  });

  const activeFilters = tab === "orders" ? currentOrderFilters : RETURN_FILTERS;
  const activeList    = tab === "orders" ? filteredOrders : filteredReturns;
  const isLoading     = tab === "orders" ? ordersLoading : returnsLoading;
  const poolCount     = tab === "orders" ? currentOrderPool.length : allReturns.length;

  const orderStats = {
    pending_review:  activeOrders.filter((o) => o.status === "pending_review").length,
    pending_payment: activeOrders.filter((o) => o.status === "pending_payment").length,
    approved:        activeOrders.filter((o) => o.status === "approved").length,
    active:          activeOrders.length,
    archived:        archivedOrders.length,
  };

  return (
    <div className="space-y-4">

      {/* Tab switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-muted/50 p-1 rounded-2xl w-fit">
          <button
            onClick={() => handleTabChange("orders")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === "orders"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            الطلبات
            {orderStats.active > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {orderStats.active}
              </span>
            )}
          </button>
        </div>

        {/* Archive toggle — orders tab only */}
        {tab === "orders" && (
          <div className="flex gap-1 bg-muted/50 p-1 rounded-2xl">
            <button
              onClick={() => handleArchiveToggle(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                !archiveView
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              نشطة
            </button>
            <button
              onClick={() => handleArchiveToggle(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                archiveView
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              الأرشيف
              {orderStats.archived > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  archiveView ? "bg-muted text-muted-foreground" : "bg-muted/70 text-muted-foreground"
                }`}>
                  {orderStats.archived}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Archive banner + bulk actions */}
      {tab === "orders" && archiveView && (
        <>
          <div className="flex items-center gap-3 bg-muted/60 border border-border rounded-2xl px-4 py-3">
            <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">الأرشيف</p>
              <p className="text-xs text-muted-foreground">الطلبات المكتملة أو المغلقة — موصّلة، مرفوضة، ملغاة، مُسترجَعة</p>
            </div>
            <button
              onClick={() => handleArchiveToggle(false)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              الطلبات النشطة
            </button>
          </div>

          {/* Bulk actions toolbar */}
          {archivedOrders.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={exportArchiveXlsx}
                disabled={exportingXlsx}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-60 transition-all"
              >
                {exportingXlsx
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileText className="w-3.5 h-3.5" />}
                تصدير Excel ({archivedOrders.length})
              </button>

              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-medium text-red-600 hover:bg-red-500/20 transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  حذف الكل من الأرشيف
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-300 bg-red-500/10">
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">حذف {archivedOrders.length} طلب نهائياً؟</span>
                  <button
                    onClick={() => deleteArchiveMut.mutate()}
                    disabled={deleteArchiveMut.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60 transition-all"
                  >
                    {deleteArchiveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                    تأكيد
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Stats (active orders only) */}
      {tab === "orders" && !archiveView && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "قيد المراجعة",  value: orderStats.pending_review,  color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/10 border border-blue-500/20" },
            { label: "انتظار إيداع",  value: orderStats.pending_payment, color: "text-amber-600 dark:text-amber-300",   bg: "bg-amber-500/10 border border-amber-500/20" },
            { label: "تمت الموافقة",  value: orderStats.approved,        color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20" },
            { label: "في الأرشيف",    value: orderStats.archived,        color: "text-muted-foreground", bg: "bg-muted/60 border border-border", clickable: true },
          ].map((s) => (
            <div
              key={s.label}
              onClick={s.clickable ? () => handleArchiveToggle(true) : undefined}
              className={`rounded-2xl p-3 text-center ${s.bg} ${s.clickable ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
            >
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                {s.clickable && <Archive className="w-2.5 h-2.5" />}
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "orders" ? "ابحث باسم العميل أو الجوال أو رقم الطلب..." : "ابحث باسم العميل أو رقم الطلب أو الاسترجاع..."}
          className="w-full h-9 pr-9 pl-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        {/* Mobile dropdown */}
        <div className="relative sm:hidden flex-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-9 ps-3 pe-8 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
          >
            {activeFilters.map((f) => {
              const count = f.value === "all" ? poolCount : activeList.filter((item: any) => item.status === f.value).length;
              return (
                <option key={f.value} value={f.value}>
                  {f.label}{count > 0 ? ` (${count})` : ""}
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute top-1/2 -translate-y-1/2 end-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {/* Desktop pills */}
        <div className="hidden sm:flex gap-1.5 flex-wrap">
          {activeFilters.map((f) => {
            const src = tab === "orders" ? currentOrderPool : allReturns;
            const count = f.value === "all" ? src.length : src.filter((item: any) => item.status === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  statusFilter === f.value
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {f.label}
                {f.value !== "all" && count > 0 && (
                  <span className={`ms-1.5 text-[10px] rounded-full px-1 tabular-nums ${statusFilter === f.value ? "bg-white/20" : "bg-muted"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <PageLoader text="جاري تحميل الطلبات..." />
      ) : activeList.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-12 flex flex-col items-center text-center">
          {archiveView
            ? <Archive className="w-10 h-10 text-muted-foreground/30 mb-3" />
            : tab === "orders"
            ? <ShoppingBag className="w-10 h-10 text-muted-foreground/30 mb-3" />
            : <PackageX className="w-10 h-10 text-muted-foreground/30 mb-3" />}
          <p className="text-sm font-medium text-foreground mb-1">
            {poolCount === 0
              ? archiveView
                ? "الأرشيف فارغ"
                : tab === "orders" ? "لا توجد طلبات نشطة" : "لا توجد طلبات استرجاع بعد"
              : "لا توجد نتائج"}
          </p>
          <p className="text-xs text-muted-foreground">
            {poolCount === 0
              ? archiveView
                ? "ستُنقل الطلبات المكتملة والمغلقة إلى هنا تلقائياً"
                : tab === "orders"
                  ? "ستظهر هنا طلبات الزبائن التي يجمعها الوكيل الذكي تلقائياً"
                  : "ستظهر هنا طلبات الاسترجاع عندما يطلب العملاء إرجاع منتج"
              : "جرّب تغيير معايير البحث أو التصفية"}
          </p>
          {poolCount === 0 && archiveView && (
            <button
              onClick={() => handleArchiveToggle(false)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm text-muted-foreground transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              الطلبات النشطة
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tab === "orders"
            ? filteredOrders.map((order) => <OrderCard key={order.id} order={order} />)
            : filteredReturns.map((ret) => <ReturnCard key={ret.id} ret={ret} />)}
        </div>
      )}

      {/* Info box */}
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            {tab === "orders"
              ? <CheckCircle2 className="w-4 h-4 text-blue-600" />
              : <RotateCcw className="w-4 h-4 text-orange-600" />}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {tab === "orders" ? "كيف يعمل نظام الطلبات؟" : "كيف يعمل نظام الاسترجاع؟"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {tab === "orders"
                ? "الوكيل يجمع تفاصيل الطلب تلقائياً (المنتجات، الاسم، الجوال، العنوان)، ثم يعرض ملخص الطلب ويطلب سند الإيداع. عند استلام السند، يُرسل الطلب تلقائياً لرقم المراجعة المحدد في إعدادات الوكيل."
                : "عندما يطلب العميل إرجاع منتج، يطلب الوكيل رقم الطلب الأصلي أولاً ثم سبب الإرجاع والمنتجات. بعد اكتمال المعلومات يُرسل إشعار لرقم المراجعة ويظهر الطلب هنا مرتبطاً بالطلب الأصلي."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
