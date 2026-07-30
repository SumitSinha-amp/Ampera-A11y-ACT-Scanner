import { useState, useEffect } from "react";
import { useAutoActiveSite } from "@/pages/site/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  AlertTriangle,
  Info,
  Minus,
  Search,
  ExternalLink,
  Code2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface RuleSummary {
  rule_id: string;
  description: string;
  impact: string;
  wcag_criteria: string | null;
  wcag_level: string | null;
  legal_text: string | null;
  remediation: string | null;
  total_occurrences: number;
  pages_affected: number;
  points_to_gain: number;
}

interface SampleElement {
  url: string;
  element: string | null;
  element_context: string | null;
  selector: string | null;
}

interface PageRow {
  page_id: number;
  url: string;
  occurrences: number;
}

interface DetailResponse {
  rule: RuleSummary;
  sampleElements: SampleElement[];
  pages: PageRow[];
  total: number;
  page: number;
  limit: number;
  scanId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function urlDisplayTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    if (!path || path === "") return u.hostname;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    // Clean up slugs: replace hyphens, remove extensions
    return last
      .replace(/\.[^.]+$/, "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return url;
  }
}

function urlDisplayPath(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

const IMPACT_WEIGHTS: Record<string, number> = {
  critical: 10, serious: 5, moderate: 2, minor: 1,
};

const RESPONSIBILITY: Record<string, string> = {
  critical: "Developer",
  serious: "Developer / Designer",
  moderate: "Content author",
  minor: "Content author",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function DifficultyDots({ impact }: { impact: string }) {
  const levels: Record<string, { filled: number; color: string; label: string }> = {
    critical: { filled: 4, color: "bg-red-500",    label: "Expert" },
    serious:  { filled: 3, color: "bg-orange-500", label: "Advanced" },
    moderate: { filled: 2, color: "bg-yellow-500", label: "Intermediate" },
    minor:    { filled: 1, color: "bg-blue-400",   label: "Basic" },
  };
  const cfg = levels[impact] ?? levels.minor;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-2.5 h-2.5 rounded-full ${i <= cfg.filled ? cfg.color : "bg-muted"}`} />
      ))}
      <span className="ml-1.5 text-sm font-medium">{cfg.label}</span>
    </span>
  );
}

function ConformanceBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-muted-foreground">—</span>;
  const styles: Record<string, string> = {
    A:   "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    AA:  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    AAA: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };
  return (
    <Badge className={`text-xs px-2 py-0.5 font-bold ${styles[level] ?? styles.A}`}>{level}</Badge>
  );
}

function ImpactIcon({ impact, size = "md" }: { impact: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-7 h-7" : size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  if (impact === "critical") return <AlertCircle className={`${sz} text-red-500 shrink-0`} />;
  if (impact === "serious")  return <AlertTriangle className={`${sz} text-orange-500 shrink-0`} />;
  if (impact === "moderate") return <Info className={`${sz} text-yellow-500 shrink-0`} />;
  return <Minus className={`${sz} text-blue-400 shrink-0`} />;
}

function Pagination({
  page, totalPages, onPage,
}: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (page - 2 > 2) pages.push("…");
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) add(i);
  if (page + 2 < totalPages - 1) pages.push("…");
  if (totalPages > 1) add(totalPages);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(1)}>
        <ChevronsLeft className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="w-3.5 h-3.5" />
      </Button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground text-xs">…</span>
        ) : (
          <Button key={p} variant={p === page ? "default" : "ghost"}
            size="sm" className="h-7 w-7 text-xs px-0"
            onClick={() => onPage(p as number)}>{p}</Button>
        ),
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => onPage(totalPages)}>
        <ChevronsRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const LIMIT = 25;

interface Props { siteId: number; ruleId: string }

export default function SiteIssueDetail({ siteId, ruleId }: Props) {
  useAutoActiveSite(siteId);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"occurrences" | "url">("occurrences");
  const [samplesOpen, setSamplesOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [debouncedSearch, sort]);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(LIMIT),
    sort,
  });
  if (debouncedSearch) params.set("search", debouncedSearch);

  const { data, isLoading, isFetching } = useQuery<DetailResponse>({
    queryKey: ["site-issue-detail", siteId, ruleId, page, debouncedSearch, sort],
    queryFn: async () => {
      const r = await fetch(
        `${BASE}/api/sites/${siteId}/issues/${encodeURIComponent(ruleId)}?${params}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load issue detail");
      return r.json();
    },
    placeholderData: (prev) => prev,
  });

  // Also fetch the site name for the breadcrumb
  const siteQ = useQuery<{ name: string; baseUrl: string }>({
    queryKey: ["site-meta", siteId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/sites/${siteId}`, { credentials: "include" });
      if (!r.ok) throw new Error("site not found");
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading issue details…
      </div>
    );
  }

  if (!data?.rule) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Issue not found or no scan data available.</p>
        <Button variant="outline" asChild>
          <Link href={`/sites/${siteId}`}>← Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const rule = data.rule;
  const total = data.total;
  const totalPages = Math.ceil(total / LIMIT);
  const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const rangeEnd = Math.min(page * LIMIT, total);
  const hasSearch = debouncedSearch !== "";

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
        <Link href="/crawler/sites" className="hover:underline">Sites</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/sites/${siteId}`} className="hover:underline">
          {siteQ.data?.name ?? `Site ${siteId}`}
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">{rule.rule_id}</span>
      </div>

      {/* ── Issue Header ── */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <ImpactIcon impact={rule.impact} size="lg" />
          <div>
            <h1 className="text-xl font-bold leading-snug">{rule.description}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {rule.rule_id}
              {rule.wcag_criteria && <> · WCAG {rule.wcag_criteria}</>}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: "Conformance",
              value: <ConformanceBadge level={rule.wcag_level} />,
            },
            {
              label: "Points you can gain",
              value: (
                <span className="text-2xl font-bold text-green-700 dark:text-green-400 tabular-nums">
                  {rule.points_to_gain}
                </span>
              ),
            },
            {
              label: "Pages with this issue",
              value: <span className="text-2xl font-bold tabular-nums">{rule.pages_affected.toLocaleString()}</span>,
            },
            {
              label: "Number of occurrences",
              value: <span className="text-2xl font-bold tabular-nums">{rule.total_occurrences.toLocaleString()}</span>,
            },
            {
              label: "Difficulty level",
              value: <DifficultyDots impact={rule.impact} />,
            },
            {
              label: "Responsibility",
              value: <span className="text-sm font-medium">{RESPONSIBILITY[rule.impact] ?? "Developer"}</span>,
            },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
                <div>{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Description + Remediation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {rule.legal_text ? (
              <p className="leading-relaxed">{rule.legal_text}</p>
            ) : (
              <p className="leading-relaxed">{rule.description}</p>
            )}
            {rule.wcag_criteria && rule.wcag_level && (
              <p className="text-xs pt-1 border-t">
                WCAG criterion:{" "}
                <a
                  href={`https://www.w3.org/WAI/WCAG21/Understanding/${rule.wcag_criteria}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  {rule.wcag_criteria} (Level {rule.wcag_level})
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">How to fix</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {rule.remediation ? (
              <p className="leading-relaxed">{rule.remediation}</p>
            ) : (
              <p className="leading-relaxed text-muted-foreground/70 italic">
                No remediation guidance available for this rule.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Sample affected elements ── */}
      {data.sampleElements.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setSamplesOpen((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">
                  Sample affected elements ({data.sampleElements.length})
                </CardTitle>
              </div>
              {samplesOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {samplesOpen && (
            <CardContent className="pt-3 space-y-3">
              {data.sampleElements.map((s, i) => (
                <div key={i} className="space-y-1.5 pb-3 border-b last:border-b-0 last:pb-0">
                  <p className="text-xs text-muted-foreground truncate">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-blue-600 dark:text-blue-400 inline-flex items-center gap-1"
                    >
                      {urlDisplayPath(s.url)}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </p>
                  {s.element_context && (
                    <pre className="text-xs bg-muted/60 rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                      {s.element_context}
                    </pre>
                  )}
                  {s.selector && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Selector:</span>{" "}
                      <code className="bg-muted/60 px-1 py-0.5 rounded text-xs">{s.selector}</code>
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Pages with this issue ── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-sm font-semibold">Pages with this issue</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {total.toLocaleString()} page{total !== 1 ? "s" : ""}
                {hasSearch && " (filtered)"}
              </p>
            </div>
          </div>

          {/* Filter + sort bar */}
          <div className="flex flex-wrap items-center gap-2 pt-3 pb-1">
            <div className="relative flex-1 min-w-48 max-w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search URL…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <Select value={sort} onValueChange={(v) => setSort(v as "occurrences" | "url")}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="occurrences">Most occurrences</SelectItem>
                <SelectItem value="url">URL (A–Z)</SelectItem>
              </SelectContent>
            </Select>

            {isFetching && !isLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0 mt-1">
          <div className={isFetching && !isLoading ? "opacity-70 transition-opacity" : ""}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page URL</TableHead>
                  <TableHead className="w-32 text-right">Occurrences</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={3}>
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (data.pages ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                      {hasSearch ? "No pages match your search." : "No pages found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  (data.pages ?? []).map((p) => (
                    <TableRow key={p.url}>
                      <TableCell className="py-3">
                        <div className="min-w-0">
                          {p.page_id && data?.scanId ? (
                            <button
                              onClick={() =>
                                window.open(
                                  `${BASE}/sites/${siteId}/page-report/${p.page_id}?rule=${encodeURIComponent(ruleId)}`,
                                  "_blank",
                                )
                              }
                              className="text-sm font-medium truncate hover:underline text-left cursor-pointer block max-w-full"
                            >
                              {urlDisplayTitle(p.url)}
                            </button>
                          ) : (
                            <p className="text-sm font-medium truncate">{urlDisplayTitle(p.url)}</p>
                          )}
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block max-w-xl"
                            title={p.url}
                          >
                            {urlDisplayPath(p.url)}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {p.occurrences.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Open page</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {(totalPages > 1 || total > 0) && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                {total === 0
                  ? "No results"
                  : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} page${total !== 1 ? "s" : ""}`}
              </p>
              <Pagination page={page} totalPages={totalPages} onPage={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
