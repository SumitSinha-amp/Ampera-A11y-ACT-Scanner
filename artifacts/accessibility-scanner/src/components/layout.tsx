import { Link, useLocation } from "wouter";
import {
  Activity,
  BookOpen,
  GitCompare,
  LayoutDashboard,
  Plus,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import SettingsPage from "@/pages/settings";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(location === "/settings");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="h-16 px-4 md:px-6 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-lg text-foreground shrink-0"
          >
            <Activity className="w-5 h-5 text-primary" />
            <span>A11y ACT Tool</span>
          </Link>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Link href="/documentation">
              <Button
                variant={location === "/documentation" ? "secondary" : "ghost"}
                size="sm"
                className="gap-2"
              >
                <BookOpen className="w-4 h-4" />
                Documentation
              </Button>
            </Link>
            <Button
              variant={location === "/settings" ? "secondary" : "ghost"}
              size="sm"
              className="gap-2"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden md:flex w-64 border-r border-border bg-sidebar shrink-0 flex-col">
          <div className="p-6 pb-2">
            <div className="flex items-center gap-2 font-bold text-xs text-sidebar-foreground">
              <span>version 1.0.0</span>
            </div>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-1">
            <Button
              variant={location === "/" ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/">
                <Plus className="w-4 h-4" />
                New Scan
              </Link>
            </Button>
            <Button
              variant={location.startsWith("/scans") ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/scans">
                <LayoutDashboard className="w-4 h-4" />
                Scan History
              </Link>
            </Button>
            <Button
              variant={location.startsWith("/compare") ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              asChild
            >
              <Link href="/compare">
                <GitCompare className="w-4 h-4" />
                Compare Scans
              </Link>
            </Button>
          </nav>
          <div className="px-4 pb-4 mt-auto space-y-1">
            <div className="text-xs text-sidebar-foreground/50 px-2 pt-2">
              Professional accessibility auditing tool.
            </div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-6 md:p-8 w-full">{children}</div>
        </main>
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Settings</span>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(false)}>
                Back
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <SettingsPage />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
