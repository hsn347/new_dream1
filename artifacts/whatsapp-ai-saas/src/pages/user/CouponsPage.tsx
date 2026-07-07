import { useState, useEffect } from "react";
import { api, type Coupon, type CouponPayload, type Product } from "@/lib/api";
import { Plus, Copy, Trash2, Tag, Edit2, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const emptyForm = { code: "", type: "percent", value: "", start: "", end: "", products: "الكل" };

function ProductMultiSelect({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selected: string[] = value === "الكل" ? [] : value.split(",").map((s) => s.trim()).filter(Boolean);
  const allSelected = value === "الكل" || selected.length === 0;

  const toggle = (name: string) => {
    if (allSelected) {
      onChange(name);
      return;
    }
    const next = selected.includes(name)
      ? selected.filter((s) => s !== name)
      : [...selected, name];
    onChange(next.length === 0 ? "الكل" : next.join(", "));
  };

  const toggleAll = () => {
    onChange("الكل");
  };

  const displayLabel = allSelected
    ? "جميع المنتجات"
    : selected.length === 1
    ? selected[0]!
    : `${selected.length} منتجات محددة`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm text-right flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={allSelected ? "text-muted-foreground" : "text-foreground"}>{displayLabel}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-auto max-h-52">
          <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted border-b border-border">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded accent-primary"
            />
            <span className="text-sm font-medium">جميع المنتجات</span>
          </label>
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted">
              <input
                type="checkbox"
                checked={!allSelected && selected.includes(p.name)}
                onChange={() => toggle(p.name)}
                className="rounded accent-primary"
              />
              <span className="text-sm">{p.name}</span>
              <span className="text-xs text-muted-foreground mr-auto">{p.price} {p.currency}</span>
            </label>
          ))}
          {products.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-3 text-center">لا توجد منتجات بعد</p>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

export default function CouponsPage() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    Promise.all([
      api.user.coupons.list(),
      api.user.products.list(),
    ])
      .then(([c, p]) => { setCoupons(c); setProducts(p.items.filter((pr) => pr.status === "active")); })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (c: Coupon) => {
    setEditTarget(c);
    setForm({
      code: c.code,
      type: c.type,
      value: c.value,
      start: c.startDate ?? "",
      end: c.endDate ?? "",
      products: c.products,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.value) return;
    setSaving(true);
    try {
      const payload: CouponPayload = {
        code: form.code,
        type: form.type,
        value: form.value,
        startDate: form.start || undefined,
        endDate: form.end || undefined,
        products: form.products || "الكل",
        status: "active",
      };

      if (editTarget) {
        const updated = await api.user.coupons.update(editTarget.id, payload);
        setCoupons((prev) => prev.map((c) => (c.id === editTarget.id ? updated : c)));
        toast({ title: "✓ تم تحديث الكوبون" });
      } else {
        const created = await api.user.coupons.create(payload);
        setCoupons((prev) => [...prev, created]);
        toast({ title: "تم إضافة الكوبون بنجاح" });
      }

      setForm(emptyForm);
      setEditTarget(null);
      setShowModal(false);
    } catch (err) {
      toast({ title: editTarget ? "خطأ في التحديث" : "خطأ في الإضافة", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.user.coupons.remove(id);
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "تم حذف الكوبون" });
    } catch (err) {
      toast({ title: "خطأ في الحذف", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast({ title: "تم نسخ الكود", description: code });
    });
  };

  const isExpired = (c: Coupon) => {
    if (c.status === "expired") return true;
    if (c.endDate) {
      const today = new Date().toISOString().split("T")[0]!;
      return c.endDate < today;
    }
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "جاري التحميل..." : `${coupons.length} كوبون`}
        </p>
        <button
          data-testid="btn-add-coupon"
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة كوبون</span>
        </button>
      </div>

      {loading && (
        <div className="text-center py-16 text-muted-foreground text-sm">جاري تحميل الكوبونات...</div>
      )}

      {!loading && coupons.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">لا توجد كوبونات بعد</p>
          <p className="text-xs mt-1">اضغط "إضافة كوبون" لإنشاء أول كوبون خصم</p>
        </div>
      )}

      {!loading && coupons.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map((c) => {
            const expired = isExpired(c);
            return (
              <div
                key={c.id}
                data-testid={`card-coupon-${c.id}`}
                className={`bg-card border rounded-xl p-5 shadow-sm relative overflow-hidden ${expired ? "opacity-60" : ""}`}
              >
                <div
                  className="absolute top-0 bottom-0 end-0 w-1 rounded-r-xl"
                  style={{ background: expired ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))" }}
                />
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Tag className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground font-mono text-sm tracking-wider">{c.code}</p>
                      <Badge
                        className={`text-[10px] mt-0.5 ${expired ? "bg-muted text-muted-foreground hover:bg-muted" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"}`}
                      >
                        {expired ? "منتهي" : "نشط"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      data-testid={`btn-copy-coupon-${c.id}`}
                      onClick={() => handleCopy(c.code)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                      title="نسخ الكود"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="تعديل الكوبون"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      data-testid={`btn-delete-coupon-${c.id}`}
                      onClick={() => handleDelete(c.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">الخصم</span>
                    <span className="text-sm font-bold text-primary">
                      {c.type === "percent" ? `${c.value}%` : `${c.value} ر.س`}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">المنتجات</span>
                    <span className="text-xs text-foreground text-end leading-relaxed">{c.products}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{c.startDate ?? "—"}</span>
                    <span className="text-muted-foreground/50">—</span>
                    <span>{c.endDate ?? "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={(v) => { setShowModal(v); if (!v) { setEditTarget(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editTarget ? `تعديل: ${editTarget.code}` : "إضافة كوبون جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">رمز الكوبون *</label>
              <input
                data-testid="input-coupon-code"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="SUMMER25"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">نوع الخصم</label>
                <select
                  data-testid="select-coupon-type"
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="percent">نسبة مئوية (%)</option>
                  <option value="fixed">مبلغ ثابت (ر.س)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">القيمة *</label>
                <input
                  data-testid="input-coupon-value"
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
                  placeholder={form.type === "percent" ? "25" : "50"}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">تاريخ البداية</label>
                <input
                  data-testid="input-coupon-start"
                  type="date"
                  value={form.start}
                  onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">تاريخ النهاية</label>
                <input
                  data-testid="input-coupon-end"
                  type="date"
                  value={form.end}
                  onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">المنتجات المشمولة</label>
              <ProductMultiSelect
                products={products}
                value={form.products}
                onChange={(v) => setForm((p) => ({ ...p, products: v }))}
              />
              <p className="text-xs text-muted-foreground mt-1">اختر المنتجات التي يُطبَّق عليها الكوبون</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => { setShowModal(false); setEditTarget(null); setForm(emptyForm); }}
              className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm"
            >
              إلغاء
            </button>
            <button
              data-testid="btn-save-coupon"
              onClick={handleSave}
              disabled={saving || !form.code || !form.value}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : editTarget ? "حفظ التعديلات" : "حفظ الكوبون"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
