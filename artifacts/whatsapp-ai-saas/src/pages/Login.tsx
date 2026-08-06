import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Bot, MessageCircle, TrendingUp, Users, Zap, Eye, EyeOff } from "lucide-react";

const features = [
  { icon: MessageCircle, title: "محادثات ذكية", desc: "رد تلقائي طبيعي بلهجتك المحلية" },
  { icon: TrendingUp, title: "زيادة المبيعات", desc: "إقناع واحترافية في كل رسالة" },
  { icon: Users, title: "إدارة العملاء", desc: "CRM متكامل" },
  { icon: Zap, title: "تشغيل فوري", desc: "ابدأ خلال دقائق بدون تعقيد" },
];

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const success = await login(email, password);
      if (success) {
        const me = await fetch("https://new-dream1-1.onrender.com/api/auth/me", { credentials: "include" }).then(r => r.json()) as { role?: string } | null;
        setLocation(me?.role === "admin" ? "/admin/keys" : "/dashboard");
      } else {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      }
    } catch {
      setError("حدث خطأ في الاتصال. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex bg-muted/30 min-h-screen" dir="rtl">

      {/* ── Form Card (right in RTL = start) ─────────────────────── */}
      <div className="flex flex-1 justify-center items-center p-6 lg:max-w-[480px]">
        <div className="w-full max-w-sm">

          {/* Card */}
          <div className="space-y-6 bg-card shadow-xl p-8 border border-border rounded-2xl">

            {/* Logo + Title */}
            <div className="space-y-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex justify-center items-center bg-primary shadow-md rounded-xl w-11 h-11">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">وكيل المبيعات</p>
                  <p className="text-muted-foreground text-xs">WhatsApp AI</p>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">سجّل الدخول للوصول إلى لوحة التحكم</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-1.5 font-medium text-foreground text-sm" htmlFor="email">
                  البريد الإلكتروني
                </label>
                <input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="example@domain.com"
                  required
                  className="bg-background px-4 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring w-full h-11 text-foreground placeholder:text-muted-foreground text-sm transition-all"
                />
              </div>

              <div>
                <label className="block mb-1.5 font-medium text-foreground text-sm" htmlFor="password">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    id="password"
                    data-testid="input-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="bg-background px-4 pe-11 border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring w-full h-11 text-foreground placeholder:text-muted-foreground text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 flex items-center text-muted-foreground hover:text-black transition-colors end-3"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 px-4 py-2.5 border border-destructive/20 rounded-xl text-destructive text-sm">
                  {error}
                </div>
              )}

              <button
                data-testid="btn-login"
                type="submit"
                disabled={loading}
                className="flex justify-center items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-60 shadow-md shadow-primary/20 rounded-xl w-full h-11 font-bold text-primary-foreground text-sm transition-all"
              >
                {loading ? (
                  <>
                    <div className="border-2 border-white/30 border-t-white rounded-full w-4 h-4 animate-spin" />
                    جاري تسجيل الدخول...
                  </>
                ) : (
                  <>تسجيل الدخول</>
                )}
              </button>
            </form>

            {/* Demo credentials */}
            <div className="bg-sidebar border border-sidebar-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-sidebar-border border-b">
                <p className="flex items-center gap-1.5 font-semibold text-sidebar-foreground text-xs">
                  <span className="inline-block bg-sidebar-primary rounded-full w-1.5 h-1.5" />
                  بيانات تجريبية — اضغط لملء تلقائياً
                </p>
              </div>
              <div className="divide-y divide-sidebar-border">
                <button
                  type="button"
                  onClick={() => { setEmail("admin@demo.com"); setPassword("admin123"); }}
                  className="flex justify-between items-center hover:bg-sidebar-accent px-4 py-2.5 w-full transition-colors"
                >
                  <span className="text-xs text-sidebar-accent-foreground">مدير النظام</span>
                  <span className="font-mono text-sidebar-foreground text-xs">admin@demo.com / admin123</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setEmail("user@demo.com"); setPassword("user123"); }}
                  className="flex justify-between items-center hover:bg-sidebar-accent px-4 py-2.5 w-full transition-colors"
                >
                  <span className="text-xs text-sidebar-accent-foreground">مستخدم عادي</span>
                  <span className="font-mono text-sidebar-foreground text-xs">user@demo.com / user123</span>
                </button>
              </div>
            </div>

          </div>

          <p className="mt-5 text-muted-foreground text-xs text-center">
            © 2026 وكيل المبيعات. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>

      {/* ── Marketing Panel (left in RTL = end) ──────────────────── */}
      <div className="hidden relative lg:flex flex-col flex-1 justify-between bg-sidebar p-10 overflow-hidden">

        {/* Background decoration */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="-top-20 absolute bg-sidebar-primary rounded-full w-80 h-80 -end-20" />
          <div className="-bottom-20 absolute bg-sidebar-primary rounded-full w-80 h-80 -start-20" />
        </div>

        {/* Top: brand + AI badge */}
        <div className="z-10 relative flex justify-between items-start">
          <div className="inline-flex items-center">
 
          </div>
          <div className="flex items-center gap-3">
            <div className="text-end">
              <p className="font-bold text-sidebar-foreground text-sm">وكيل المبيعات</p>
              <p className="text-xs text-sidebar-accent-foreground">WhatsApp AI Sales Agent</p>
            </div>
            <div className="flex justify-center items-center bg-sidebar-primary shadow-lg rounded-xl w-10 h-10">
              <Bot className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Middle: headline + desc + features */}
        <div className="z-10 relative space-y-8">
          <div>
            <h2 className="font-extrabold text-sidebar-foreground text-4xl leading-tight">
              أتمتة مبيعاتك<br />
              <span className="text-sidebar-primary">عبر واتساب</span><br />
              بالذكاء الاصطناعي
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-sidebar-accent-foreground">
              وكيل ذكي يعمل 24/7 لإدارة محادثات العملاء، عرض المنتجات، وإتمام الصفقات تلقائياً.
            </p>
          </div>

          <div className="gap-3 grid grid-cols-2">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-3 bg-sidebar-accent/40 backdrop-blur-sm p-4 border border-sidebar-border rounded-xl"
              >
                <div className="flex justify-center items-center bg-sidebar-accent mt-0.5 border border-sidebar-border rounded-lg w-8 h-8 shrink-0">
                  <Icon className="w-4 h-4 text-sidebar-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sidebar-foreground text-sm">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-sidebar-accent-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: copyright */}
        <p className="z-10 relative text-xs text-sidebar-accent-foreground">
          © 2026 وكيل المبيعات. جميع الحقوق محفوظة.
        </p>
      </div>

    </div>
  );
}
