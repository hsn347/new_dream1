import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Shield, UserCheck, Clock, X, Save, Loader2, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Admin {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const statusConfig = {
  active:   { label: "نشط",   className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" },
  pending:  { label: "معلق",  className: "bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20" },
  disabled: { label: "موقوف", className: "bg-red-500/15 text-red-600 hover:bg-red-500/20" },
};

const emptyForm = { name: "", email: "", password: "", phone: "", status: "active" };

export default function AdminsPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Admin | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Admin | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const data = await api.admins.list();
      setAdmins(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (admin: Admin) => {
    setEditTarget(admin);
    setForm({ name: admin.name, email: admin.email, password: "", phone: admin.phone ?? "", status: admin.status });
    setShowPassword(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) {
      toast({ title: "خطأ", description: "الاسم والبريد الإلكتروني مطلوبان", variant: "destructive" });
      return;
    }
    if (!editTarget && !form.password) {
      toast({ title: "خطأ", description: "كلمة المرور مطلوبة عند الإنشاء", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editTarget) {
        const payload: Record<string, string> = { name: form.name, email: form.email, phone: form.phone, status: form.status };
        if (form.password) payload["password"] = form.password;
        await api.admins.update(editTarget.id, payload);
        toast({ title: "تم الحفظ", description: "تم تحديث بيانات المسؤول بنجاح" });
      } else {
        await api.admins.create({ name: form.name, email: form.email, password: form.password, phone: form.phone || undefined });
        toast({ title: "تم الإنشاء", description: "تم إنشاء حساب المسؤول بنجاح" });
      }
      setShowModal(false);
      await load();
    } catch (err: unknown) {
      toast({ title: "خطأ", description: err instanceof Error ? err.message : "حدث خطأ غير متوقع", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.admins.remove(deleteTarget.id);
      toast({ title: "تم الحذف", description: `تم حذف حساب "${deleteTarget.name}" بنجاح` });
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      toast({ title: "خطأ", description: err instanceof Error ? err.message : "حدث خطأ", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = admins.filter(a => a.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {[
          { label: "إجمالي المسؤولين", value: admins.length, icon: Shield, color: "text-primary" },
          { label: "المسؤولون النشطون", value: activeCount, icon: UserCheck, color: "text-emerald-500" },
          { label: "آخر تسجيل دخول", value: admins.filter(a => a.lastLoginAt).length > 0
              ? new Date(admins.sort((a, b) => (b.lastLoginAt ?? "").localeCompare(a.lastLoginAt ?? ""))[0]?.lastLoginAt ?? "").toLocaleDateString("ar")
              : "—", icon: Clock, color: "text-amber-500", text: true },
        ].map(({ label, value, icon: Icon, color, text }) => (
          <div key={label} className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-xl font-bold text-foreground">{loading ? "..." : (text ? value : (value as number).toLocaleString("ar"))}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground text-sm">قائمة المسؤولين</h2>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all">
            <Plus className="w-3.5 h-3.5" /><span>إضافة مسؤول</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">المسؤول</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">الحالة</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold hidden md:table-cell">تاريخ الإنشاء</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold hidden md:table-cell">آخر دخول</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin inline me-2" />جاري التحميل...
                </td></tr>
              )}
              {!loading && admins.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">لا يوجد مسؤولون بعد</td></tr>
              )}
              {admins.map((admin, i) => {
                const isSelf = admin.id === me?.id;
                return (
                  <tr key={admin.id}
                    className={`border-b border-border last:border-0 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {admin.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground text-sm">{admin.name}</p>
                            {isSelf && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">أنت</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{admin.email}</p>
                          {admin.phone && <p className="text-xs text-muted-foreground">{admin.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${statusConfig[admin.status as keyof typeof statusConfig]?.className}`}>
                        {statusConfig[admin.status as keyof typeof statusConfig]?.label ?? admin.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {new Date(admin.createdAt).toLocaleDateString("ar")}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString("ar") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(admin)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => !isSelf && setDeleteTarget(admin)} disabled={isSelf}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editTarget ? "تعديل بيانات المسؤول" : "إضافة مسؤول جديد"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">الاسم الكامل <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="أحمد المحمد"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">البريد الإلكتروني <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@example.com"
                dir="ltr"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-left"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                كلمة المرور {editTarget && <span className="text-xs text-muted-foreground font-normal">(اتركها فارغة للإبقاء على الحالية)</span>}
                {!editTarget && <span className="text-red-500"> *</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  dir="ltr"
                  className="w-full h-10 px-3 pe-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="button" onClick={() => setShowPassword(s => !s)}
                  className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">رقم الهاتف <span className="text-xs text-muted-foreground font-normal">(اختياري)</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+967 7XXXXXXXX"
                dir="ltr"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-left"
              />
            </div>
            {editTarget && (
              <div>
                <label className="block text-sm font-medium mb-1.5">حالة الحساب</label>
                <select
                  value={form.status}
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="active">نشط</option>
                  <option value="disabled">موقوف</option>
                </select>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button onClick={() => setShowModal(false)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm">
              <X className="w-4 h-4" />إلغاء
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "جاري الحفظ…" : (editTarget ? "حفظ التعديلات" : "إنشاء المسؤول")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            هل أنت متأكد من حذف حساب المسؤول <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>؟
            <br />هذا الإجراء لا يمكن التراجع عنه.
          </p>
          <DialogFooter className="gap-2">
            <button onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm">
              إلغاء
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-all">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? "جاري الحذف…" : "نعم، احذف"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
