import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Phone,
  Loader2, Search, Filter, Package, RotateCcw, StickyNote, AlertCircle, ShoppingBag, Plus, Minus, Trash2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft: { label: "مسودة", color: "text-muted-foreground", bg: "bg-muted/60", icon: <Clock className="w-3 h-3" /> },
  pending_payment: { label: "في انتظار الإيداع", color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-500/10 border border-amber-500/20", icon: <Clock className="w-3 h-3" /> },
  pending_review: { label: "قيد المراجعة", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border border-blue-500/20", icon: <Clock className="w-3 h-3" /> },
  approved: { label: "تمت الموافقة", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "مرفوض", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  delivered: { label: "تم التوصيل", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 border border-violet-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: "ملغى", color: "text-muted-foreground", bg: "bg-muted", icon: <XCircle className="w-3 h-3" /> },
  returned: { label: "مُسترجَع", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10 border border-orange-500/20", icon: <RotateCcw className="w-3 h-3" /> },
};

const RETURN_STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending_review: { label: "انتظار المراجعة", color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-500/10 border border-amber-500/20", icon: <Clock className="w-3 h-3" /> },
  approved: { label: "تمت الموافقة", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border border-emerald-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "مرفوض", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10 border border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  completed: { label: "مكتمل", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10 border border-blue-500/20", icon: <CheckCircle2 className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ReturnCard({ ret }: { ret: Return }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(ret.adminNotes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);

  let linkedItems: OrderItem[] = [];
  if (ret.linkedOrder) {
    try { linkedItems = JSON.parse(ret.linkedOrder.items) as OrderItem[]; } catch { }
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

  const deleteMut = useMutation({
    mutationFn: () => api.user.returns.delete(ret.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["returns"] }); toast({ title: "تم حذف الاسترجاع بنجاح" }); },
    onError: () => toast({ title: "فشل الحذف", variant: "destructive" }),
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
                <StatusBadge status={ret.linkedOrder.status as OrderStatus} />
              </div>
            </div>
          ) : ret.orderId && (
            <div className="border border-red-500/20 bg-red-500/10 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                لم يُعثر على طلب بالرقم #{ret.orderId}
              </p>
            </div>
          )}

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

          <div className="flex items-center justify-between mt-4">
            {ret.status === "approved" ? (
              <button onClick={() => statusMut.mutate("completed")} disabled={statusMut.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all">
                {statusMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}تم الاسترجاع
              </button>
            ) : <div />}

            <button
              onClick={() => { if (confirm("هل أنت متأكد من حذف هذا الاسترجاع بشكل نهائي؟")) deleteMut.mutate(); }}
              disabled={deleteMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:bg-red-500/10 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
            >
              {deleteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              حذف نهائي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const RETURN_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "pending_review", label: "انتظار المراجعة" },
  { value: "approved", label: "موافق عليه" },
  { value: "rejected", label: "مرفوض" },
  { value: "completed", label: "مكتمل" },
  { value: "archived", label: "الأرشيف (أقدم من 3 أيام)" },
];

function CreateReturnModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    orderId: "",
    customerName: "",
    customerPhone: "",
    reason: "",
    items: "",
    status: "completed",
    adminNotes: "",
  });

  const [orderItems, setOrderItems] = useState<{ name: string; originalQty: number; returnQty: number; selected: boolean }[]>([]);

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["orders"],
    queryFn: () => api.user.orders.list(),
    enabled: open,
  });

  const handleOrderChange = (val: string) => {
    if (!val) {
      setFormData(p => ({ ...p, orderId: "" }));
      setOrderItems([]);
      return;
    }
    const order = orders.find(o => String(o.id) === val);
    if (order) {
      let parsedItems: { name: string; originalQty: number; returnQty: number; selected: boolean }[] = [];
      try {
        const parsed = JSON.parse(order.items);
        if (Array.isArray(parsed)) {
          parsedItems = parsed.map((item: any) => ({
            name: item.name,
            originalQty: item.qty || 1,
            returnQty: item.qty || 1,
            selected: true,
          }));
        }
      } catch (err) { }

      setOrderItems(parsedItems);
      setFormData(p => ({
        ...p,
        orderId: val,
        customerName: order.customerName || "",
        customerPhone: order.customerPhone || order.senderPhone || "",
        items: "", // Will be generated from orderItems
      }));
    } else {
      setOrderItems([]);
      setFormData(p => ({ ...p, orderId: val }));
    }
  };

  const handleReturnAll = () => {
    setOrderItems(prev => prev.map(item => ({ ...item, selected: true, returnQty: item.originalQty })));
  };

  const handleItemChange = (index: number, changes: Partial<typeof orderItems[0]>) => {
    const newItems = [...orderItems];
    newItems[index] = { ...newItems[index], ...changes };
    if (changes.returnQty !== undefined && changes.returnQty > newItems[index].originalQty) {
      newItems[index].returnQty = newItems[index].originalQty;
    }
    if (changes.returnQty !== undefined && changes.returnQty < 1) {
      newItems[index].returnQty = 1;
    }
    setOrderItems(newItems);
  };

  const mut = useMutation({
    mutationFn: () => {
      let finalItems = formData.items;
      if (formData.orderId && orderItems.length > 0) {
        finalItems = orderItems
          .filter(i => i.selected && i.returnQty > 0)
          .map(i => `${i.name} (الكمية: ${i.returnQty})`)
          .join("، ");
      }
      return api.user.returns.create({ ...formData, items: finalItems } as Partial<Return>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      toast({ title: "تم إضافة الاسترجاع بنجاح" });
      onClose();
      setFormData({ orderId: "", customerName: "", customerPhone: "", reason: "", items: "", status: "completed", adminNotes: "" });
      setOrderItems([]);
    },
    onError: (error: any) => {
      toast({ title: "فشل الإضافة", description: error?.message || "حدث خطأ غير متوقع", variant: "destructive" });
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="w-full max-w-xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
              <RotateCcw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">استرجاع جديد</h2>
              <p className="text-xs text-muted-foreground">قم بتعبئة تفاصيل الاسترجاع أو اختر طلباً حالياً</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-xl transition-all duration-200"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">

          {/* Order Selection */}
          <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border">
            <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" />
              تحديد الطلب *
            </label>
            <div className="relative">
              <Select value={formData.orderId} onValueChange={handleOrderChange} dir="rtl">
                <SelectTrigger className="w-full h-11 px-4 text-sm bg-background border border-input rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all">
                  <SelectValue placeholder="-- يرجى اختيار طلب --" />
                </SelectTrigger>
                <SelectContent>
                  {orders
                    .filter(o => o.status === "approved" || o.status === "delivered")
                    .map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        طلب #{o.id} - {o.customerName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer Details */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">اسم العميل *</label>
              <input
                type="text"
                value={formData.customerName}
                onChange={(e) => setFormData(p => ({ ...p, customerName: e.target.value }))}
                className="w-full h-10 px-3 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                placeholder="مثال: أحمد محمد"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">رقم الجوال *</label>
              <input
                type="text"
                value={formData.customerPhone}
                onChange={(e) => setFormData(p => ({ ...p, customerPhone: e.target.value }))}
                className="w-full h-10 px-3 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-left"
                dir="ltr"
                placeholder="+966xxxxxxxxx"
              />
            </div>
          </div>

          {/* Items to Return */}
          <div className="space-y-3">
            {formData.orderId && orderItems.length > 0 ? (
              <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    المنتجات المراد إرجاعها
                  </label>
                  <button
                    onClick={handleReturnAll}
                    className="text-[10px] bg-orange-500/10 text-orange-700 dark:text-orange-400 px-2.5 py-1.5 rounded-lg font-bold hover:bg-orange-500/20 transition-all border border-orange-500/20"
                  >
                    استرجاع الطلب كاملاً
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                  {orderItems.map((item, i) => (
                    <div
                      key={i}
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 bg-background border ${item.selected ? "border-orange-500/50 shadow-sm" : "border-border"} rounded-xl p-3 transition-all`}
                    >
                      <label className="flex items-start sm:items-center gap-3 cursor-pointer w-full sm:flex-1 min-w-0">
                        <div className="relative flex items-center justify-center w-5 h-5 shrink-0 mt-0.5 sm:mt-0">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) => handleItemChange(i, { selected: e.target.checked })}
                            className="peer appearance-none w-5 h-5 border-2 border-muted-foreground/30 rounded-md checked:border-orange-500 checked:bg-orange-500 transition-all cursor-pointer"
                          />
                          <CheckCircle2 className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                        </div>
                        <span className={`text-sm font-medium leading-relaxed sm:leading-normal line-clamp-2 sm:truncate transition-colors ${item.selected ? "text-foreground" : "text-muted-foreground"}`}>
                          {item.name}
                        </span>
                      </label>
                      {item.selected && (
                        <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto shrink-0 bg-muted/40 p-1.5 rounded-xl border border-border/50 pr-4 sm:pr-1.5">
                          <span className="text-xs font-bold text-muted-foreground sm:hidden">الكمية المسترجعة:</span>
                          <span className="text-[10px] font-bold text-muted-foreground hidden sm:inline px-1">الكمية:</span>
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center bg-background border border-input rounded-lg overflow-hidden shadow-sm h-8" dir="ltr">
                              <button
                                onClick={() => handleItemChange(i, { returnQty: Math.max(1, item.returnQty - 1) })}
                                className={`w-8 h-full flex items-center justify-center transition-colors border-r border-input ${item.returnQty <= 1 ? "text-muted-foreground/30 bg-muted/20 cursor-not-allowed" : "text-muted-foreground hover:bg-muted active:bg-muted/80"}`}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 text-center text-xs font-bold text-foreground">
                                {item.returnQty}
                              </span>
                              <button
                                onClick={() => handleItemChange(i, { returnQty: Math.min(item.originalQty, item.returnQty + 1) })}
                                className={`w-8 h-full flex items-center justify-center transition-colors border-l border-input ${item.returnQty >= item.originalQty ? "text-muted-foreground/30 bg-muted/20 cursor-not-allowed" : "text-muted-foreground hover:bg-muted active:bg-muted/80"}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap">{item.originalQty}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-muted/30 border border-border/50 p-4 rounded-2xl text-center">
                <p className="text-xs font-semibold text-muted-foreground">الرجاء اختيار طلب أولاً لعرض وتحديد المنتجات.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                سبب الاسترجاع *
              </label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData(p => ({ ...p, reason: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                placeholder="لماذا يود العميل إرجاع المنتجات؟"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" />
                ملاحظات إدارية (اختياري)
              </label>
              <textarea
                value={formData.adminNotes}
                onChange={(e) => setFormData(p => ({ ...p, adminNotes: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                placeholder="ملاحظات تظهر لفريق العمل فقط..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border bg-muted/30 flex items-center justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-semibold text-muted-foreground bg-background hover:bg-muted border border-border rounded-xl transition-all"
          >
            إلغاء
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending ||
              !formData.orderId ||
              !formData.customerName ||
              !formData.customerPhone ||
              !formData.reason ||
              orderItems.filter(i => i.selected).length === 0
            }
            className="px-6 py-2.5 text-sm font-bold text-primary-foreground bg-gradient-to-r from-primary to-primary/90 rounded-xl hover:shadow-lg hover:shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 disabled:hover:shadow-none flex items-center gap-2"
          >
            {mut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            تأكيد وإضافة الاسترجاع
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReturnsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: returns = [], isLoading } = useQuery<Return[]>({
    queryKey: ["returns"],
    queryFn: () => api.user.returns.list(),
    refetchInterval: 30000,
  });

  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const activeReturns = returns.filter(r => new Date(r.createdAt).getTime() >= threeDaysAgo);
  const archivedReturns = returns.filter(r => new Date(r.createdAt).getTime() < threeDaysAgo);

  const filteredReturns = (statusFilter === "archived" ? archivedReturns : activeReturns).filter((r) => {
    if (statusFilter !== "all" && statusFilter !== "archived" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.customerName.toLowerCase().includes(q) || r.customerPhone.includes(q) || String(r.id).includes(q) || (r.orderId ?? "").includes(q);
  });

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between gap-3 bg-muted/60 border border-border rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <RotateCcw className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">طلبات الاسترجاع</p>
            <p className="text-xs text-muted-foreground">معالجة استرجاع المنتجات الخاصة بالعملاء يدوياً من هذه الصفحة</p>
          </div>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة استرجاع</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم العميل أو رقم الطلب أو الاسترجاع..."
          className="w-full h-9 pr-9 pl-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div className="relative sm:hidden flex-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-9 ps-3 pe-8 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
          >
            {RETURN_FILTERS.map((f) => {
              let count = 0;
              if (f.value === "all") count = activeReturns.length;
              else if (f.value === "archived") count = archivedReturns.length;
              else count = activeReturns.filter((item: Return) => item.status === f.value).length;

              return (
                <option key={f.value} value={f.value}>
                  {f.label}{count > 0 ? ` (${count})` : ""}
                </option>
              );
            })}
          </select>
          <ChevronDown className="absolute top-1/2 -translate-y-1/2 end-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <div className="hidden sm:flex gap-1.5 flex-wrap">
          {RETURN_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            let count = 0;
            if (f.value === "all") count = activeReturns.length;
            else if (f.value === "archived") count = archivedReturns.length;
            else count = activeReturns.filter((item: Return) => item.status === f.value).length;

            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:border-border hover:bg-muted/50"
                  }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-bold ${active ? "bg-primary-foreground/20" : "bg-muted-foreground/15 text-muted-foreground"
                    }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredReturns.length === 0 ? (
        <div className="bg-card border border-border border-dashed rounded-2xl flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <RotateCcw className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-semibold mb-1">لا توجد استرجاعات</p>
          <p className="text-xs text-muted-foreground max-w-sm">لم يتم العثور على أي طلب استرجاع يطابق شروط البحث الحالية.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReturns.map((ret) => (
            <ReturnCard key={ret.id} ret={ret} />
          ))}
        </div>
      )}

      <CreateReturnModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </div>
  );
}
