export const METRO_STATUSES = [
  "running",
  "discovering",
  "scanning",
  "crawled",
  "pending",
  "paused",
  "completed",
  "failed",
  "cancelled",
  "active",
  "healthy",
  "warning",
  "error",
  "confirmed",
  "rejected",
  "critical",
  "serious",
  "moderate",
  "minor",
] as const;

export type MetroStatus = (typeof METRO_STATUSES)[number];

const METRO_STATUS_ALIASES: Record<string, MetroStatus> = {
  crawl_complete: "crawled",
  crawling: "discovering",
  error: "error",
  high: "critical",
  in_progress: "scanning",
  low: "minor",
  medium: "moderate",
  open: "pending",
  resolved: "completed",
  closed: "cancelled",
  not_available: "failed",
  queued: "pending",
  success: "healthy",
};

/** Stable semantic hooks for Metro's high-contrast status chips. */
export function metroStatusProps(status: string): { "data-metro-status-badge": MetroStatus | "other" } {
  const normalized = status.trim().toLowerCase().replaceAll(" ", "_");
  const value = (METRO_STATUSES as readonly string[]).includes(normalized)
    ? normalized as MetroStatus
    : METRO_STATUS_ALIASES[normalized] ?? "other";
  return { "data-metro-status-badge": value };
}

export type MetroTile = "total" | "active" | "completed" | "failed" | "warning" | "critical" | "issues" | "pages" | "links" | "score" | "rules" | "scanned" | "checked" | "broken" | "redirects";

export function metroTileProps(tile: MetroTile): { "data-metro-tile": MetroTile } {
  return { "data-metro-tile": tile };
}

export type MetroAction = "view" | "edit" | "delete" | "retry" | "manage";
export function metroActionProps(action: MetroAction): { "data-metro-action": MetroAction } {
  return { "data-metro-action": action };
}

export type MetroCount = "issues" | "critical" | "rules" | "pages" | "links" | "success" | "warning";
export function metroCountProps(kind: MetroCount): { "data-metro-count": MetroCount } {
  return { "data-metro-count": kind };
}

export function metroRuleProps(): { "data-metro-rule-chip": "true" } {
  return { "data-metro-rule-chip": "true" };
}
