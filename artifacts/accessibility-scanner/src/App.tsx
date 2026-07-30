import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import ScanList from "@/pages/scan-list";
import ScanDetail from "@/pages/scan-detail";
import PageReport from "@/pages/page-report";
import ScanReport from "@/pages/scan-report";
import ScanCompare from "@/pages/scan-compare";
import Documentation from "@/pages/documentation";
import AppUpdates from "@/pages/app-updates";
import AppWalkthrough from "@/pages/app-walkthrough";
import LoginPage from "@/pages/login";
import ResetPasswordPage from "@/pages/reset-password";
import ChangePasswordPage from "@/pages/change-password";
import AdminUsersPage from "@/pages/admin/users";
import AdminGroupsPage from "@/pages/admin/groups";
import AdminDashboardPage from "@/pages/admin/dashboard";
import AdminPermissionsPage from "@/pages/admin/permissions";
import AdminSettingsPage from "@/pages/admin/settings";
import TicketsPage from "@/pages/tickets";
//import AdvancedScanPage from "@/pages/advanced-scan";
import CrawlerListPage from "@/pages/crawler-list";
import CrawlerNewPage from "@/pages/crawler-new";
import CrawlerDetailPage from "@/pages/crawler-detail";
import SitesPage from "@/pages/sites";
import SiteManagementPage from "@/pages/site-management";
import SiteDashboard from "@/pages/site-dashboard";
import SitePageGroups from "@/pages/site-page-groups";
import SiteIssues from "@/pages/site-issues";
import SitePotentialIssues from "@/pages/site-potential-issues";
import SiteComplianceWcag from "@/pages/site-compliance-wcag";
import SiteComplianceEaa from "@/pages/site-compliance-eaa";
import SiteComplianceAda from "@/pages/site-compliance-ada";
import SiteIssueDetail from "@/pages/site-issue-detail";
import SiteRulePageReport from "@/pages/site-rule-page-report";
import QualityAssurancePage from "@/pages/quality-assurance";
import QABrokenLinksPage from "@/pages/qa-broken-links";
import QAInventoryPagesPage from "@/pages/qa-page-inventory";
import QACheckHistoryPage from "@/pages/qa-check-history";
import QAStubPage from "@/pages/qa-stub";
import ActivityPage from "@/pages/activity";
import QALinksOverviewPage from "@/pages/qa-links-overview";
import QAInventorySummaryPage from "@/pages/qa-inventory-summary";
import {
  QAInventoryLinksPage,
  QAInventoryDocumentsPage,
  QAInventoryMediaPage,
  QAInventoryEmailPage,
  QAInventoryPhonesPage,
  QAInventoryJavascriptPage,
  QAInventoryCSSPage,
} from "@/pages/qa-link-inventory";
import QALinkTextPage from "@/pages/qa-link-text";
import QAMetaTagsPage from "@/pages/qa-meta-tags";
import QAPriorityPagesPage from "@/pages/qa-priority-pages";
import QAIssuesPage from "@/pages/qa-issues";
import QAPagesWithBrokenPage from "@/pages/qa-pages-with-broken";
import QAUnsafeLinksPage from "@/pages/qa-unsafe-links";
import QASitemapPage from "@/pages/qa-sitemap";
import QAWordInventoryPage from "@/pages/qa-word-inventory";
//import SeoPage from "@/pages/seo";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { SiteProvider } from "@/contexts/site";
import AdminSiteManagerPage from "@/pages/admin/site-manager";
import { AppStatusProvider, useAppStatus } from "@/contexts/app-status";
import MaintenancePage from "@/pages/maintenance";
import WelcomePage from "@/pages/welcome";
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
        <AuthGuard><Redirect to="/welcome" /></AuthGuard>
      </Route>
      <Route path="/welcome">
        <AuthGuard><Layout><WelcomePage /></Layout></AuthGuard>
      </Route>
      <Route path="/new">
        <AuthGuard><Layout><Home /></Layout></AuthGuard>
      </Route>
      <Route path="/scans/:scanId/pages/:pageId/report">
        <AuthGuard><PageReport /></AuthGuard>
      </Route>
      <Route path="/sites/:siteId/page-report/:pageId">
        <AuthGuard><SiteRulePageReport /></AuthGuard>
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
      <Route path="/app-updates">
        <AuthGuard><Layout><AppUpdates /></Layout></AuthGuard>
      </Route>
      <Route path="/app-walkthrough">
        <AuthGuard><Layout><AppWalkthrough /></Layout></AuthGuard>
      </Route>
      <Route path="/tickets">
        <AuthGuard><Layout><TicketsPage /></Layout></AuthGuard>
      </Route>
      <Route path="/activity">
        <AuthGuard><Layout><ActivityPage /></Layout></AuthGuard>
      </Route>
      <Route path="/crawler/new">
        <AuthGuard><Layout><CrawlerNewPage /></Layout></AuthGuard>
      </Route>
      <Route path="/crawler/manage">
        <AuthGuard><Layout><SiteManagementPage /></Layout></AuthGuard>
      </Route>
      <Route path="/crawler/sites/:siteId/manage">
        <AuthGuard><Layout><SiteManagementPage /></Layout></AuthGuard>
      </Route>
      <Route path="/crawler/sites">
        <AuthGuard><Layout><SitesPage /></Layout></AuthGuard>
      </Route>
      {/* Quality Assurance — functional routes */}
      <Route path="/quality-assurance/check-history">
        <AuthGuard><Layout><QACheckHistoryPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/links/broken">
        <AuthGuard><Layout><QABrokenLinksPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/links/overview">
        <AuthGuard><Layout><QALinksOverviewPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/pages">
        <AuthGuard><Layout><QAInventoryPagesPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance">
        <AuthGuard><Layout><QualityAssurancePage /></Layout></AuthGuard>
      </Route>
      {/* Quality Assurance — stub routes */}
      <Route path="/quality-assurance/priority-pages">
        <AuthGuard><Layout><QAPriorityPagesPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/single-page-check">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory">
        <AuthGuard><Layout><QAInventorySummaryPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/links">
        <AuthGuard><Layout><QAInventoryLinksPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/link-text">
        <AuthGuard><Layout><QALinkTextPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/documents">
        <AuthGuard><Layout><QAInventoryDocumentsPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/media">
        <AuthGuard><Layout><QAInventoryMediaPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/email">
        <AuthGuard><Layout><QAInventoryEmailPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/phones">
        <AuthGuard><Layout><QAInventoryPhonesPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/ssn">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/javascript">
        <AuthGuard><Layout><QAInventoryJavascriptPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/css">
        <AuthGuard><Layout><QAInventoryCSSPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/meta-tags">
        <AuthGuard><Layout><QAMetaTagsPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/inventory/sitemap">
        <AuthGuard><Layout><QASitemapPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/issues">
        <AuthGuard><Layout><QAIssuesPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/issues/resolved">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/links/pages-with-broken">
        <AuthGuard><Layout><QAPagesWithBrokenPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/links/pdfs-broken">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/links/broken-in-pdfs">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/links/unsafe">
        <AuthGuard><Layout><QAUnsafeLinksPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/spelling/pages">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/spelling/misspellings">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/spelling/word-inventory">
        <AuthGuard><Layout><QAWordInventoryPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/spelling/decisions">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/quality-assurance/spelling/progress">
        <AuthGuard><Layout><QAStubPage /></Layout></AuthGuard>
      </Route>
      <Route path="/sites/:siteId/issues/:ruleId">
        {(params: { siteId: string; ruleId: string }) => (
          <AuthGuard>
            <Layout>
              <SiteIssueDetail
                siteId={parseInt(params.siteId)}
                ruleId={decodeURIComponent(params.ruleId)}
              />
            </Layout>
          </AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id/page-groups">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SitePageGroups siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id/issues">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SiteIssues siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id/potential-issues">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SitePotentialIssues siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id/compliance/wcag">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SiteComplianceWcag siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id/compliance/eaa">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SiteComplianceEaa siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id/compliance/ada">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SiteComplianceAda siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/sites/:id">
        {(params: { id: string }) => (
          <AuthGuard><Layout><SiteDashboard siteId={parseInt(params.id)} /></Layout></AuthGuard>
        )}
      </Route>
      <Route path="/crawler/:id">
        <AuthGuard><Layout><CrawlerDetailPage /></Layout></AuthGuard>
      </Route>
      <Route path="/crawler">
        <AuthGuard><Layout><CrawlerListPage /></Layout></AuthGuard>
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
      <Route path="/admin/site-manager">
        <AuthGuard><AdminGuard><Layout><AdminSiteManagerPage /></Layout></AdminGuard></AuthGuard>
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Ping the health endpoint every 3.5 minutes to prevent Azure App Service
// from putting the worker process to sleep during idle periods.
// Azure's idle-process timeout is ~20 minutes without "Always On", but Azure
// Application Gateway also drops connections with no traffic after ~4 minutes,
// so a sub-4-minute interval keeps both the process and any open connections alive.
function useKeepAlive() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`${BASE}/api/healthz`, { credentials: "include" }).catch(() => {});
    }, 3.5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

function App() {
  useKeepAlive();
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AppStatusProvider>
          <AppStatusGate>
            <AuthProvider>
              <SiteProvider>
                <TooltipProvider>
                  <Router />
                  <Toaster />
                </TooltipProvider>
              </SiteProvider>
            </AuthProvider>
          </AppStatusGate>
        </AppStatusProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
