import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileNav from "./MobileNav";
import { useLocation } from "wouter";

const titles: Record<string, string> = {
  "/dashboard": "لوحة التحكم",
  "/conversations": "المحادثات",
  "/products": "المنتجات",
  "/coupons": "الكوبونات",
  "/business": "بيانات العمل التجاري",
  "/knowledge": "قاعدة المعرفة",
  "/broadcast": "الرسائل الجماعية",
  "/delivery": "تكاليف التوصيل",
  "/customers": "ملفات العملاء",
  "/settings": "إعدادات الوكيل",
  "/returns": "الاسترجاعات",
};

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const title = titles[location] || "لوحة التحكم";
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
