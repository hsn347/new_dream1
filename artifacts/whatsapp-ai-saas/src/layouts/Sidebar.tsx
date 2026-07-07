import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, MessageCircle, Package, Tag, Building2,
  BookOpen, Send, Truck, Settings, Key, Users, LogOut, Bot, ShoppingBag, UserCircle2, Shield, BarChart3, RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin/keys", label: "إدارة المفاتيح", icon: Key },
  { href: "/admin/users", label: "إدارة المستخدمين", icon: Users },
  { href: "/admin/admins", label: "إدارة المسؤولين", icon: Shield },
  { href: "/admin/settings", label: "إعدادات النظام", icon: Settings },
];

const userNav = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/analytics", label: "التحليلات", icon: BarChart3 },
  { href: "/conversations", label: "المحادثات", icon: MessageCircle },
  { href: "/customers", label: "ملفات العملاء", icon: UserCircle2 },
  { href: "/products", label: "المنتجات", icon: Package },
  { href: "/coupons", label: "الكوبونات", icon: Tag },
  { href: "/business", label: "بيانات العمل", icon: Building2 },
  { href: "/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
  { href: "/broadcast", label: "الرسائل الجماعية", icon: Send },
  { href: "/delivery", label: "تكاليف التوصيل", icon: Truck },
  { href: "/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/returns", label: "الاسترجاعات", icon: RotateCcw },
  { href: "/settings", label: "إعدادات الوكيل", icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const nav = user?.role === "admin" ? adminNav : userNav;

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 bg-sidebar h-screen sticky top-0 overflow-y-auto">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sidebar-foreground text-sm leading-tight">وكيل المبيعات</p>
          <p className="text-[11px] text-sidebar-accent-foreground">WhatsApp AI</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <div
                data-testid={`nav-${href.replace(/\//g, "-")}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 text-sm font-medium",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sidebar-foreground text-xs font-semibold truncate">{user?.name}</p>
            <p className="text-sidebar-accent-foreground text-[11px] truncate">{user?.email}</p>
          </div>
        </div>
        <button
          data-testid="btn-logout"
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all text-sm"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
