import { Link, useLocation } from "wouter";
import { Activity, BookOpen, LayoutDashboard, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border bg-sidebar shrink-0 flex flex-col">
        <div className="p-6 pb-2">
          <div className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
            <Activity className="w-5 h-5 text-primary" />
            <span>A11yScanner</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <Link href="/">
            <Button
              variant={location === "/" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
            >
              <Plus className="w-4 h-4" />
              New Scan
            </Button>
          </Link>
          <Link href="/scans">
            <Button
              variant={location.startsWith("/scans") ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Scan History
            </Button>
          </Link>
        </nav>

        <div className="px-4 pb-4 mt-auto space-y-1">
          <Link href="/settings">
            <Button
              variant={location === "/settings" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </Link>
          <Link href="/documentation">
            <Button
              variant={location === "/documentation" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Documentation
            </Button>
          </Link>
          <div className="text-xs text-sidebar-foreground/50 px-2 pt-2">
            Professional accessibility auditing tool.
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
