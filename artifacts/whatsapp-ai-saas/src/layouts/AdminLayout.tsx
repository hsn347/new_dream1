import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileNav from "./MobileNav";
import { useLocation } from "wouter";

const titles: Record<string, string> = {
  "/admin/keys": "إدارة المفاتيح",
  "/admin/users": "إدارة المستخدمين",
  "/admin/admins": "إدارة المسؤولين",
  "/admin/settings": "إعدادات النظام",
};

interface AdminLayoutProps {
  children: React.ReactNode;
  overrideTitle?: string;
  noPadding?: boolean;
}

export default function AdminLayout({ children, overrideTitle, noPadding }: AdminLayoutProps) {
  const [location] = useLocation();
  const title = overrideTitle ?? titles[location] ?? "الإدارة";
  const isFullCanvas = !!noPadding;
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={title} />
        <main className={isFullCanvas ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6"}>
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
