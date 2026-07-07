import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";

import AdminLayout from "@/layouts/AdminLayout";
import UserLayout from "@/layouts/UserLayout";

import Login from "@/pages/Login";
import KeysPage from "@/pages/admin/KeysPage";
import UsersPage from "@/pages/admin/UsersPage";
import UserDetailPage from "@/pages/admin/UserDetailPage";
import KeyDetailPage from "@/pages/admin/KeyDetailPage";
import AdminSettingsPage from "@/pages/admin/AdminSettingsPage";
import AdminsPage from "@/pages/admin/AdminsPage";
import DashboardPage from "@/pages/user/DashboardPage";
import ConversationsPage from "@/pages/user/ConversationsPage";
import ProductsPage from "@/pages/user/ProductsPage";
import CouponsPage from "@/pages/user/CouponsPage";
import BusinessPage from "@/pages/user/BusinessPage";
import KnowledgePage from "@/pages/user/KnowledgePage";
import BroadcastPage from "@/pages/user/BroadcastPage";
import DeliveryPage from "@/pages/user/DeliveryPage";
import OrdersPage from "@/pages/user/OrdersPage";
import CustomersPage from "@/pages/user/CustomersPage";
import SettingsPage from "@/pages/user/SettingsPage";
import AnalyticsPage from "@/pages/user/AnalyticsPage";
import ReturnsPage from "@/pages/user/ReturnsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours caching
      staleTime: 1000 * 60 * 5, // 5 minutes freshness
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if (requireAdmin && user.role !== "admin") return <Redirect to="/dashboard" />;
  if (!requireAdmin && user.role === "admin" && location === "/dashboard") return <Redirect to="/admin/keys" />;

  return <>{children}</>;
}


function AppRoutes() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (location === "/login" && user) {
    return <Redirect to={user.role === "admin" ? "/admin/keys" : "/dashboard"} />;
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route path="/admin/keys/:id">
        {(params) => (
          <ProtectedRoute requireAdmin>
            <AdminLayout overrideTitle="تفاصيل المفتاح">
              <KeyDetailPage />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/admin/keys">
        <ProtectedRoute requireAdmin>
          <AdminLayout><KeysPage /></AdminLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/admin/users/:id">
        {(params) => (
          <ProtectedRoute requireAdmin>
            <AdminLayout overrideTitle="تفاصيل المستخدم">
              <UserDetailPage />
            </AdminLayout>
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/admin/users">
        <ProtectedRoute requireAdmin>
          <AdminLayout><UsersPage /></AdminLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/admin/admins">
        <ProtectedRoute requireAdmin>
          <AdminLayout><AdminsPage /></AdminLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/admin/settings">
        <ProtectedRoute requireAdmin>
          <AdminLayout><AdminSettingsPage /></AdminLayout>
        </ProtectedRoute>
      </Route>


      <Route path="/dashboard">
        <ProtectedRoute>
          <UserLayout><DashboardPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/conversations">
        <ProtectedRoute>
          <UserLayout><ConversationsPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/products">
        <ProtectedRoute>
          <UserLayout><ProductsPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/coupons">
        <ProtectedRoute>
          <UserLayout><CouponsPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/business">
        <ProtectedRoute>
          <UserLayout><BusinessPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/knowledge">
        <ProtectedRoute>
          <UserLayout><KnowledgePage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/broadcast">
        <ProtectedRoute>
          <UserLayout><BroadcastPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/delivery">
        <ProtectedRoute>
          <UserLayout><DeliveryPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/orders">
        <ProtectedRoute>
          <UserLayout><OrdersPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/returns">
        <ProtectedRoute>
          <UserLayout><ReturnsPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/customers">
        <ProtectedRoute>
          <UserLayout><CustomersPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/settings">
        <ProtectedRoute>
          <UserLayout><SettingsPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/analytics">
        <ProtectedRoute>
          <UserLayout><AnalyticsPage /></UserLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/">
        {user ? <Redirect to={user.role === "admin" ? "/admin/keys" : "/dashboard"} /> : <Redirect to="/login" />}
      </Route>

      <Route>
        {user ? <Redirect to={user.role === "admin" ? "/admin/keys" : "/dashboard"} /> : <Redirect to="/login" />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
