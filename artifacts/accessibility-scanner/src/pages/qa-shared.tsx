import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";

export const QA_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/** Shared visual contract for every QA data table. */
export const QA_TABLE_SHELL_CLASS = "rounded-lg border bg-card overflow-x-auto";
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

export function useQASelectedSite(sites: QASiteEntry[]) {
  const { activeSite, setActiveSite } = useSite();
  const globalSiteId = activeSite?.id ?? null;

  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(() => {
    // Prefer global activeSite if it matches a QA site entry
    if (globalSiteId != null && sites.some((s) => s.siteId === globalSiteId)) {
      return globalSiteId;
    }
    try {
      const v = sessionStorage.getItem("qa-selected-site");
      return v ? parseInt(v) : null;
    } catch { return null; }
  });

  // Auto-select first when no valid selection exists
  useEffect(() => {
    if (!sites.length) return;
    if (globalSiteId != null) {
      // The sync effect below handles a matching QA site. If the active
      // header site has no QA data, preserve that selection as an empty state
      // instead of silently switching to a different site's report.
      if (sites.some((s) => s.siteId === globalSiteId)) return;
      setSelectedSiteId(null);
      try { sessionStorage.removeItem("qa-selected-site"); } catch {}
      return;
    }
    if (selectedSiteId !== null && sites.some((s) => s.siteId === selectedSiteId)) return;
    const first = sites[0].siteId;
    setSelectedSiteId(first);
    try { sessionStorage.setItem("qa-selected-site", String(first)); } catch {}
  }, [sites, selectedSiteId]);

  // Sync with the global header selector when activeSite changes. A selected
  // site without QA data should show the empty state rather than leaving the
  // previous site's report on screen.
  useEffect(() => {
    if (globalSiteId == null || sites.length === 0) return;
    const globalSiteIsAvailable = sites.some((s) => s.siteId === globalSiteId);
    setSelectedSiteId(globalSiteIsAvailable ? globalSiteId : null);
    try {
      if (globalSiteIsAvailable) {
        sessionStorage.setItem("qa-selected-site", String(globalSiteId));
      } else {
        sessionStorage.removeItem("qa-selected-site");
      }
    } catch {}
  }, [globalSiteId, sites]);

  const setSite = (id: number) => {
    setSelectedSiteId(id);
    const matchingSite = sites.find((site) => site.siteId === id);
    if (matchingSite) {
      const contextSite = {
        id: matchingSite.siteId,
        name: matchingSite.siteName,
        baseUrl: matchingSite.siteUrl,
        description: null,
        role: "",
        pageCount: matchingSite.pageCount,
      };
      setActiveSite(contextSite);
    }
    try { sessionStorage.setItem("qa-selected-site", String(id)); } catch {}
  };

  const selected = sites.find((s) => s.siteId === selectedSiteId) ?? null;
  return [selectedSiteId, selected, setSite] as const;
}

export function QASiteSelector({
  value,
  onChange,
  sites,
  loading,
  error,
  onRetry,
}: {
  value: number | null;
  onChange: (id: number) => void;
  sites: QASiteEntry[];
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading sites…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <span>{qaErrorMessage(error)}</span>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  if (!sites.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No crawler-linked sites with completed scans found.
      </p>
    );
  }
  return (
    <Select
      value={value !== null ? String(value) : ""}
      onValueChange={(v) => onChange(parseInt(v))}
    >
      <SelectTrigger className="w-full max-w-sm bg-background border-border text-sm">
        <SelectValue placeholder="Select a site…" />
      </SelectTrigger>
      <SelectContent>
        {sites.map((s) => (
          <SelectItem key={s.siteId} value={String(s.siteId)}>
            <span className="font-medium">{s.siteName}</span>
            <span className="ml-2 text-muted-foreground text-xs truncate max-w-[200px]">
              {s.siteUrl}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
}: {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: QAFilter[];
  limit?: number;
  onLimitChange?: (limit: number) => void;
  exportLabel?: string;
  onExport?: () => void;
}) {
  const [input, setInput] = useState(search ?? "");

  useEffect(() => {
    setInput(search ?? "");
  }, [search]);

  const submitSearch = () => onSearch?.(input.trim());

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      {onSearch && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={searchPlaceholder}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={submitSearch} aria-label="Search">
            <Search className="w-4 h-4" />
          </Button>
        </div>
      )}

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <Select key={filter.label} value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger className="w-full sm:w-[150px] bg-background text-sm">
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
            <span className="hidden sm:inline">Show results</span>
            <Select value={String(limit)} onValueChange={(value) => onLimitChange(Number(value))}>
              <SelectTrigger className="w-[82px] bg-background text-sm" aria-label="Results per page">
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
          <Button variant="outline" size="sm" onClick={onExport}>
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
