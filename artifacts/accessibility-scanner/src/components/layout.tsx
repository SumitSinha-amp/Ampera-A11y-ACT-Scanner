import { Link, useLocation } from "wouter";
import {
  Accessibility,
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FileText,
  GitCompare,
  Globe,
  History,
  KeyRound,
  Layers,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TicketCheck,
  User,
  Users,
  UsersRound,
  XCircle,
  Flag,
  LayoutDashboard,
  Link2,
  SpellCheck,
  Map,
  Megaphone,
  X,
  Home,
} from "lucide-react";
import { AccessibilityModeControl } from "@/components/accessibility-mode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import SettingsPage, {
  DEFAULT_LOGO_TEXT,
  DEFAULT_LOGO_SIZE,
  type LogoType,
} from "@/pages/settings";
import { useAuth, isAdmin, isSuperAdmin } from "@/contexts/auth";
import { useSite, type MySite } from "@/contexts/site";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_WALKTHROUGH_EVENT } from "@/lib/walkthrough";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppLogo() {
  const BASE_URL = import.meta.env.BASE_URL as string;
  const BASE = BASE_URL.replace(/\/$/, "");
  const [logoType, setLogoType] = useState<LogoType>("image");
  const [imgUrl, setImgUrl] = useState(() => `${BASE_URL}act-logo.png`);
  const [text, setText] = useState(DEFAULT_LOGO_TEXT);
  const [size, setSize] = useState(DEFAULT_LOGO_SIZE);
  const [textColor, setTextColor] = useState("");
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const applyData = (data: {
      type: string;
      imageUrl: string;
      text: string;
      size: number | null;
      textColor?: string;
    }) => {
      setLogoType(
        data.type === "text"
          ? "text"
          : data.type === "image-text"
            ? "image-text"
            : "image",
      );
      setImgUrl(data.imageUrl || `${BASE_URL}act-logo.png`);
      setText(data.text || DEFAULT_LOGO_TEXT);
      setSize(typeof data.size === "number" ? data.size : DEFAULT_LOGO_SIZE);
      setTextColor(data.textColor ?? "");
      setImgError(false);
    };

    const fetchLogo = () =>
      fetch(`${BASE}/api/logo`)
        .then((r) => r.json())
        .then(applyData)
        .catch(() => {});

    fetchLogo();

    const sync = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          type: LogoType;
          imageUrl: string;
          text: string;
          size: number;
          textColor?: string;
        }>
      ).detail;
      if (detail) applyData({ ...detail, size: detail.size });
    };
    window.addEventListener("a11y-logo-changed", sync);

    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchLogo();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("a11y-logo-changed", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
          className="font-bold truncate"
          style={{
            fontSize: size * 0.55,
            maxWidth: size * 5,
            color: textColor || undefined,
          }}
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
        className="truncate"
        style={{ fontSize: size * 0.55, maxWidth: size * 5 }}
      >
        {text}
      </span>
    </span>
  );
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  return [collapsed, toggle] as const;
}

// Fetches the site(s) owned by the current logged-in user. Used to route
// "site customer" (regular `user` role) accounts straight to their own site.
function useMySites(enabled: boolean) {
  return useQuery<{ id: number; name: string }[]>({
    queryKey: ["my-sites-legacy"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites/my-sites`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.sites ?? []);
    },
  });
}

function SiteSelector() {
  const { sites, activeSite, setActiveSite } = useSite();
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const canSwitchSite = user?.permissions?.canSwitchSite ?? false;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem("site-favorites");
      return stored ? (JSON.parse(stored) as number[]) : [];
    } catch {
      return [];
    }
  });

  // Switching is an explicit capability. Keep the selector available even
  // when a user currently has one accessible site so the control does not
  // disappear when their site access changes.
  if (!superAdmin && !canSwitchSite) return null;

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem("site-favorites", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const filtered = sites
    .filter(
      (s) =>
        search === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.baseUrl.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 0 : 1;
      const bFav = favorites.includes(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.name.localeCompare(b.name);
    });

  const triggerName = activeSite ? activeSite.name : "All sites";
  const triggerUrl = activeSite?.baseUrl ?? "";

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-auto py-1.5 px-3 gap-2 w-[540px] max-w-full text-left justify-start"
          aria-label={`Switch site. Current site: ${triggerName}`}
        >
          <Globe className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">
              {triggerName}
            </div>
            {triggerUrl && (
              <div className="text-xs text-muted-foreground truncate leading-tight">
                {triggerUrl}
              </div>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[540px] p-0 shadow-xl"
        align="center"
        sideOffset={8}
      >
        {/* Header: site count + search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <span className="text-sm text-muted-foreground whitespace-nowrap font-medium">
            Sites: {sites.length}
          </span>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for site"
              aria-label="Search accessible sites"
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/40 text-xs text-muted-foreground font-medium">
          <Star className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">Site</span>
          <span className="w-16 text-right">Pages</span>
        </div>

        {/* Site list */}
        <ScrollArea className="max-h-[400px]">
          {/* Only Superadmin can view data across every site. */}
          {superAdmin && (
            <button
              type="button"
              onClick={() => {
                setActiveSite(null);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-accent text-left transition-colors border-b ${!activeSite ? "bg-primary/5" : ""}`}
            >
              <span className="w-4 shrink-0" />
              <div className="w-9 h-9 rounded border bg-muted/60 flex items-center justify-center shrink-0">
                <Globe className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-semibold ${!activeSite ? "text-primary" : ""}`}
                >
                  All sites
                </div>
                <div className="text-xs text-muted-foreground">
                  View data across all sites
                </div>
              </div>
              <span className="w-4 shrink-0 flex justify-center">
                {!activeSite && <Check className="w-4 h-4 text-primary" />}
              </span>
            </button>
          )}

          {filtered.map((site) => {
            const isActive = activeSite?.id === site.id;
            const isFav = favorites.includes(site.id);
            return (
              <button
                type="button"
                key={site.id}
                onClick={() => {
                  setActiveSite(site);
                  setOpen(false);
                  setSearch("");
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-accent text-left transition-colors border-b last:border-b-0 ${isActive ? "bg-primary/5" : ""}`}
              >
                {/* Favorite */}
                <button
                  type="button"
                  onClick={(e) => toggleFavorite(site.id, e)}
                  className="w-4 h-4 shrink-0 text-muted-foreground hover:text-yellow-500 transition-colors"
                  aria-label={
                    isFav ? "Remove from favorites" : "Add to favorites"
                  }
                >
                  <Star
                    className={`w-3.5 h-3.5 ${isFav ? "fill-yellow-400 text-yellow-400" : ""}`}
                  />
                </button>

                {/* Site icon placeholder */}
                <div className="w-9 h-9 rounded border bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src={`${site.baseUrl}/favicon.ico`}
                    alt=""
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                  <Globe className="w-4 h-4 text-muted-foreground absolute" />
                </div>

                {/* Name + URL */}
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium leading-tight truncate ${isActive ? "text-primary" : ""}`}
                  >
                    {site.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate leading-tight">
                    {site.baseUrl}
                  </div>
                </div>

                {/* External link */}
                <a
                  href={site.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                  aria-label={`Open ${site.name}`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {/* Page count */}
                <span className="w-12 text-right text-sm tabular-nums text-muted-foreground shrink-0">
                  {site.pageCount.toLocaleString()}
                </span>

                {/* Active check */}
                <span className="w-4 shrink-0 flex justify-center">
                  {isActive && <Check className="w-4 h-4 text-primary" />}
                </span>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No sites match "{search}"
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  indent?: boolean;
  badge?: React.ReactNode;
  tourId?: string;
}

function NavItem({
  href,
  icon,
  label,
  active,
  collapsed,
  indent,
  badge,
  tourId,
}: NavItemProps) {
  const tourKey =
    tourId ??
    `nav-${href.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const btn = (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={`w-full transition-all duration-200 ${
        collapsed
          ? "justify-center px-0"
          : `justify-start gap-2 ${indent ? "pl-8 h-8 text-[13px]" : ""}`
      }`}
      asChild
      data-tour={tourKey}
      data-tour-title={label}
      data-tour-description={`Open ${label} from the application navigation.`}
    >
      <Link href={href}>
        {icon}
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && badge}
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

interface NavGroupProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  defaultOpen?: boolean;
  fallbackHref?: string;
  children: React.ReactNode;
}

function useGroupOpen(id: string, defaultOpen: boolean, forceOpen: boolean) {
  const key = `sidebar-group-${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? stored === "true" : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    if (forceOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  const toggle = () =>
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, String(next));
      } catch {}
      return next;
    });

  return [open, toggle] as const;
}

function NavGroup({
  id,
  icon,
  label,
  active,
  collapsed,
  defaultOpen = false,
  fallbackHref,
  children,
}: NavGroupProps) {
  const [open, toggle] = useGroupOpen(id, defaultOpen, active);

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={active ? "secondary" : "ghost"}
            className="w-full justify-center px-0"
            asChild
            data-tour={`menu-${id}`}
            data-tour-title={label}
            data-tour-description={`Open the ${label} navigation menu.`}
          >
            <Link href={fallbackHref ?? "#"}>{icon}</Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  const contentId = `sidebar-group-content-${id}`;

  return (
    <div role="group" aria-label={label}>
      <Button
        variant="ghost"
        onClick={toggle}
        className="w-full justify-start gap-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        aria-controls={contentId}
        data-tour={`menu-${id}`}
        data-tour-title={label}
        data-tour-description={`Expand or collapse the ${label} navigation menu.`}
      >
        {icon}
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div
          id={contentId}
          role="group"
          aria-label={`${label} items`}
          className="mt-0.5 space-y-0.5 pl-2 border-l border-border/60 ml-3.5"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function QASidebarContent({
  collapsed,
  location,
  onBack,
}: {
  collapsed: boolean;
  location: string;
  onBack: () => void;
}) {
  const { user } = useAuth();
  if (!user?.permissions?.canViewQualityAssurance) return null;
  const dot = (
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 shrink-0 ml-0.5" />
  );
  return (
    <div className="space-y-1">
      {!collapsed ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground font-normal mb-1 h-8 text-sm"
          onClick={onBack}
        >
          <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
          Back to main menu
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-full flex justify-center mb-1 h-8"
              onClick={onBack}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Back to main menu</TooltipContent>
        </Tooltip>
      )}
      {!collapsed && (
        <div className="flex items-center gap-2 px-2 py-1 mb-1 border-b border-border/40 pb-2">
          <ClipboardCheck className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
            Quality Assurance
          </span>
        </div>
      )}
      <NavItem
        href="/quality-assurance"
        icon={<ClipboardCheck className="w-4 h-4 shrink-0" />}
        label="Overview"
        active={location === "/quality-assurance"}
        collapsed={collapsed}
      />
      <NavItem
        href="/quality-assurance/priority-pages"
        icon={<Flag className="w-4 h-4 shrink-0" />}
        label="Priority pages"
        active={location === "/quality-assurance/priority-pages"}
        collapsed={collapsed}
      />
      <NavItem
        href="/quality-assurance/check-history"
        icon={<History className="w-4 h-4 shrink-0" />}
        label="Check history"
        active={location === "/quality-assurance/check-history"}
        collapsed={collapsed}
      />
      <NavItem
        href="/quality-assurance/single-page-check"
        icon={<Search className="w-4 h-4 shrink-0" />}
        label="Single page check"
        active={location === "/quality-assurance/single-page-check"}
        collapsed={collapsed}
      />
      <NavGroup
        id="qa-inventory"
        icon={<Layers className="w-4 h-4 shrink-0" />}
        label="Inventory"
        active={location.startsWith("/quality-assurance/inventory")}
        collapsed={collapsed}
        fallbackHref="/quality-assurance/inventory"
        defaultOpen={location.startsWith("/quality-assurance/inventory")}
      >
        <NavItem
          href="/quality-assurance/inventory"
          icon={dot}
          label="Summary"
          active={location === "/quality-assurance/inventory"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/pages"
          icon={dot}
          label="Pages"
          active={location === "/quality-assurance/inventory/pages"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/links"
          icon={dot}
          label="Links"
          active={location === "/quality-assurance/inventory/links"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/link-text"
          icon={dot}
          label="Link text"
          active={location === "/quality-assurance/inventory/link-text"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/documents"
          icon={dot}
          label="Documents"
          active={location === "/quality-assurance/inventory/documents"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/media"
          icon={dot}
          label="Media files"
          active={location === "/quality-assurance/inventory/media"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/email"
          icon={dot}
          label="Email addresses"
          active={location === "/quality-assurance/inventory/email"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/phones"
          icon={dot}
          label="Phone numbers"
          active={location === "/quality-assurance/inventory/phones"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/ssn"
          icon={dot}
          label="Social Security Numbers"
          active={location === "/quality-assurance/inventory/ssn"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/javascript"
          icon={dot}
          label="JavaScript files"
          active={location === "/quality-assurance/inventory/javascript"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/css"
          icon={dot}
          label="CSS"
          active={location === "/quality-assurance/inventory/css"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/meta-tags"
          icon={dot}
          label="Meta tags"
          active={location === "/quality-assurance/inventory/meta-tags"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/inventory/sitemap"
          icon={dot}
          label="Sitemap"
          active={location === "/quality-assurance/inventory/sitemap"}
          collapsed={collapsed}
          indent
        />
      </NavGroup>
      <NavGroup
        id="qa-issues"
        icon={<AlertTriangle className="w-4 h-4 shrink-0" />}
        label="Issues"
        active={location.startsWith("/quality-assurance/issues")}
        collapsed={collapsed}
        fallbackHref="/quality-assurance/issues"
        defaultOpen={location.startsWith("/quality-assurance/issues")}
      >
        <NavItem
          href="/quality-assurance/issues"
          icon={dot}
          label="Issues"
          active={location === "/quality-assurance/issues"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/issues/resolved"
          icon={dot}
          label="Resolved issues"
          active={location === "/quality-assurance/issues/resolved"}
          collapsed={collapsed}
          indent
        />
      </NavGroup>
      <NavGroup
        id="qa-links"
        icon={<Link2 className="w-4 h-4 shrink-0" />}
        label="Links"
        active={location.startsWith("/quality-assurance/links")}
        collapsed={collapsed}
        fallbackHref="/quality-assurance/links/broken"
        defaultOpen={location.startsWith("/quality-assurance/links")}
      >
        <NavItem
          href="/quality-assurance/links/overview"
          icon={dot}
          label="Links overview"
          active={location === "/quality-assurance/links/overview"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/links/broken"
          icon={dot}
          label="Broken links"
          active={location === "/quality-assurance/links/broken"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/links/pages-with-broken"
          icon={dot}
          label="Pages with broken links"
          active={location === "/quality-assurance/links/pages-with-broken"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/links/pdfs-broken"
          icon={dot}
          label="PDFs with broken links"
          active={location === "/quality-assurance/links/pdfs-broken"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/links/broken-in-pdfs"
          icon={dot}
          label="Broken links in PDFs"
          active={location === "/quality-assurance/links/broken-in-pdfs"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/links/unsafe"
          icon={dot}
          label="Links to unsafe domains"
          active={location === "/quality-assurance/links/unsafe"}
          collapsed={collapsed}
          indent
        />
      </NavGroup>
      <NavGroup
        id="qa-spelling"
        icon={<SpellCheck className="w-4 h-4 shrink-0" />}
        label="Spelling"
        active={location.startsWith("/quality-assurance/spelling")}
        collapsed={collapsed}
        fallbackHref="/quality-assurance/spelling/misspellings"
        defaultOpen={location.startsWith("/quality-assurance/spelling")}
      >
        <NavItem
          href="/quality-assurance/spelling/pages"
          icon={dot}
          label="Pages with misspellings"
          active={location === "/quality-assurance/spelling/pages"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/spelling/misspellings"
          icon={dot}
          label="Misspellings"
          active={location === "/quality-assurance/spelling/misspellings"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/spelling/word-inventory"
          icon={dot}
          label="Word inventory"
          active={location === "/quality-assurance/spelling/word-inventory"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/spelling/decisions"
          icon={dot}
          label="Spelling decisions"
          active={location === "/quality-assurance/spelling/decisions"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/quality-assurance/spelling/progress"
          icon={dot}
          label="Progress and trends"
          active={location === "/quality-assurance/spelling/progress"}
          collapsed={collapsed}
          indent
        />
      </NavGroup>
    </div>
  );
}

type Section =
  | "accessibility"
  | "quality-assurance"
  | "seo"
  | "admin"
  | "site-management";

function SectionBackButton({
  collapsed,
  onBack,
}: {
  collapsed: boolean;
  onBack: () => void;
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-full flex justify-center mb-1 h-8"
            onClick={onBack}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Back to main menu</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground font-normal mb-1 h-8 text-sm"
      onClick={onBack}
    >
      <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
      Back to main menu
    </Button>
  );
}

function SectionHeader({
  collapsed,
  icon,
  label,
}: {
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  if (collapsed) return null;
  return (
    <div className="flex items-center gap-2 px-2 py-1 mb-1 border-b border-border/40 pb-2">
      {icon}
      <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
        {label}
      </span>
    </div>
  );
}

function MainMenuContent({
  collapsed,
  adminUser,
  canManageSites,
}: {
  collapsed: boolean;
  adminUser: boolean;
  canManageSites: boolean;
}) {
  const { user } = useAuth();
  const items = [
    {
      label: "Accessibility",
      icon: <Accessibility className="w-5 h-5 shrink-0" />,
      href: "/scans",
      color: "text-blue-500",
    },
    ...(user?.permissions?.canViewQualityAssurance ? [{
      label: "Quality Assurance",
      icon: <ClipboardCheck className="w-5 h-5 shrink-0" />,
      href: "/quality-assurance",
      color: "text-violet-500",
    }] : []),
    //  { label: "SEO", icon: <Search className="w-5 h-5 shrink-0" />, href: "/seo", color: "text-emerald-500" },*/}
    ...(adminUser
      ? [
          {
            label: "Admin Settings",
            icon: <ShieldCheck className="w-5 h-5 shrink-0" />,
            href: "/admin/dashboard",
            color: "text-amber-500",
          },
        ]
      : []),
    ...(canManageSites
      ? [
          {
            label: "Site Management",
            icon: <Building2 className="w-5 h-5 shrink-0" />,
            href: "/crawler/sites",
            color: "text-amber-500",
          },
        ]
      : []),
  ];

  if (collapsed) {
    return (
      <div className="space-y-1">
        {items.map((item) => (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-center px-0"
                asChild
                data-tour={`main-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                data-tour-title={item.label}
                data-tour-description={`Open the ${item.label} area of the application.`}
              >
                <Link href={item.href}>
                  <span className={item.color}>{item.icon}</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <p className="px-2 pb-2 text-xs text-muted-foreground">Main menu</p>
      {items.map((item) => (
        <Button
          key={item.label}
          variant="ghost"
          className="w-full justify-start gap-3 h-11 px-3 text-sm font-medium rounded-lg"
          asChild
          data-tour={`main-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          data-tour-title={item.label}
          data-tour-description={`Open the ${item.label} area of the application.`}
        >
          <Link href={item.href}>
            <span className={item.color}>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          </Link>
        </Button>
      ))}
    </div>
  );
}

function AccessibilitySidebarContent({
  collapsed,
  location,
  adminUser,
  showSiteNav,
  effectiveSiteId,
  onBack,
}: {
  collapsed: boolean;
  location: string;
  adminUser: boolean;
  showSiteNav: boolean;
  effectiveSiteId: number | undefined;
  onBack: () => void;
}) {
  const dot = (
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 shrink-0 ml-0.5" />
  );
  const { activeSite: dropdownSite } = useSite();
  const { user } = useAuth();
  const canCreateCrawl = user?.permissions?.canCreateCrawl ?? false;
  const canManageSites = user?.permissions?.canManageSites ?? false;
  const canViewCrawlHistory = user?.permissions?.canViewCrawlHistory ?? false;
  const canViewSiteAccessibilityDashboard =
    user?.permissions?.canViewSiteAccessibilityDashboard ?? false;
  // Overview uses the dropdown-selected site first, then falls back to URL-derived ID (for non-admin users)
  const overviewSiteId = dropdownSite?.id ?? effectiveSiteId;
  const siteDashboardHref =
    overviewSiteId !== undefined ? `/sites/${overviewSiteId}` : null;
  const sitePageGroupsHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/page-groups`
      : "/crawler/sites";
  const siteIssuesHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/issues`
      : "/crawler/sites";
  const sitePotentialIssuesHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/potential-issues`
      : "/crawler/sites";
  const siteComplianceWcagHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/compliance/wcag`
      : "/crawler/sites";
  const siteComplianceEaaHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/compliance/eaa`
      : "/crawler/sites";
  const siteComplianceAdaHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/compliance/ada`
      : "/crawler/sites";
  const onSiteDashboard =
    location.startsWith("/sites/") &&
    effectiveSiteId !== undefined &&
    location.startsWith(`/sites/${effectiveSiteId}`);
  const onSiteDashboardExact =
    onSiteDashboard && location === siteDashboardHref;
  const onSitePageGroups = onSiteDashboard && location === sitePageGroupsHref;
  const onSiteIssues = onSiteDashboard && location === siteIssuesHref;
  const onSitePotentialIssues =
    onSiteDashboard && location === sitePotentialIssuesHref;
  const onSiteComplianceWcag =
    onSiteDashboard && location === siteComplianceWcagHref;
  const onSiteComplianceEaa =
    onSiteDashboard && location === siteComplianceEaaHref;
  const onSiteComplianceAda =
    onSiteDashboard && location === siteComplianceAdaHref;
  const issuesActive = onSiteIssues || onSitePotentialIssues;
  const complianceActive =
    onSiteComplianceWcag || onSiteComplianceEaa || onSiteComplianceAda;
  const manualScanActive =
    location === "/new" ||
    location === "/advanced" ||
    location.startsWith("/scans") ||
    location.startsWith("/compare");
  const crawlerScanActive =
    location.startsWith("/crawler/new") ||
    location.startsWith("/crawler/sites") ||
    (location.startsWith("/crawler") && !location.startsWith("/crawler/sites"));

  return (
    <div className="space-y-1">
      <SectionBackButton collapsed={collapsed} onBack={onBack} />
      <SectionHeader
        collapsed={collapsed}
        icon={<Accessibility className="w-4 h-4 text-primary shrink-0" />}
        label="Accessibility"
      />
      {siteDashboardHref !== null && canViewSiteAccessibilityDashboard && (
        <NavItem
          href={siteDashboardHref}
          icon={<LayoutDashboard className="w-3.5 h-3.5 shrink-0" />}
          label="Overview"
          active={onSiteDashboardExact}
          collapsed={collapsed}
        />
      )}
      {showSiteNav && canViewSiteAccessibilityDashboard && (
        <>
          <NavItem
            href={sitePageGroupsHref}
            icon={<Layers className="w-3.5 h-3.5 shrink-0" />}
            label="Page Groups"
            active={onSitePageGroups}
            collapsed={collapsed}
          />
          <NavGroup
            id="acc-issues"
            icon={<AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            label="Issues"
            active={issuesActive}
            collapsed={collapsed}
            defaultOpen={issuesActive}
          >
            <NavItem
              href={siteIssuesHref}
              icon={dot}
              label="Issues"
              active={onSiteIssues}
              collapsed={collapsed}
              indent
            />
            <NavItem
              href={sitePotentialIssuesHref}
              icon={dot}
              label="Potential Issues"
              active={onSitePotentialIssues}
              collapsed={collapsed}
              indent
            />
          </NavGroup>
          <NavGroup
            id="acc-compliance"
            icon={<FileCheck2 className="w-3.5 h-3.5 shrink-0" />}
            label="Compliance"
            active={complianceActive}
            collapsed={collapsed}
            defaultOpen={complianceActive}
          >
            <NavItem
              href={siteComplianceWcagHref}
              icon={dot}
              label="WCAG guidelines"
              active={onSiteComplianceWcag}
              collapsed={collapsed}
              indent
            />
            <NavItem
              href={siteComplianceEaaHref}
              icon={dot}
              label="European Accessibility Act"
              active={onSiteComplianceEaa}
              collapsed={collapsed}
              indent
            />
            <NavItem
              href={siteComplianceAdaHref}
              icon={dot}
              label="ADA Title II"
              active={onSiteComplianceAda}
              collapsed={collapsed}
              indent
            />
          </NavGroup>
        </>
      )}
      <NavItem
        href="/activity"
        icon={<Activity className="w-3.5 h-3.5 shrink-0" />}
        label="Activity"
        active={location === "/activity"}
        collapsed={collapsed}
      />
      <NavGroup
        id="manual-scan"
        icon={<Plus className="w-3.5 h-3.5 shrink-0" />}
        label="Manual Scan"
        active={manualScanActive}
        collapsed={collapsed}
        defaultOpen={manualScanActive}
      >
        <NavItem
          href="/new"
          icon={dot}
          label="New Scan"
          active={location === "/new"}
          collapsed={collapsed}
          indent
        />
        <NavItem
          href="/scans"
          icon={dot}
          label="Scan History"
          active={location.startsWith("/scans")}
          collapsed={collapsed}
          indent
        />
        {/*  <NavItem
          href="/advanced"
          icon={dot}
          label="Advanced Scan"
          active={location.startsWith("/advanced")}
          collapsed={collapsed}
          indent
        />*/}
        <NavItem
          href="/compare"
          icon={dot}
          label="Compare Scans"
          active={location.startsWith("/compare")}
          collapsed={collapsed}
          indent
        />
      </NavGroup>
      {(canCreateCrawl || canViewCrawlHistory || canManageSites || adminUser) && (
        <NavGroup
          id="crawler-scan"
          icon={<Globe className="w-3.5 h-3.5 shrink-0" />}
          label="Crawler Scan"
          active={crawlerScanActive}
          collapsed={collapsed}
          defaultOpen={crawlerScanActive}
        >
          {canCreateCrawl && (
            <NavItem
              href="/crawler/new"
              icon={dot}
              label="New Scan"
              active={location === "/crawler/new"}
              collapsed={collapsed}
              indent
            />
          )}
          {canViewCrawlHistory && (
            <NavItem
              href="/crawler"
              icon={dot}
              label="Scan History"
              active={
                location.startsWith("/crawler") &&
                !location.startsWith("/crawler/new") &&
                !location.startsWith("/crawler/sites")
              }
              collapsed={collapsed}
              indent
            />
          )}
          {canManageSites && (
            <NavItem
              href="/crawler/sites"
              icon={dot}
              label="Manage Sites"
              active={location.startsWith("/crawler/sites")}
              collapsed={collapsed}
              indent
            />
          )}
          {adminUser && (
            <NavItem
              href="/crawler/manage"
              icon={dot}
              label="Manage Crawl"
              active={location === "/crawler/manage" || location.startsWith("/crawler/sites/")}
              collapsed={collapsed}
              indent
            />
          )}
        </NavGroup>
      )}
    </div>
  );
}

function SEOSidebarContent({
  collapsed,
  location,
  onBack,
}: {
  collapsed: boolean;
  location: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-1">
      <SectionBackButton collapsed={collapsed} onBack={onBack} />
      <SectionHeader
        collapsed={collapsed}
        icon={<Search className="w-4 h-4 text-primary shrink-0" />}
        label="SEO"
      />
      <NavItem
        href="/seo"
        icon={<Search className="w-4 h-4 shrink-0" />}
        label="Overview"
        active={location === "/seo"}
        collapsed={collapsed}
      />
    </div>
  );
}

function AdminSidebarContent({
  collapsed,
  location,
  adminUser,
  superAdminUser,
  canManageSites,
  onBack,
}: {
  collapsed: boolean;
  location: string;
  adminUser: boolean;
  superAdminUser: boolean;
  canManageSites: boolean;
  onBack: () => void;
}) {
  const dot = (
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 shrink-0 ml-0.5" />
  );
  const usersGroupActive =
    location === "/admin/users" || location === "/admin/groups";
  return (
    <div className="space-y-1">
      <SectionBackButton collapsed={collapsed} onBack={onBack} />
      <SectionHeader
        collapsed={collapsed}
        icon={
          adminUser ? (
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <Building2 className="w-4 h-4 text-primary shrink-0" />
          )
        }
        label={adminUser ? "Admin Settings" : "Site Management"}
      />
      {adminUser && (
        <NavItem
          href="/admin/dashboard"
          icon={<ShieldCheck className="w-4 h-4 shrink-0" />}
          label="Admin Dashboard"
          active={location === "/admin/dashboard"}
          collapsed={collapsed}
        />
      )}
      {(superAdminUser || canManageSites) && (
        <NavItem
          href="/crawler/sites"
          icon={<Building2 className="w-4 h-4 shrink-0" />}
          label="Manage Sites"
          active={location.startsWith("/crawler/sites")}
          collapsed={collapsed}
        />
      )}
      {adminUser && (
        <NavItem
          href="/admin/site-manager"
          icon={<UsersRound className="w-4 h-4 shrink-0" />}
          label="Site Manager"
          active={location === "/admin/site-manager"}
          collapsed={collapsed}
        />
      )}
      {adminUser && (
        <NavGroup
          id="admin-users"
          icon={<Users className="w-4 h-4 shrink-0" />}
          label="Users"
          active={usersGroupActive}
          collapsed={collapsed}
          defaultOpen={usersGroupActive}
        >
          <NavItem
            href="/admin/users"
            icon={dot}
            label="User Management"
            active={location === "/admin/users"}
            collapsed={collapsed}
            indent
          />
          <NavItem
            href="/admin/groups"
            icon={dot}
            label="User Groups"
            active={location === "/admin/groups"}
            collapsed={collapsed}
            indent
          />
        </NavGroup>
      )}
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
          icon={<Settings className="w-4 h-4 shrink-0" />}
          label="System Settings"
          active={location === "/admin/settings"}
          collapsed={collapsed}
        />
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(location === "/settings");
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { user, logout } = useAuth();
  const adminUser = isAdmin(user);
  const superAdminUser = user?.role === "super_admin";
  const canManageSites = user?.permissions?.canManageSites ?? false;
  const isSiteCustomer = !!user && user.role === "user";
  // The contextual site nav (Dashboard/Issues/Compliance) is for site-specific
  // users — regular `user` accounts tied to their own site, and `admin`
  // accounts while they're actively managing a specific site. `super_admin`
  // manages the whole platform and never gets this contextual nav.
  const isNonSuperAdminRole = !!user && user.role !== "super_admin";

  const mySitesQ = useMySites(isSiteCustomer);
  const mySites = mySitesQ.data ?? [];
  const mySiteId = mySites.length >= 1 ? mySites[0].id : undefined;

  // `admin` (non-super) doesn't have a single "my site" — instead, show the
  // contextual site nav whenever they're actively viewing a specific site's pages.
  const siteIdFromUrlMatch = location.match(/^\/sites\/(\d+)/);
  const siteIdFromUrl = siteIdFromUrlMatch
    ? parseInt(siteIdFromUrlMatch[1], 10)
    : undefined;
  const effectiveSiteId = !isNonSuperAdminRole
    ? undefined
    : isSiteCustomer
      ? mySiteId
      : siteIdFromUrl;
  const showSiteNav = effectiveSiteId !== undefined;

  const siteDashboardHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}`
      : "/crawler/sites";
  const sitePageGroupsHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/page-groups`
      : "/crawler/sites";
  const siteIssuesHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/issues`
      : "/crawler/sites";
  const sitePotentialIssuesHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/potential-issues`
      : "/crawler/sites";
  const siteComplianceWcagHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/compliance/wcag`
      : "/crawler/sites";
  const siteComplianceEaaHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/compliance/eaa`
      : "/crawler/sites";
  const siteComplianceAdaHref =
    effectiveSiteId !== undefined
      ? `/sites/${effectiveSiteId}/compliance/ada`
      : "/crawler/sites";
  const onSiteDashboard =
    location.startsWith("/sites/") &&
    effectiveSiteId !== undefined &&
    location.startsWith(`/sites/${effectiveSiteId}`);
  const onSiteDashboardExact =
    onSiteDashboard && location === siteDashboardHref;
  const onSitePageGroups = onSiteDashboard && location === sitePageGroupsHref;
  const onSiteIssues = onSiteDashboard && location === siteIssuesHref;
  const onSitePotentialIssues =
    onSiteDashboard && location === sitePotentialIssuesHref;
  const onSiteComplianceWcag =
    onSiteDashboard && location === siteComplianceWcagHref;
  const onSiteComplianceEaa =
    onSiteDashboard && location === siteComplianceEaaHref;
  const onSiteComplianceAda =
    onSiteDashboard && location === siteComplianceAdaHref;

  const accessibilityActive =
    onSiteDashboard ||
    location === "/new" ||
    location === "/advanced" ||
    location.startsWith("/scans") ||
    location.startsWith("/compare") ||
    location.startsWith("/crawler");

  const manualScanActive =
    location === "/new" ||
    location === "/advanced" ||
    location.startsWith("/scans") ||
    location.startsWith("/compare");
  const crawlerScanActive =
    location.startsWith("/crawler/new") ||
    (location.startsWith("/crawler") && !location.startsWith("/crawler/sites"));
  const issuesActive = onSiteIssues || onSitePotentialIssues;
  const complianceActive =
    onSiteComplianceWcag || onSiteComplianceEaa || onSiteComplianceAda;
  const adminSettingsActive = location.startsWith("/admin");
  const siteManagementActive = location.startsWith("/crawler/sites");
  const inQA = location.startsWith("/quality-assurance");
  const seoActive = location.startsWith("/seo");

  const urlSection: Section | null = inQA
    ? "quality-assurance"
    : seoActive
      ? "seo"
      : siteManagementActive
        ? "site-management"
        : adminSettingsActive
        ? "admin"
        : accessibilityActive
          ? "accessibility"
          : null;

  const [sidebarSection, setSidebarSection] = useState<Section | null>(
    urlSection,
  );
  const [tourTargets, setTourTargets] = useState<
    { id: string; title: string; description: string }[]
  >([]);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourRect, setTourRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (urlSection !== null) setSidebarSection(urlSection);
  }, [urlSection]);

  const onBack = () => setSidebarSection(null);

  const closeWalkthrough = () => {
    setTourStep(null);
    setTourTargets([]);
    setTourRect(null);
  };

  useEffect(() => {
    const startWalkthrough = () => {
      window.requestAnimationFrame(() => {
        const seen = new Set<string>();
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>("[data-tour]"),
        )
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const id = element.dataset.tour ?? "";
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              getComputedStyle(element).visibility !== "hidden" &&
              getComputedStyle(element).opacity !== "0" &&
              !seen.has(id)
            );
          })
          .map((element) => {
            const id = element.dataset.tour ?? "";
            seen.add(id);
            return {
              id,
              title: element.dataset.tourTitle ?? "Application navigation",
              description:
                element.dataset.tourDescription ??
                "Use this control to explore the application.",
            };
          });
        setTourTargets(targets);
        setTourStep(targets.length > 0 ? 0 : null);
      });
    };

    window.addEventListener(APP_WALKTHROUGH_EVENT, startWalkthrough);
    return () => window.removeEventListener(APP_WALKTHROUGH_EVENT, startWalkthrough);
  }, []);

  useEffect(() => {
    if (tourStep === null || !tourTargets[tourStep]) return;

    const updateTourRect = () => {
      const element = Array.from(
        document.querySelectorAll<HTMLElement>("[data-tour]"),
      ).find((candidate) => candidate.dataset.tour === tourTargets[tourStep].id);
      if (!element) return;
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      setTourRect(element.getBoundingClientRect());
    };

    updateTourRect();
    window.addEventListener("resize", updateTourRect);
    window.addEventListener("scroll", updateTourRect, true);
    return () => {
      window.removeEventListener("resize", updateTourRect);
      window.removeEventListener("scroll", updateTourRect, true);
    };
  }, [tourStep, tourTargets]);

  useEffect(() => {
    if (tourStep === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWalkthrough();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tourStep]);

  const activeTourTarget = tourStep === null ? undefined : tourTargets[tourStep];
  const tourPanelStyle =
    tourRect && activeTourTarget
      ? (() => {
          const panelWidth = 320;
          const left = Math.min(
            Math.max(16, tourRect.left),
            window.innerWidth - panelWidth - 16,
          );
          const placeBelow = tourRect.bottom + 190 < window.innerHeight;
          return {
            left,
            ...(placeBelow
              ? { top: Math.min(window.innerHeight - 190, tourRect.bottom + 14) }
              : { top: Math.max(16, tourRect.top - 190) }),
          };
        })()
      : undefined;

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
            <div className="flex-1 flex items-center justify-center px-4">
              <SiteSelector />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/tickets">
                <Button
                  data-tour="header-support"
                  data-tour-title="Support"
                  data-tour-description="Open support tickets and request help from your team."
                  variant={
                    location.startsWith("/tickets") ? "secondary" : "ghost"
                  }
                  size="sm"
                  className="gap-2"
                >
                  <TicketCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Support</span>
                </Button>
              </Link>
              <Link href="/app-updates">
                <Button
                  data-testid="button-app-updates"
                  data-tour="header-app-updates"
                  data-tour-title="App Updates"
                  data-tour-description="See what is new in version 1.2.0."
                  variant={location === "/app-updates" ? "secondary" : "ghost"}
                  size="sm"
                  className="relative gap-2"
                >
                  <Megaphone className="h-4 w-4 text-primary" />
                  <span className="hidden sm:inline">App Updates</span>
                  <span
                    aria-label="New updates"
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-fuchsia-500 shadow-[0_0_0_2px_hsl(var(--background)),0_0_10px_rgba(217,70,239,0.9)]"
                  />
                </Button>
              </Link>
              <Link href="/app-walkthrough">
                <Button
                  data-testid="button-app-walkthrough"
                  data-tour="header-app-walkthrough"
                  data-tour-title="App Walkthrough"
                  data-tour-description="Start a guided tour of the platform navigation."
                  variant={location === "/app-walkthrough" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Map className="h-4 w-4" />
                  <span className="hidden sm:inline">App Walkthrough</span>
                </Button>
              </Link>
              <Link href="/documentation">
                <Button
                  data-testid="button-documentation"
                  data-tour="header-documentation"
                  data-tour-title="Documentation"
                  data-tour-description="Read scanning guidance, rule descriptions, and WCAG references."
                  variant={
                    location === "/documentation" ? "secondary" : "ghost"
                  }
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
                  <Button
                    data-tour="header-account"
                    data-tour-title="Account menu"
                    data-tour-description="Access account settings and sign out."
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Open account menu"
                  >
                    <User className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </span>
                      <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {user?.fullName || user?.username}
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
            <div className="absolute -right-3.5 top-5 z-10">{toggleBtn}</div>

            <div
              className={`p-4 pb-2 overflow-hidden whitespace-nowrap ${collapsed ? "opacity-0 pointer-events-none" : "opacity-100"} transition-opacity duration-150`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-sidebar-foreground">
                <Badge
                  data-tour="version-badge"
                  data-tour-title="Version 1.2.0"
                  data-tour-description="This badge shows the current application release."
                  variant="outline"
                  className="h-6 border-primary/30 bg-primary/5 px-2 font-mono text-[10px] text-primary"
                >
                  v1.2.0
                </Badge>
              </div>
            </div>

            <nav
              className={`flex-1 py-4 space-y-3 overflow-y-auto ${collapsed ? "px-1.5" : "px-4"} transition-[padding] duration-200`}
            >
              {sidebarSection === null && (
                <MainMenuContent
                  collapsed={collapsed}
                  adminUser={adminUser}
                  canManageSites={user?.permissions?.canManageSites ?? false}
                />
              )}
              {sidebarSection === "accessibility" && (
                <AccessibilitySidebarContent
                  collapsed={collapsed}
                  location={location}
                  adminUser={adminUser}
                  showSiteNav={showSiteNav}
                  effectiveSiteId={effectiveSiteId}
                  onBack={onBack}
                />
              )}
              {sidebarSection === "quality-assurance" && (
                <QASidebarContent
                  collapsed={collapsed}
                  location={location}
                  onBack={onBack}
                />
              )}
              {sidebarSection === "seo" && (
                <SEOSidebarContent
                  collapsed={collapsed}
                  location={location}
                  onBack={onBack}
                />
              )}
              {sidebarSection === "admin" && adminUser && (
                <AdminSidebarContent
                  collapsed={collapsed}
                  location={location}
                  adminUser={adminUser}
                  superAdminUser={superAdminUser}
                  canManageSites={canManageSites}
                  onBack={onBack}
                />
              )}
              {sidebarSection === "site-management" && canManageSites && (
                <AdminSidebarContent
                  collapsed={collapsed}
                  location={location}
                  adminUser={false}
                  superAdminUser={false}
                  canManageSites
                  onBack={onBack}
                />
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

          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to main content
          </a>
          <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-auto">
            <div className="p-6 md:p-8 w-full">
              {location !== "/welcome" && (
                <Link
                  href="/welcome"
                  data-testid="link-back-to-home"
                  className="mb-6 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Home className="h-4 w-4" />
                  Back to Home
                </Link>
              )}
              {children}
            </div>
          </main>
        </div>

        <AccessibilityModeControl />

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
            </DialogHeader>
            <div className="mt-2">
              <SettingsPage />
            </div>
          </DialogContent>
        </Dialog>

        {tourStep !== null && activeTourTarget && tourRect && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Application walkthrough"
            className="fixed inset-0 z-[100] pointer-events-none"
          >
            <div className="absolute inset-0 bg-slate-950/35" />
            <div
              aria-hidden="true"
              className="fixed rounded-lg border-2 border-primary bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.48),0_0_24px_rgba(99,102,241,0.7)] transition-all duration-200"
              style={{
                left: Math.max(4, tourRect.left - 4),
                top: Math.max(4, tourRect.top - 4),
                width: tourRect.width + 8,
                height: tourRect.height + 8,
              }}
            />
            <div
              className="pointer-events-auto fixed w-[min(320px,calc(100vw-32px))] rounded-xl border bg-background p-4 shadow-2xl transition-all duration-200"
              style={tourPanelStyle}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                    App walkthrough
                  </p>
                  <h2 className="mt-1 text-sm font-semibold">
                    {activeTourTarget.title}
                  </h2>
                </div>
                <Button
                  data-testid="button-cancel-walkthrough"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={closeWalkthrough}
                  aria-label="Cancel walkthrough"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {activeTourTarget.description}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {tourStep + 1} of {tourTargets.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="button-cancel-walkthrough-text"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={closeWalkthrough}
                  >
                    Cancel
                  </Button>
                  <Button
                    data-testid="button-previous-walkthrough"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={tourStep === 0}
                    onClick={() =>
                      setTourStep((step) =>
                        step === null ? null : Math.max(0, step - 1),
                      )
                    }
                  >
                    Back
                  </Button>
                  <Button
                    data-testid="button-next-walkthrough"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (tourStep >= tourTargets.length - 1) {
                        closeWalkthrough();
                      } else {
                        setTourStep((step) =>
                          step === null ? null : step + 1,
                        );
                      }
                    }}
                  >
                    {tourStep >= tourTargets.length - 1 ? "Finish" : "Next"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
