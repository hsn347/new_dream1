import { useState, useEffect, useRef } from "react";
import { api, type Product, type ProductPayload } from "@/lib/api";
import {
  Plus, Edit2, Trash2, Package, Search, ImageIcon, X, Save, Check, Upload, Loader2,
  ChevronLeft, Tag, Archive, ToggleLeft, ToggleRight, Info, AlertTriangle,
  FileSpreadsheet, PackagePlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const units = ["قطعة", "كيلو", "لتر", "عبوة", "صندوق", "غير ذلك"];
const currencies = ["SAR", "AED", "USD", "EGP", "YER"];

type FormState = {
  name: string; description: string; qty: string; unit: string;
  price: string; negotiationPrice: string; status: string;
};

const emptyForm: FormState = {
  name: "", description: "", qty: "", unit: "قطعة",
  price: "", negotiationPrice: "", status: "active",
};

function productToForm(p: Product): FormState {
  return {
    name: p.name, description: p.description, qty: String(p.qty), unit: p.unit,
    price: p.price, negotiationPrice: p.negotiationPrice ?? "", status: p.status,
  };
}

function ImageUploader({
  productId,
  currentUrl,
  onUploaded,
}: { productId?: number; currentUrl?: string | null; onUploaded?: (url: string) => void }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setPreview(currentUrl ?? null); }, [currentUrl]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "نوع الملف غير مدعوم", description: "يرجى اختيار صورة", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "الصورة كبيرة جداً", description: "الحد الأقصى 8 ميغابايت", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      if (!productId) return;
      const base64 = dataUrl.split(",")[1]!;
      setUploading(true);
      try {
        const { imageUrl } = await api.user.products.uploadImage(productId, base64, file.type);
        setPreview(imageUrl);
        onUploaded?.(imageUrl);
        toast({ title: "✓ تم رفع الصورة بنجاح" });
      } catch (err) {
        toast({ title: "فشل رفع الصورة", description: (err as Error).message, variant: "destructive" });
        setPreview(currentUrl ?? null);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className="block text-sm font-semibold mb-2 text-foreground">صورة المنتج</label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          "relative w-full h-44 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer overflow-hidden group",
          uploading ? "border-primary/40 bg-primary/5 cursor-wait" : "border-border hover:border-primary/50 hover:bg-muted/30",
          preview ? "border-solid" : "",
        )}
      >
        {preview ? (
          <>
            <img src={preview} alt="معاينة" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 text-white">
              <Upload className="w-6 h-6" />
              <span className="text-xs font-medium">انقر لتغيير الصورة</span>
            </div>
          </>
        ) : (
          <>
            {uploading
              ? <Loader2 className="w-9 h-9 text-primary animate-spin" />
              : <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center"><Upload className="w-6 h-6 text-muted-foreground" /></div>
            }
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{uploading ? "جاري الرفع..." : "اسحب الصورة هنا أو انقر"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP — حتى 8MB</p>
            </div>
          </>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-2xl">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <span className="text-xs text-primary font-medium">جاري رفع الصورة...</span>
            </div>
          </div>
        )}
      </div>

      {preview && !uploading && (
        <button
          onClick={() => { setPreview(null); if (inputRef.current) inputRef.current.value = ""; }}
          className="mt-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1 transition-colors"
        >
          <X className="w-3 h-3" />إزالة الصورة
        </button>
      )}
      {!productId && (
        <p className="mt-1.5 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <Info className="w-3 h-3 shrink-0" />
          احفظ المنتج أولاً لتتمكن من رفع الصورة
        </p>
      )}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5 text-foreground">
        {label}{required && <span className="text-red-500 me-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const selectCls = "w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer";

function ProductForm({
  initial, onSave, onCancel, title, saving, savedProduct, globalCurrency,
}: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  title: string;
  saving?: boolean;
  savedProduct?: Product | null;
  globalCurrency: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [product, setProduct] = useState<Product | null>(savedProduct ?? null);

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="max-w-2xl mx-auto" dir="rtl">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ChevronLeft className="w-4 h-4 rotate-180" />العودة للمنتجات
      </button>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-4.5 h-4.5 text-primary" />
          </div>
          <h2 className="font-bold text-foreground text-base">{title}</h2>
        </div>

        <div className="p-6 space-y-6">
          <ImageUploader
            productId={product?.id}
            currentUrl={product?.imageUrl}
            onUploaded={(url) => setProduct((p) => p ? { ...p, imageUrl: url } : null)}
          />

          <div className="grid gap-5">
            <Field label="اسم المنتج" required>
              <input value={form.name} onChange={set("name")} placeholder="مثال: عسل السدر الملكي" className={inputCls} />
            </Field>

            <Field label="وصف المنتج">
              <textarea value={form.description} onChange={set("description")}
                placeholder="وصف تفصيلي يساعد الوكيل على فهم المنتج والإجابة بدقة للزبائن..."
                rows={3} className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed transition-shadow" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="الكمية المتاحة">
                <input type="number" value={form.qty} onChange={set("qty")} placeholder="0" min="0" className={inputCls} />
              </Field>
              <Field label="وحدة القياس">
                <select value={form.unit} onChange={set("unit")} className={selectCls}>
                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="سعر البيع" required>
                <div className="relative">
                  <input type="number" value={form.price} onChange={set("price")} placeholder="0.00" min="0"
                    className="w-full h-11 ps-4 pe-14 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow" />
                  <span className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-muted-foreground font-bold bg-muted px-1.5 py-0.5 rounded-md">{globalCurrency}</span>
                </div>
              </Field>
              <Field label="سعر المساومة (سري)">
                <div className="relative">
                  <input type="number" value={form.negotiationPrice} onChange={set("negotiationPrice")} placeholder="0.00" min="0"
                    className="w-full h-11 ps-4 pe-14 rounded-xl border border-amber-500/20 bg-amber-500/10/50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 transition-shadow" />
                  <span className="absolute top-1/2 -translate-y-1/2 end-3 text-xs text-amber-600 font-bold bg-amber-500/15 px-1.5 py-0.5 rounded-md">{globalCurrency}</span>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-300 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3 shrink-0" />
                  لا يُكشف للزبون إلا عند الحاجة فقط
                </p>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Field label="حالة المنتج">
                <select value={form.status} onChange={set("status")} className={selectCls}>
                  <option value="active">نشط — متاح للبيع</option>
                  <option value="inactive">غير نشط — مخفي</option>
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/10">
          <button onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted text-sm transition-all">
            <X className="w-4 h-4" />إلغاء
          </button>
          <button onClick={() => onSave(form)} disabled={!form.name.trim() || !form.price.trim() || saving}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
              saving ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}>
            {saving ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "جاري الحفظ..." : "حفظ المنتج"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, onEdit, onDelete, onToggle, onAddStock, lowStockThreshold, globalCurrency }: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onAddStock: (qty: number) => Promise<void>;
  lowStockThreshold: number;
  globalCurrency: string;
}) {
  const isActive = product.status === "active";
  const isLowStock = isActive && product.qty > 0 && product.qty <= lowStockThreshold;
  const isOutOfStock = isActive && product.qty <= 0;
  const [showRestock, setShowRestock] = useState(false);
  const [restockQty, setRestockQty] = useState("");
  const [restocking, setRestocking] = useState(false);
  const restockInputRef = useRef<HTMLInputElement>(null);

  const handleRestock = async () => {
    const qty = Number(restockQty);
    if (!qty || qty <= 0) return;
    setRestocking(true);
    try {
      await onAddStock(qty);
      setShowRestock(false);
      setRestockQty("");
    } finally {
      setRestocking(false);
    }
  };

  return (
    <div className={cn(
      "bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all group flex flex-col",
      !isActive && "opacity-60 border-border",
      isLowStock ? "border-orange-300" : "border-border",
    )}>
      <div className="relative h-44 bg-gradient-to-br from-muted/60 to-muted/30 overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <div className="w-14 h-14 rounded-2xl bg-muted/80 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 opacity-40" />
            </div>
            <span className="text-xs opacity-50">لا توجد صورة</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <Badge className={cn(
          "absolute top-2 start-2 text-[10px] h-5 px-1.5 font-semibold",
          isActive ? "bg-emerald-500/90 text-white hover:bg-emerald-500/90" : "bg-muted/400/80 text-white hover:bg-muted/400/80",
        )}>
          {isActive ? "نشط" : "مخفي"}
        </Badge>
        {isOutOfStock && (
          <Badge className="absolute top-2 end-2 text-[10px] h-5 px-1.5 font-semibold bg-red-500/90 text-white hover:bg-red-500/90">
            نفذ
          </Badge>
        )}
        {isLowStock && (
          <Badge className="absolute top-2 end-2 text-[10px] h-5 px-1.5 font-semibold bg-orange-500/90 text-white hover:bg-orange-500/90 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            مخزون منخفض
          </Badge>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex-1">
          <h3 className="font-bold text-foreground text-sm leading-snug line-clamp-1">{product.name}</h3>
          {product.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{product.description}</p>
          )}
        </div>

        <div className="flex items-end justify-between pt-2 border-t border-border">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-foreground tabular-nums">{product.price}</span>
              <span className="text-xs text-muted-foreground font-medium">{globalCurrency}</span>
            </div>
            <div className={cn("flex items-center gap-1 mt-0.5", isLowStock && "text-orange-500")}>
              <Archive className="w-3 h-3" />
              <span className={cn("text-[11px] font-medium", isLowStock ? "text-orange-500" : "text-muted-foreground")}>
                {product.qty} {product.unit}
                {isLowStock && " ⚠️"}
              </span>
            </div>
          </div>
          {product.negotiationPrice && (
            <div className="text-end">
              <div className="flex items-center gap-0.5 text-amber-600 justify-end">
                <Tag className="w-3 h-3" />
                <span className="text-[10px] font-semibold">سعر تفاوض</span>
              </div>
              <span className="text-xs text-amber-600 dark:text-amber-300 font-bold">{product.negotiationPrice} {globalCurrency}</span>
            </div>
          )}
        </div>

        {/* Restock inline panel */}
        {showRestock && (
          <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20 animate-in slide-in-from-top-1 duration-150">
            <PackagePlus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <input
              ref={restockInputRef}
              type="number"
              min="1"
              value={restockQty}
              onChange={e => setRestockQty(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleRestock(); if (e.key === "Escape") { setShowRestock(false); setRestockQty(""); } }}
              placeholder="الكمية المضافة"
              className="flex-1 h-7 px-2 rounded-lg border border-emerald-500/30 bg-background text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-right"
              autoFocus
            />
            <button onClick={handleRestock} disabled={!restockQty || Number(restockQty) <= 0 || restocking}
              className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors disabled:opacity-40">
              {restocking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            </button>
            <button onClick={() => { setShowRestock(false); setRestockQty(""); }}
              className="w-7 h-7 rounded-lg border border-border text-muted-foreground hover:bg-muted flex items-center justify-center transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-1">
          <button onClick={onEdit}
            className="flex-1 h-8 rounded-xl border border-border text-xs text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5 font-semibold">
            <Edit2 className="w-3 h-3" />تعديل
          </button>
          <button
            onClick={() => { setShowRestock(v => !v); setRestockQty(""); setTimeout(() => restockInputRef.current?.focus(), 50); }}
            title="إضافة للمخزون"
            className={cn(
              "w-8 h-8 rounded-xl border text-xs transition-all flex items-center justify-center",
              showRestock
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : "border-border text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500/20",
            )}>
            <PackagePlus className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggle}
            title={isActive ? "إخفاء المنتج" : "إظهار المنتج"}
            className="w-8 h-8 rounded-xl border border-border text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center">
            {isActive ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={onDelete}
            className="w-8 h-8 rounded-xl border border-border text-red-400 hover:text-red-600 hover:bg-red-500/10 hover:border-red-500/20 transition-all flex items-center justify-center">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const PER_PAGE = 20;

function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;

  const getPageNums = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const nums: (number | "…")[] = [1];
    if (page > 3) nums.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) nums.push(i);
    if (page < pages - 2) nums.push("…");
    nums.push(pages);
    return nums;
  };

  return (
    <div className="flex items-center justify-between pt-2" dir="rtl">
      <p className="text-xs text-muted-foreground">
        عرض {Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)} من {total} منتج
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
          ‹ السابق
        </button>
        {getPageNums().map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-muted-foreground">…</span>
          ) : (
            <button key={n} onClick={() => onChange(n as number)}
              className={cn(
                "w-8 h-8 rounded-lg border text-xs font-medium transition-colors",
                n === page ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}>
              {n}
            </button>
          )
        )}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors">
          التالي ›
        </button>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, inactive: 0, low_stock: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "low_stock">("all");
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [justCreated, setJustCreated] = useState<Product | null>(null);
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [globalCurrency, setGlobalCurrency] = useState("SAR");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = async (opts?: { p?: number; q?: string; status?: string; threshold?: number }) => {
    setLoading(true);
    try {
      const res = await api.user.products.list({
        page: opts?.p ?? page,
        limit: PER_PAGE,
        q: opts?.q !== undefined ? opts.q : search,
        status: opts?.status !== undefined ? opts.status : filterStatus,
        threshold: opts?.threshold ?? lowStockThreshold,
      });
      setProducts(res.items);
      setTotal(res.total);
      setCounts(res.counts);
    } catch {
      toast({ title: "خطأ في تحميل المنتجات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.user.settings().then(s => {
      const t = s.lowStockThreshold ?? 5;
      setLowStockThreshold(t);
      setGlobalCurrency(s.currency ?? "SAR");
      fetchProducts({ threshold: t });
    }).catch(() => fetchProducts());
  }, []);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      fetchProducts({ p: 1, q: val });
    }, 300);
  };

  const handleFilterChange = (s: "all" | "active" | "inactive" | "low_stock") => {
    setFilterStatus(s);
    setPage(1);
    fetchProducts({ p: 1, status: s });
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchProducts({ p });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddSave = async (f: FormState) => {
    setSaving(true);
    try {
      const payload: ProductPayload = {
        name: f.name.trim(), description: f.description.trim(),
        qty: Number(f.qty) || 0, unit: f.unit,
        price: f.price, negotiationPrice: f.negotiationPrice.trim() || undefined,
        currency: globalCurrency, status: f.status,
      };
      const created = await api.user.products.create(payload);
      setShowAdd(false);
      setJustCreated(created);
      setEditTarget(created);
      toast({ title: "تم إضافة المنتج — يمكنك الآن رفع الصورة" });
      fetchProducts({ p: 1 });
      setPage(1);
    } catch (err) {
      toast({ title: "خطأ في الإضافة", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (f: FormState) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const updated = await api.user.products.update(editTarget.id, {
        name: f.name.trim(), description: f.description.trim(),
        qty: Number(f.qty) || 0, unit: f.unit,
        price: f.price, negotiationPrice: f.negotiationPrice.trim() || undefined,
        currency: globalCurrency, status: f.status,
      });
      setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...updated, imageUrl: p.imageUrl } : p));
      setEditTarget(null);
      setJustCreated(null);
      toast({ title: "✓ تم تحديث المنتج" });
      fetchProducts();
    } catch (err) {
      toast({ title: "خطأ في التحديث", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    const newStatus = product.status === "active" ? "inactive" : "active";
    try {
      await api.user.products.update(product.id, { status: newStatus });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: newStatus } : p));
      fetchProducts();
    } catch {
      toast({ title: "خطأ في تغيير الحالة", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.user.products.remove(id);
      setProducts(prev => prev.filter(p => p.id !== id));
      setTotal(t => t - 1);
      toast({ title: "تم حذف المنتج" });
      fetchProducts();
    } catch (err) {
      toast({ title: "خطأ في الحذف", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleAddStock = async (id: number, qty: number) => {
    try {
      const updated = await api.user.products.addStock(id, qty);
      setProducts(prev => prev.map(p => p.id === id ? { ...p, qty: updated.qty } : p));
      toast({ title: `✓ تمت إضافة ${qty} للمخزون` });
    } catch (err) {
      toast({ title: "خطأ في تحديث المخزون", description: (err as Error).message, variant: "destructive" });
      throw err;
    }
  };

  const handleImportExcel = async (file: File) => {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const result = await api.user.products.importExcel(base64);
      if (result.imported > 0) {
        setPage(1);
        fetchProducts({ p: 1 });
      }
      toast({
        title: result.imported > 0 ? `✓ تم استيراد ${result.imported} منتج` : "لم يُستورد أي منتج",
        description: result.skipped > 0
          ? `تم تخطي ${result.skipped} صف — تأكد من وجود عمودَي name و price`
          : undefined,
        variant: result.imported === 0 ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "خطأ في الاستيراد", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  if (showAdd) {
    return <ProductForm initial={emptyForm} onSave={handleAddSave} onCancel={() => setShowAdd(false)} title="إضافة منتج جديد" saving={saving} globalCurrency={globalCurrency} />;
  }
  if (editTarget) {
    return (
      <ProductForm
        initial={productToForm(editTarget)}
        onSave={handleEditSave}
        onCancel={() => { setEditTarget(null); setJustCreated(null); }}
        title={justCreated ? `✓ تمت الإضافة — ${editTarget.name}` : `تعديل: ${editTarget.name}`}
        saving={saving}
        savedProduct={editTarget}
        globalCurrency={globalCurrency}
      />
    );
  }

  const tabCounts = {
    all: total,
    active: counts.active,
    inactive: counts.inactive,
    low_stock: counts.low_stock,
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-muted-foreground" />
          <input type="search" value={search} onChange={e => handleSearchChange(e.target.value)}
            placeholder="بحث في جميع المنتجات..."
            className="w-full h-9 ps-9 pe-3 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 flex-wrap">
          {([
            { key: "all",       label: "الكل" },
            { key: "active",    label: "نشط" },
            { key: "inactive",  label: "مخفي" },
            { key: "low_stock", label: "⚠️ منخفض" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => handleFilterChange(key)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                filterStatus === key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                key === "low_stock" && counts.low_stock > 0 && filterStatus !== "low_stock" && "text-orange-500 hover:text-orange-600",
              )}>
              {label}
              <span className={cn(
                "text-[10px] rounded-full px-1",
                filterStatus === key ? "bg-primary/10 text-primary" : "bg-background/60",
                key === "low_stock" && counts.low_stock > 0 && filterStatus !== "low_stock" && "bg-orange-100 text-orange-600",
              )}>
                {key === "all" ? total : tabCounts[key]}
              </span>
            </button>
          ))}
        </div>

        <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImportExcel(f); }} />
        <button onClick={() => importInputRef.current?.click()} disabled={importing}
          title="استيراد منتجات من Excel"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-60">
          {importing
            ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الاستيراد...</>
            : <><FileSpreadsheet className="w-4 h-4 text-emerald-600" />استيراد Excel</>}
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm">
          <Plus className="w-4 h-4" />إضافة منتج
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
              <div className="h-44 bg-muted/60" />
              <div className="p-4 space-y-2.5">
                <div className="h-4 bg-muted rounded-lg w-3/4" />
                <div className="h-3 bg-muted rounded-lg w-full" />
                <div className="h-3 bg-muted rounded-lg w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <div className="w-20 h-20 rounded-3xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
            <Package className="w-9 h-9 opacity-25" />
          </div>
          <p className="font-bold text-base">{search || filterStatus !== "all" ? "لا توجد نتائج" : "لا توجد منتجات بعد"}</p>
          {!search && filterStatus === "all" && (
            <p className="text-sm mt-1.5 opacity-70">اضغط "إضافة منتج" لإضافة أول منتج في كتالوجك</p>
          )}
        </div>
      )}

      {!loading && products.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                onEdit={() => setEditTarget(p)}
                onDelete={() => handleDelete(p.id)}
                onToggle={() => handleToggleStatus(p)}
                onAddStock={qty => handleAddStock(p.id, qty)}
                lowStockThreshold={lowStockThreshold}
                globalCurrency={globalCurrency}
              />
            ))}
          </div>
          <Pagination page={page} total={total} perPage={PER_PAGE} onChange={handlePageChange} />
        </>
      )}
    </div>
  );
}
