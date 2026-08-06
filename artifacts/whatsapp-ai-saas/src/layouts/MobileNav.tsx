import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, MessageCircle, Package, Settings, Menu,
  Key, Users, X, Tag, Building2, BookOpen, Send, Truck, Bot, LogOut, ShoppingBag, UserCircle2, Shield, BarChart3, RotateCcw
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin/keys", label: "المفاتيح", icon: Key },
  { href: "/admin/users", label: "المستخدمون", icon: Users },
  { href: "/admin/admins", label: "المسؤولون", icon: Shield },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings },
];

const userNav = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/conversations", label: "المحادثات", icon: MessageCircle },
  { href: "/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/analytics", label: "التحليلات", icon: BarChart3 },
];

const allUserNav = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/conversations", label: "المحادثات", icon: MessageCircle },
  { href: "/customers", label: "ملفات العملاء", icon: UserCircle2 },
  { href: "/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/returns", label: "الاسترجاعات", icon: RotateCcw },
  { href: "/products", label: "المنتجات", icon: Package },
  { href: "/coupons", label: "الكوبونات", icon: Tag },
  { href: "/business", label: "بيانات العمل", icon: Building2 },
  { href: "/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
  { href: "/broadcast", label: "الرسائل الجماعية", icon: Send },
  { href: "/delivery", label: "تكاليف التوصيل", icon: Truck },
  { href: "/settings", label: "إعدادات الوكيل", icon: Settings },
];

export default function MobileNav() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const bottomNav = user?.role === "admin" ? adminNav : userNav;
  const drawerNav = user?.role === "admin" ? adminNav : allUserNav;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border flex items-center justify-around px-1 h-16 safe-area-bottom">
        {bottomNav.map(({ href, label, icon: Icon }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <div className={cn("flex flex-col items-center gap-1 px-3 py-1 rounded-lg", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </div>
            </Link>
          );
        })}
        <button data-testid="btn-mobile-menu" onClick={() => setDrawerOpen(true)} className="flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-muted-foreground">
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">القائمة</span>
        </button>
      </nav>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-72 bg-sidebar h-full flex flex-col overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sidebar-primary flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-sidebar-foreground text-sm">وكيل المبيعات</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-sidebar-accent-foreground hover:text-sidebar-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              {drawerNav.map(({ href, label, icon: Icon }) => {
                const active = location === href;
                return (
                  <Link key={href} href={href}>
                    <div
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all text-sm font-medium",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 py-4 border-t border-sidebar-border">
              <div className="flex items-center gap-3 px-3 py-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-white">
                  {user?.avatar}
                </div>
                <div>
                  <p className="text-sidebar-foreground text-xs font-semibold">{user?.name}</p>
                  <p className="text-sidebar-accent-foreground text-[11px]">{user?.email}</p>
                </div>
              </div>
              <button onClick={logout} className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sidebar-accent-foreground hover:bg-sidebar-accent text-sm">
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
