import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { useAuth } from "@/hooks/useAuth";
import { Component, type ReactNode } from "react";

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

// ── Error Boundary: catches any rendering crash gracefully ────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
          <div className="text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-bold text-foreground">حدث خطأ في الصفحة</h2>
            <p className="text-muted-foreground text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,    // 24h in garbage-collection cache
      staleTime: 1000 * 60 * 15,      // 15 min freshness (was 5 min)
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error instanceof Error && error.message.includes("401")) return false;
        return failureCount < 2;
      },
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  throttleTime: 1000,
});

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-medium animate-pulse">جاري تسجيل الدخول...</p>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  if (!requireAdmin && user.role === "admin" && location === "/dashboard") {
    return <Redirect to="/admin/keys" />;
  }

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
    <ErrorBoundary>
      <ThemeProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
          <TooltipProvider>
            <ConfirmProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AuthProvider>
                  <AppRoutes />
                </AuthProvider>
              </WouterRouter>
              <Toaster />
            </ConfirmProvider>
          </TooltipProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
