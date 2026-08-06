import { useState, useEffect, useCallback } from "react";
import { api, type KnowledgeEntry, type KnowledgeEntryPayload } from "@/lib/api";
import { BookOpen, Plus, Save, Trash2, Pencil, X, Check, Brain, Loader2, RefreshCw } from "lucide-react";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  policy: { label: "سياسة", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  faq: { label: "سؤال شائع", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  custom: { label: "معلومة عامة", color: "bg-muted text-muted-foreground" },
};

const DEFAULT_TEMPLATES: KnowledgeEntryPayload[] = [
  { title: "سياسة الاسترجاع والاستبدال", content: "يمكن استرجاع المنتج خلال 7 أيام من تاريخ الاستلام بشرط أن يكون في حالته الأصلية وبالتغليف الأصلي. يتم رد المبلغ خلال 3-5 أيام عمل.", type: "policy" },
  { title: "سياسة الشحن والتوصيل", content: "نوصل لجميع مناطق المملكة. مدة التوصيل 2-5 أيام عمل. الشحن مجاني للطلبات التي تتجاوز 200 ريال.", type: "policy" },
  { title: "الضمان", content: "جميع منتجاتنا مضمونة 100% من حيث الجودة. في حالة وجود أي مشكلة يرجى التواصل معنا خلال 48 ساعة من الاستلام.", type: "policy" },
];

interface EditState {
  id: number;
  title: string;
  content: string;
  type: string;
}

export default function KnowledgePage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<KnowledgeEntryPayload>({ title: "", content: "", type: "custom" });
  const [saving, setSaving] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const loadEntries = useCallback(() => {
    setLoading(true);
    api.user.knowledge.list()
      .then(setEntries)
      .catch(() => toast({ title: "خطأ في تحميل قاعدة المعرفة", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleCreate = async () => {
    const isCustom = form.type === "custom";
    if (isCustom ? !form.content.trim() : (!form.title.trim() || !form.content.trim())) return;
    const payload = isCustom
      ? { ...form, title: form.content.trim().slice(0, 70) + (form.content.length > 70 ? "…" : "") }
      : form;
    setSaving(true);
    try {
      const created = await api.user.knowledge.create(payload);
      setEntries(prev => [...prev, created]);
      setForm({ title: "", content: "", type: "custom" });
      setShowModal(false);
      toast({ title: "✅ تم إضافة المعلومة وتضمينها في قاعدة المعرفة" });
    } catch (err) {
      toast({ title: "خطأ في الإضافة", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editState || !editState.title.trim() || !editState.content.trim()) return;
    setEditSaving(true);
    try {
      const updated = await api.user.knowledge.update(editState.id, {
        title: editState.title,
        content: editState.content,
        type: editState.type,
      });
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      setEditState(null);
      toast({ title: "✅ تم تحديث المعلومة وإعادة تضمينها" });
    } catch (err) {
      toast({ title: "خطأ في التحديث", description: (err as Error).message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await api.user.knowledge.remove(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast({ title: "تم حذف المعلومة من قاعدة المعرفة" });
    } catch (err) {
      toast({ title: "خطأ في الحذف", description: (err as Error).message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const created = await api.user.knowledge.bulk(DEFAULT_TEMPLATES);
      setEntries(prev => [...prev, ...created]);
      toast({ title: `✅ تم إضافة ${created.length} قوالب افتراضية وتضمينها في الوكيل` });
    } catch (err) {
      toast({ title: "خطأ في تحميل القوالب", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditState({ id: entry.id, title: entry.title, content: entry.content, type: entry.type });
  };

  const cancelEdit = () => setEditState(null);

  return (
    <div className="space-y-4">
      {/* Header info banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">قاعدة المعرفة مدمجة مع الوكيل بنظام RAG</p>
          <p className="text-xs text-muted-foreground mt-0.5">كل معلومة تضيفها يتم تضمينها تلقائياً ويبحث فيها الوكيل عند الإجابة على أسئلة العملاء</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {loading ? "جاري التحميل..." : `${entries.length} معلومة في قاعدة المعرفة`}
          </p>
          <button onClick={loadEntries} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {entries.length === 0 && !loading && (
            <button
              onClick={handleLoadTemplates}
              disabled={loadingTemplates}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              {loadingTemplates ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
              <span>تحميل القوالب الافتراضية</span>
            </button>
          )}
          <button
            data-testid="btn-add-knowledge"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /><span>إضافة معلومة</span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <PageLoader text="جاري تحميل قاعدة المعرفة..." />
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">قاعدة المعرفة فارغة</p>
          <p className="text-xs mt-1">أضف معلومات وسياسات لتجعل الوكيل أكثر دقة في إجاباته</p>
        </div>
      )}

      {/* Entries list */}
      {!loading && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map(entry => {
            const isEditing = editState?.id === entry.id;
            const typeInfo = TYPE_LABELS[entry.type] ?? TYPE_LABELS["custom"]!;

            return (
              <div key={entry.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                {isEditing ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={editState.title}
                        onChange={e => setEditState(s => s ? { ...s, title: e.target.value } : s)}
                        className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="عنوان المعلومة"
                      />
                      <select
                        value={editState.type}
                        onChange={e => setEditState(s => s ? { ...s, type: e.target.value } : s)}
                        className="h-9 px-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="policy">سياسة</option>
                        <option value="faq">سؤال شائع</option>
                        <option value="custom">معلومة عامة</option>
                      </select>
                    </div>
                    <textarea
                      value={editState.content}
                      onChange={e => setEditState(s => s ? { ...s, content: e.target.value } : s)}
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="محتوى المعلومة..."
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={cancelEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">
                        <X className="w-3.5 h-3.5" />إلغاء
                      </button>
                      <button
                        onClick={handleEdit}
                        disabled={editSaving || !editState.title.trim() || !editState.content.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        {editSaving ? "جاري الحفظ..." : "حفظ"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground text-sm">{entry.title}</h3>
                        <Badge className={`text-[10px] px-1.5 py-0 ${typeInfo.color} border-0`}>{typeInfo.label}</Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(entry)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                          title="تعديل"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                          title="حذف"
                        >
                          {deletingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-2">
                      آخر تحديث: {new Date(entry.updatedAt).toLocaleDateString("ar-SA")}
                      {" · "}مضمّنة في الوكيل ✓
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              إضافة معلومة جديدة لقاعدة المعرفة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">النوع</label>
              <div className="flex gap-2">
                {[
                  { value: "custom", label: "معلومة عامة", desc: "معلومة واحدة فقط" },
                  { value: "policy", label: "سياسة", desc: "لها عنوان + محتوى" },
                  { value: "faq", label: "سؤال شائع", desc: "سؤال + جواب" },
                ].map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: t.value }))}
                    className={cn(
                      "flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all text-center",
                      form.type === t.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/70 hover:bg-muted/50",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {form.type !== "custom" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">العنوان *</label>
                <input
                  data-testid="input-knowledge-title"
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder={form.type === "faq" ? "مثال: ما هي طريقة الدفع؟" : "مثال: سياسة الاسترجاع"}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {form.type === "custom" ? "المعلومة *" : form.type === "faq" ? "الجواب *" : "المحتوى *"}
              </label>
              <textarea
                data-testid="textarea-knowledge-content"
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder={
                  form.type === "custom"
                    ? "اكتب معلومتك هنا... مثال: نحن نشحن لجميع مناطق اليمن. مدة التوصيل 1-3 أيام."
                    : form.type === "faq"
                    ? "اكتب الجواب بشكل واضح..."
                    : "اكتب المحتوى بشكل واضح حتى يستطيع الوكيل الإجابة بدقة..."
                }
                rows={form.type === "custom" ? 6 : 5}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 flex items-start gap-2">
              <Brain className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">هذه المعلومة ستُضمَّن تلقائياً في نظام RAG وسيبحث الوكيل فيها عند إجابة أسئلة العملاء ذات الصلة</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm">إلغاء</button>
            <button
              data-testid="btn-save-knowledge"
              onClick={handleCreate}
              disabled={saving || (form.type === "custom" ? !form.content.trim() : (!form.title.trim() || !form.content.trim()))}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "جاري الحفظ والتضمين..." : "حفظ وتضمين في الوكيل"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
