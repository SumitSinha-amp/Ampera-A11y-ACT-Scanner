import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import ScanList from "@/pages/scan-list";
import ScanDetail from "@/pages/scan-detail";
import ScanReport from "@/pages/scan-report";
import Settings from "@/pages/settings";
import Documentation from "@/pages/documentation";
import ScanCompare from "@/pages/scan-compare";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/scans" component={ScanList} />
        <Route path="/scans/:id" component={ScanDetail} />
        <Route path="/scans/:id/report" component={ScanReport} />
        <Route path="/compare" component={ScanCompare} />
        <Route path="/settings" component={Settings} />
        <Route path="/documentation" component={Documentation} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
