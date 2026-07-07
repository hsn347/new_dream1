import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Truck, Edit2, X, CheckCircle2, Loader2,
  MapPin, Package, AlertCircle, Check,
} from "lucide-react";
import { api, type DeliveryZone } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type RateDraft = { unit: string; cost: string };

function RateRow({
  rate,
  onChange,
  onDelete,
  canDelete,
}: {
  rate: RateDraft;
  onChange: (r: RateDraft) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <input
          value={rate.unit}
          onChange={(e) => onChange({ ...rate, unit: e.target.value })}
          placeholder="الوحدة (مثال: كيلو، لتر، قطعة)"
          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="w-36 flex items-center gap-1">
        <input
          type="number"
          min="0"
          value={rate.cost}
          onChange={(e) => onChange({ ...rate, cost: e.target.value })}
          placeholder="0"
          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">ر.س</span>
      </div>
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ZoneCard({
  zone,
  onDeleted,
  onUpdated,
}: {
  zone: DeliveryZone;
  onDeleted: () => void;
  onUpdated: (z: DeliveryZone) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(zone.name);
  const [minOrder, setMinOrder] = useState(zone.minOrder);
  const [rates, setRates] = useState<RateDraft[]>(
    zone.rates.length > 0 ? zone.rates.map((r) => ({ unit: r.unit, cost: r.cost })) : [{ unit: "", cost: "" }],
  );

  const updateMutation = useMutation({
    mutationFn: () =>
      api.user.delivery.updateZone(zone.id, {
        name: name.trim(),
        minOrder,
        rates: rates.filter((r) => r.unit.trim() && r.cost),
      }),
    onSuccess: (updated) => {
      onUpdated(updated);
      queryClient.invalidateQueries({ queryKey: ["delivery"] });
      setEditing(false);
      toast({ title: "تم التحديث", description: "تم تحديث المنطقة والوكيل معاً" });
    },
    onError: () => toast({ title: "خطأ", description: "فشل تحديث المنطقة", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.user.delivery.removeZone(zone.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery"] });
      onDeleted();
      toast({ title: "تم الحذف", description: "تم حذف المنطقة وتحديث الوكيل" });
    },
    onError: () => toast({ title: "خطأ", description: "فشل حذف المنطقة", variant: "destructive" }),
  });

  const addRate = () => setRates((p) => [...p, { unit: "", cost: "" }]);
  const removeRate = (i: number) => setRates((p) => p.filter((_, idx) => idx !== i));
  const changeRate = (i: number, r: RateDraft) => setRates((p) => p.map((old, idx) => (idx === i ? r : old)));

  if (editing) {
    return (
      <div className="bg-card border-2 border-primary/30 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">تعديل المنطقة</p>
          <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
              اسم المنطقة / الموقع <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
              الحد الأدنى للطلب (ر.س)
            </label>
            <input
              type="number"
              min="0"
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-muted-foreground">
              تكاليف التوصيل حسب الوحدة
            </label>
            <button
              onClick={addRate}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />أضف وحدة
            </button>
          </div>
          <div className="space-y-2">
            {rates.map((r, i) => (
              <RateRow
                key={i}
                rate={r}
                onChange={(upd) => changeRate(i, upd)}
                onDelete={() => removeRate(i)}
                canDelete={rates.length > 1}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            مثال: لكل كيلو 12 ر.س | لكل لتر 6 ر.س | لكل قطعة 5 ر.س
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            حفظ التغييرات
          </button>
          <button
            onClick={() => setEditing(false)}
            className="h-9 px-4 border border-border text-muted-foreground rounded-lg text-xs hover:bg-muted transition-all"
          >
            إلغاء
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-2xl p-4 shadow-sm group hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{zone.name}</p>
            {zone.minOrder && zone.minOrder !== "0" && (
              <p className="text-[10px] text-muted-foreground">
                الحد الأدنى للطلب: {zone.minOrder} ر.س
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {zone.rates.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">لم تحدد تكاليف بعد</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {zone.rates.map((r) => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/60 rounded-lg text-xs font-medium text-foreground"
            >
              <Package className="w-3 h-3 text-muted-foreground" />
              {r.cost} ر.س / {r.unit}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AddZonePanel({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [minOrder, setMinOrder] = useState("0");
  const [rates, setRates] = useState<RateDraft[]>([{ unit: "", cost: "" }]);

  const addMutation = useMutation({
    mutationFn: () =>
      api.user.delivery.createZone({
        name: name.trim(),
        minOrder,
        rates: rates.filter((r) => r.unit.trim() && r.cost),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery"] });
      onAdded();
      toast({ title: "تمت الإضافة", description: "تمت إضافة المنطقة وتحديث الوكيل" });
    },
    onError: () => toast({ title: "خطأ", description: "فشل إضافة المنطقة", variant: "destructive" }),
  });

  const addRate = () => setRates((p) => [...p, { unit: "", cost: "" }]);
  const removeRate = (i: number) => setRates((p) => p.filter((_, idx) => idx !== i));
  const changeRate = (i: number, r: RateDraft) => setRates((p) => p.map((old, idx) => (idx === i ? r : old)));

  return (
    <div className="bg-muted/40 border border-border rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">إضافة منطقة توصيل جديدة</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
            اسم المنطقة / المدينة <span className="text-red-500">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: الرياض، القصيم، المنطقة الشرقية"
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">
            الحد الأدنى للطلب (ر.س)
          </label>
          <input
            type="number"
            min="0"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            placeholder="0"
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold text-muted-foreground">
            تكاليف التوصيل حسب الوحدة
          </label>
          <button onClick={addRate} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" />أضف وحدة
          </button>
        </div>
        <div className="space-y-2">
          {rates.map((r, i) => (
            <RateRow
              key={i}
              rate={r}
              onChange={(upd) => changeRate(i, upd)}
              onDelete={() => removeRate(i)}
              canDelete={rates.length > 1}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          مثال: لكل كيلو 12 ر.س | لكل لتر 6 ر.س | لكل قطعة 5 ر.س
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => addMutation.mutate()}
          disabled={!name.trim() || addMutation.isPending}
          className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {addMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          إضافة المنطقة
        </button>
        <button
          onClick={onClose}
          className="h-9 px-4 border border-border text-muted-foreground rounded-lg text-xs hover:bg-muted transition-all"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}

export default function DeliveryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["delivery"],
    queryFn: () => api.user.delivery.get(),
  });

  const freeDeliveryAll = data?.freeDeliveryAll ?? false;
  const unknownPolicy = data?.unknownLocationPolicy ?? "unavailable";
  const zones = data?.zones ?? [];

  const settingsMutation = useMutation({
    mutationFn: (update: { freeDeliveryAll?: boolean; unknownLocationPolicy?: string }) =>
      api.user.delivery.updateSettings(update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery"] });
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات التوصيل" });
    },
    onError: () => toast({ title: "خطأ", description: "فشل تحديث الإعداد", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Global Settings Card */}
      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Truck className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">إعدادات التوصيل العامة</h3>
            <p className="text-xs text-muted-foreground">تؤثر هذه الإعدادات على إجابات الوكيل الذكي</p>
          </div>
        </div>

        {/* Free for all toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">توصيل مجاني لجميع المناطق</p>
            <p className="text-xs text-muted-foreground mt-0.5">يتجاوز جميع تكاليف المناطق المحددة</p>
          </div>
          <button
            onClick={() => settingsMutation.mutate({ freeDeliveryAll: !freeDeliveryAll })}
            disabled={settingsMutation.isPending}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 disabled:opacity-70 ${
              freeDeliveryAll ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                freeDeliveryAll ? "right-1" : "left-1"
              }`}
            />
          </button>
        </div>

        {freeDeliveryAll && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              التوصيل مجاني لجميع المناطق — الوكيل يعلم بذلك تلقائياً
            </p>
          </div>
        )}

        {/* Unknown location policy */}
        <div className={`transition-opacity ${freeDeliveryAll ? "opacity-40 pointer-events-none" : ""}`}>
          <p className="text-sm font-medium text-foreground mb-2">
            المناطق غير المذكورة في القائمة
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => settingsMutation.mutate({ unknownLocationPolicy: "unavailable" })}
              className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-right transition-all ${
                unknownPolicy === "unavailable"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  unknownPolicy === "unavailable" ? "bg-red-500/15" : "bg-muted"
                }`}
              >
                <AlertCircle
                  className={`w-4 h-4 ${unknownPolicy === "unavailable" ? "text-red-500" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">لا يتوفر توصيل</p>
                <p className="text-[10px] text-muted-foreground">الوكيل يُبلّغ العميل بعدم التوفر</p>
              </div>
            </button>

            <button
              onClick={() => settingsMutation.mutate({ unknownLocationPolicy: "free" })}
              className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-right transition-all ${
                unknownPolicy === "free"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  unknownPolicy === "free" ? "bg-emerald-500/15" : "bg-muted"
                }`}
              >
                <CheckCircle2
                  className={`w-4 h-4 ${unknownPolicy === "free" ? "text-emerald-600" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">توصيل مجاني</p>
                <p className="text-[10px] text-muted-foreground">الوكيل يُبشّر العميل بالمجانية</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Zones section */}
      <div className={`space-y-3 transition-opacity ${freeDeliveryAll ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-foreground">مناطق التوصيل</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              كل منطقة يمكن أن يكون لها أسعار مختلفة لكل وحدة (كيلو، لتر، قطعة...)
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة منطقة
          </button>
        </div>

        {showAdd && (
          <AddZonePanel
            onClose={() => setShowAdd(false)}
            onAdded={() => setShowAdd(false)}
          />
        )}

        {zones.length === 0 && !showAdd ? (
          <div className="bg-card border border-card-border rounded-2xl p-10 flex flex-col items-center text-center">
            <Truck className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">لا توجد مناطق توصيل</p>
            <p className="text-xs text-muted-foreground mb-4">
              أضف مناطقك وحدد تكلفة التوصيل لكل وحدة قياس
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة أول منطقة
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {zones.map((zone) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                onDeleted={() => {}}
                onUpdated={() => {}}
              />
            ))}
          </div>
        )}
      </div>

      {/* Agent info banner */}
      <div className="bg-card border border-card-border rounded-2xl p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">مدمج مع الوكيل الذكي تلقائياً</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              أي تغيير في مناطق أو أسعار التوصيل يُحدَّث فوراً — الوكيل سيجيب بدقة على أسئلة مثل:
              "كم تكلفة شحن 5 كيلو للرياض؟"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
