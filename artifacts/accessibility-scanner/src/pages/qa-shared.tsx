import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useSite } from "@/contexts/site";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import { usePageGroup } from "@/contexts/page-group";

export const QA_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/** Shared visual contract for every QA data table. */
export const QA_TABLE_SHELL_CLASS = "overflow-x-auto rounded-[18px] border border-white/80 bg-card/80 shadow-[0_8px_22px_rgba(69,57,112,.06)] backdrop-blur-xl";
export const QA_TABLE_CLASS = "min-w-[720px]";
export const QA_URL_CLASS =
  "text-primary hover:underline text-sm font-mono flex items-center gap-1 break-all";
export const QA_SECONDARY_URL_CLASS =
  "text-muted-foreground hover:text-foreground text-xs font-mono flex items-center gap-1 break-all";

export function qaErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Quality Assurance could not be loaded. Please try again.";
}

export async function fetchQAJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...init,
      credentials: "include",
      signal: init?.signal ?? controller.signal,
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (typeof body?.error === "string") message = body.error;
      } catch {
        // Keep the status-based message when the server did not return JSON.
      }
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The QA request timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface QASiteEntry {
  siteId: number;
  siteName: string;
  siteUrl: string;
  crawlerSessionId: number;
  scanId: number | null;
  crawledAt: string | null;
  pageCount: number;
  brokenLinksCount: number;
}

export function useQASites() {
  return useQuery<QASiteEntry[]>({
    queryKey: ["qa-sites"],
    queryFn: async () => {
      return fetchQAJson<QASiteEntry[]>(`${QA_BASE}/api/qa/sites`);
    },
    staleTime: 60_000,
  });
}

/**
 * Derives the selected QA site entry from the global header `activeSite`.
 * No local fallback auto-selection and no method to switch site — the header
 * site selector is the single source of truth.
 *
 * Returns a two-element tuple: [selectedSiteId, selectedEntry].
 */
export function useQASelectedSite(sites: QASiteEntry[]) {
  const { activeSite } = useSite();
  const globalSiteId = activeSite?.id ?? null;

  const selectedSiteId =
    globalSiteId !== null && sites.some((s) => s.siteId === globalSiteId)
      ? globalSiteId
      : null;

  const selected = sites.find((s) => s.siteId === selectedSiteId) ?? null;
  return [selectedSiteId, selected] as const;
}

/** @deprecated The site selector has been moved to the global header. This
 * component is kept temporarily to avoid breaking imports; it renders nothing.
 * Remove import references when all QA pages are updated.
 */
export function QASiteSelector(_props: {
  value?: number | null;
  onChange?: (id: number) => void;
  sites?: QASiteEntry[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return null;
}

/**
 * QA scan tables do not retain crawler page-type assignments. Returning null
 * prevents QA endpoints from advertising a page-group filter they cannot apply;
 * the header site remains their shared, accurate context.
 */
export function useQAPageGroup() {
  usePageGroup();
  return null;
}

export type QAPrimaryTab = "overview" | "broken-links" | "redirects" | "pages" | "word-inventory";

const QA_PRIMARY_TABS: Array<{ key: QAPrimaryTab; href: string; label: string; icon: string }> = [
  { key: "overview", href: "/quality-assurance", label: "Overview", icon: "📊" },
  { key: "broken-links", href: "/quality-assurance/links/broken", label: "Broken Links", icon: "🔗" },
  { key: "redirects", href: "/quality-assurance/links/overview", label: "Redirects", icon: "↪️" },
  { key: "pages", href: "/quality-assurance/inventory/pages", label: "Page Inventory", icon: "📄" },
  { key: "word-inventory", href: "/quality-assurance/spelling/word-inventory", label: "Word Inventory", icon: "🔤" },
];

export function QAPageShell({
  activeTab,
  children,
}: {
  activeTab: QAPrimaryTab;
  children: ReactNode;
}) {
  return (
    <div className="vision-page vision-qa relative -m-6 min-h-[calc(100vh-3rem)] overflow-hidden bg-[#f5f6fb] p-6 md:-m-8 md:min-h-[calc(100vh-4rem)] md:p-8">
      <div className="relative z-10 mx-auto max-w-none space-y-5 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/welcome" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
            <span aria-hidden="true">←</span>
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-foreground">Quality Assurance</span>
        </nav>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#172b4d]">Quality Assurance</h1>
            <p className="mt-1 text-[13px] text-[#7b8aaa]">
              Site health, broken links, redirects, page inventory, and content metrics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="h-8 rounded-[9px] px-4 text-xs font-semibold shadow-[0_6px_16px_rgba(109,72,199,.22)]">
              <Link href="/crawler/new">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Run QA Scan
              </Link>
            </Button>
          </div>
        </header>

        <nav
          aria-label="Quality assurance sections"
          className="flex w-full max-w-full gap-1 overflow-x-auto rounded-xl bg-white/80 p-1.5 shadow-[0_4px_16px_rgba(69,57,112,.05)] backdrop-blur-xl"
        >
          {QA_PRIMARY_TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(109,72,199,.22)]"
                    : "text-[#7b8aaa] hover:bg-[#f0f2f8] hover:text-[#172b4d]"
                }`}
              >
                <span aria-hidden="true" className="text-[13px] leading-none">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}

export interface QAFilterOption {
  value: string;
  label: string;
}

export interface QAFilter {
  label: string;
  value: string;
  options: QAFilterOption[];
  onChange: (value: string) => void;
}

export function QAListToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search URL…",
  filters = [],
  limit,
  onLimitChange,
  exportLabel = "Export CSV",
  onExport,
  compact = false,
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: QAFilter[];
  limit?: number;
  onLimitChange?: (limit: number) => void;
  exportLabel?: string;
  onExport?: () => void;
  compact?: boolean;
}) {
  const [input, setInput] = useState(search ?? "");

  useEffect(() => {
    setInput(search ?? "");
  }, [search]);

  const submitSearch = () => onSearch?.(input.trim());

  return (
    <div className={`flex flex-col gap-2 ${
      compact
        ? "w-full border-0 p-0 lg:w-auto lg:flex-row lg:items-center"
        : "rounded-2xl border border-white/80 bg-background/60 p-3 shadow-[0_5px_16px_rgba(69,57,112,.04)] lg:flex-row lg:items-center"
    }`}>
      {onSearch && (
        <div className={`flex min-w-0 items-center gap-2 ${compact ? "flex-1 lg:flex-none" : "flex-1"}`}>
          <div className={`relative flex-1 ${compact ? "max-w-none lg:w-[200px]" : "max-w-lg"}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className={`h-8 pl-8 text-[11px] ${compact ? "rounded-md border-border/70 bg-background/60 shadow-none" : "rounded-xl border-white/80 bg-card/90 shadow-sm"}`}
              placeholder={searchPlaceholder}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
            />
          </div>
          <Button variant="outline" size="sm" className={`h-8 ${compact ? "rounded-md border-border/70 px-2" : "rounded-xl border-white/80 bg-card/90 shadow-sm"}`} onClick={submitSearch} aria-label="Search">
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <Select key={filter.label} value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger className="h-9 w-full rounded-xl border-white/80 bg-card/90 text-sm shadow-sm sm:w-[150px]">
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 lg:ml-auto">
        {onLimitChange && limit && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
            <span className={`${compact ? "text-[10px]" : "hidden text-sm sm:inline"}`}>Show results</span>
            <Select value={String(limit)} onValueChange={(value) => onLimitChange(Number(value))}>
              <SelectTrigger className={`h-8 w-[76px] text-[11px] ${compact ? "rounded-md border-border/70 bg-background/60 shadow-none" : "rounded-xl border-white/80 bg-card/90 shadow-sm"}`} aria-label="Results per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((value) => (
                  <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {onExport && (
          <Button variant="outline" size="sm" className={`h-8 text-[11px] ${compact ? "rounded-md border-primary/20 bg-primary/5 px-2.5 text-primary hover:bg-primary/10" : "rounded-xl border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"}`} onClick={onExport}>
            {exportLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function QAPagination({
  page,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center justify-between sm:justify-end gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(1)} aria-label="First page">
          <ChevronsLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground px-2 whitespace-nowrap">Page {page} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(pages)} aria-label="Last page">
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function QABreadcrumb({
  parentHref,
  parentLabel,
  current,
}: {
  parentHref: string;
  parentLabel: string;
  current: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link
        href={parentHref}
        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
      >
        <span aria-hidden="true">←</span>
        {parentLabel}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="font-medium text-foreground">{current}</span>
    </nav>
  );
}

export function QAComingSoon({ feature, description }: { feature: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <span className="text-2xl">🔜</span>
      </div>
      <p className="text-lg font-semibold text-foreground">{feature}</p>
      {description && (
        <p className="text-sm text-center max-w-md">{description}</p>
      )}
      <p className="text-xs text-muted-foreground/60 mt-2">
        This feature is planned for a future release.
      </p>
    </div>
  );
}
