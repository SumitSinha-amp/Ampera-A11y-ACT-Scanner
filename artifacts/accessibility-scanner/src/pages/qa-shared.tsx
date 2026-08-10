import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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

export const QA_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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
