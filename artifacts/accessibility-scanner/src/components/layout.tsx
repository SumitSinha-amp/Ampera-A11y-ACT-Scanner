import { Link, useLocation } from "wouter";
import { Activity, BookOpen, LayoutDashboard, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="h-16 px-4 md:px-6 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-foreground shrink-0">
            <Activity className="w-5 h-5 text-primary" />
            <span>A11y ACT Tool</span>
          </Link>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Link href="/documentation">
              <Button variant={location === "/documentation" ? "secondary" : "ghost"} size="sm" className="gap-2">
                <BookOpen className="w-4 h-4" />
                Documentation
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant={location === "/settings" ? "secondary" : "ghost"} size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden md:flex w-64 border-r border-border bg-sidebar shrink-0 flex-col">
          <div className="p-6 pb-2">
            <div className="flex items-center gap-2 font-bold text-lg text-sidebar-foreground">
              <Activity className="w-5 h-5 text-primary" />
              <span>A11y ACT Tool</span>
            </div>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-1">
            <Link href="/">
              <Button variant={location === "/" ? "secondary" : "ghost"} className="w-full justify-start gap-2">
                <Plus className="w-4 h-4" />
                New Scan
              </Button>
            </Link>
            <Link href="/scans">
              <Button variant={location.startsWith("/scans") ? "secondary" : "ghost"} className="w-full justify-start gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Scan History
              </Button>
            </Link>
          </nav>
          <div className="px-4 pb-4 mt-auto space-y-1">
            <div className="text-xs text-sidebar-foreground/50 px-2 pt-2">
              Professional accessibility auditing tool.
            </div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-6 md:p-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
