import { Link, useLocation } from "wouter";
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  UsersRound,
  TicketCheck,
  ShieldCheck,
  LogOut,
  User,
  KeyRound,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import SettingsPage, {
  DEFAULT_LOGO_TEXT,
  DEFAULT_LOGO_SIZE,
  type LogoType,
} from "@/pages/settings";
import { useAuth, isAdmin } from "@/contexts/auth";

function AppLogo() {
  const BASE_URL = import.meta.env.BASE_URL as string;
  const BASE = BASE_URL.replace(/\/$/, "");
  const [logoType, setLogoType] = useState<LogoType>("image");
  const [imgUrl, setImgUrl] = useState(() => `${BASE_URL}act-logo.png`);
  const [text, setText] = useState(DEFAULT_LOGO_TEXT);
  const [size, setSize] = useState(DEFAULT_LOGO_SIZE);
  const [imgError, setImgError] = useState(false);
  const [textColor, setTextColor] = useState("");
  useEffect(() => {
    fetch(`${BASE}/api/logo`)
      .then((r) => r.json())
     .then((data: { type: string; imageUrl: string; text: string; size: number | null; textColor?: string }) => {
        setLogoType(data.type === "text" ? "text" : data.type === "image-text" ? "image-text" : "image");
        setImgUrl(data.imageUrl || `${BASE_URL}act-logo.png`);
        setText(data.text || DEFAULT_LOGO_TEXT);
        setSize(typeof data.size === "number" ? data.size : DEFAULT_LOGO_SIZE);
        setTextColor(data.textColor ?? "");
        setImgError(false);
      })
      .catch(() => {});

    const sync = (e: Event) => {
       const detail = (e as CustomEvent<{ type: LogoType; imageUrl: string; text: string; size: number; textColor?: string }>).detail;
      if (!detail) return;
      setLogoType(detail.type === "text" ? "text" : detail.type === "image-text" ? "image-text" : "image");
      setImgUrl(detail.imageUrl || `${BASE_URL}act-logo.png`);
      setText(detail.text || DEFAULT_LOGO_TEXT);
      setSize(typeof detail.size === "number" ? detail.size : DEFAULT_LOGO_SIZE);
      setTextColor(detail.textColor ?? "");
      setImgError(false);
    };
    window.addEventListener("a11y-logo-changed", sync);
    return () => window.removeEventListener("a11y-logo-changed", sync);
  }, [BASE, BASE_URL]);

  if (logoType === "image" && !imgError) {
    return (
      <img
        src={imgUrl}
        alt={text || "App logo"}
        style={{ height: size, maxWidth: size * 6 }}
        className="w-auto object-contain"
        onError={() => setImgError(true)}
        onLoad={() => setImgError(false)}
      />
    );
  }
  if (logoType === "image-text") {
    return (
      <span className="flex items-center gap-2">
        {!imgError && (
          <img
            src={imgUrl}
            alt=""
            style={{ height: size, maxWidth: size * 4 }}
            className="w-auto object-contain shrink-0"
            onError={() => setImgError(true)}
            onLoad={() => setImgError(false)}
          />
        )}
        <span
          className="font-bold text-foreground truncate"
          style={{ fontSize: size * 0.55, maxWidth: size * 5 }}
        >
          {text}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 font-bold text-foreground">
      <Activity
        className="text-primary shrink-0"
        style={{ width: size * 0.6, height: size * 0.6 }}
      />
      <span
        className="font-bold truncate"
          style={{ fontSize: size * 0.55, maxWidth: size * 5, color: textColor || undefined }}
          >
        {text}
      </span>
    </span>
  );
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const toggle = () =>
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  return [collapsed, toggle] as const;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
}

function NavItem({ href, icon, label, active, collapsed }: NavItemProps) {
  const btn = (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={`w-full transition-all duration-200 ${
        collapsed ? "justify-center px-0" : "justify-start gap-2"
      }`}
      asChild
    >
      <Link href={href}>
        {icon}
        {!collapsed && <span>{label}</span>}
      </Link>
    </Button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(location === "/settings");
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { user, logout } = useAuth();
  const adminUser = isAdmin(user);
  const superAdminUser = user?.role === "super_admin";

  const toggleBtn = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 rounded-full border border-border bg-background shadow-sm hover:bg-muted"
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {collapsed ? (
        <ChevronRight className="w-3.5 h-3.5" />
      ) : (
        <ChevronLeft className="w-3.5 h-3.5" />
      )}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="h-16 px-4 md:px-6 flex items-center justify-between gap-4 overflow-hidden">
            <Link href="/scans" className="shrink-0 flex items-center">
              <AppLogo />
            </Link>
            <div className="flex items-center gap-2 shrink-0">
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
              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline max-w-[120px] truncate">
                      {user?.fullName || user?.username}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {user?.role?.replace("_", " ")}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => logout()}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-4rem)]">
          {/* Sidebar */}
          <aside
            className={`hidden md:flex border-r border-border bg-sidebar shrink-0 flex-col relative transition-[width] duration-200 ease-in-out ${
              collapsed ? "w-[56px]" : "w-64"
            }`}
          >
            <div className="absolute -right-3.5 top-5 z-10">
              {toggleBtn}
            </div>

            <div className={`p-4 pb-2 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 pointer-events-none" : "opacity-100"} transition-opacity duration-150`}>
              <div className="flex items-center gap-2 font-bold text-xs text-sidebar-foreground">
                <span>version 1.0.0</span>
              </div>
            </div>

            <nav className={`flex-1 py-4 space-y-1 ${collapsed ? "px-1.5" : "px-4"} transition-[padding] duration-200`}>
              {/* Main nav */}
              <NavItem
                href="/new"
                icon={<Plus className="w-4 h-4 shrink-0" />}
                label="New Scan"
                active={location === "/new"}
                collapsed={collapsed}
              />
              <NavItem
                href="/scans"
                icon={<LayoutDashboard className="w-4 h-4 shrink-0" />}
                label="Scan History"
                active={location.startsWith("/scans")}
                collapsed={collapsed}
              />
              <NavItem
                href="/compare"
                icon={<GitCompare className="w-4 h-4 shrink-0" />}
                label="Compare Scans"
                active={location.startsWith("/compare")}
                collapsed={collapsed}
              />
              <NavItem
                href="/tickets"
                icon={<TicketCheck className="w-4 h-4 shrink-0" />}
                label="Support Tickets"
                active={location.startsWith("/tickets")}
                collapsed={collapsed}
              />

              {/* Admin section */}
              {adminUser && (
                <>
                  {!collapsed && (
                    <div className="pt-4 pb-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                        Admin
                      </p>
                    </div>
                  )}
                  {collapsed && <div className="py-2"><div className="border-t border-border" /></div>}
                  <NavItem
                    href="/admin/dashboard"
                    icon={<ShieldCheck className="w-4 h-4 shrink-0" />}
                    label="Admin Dashboard"
                    active={location === "/admin/dashboard"}
                    collapsed={collapsed}
                  />
                  <NavItem
                    href="/admin/users"
                    icon={<Users className="w-4 h-4 shrink-0" />}
                    label="User Management"
                    active={location === "/admin/users"}
                    collapsed={collapsed}
                  />
                  <NavItem
                    href="/admin/groups"
                    icon={<UsersRound className="w-4 h-4 shrink-0" />}
                    label="User Groups"
                    active={location === "/admin/groups"}
                    collapsed={collapsed}
                  />
                  {superAdminUser && (
                    <NavItem
                      href="/admin/permissions"
                      icon={<KeyRound className="w-4 h-4 shrink-0" />}
                      label="Permissions"
                      active={location === "/admin/permissions"}
                      collapsed={collapsed}
                    />
                  )}
                  {superAdminUser && (
                    <NavItem
                      href="/admin/settings"
                      icon={<SlidersHorizontal className="w-4 h-4 shrink-0" />}
                      label="System Settings"
                      active={location === "/admin/settings"}
                      collapsed={collapsed}
                    />
                  )}
                </>
              )}
            </nav>

            {!collapsed && (
              <div className="px-4 pb-4 mt-auto space-y-1">
                <div className="text-xs text-sidebar-foreground/50 px-2 pt-2">
                  Professional accessibility auditing tool.
                </div>
              </div>
            )}
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
    </TooltipProvider>
  );
}
