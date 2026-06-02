import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import ScanList from "@/pages/scan-list";
import ScanDetail from "@/pages/scan-detail";
import ScanReport from "@/pages/scan-report";
import ScanCompare from "@/pages/scan-compare";
import Documentation from "@/pages/documentation";
import LoginPage from "@/pages/login";
import ResetPasswordPage from "@/pages/reset-password";
import ChangePasswordPage from "@/pages/change-password";
import AdminUsersPage from "@/pages/admin/users";
import AdminGroupsPage from "@/pages/admin/groups";
import AdminDashboardPage from "@/pages/admin/dashboard";
import AdminPermissionsPage from "@/pages/admin/permissions";
import AdminSettingsPage from "@/pages/admin/settings";
import TicketsPage from "@/pages/tickets";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AppStatusProvider, useAppStatus } from "@/contexts/app-status";
import MaintenancePage from "@/pages/maintenance";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppStatusGate({ children }: { children: React.ReactNode }) {
  const { status } = useAppStatus();
  if (status === "checking" || status === "offline") {
    return <MaintenancePage />;
  }
  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.mustResetPassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return <Redirect to="/scans" />;
  }
  return <>{children}</>;
}

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== "super_admin") {
    return <Redirect to="/scans" />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>

      {/* Password change (requires auth but no layout) */}
      <Route path="/change-password">
        <AuthGuard>
          <ChangePasswordPage />
        </AuthGuard>
      </Route>

      {/* Protected app routes */}
      <Route path="/">
        <AuthGuard><Redirect to="/scans" /></AuthGuard>
      </Route>
      <Route path="/new">
        <AuthGuard><Layout><Home /></Layout></AuthGuard>
      </Route>
      <Route path="/scans/:id/report">
        <AuthGuard><Layout><ScanReport /></Layout></AuthGuard>
      </Route>
      <Route path="/scans/:id">
        <AuthGuard><Layout><ScanDetail /></Layout></AuthGuard>
      </Route>
      <Route path="/scans">
        <AuthGuard><Layout><ScanList /></Layout></AuthGuard>
      </Route>
      <Route path="/compare">
        <AuthGuard><Layout><ScanCompare /></Layout></AuthGuard>
      </Route>
      <Route path="/documentation">
        <AuthGuard><Layout><Documentation /></Layout></AuthGuard>
      </Route>
      <Route path="/tickets">
        <AuthGuard><Layout><TicketsPage /></Layout></AuthGuard>
      </Route>
      <Route path="/advanced">
        <AuthGuard><Layout><AdvancedScanPage /></Layout></AuthGuard>
      </Route>

      {/* Admin-only routes */}
      <Route path="/admin/dashboard">
        <AuthGuard><AdminGuard><Layout><AdminDashboardPage /></Layout></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/users">
        <AuthGuard><AdminGuard><Layout><AdminUsersPage /></Layout></AdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/groups">
        <AuthGuard><AdminGuard><Layout><AdminGroupsPage /></Layout></AdminGuard></AuthGuard>
      </Route>

      {/* Super-admin-only routes */}
      <Route path="/admin/permissions">
        <AuthGuard><SuperAdminGuard><Layout><AdminPermissionsPage /></Layout></SuperAdminGuard></AuthGuard>
      </Route>
      <Route path="/admin/settings">
        <AuthGuard><SuperAdminGuard><Layout><AdminSettingsPage /></Layout></SuperAdminGuard></AuthGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}
 // const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// Ping the health endpoint every 3.5 minutes to prevent Azure App Service
// from putting the worker process to sleep during idle periods.
// Azure's idle-process timeout is ~20 minutes without "Always On", but Azure
// Application Gateway also drops connections with no traffic after ~4 minutes,
// so a sub-4-minute interval keeps both the process and any open connections alive.
/*function useKeepAlive() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`${BASE}/api/healthz`, { credentials: "include" }).catch(() => {});
    }, 3.5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}
*/
function App() {
//useKeepAlive();
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AppStatusProvider>
          <AppStatusGate>
            <AuthProvider>
              <TooltipProvider>
                <Router />
                <Toaster />
              </TooltipProvider>
            </AuthProvider>
          </AppStatusGate>
        </AppStatusProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
