import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { useListScans } from "@workspace/api-client-react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  GitCompare, Download, ChevronDown, ChevronRight, TrendingUp,
  TrendingDown, Minus, AlertTriangle, CheckCircle2, Globe,
  Printer, ArrowRight, Filter,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getImpactBadge } from "@/lib/status-badge";

// ── Fetch helper ────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    throw new Error(
      (typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null)
      ?? `HTTP ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ComparisonIssue {
  ruleId: string;
  impact: string;
  description: string;
  selector: string | null;
  wcagCriteria: string | null;
  wcagLevel: string | null;
}

interface ComparisonPage {
  url: string;
  scan1Page: { status: string; issueCount: number; criticalCount: number };
  scan2Page: { status: string; issueCount: number; criticalCount: number };
  newIssues: ComparisonIssue[];
  fixedIssues: ComparisonIssue[];
  persistingIssues: ComparisonIssue[];
}

interface ComparisonResult {
  scan1: { id: number; name: string | null; projectName: string | null; status: string; totalUrls: number; totalIssues: number; createdAt: string; completedAt: string | null };
  scan2: { id: number; name: string | null; projectName: string | null; status: string; totalUrls: number; totalIssues: number; createdAt: string; completedAt: string | null };
  summary: { pagesCompared: number; pagesOnlyInScan1: number; pagesOnlyInScan2: number; totalNew: number; totalFixed: number; totalPersisting: number };
  pages: ComparisonPage[];
  onlyInScan1: string[];
  onlyInScan2: string[];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function impactOrder(impact: string) {
  return ({ critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>)[impact] ?? 4;
}

function DeltaBadge({ value, type }: { value: number; type: "new" | "fixed" | "unchanged" }) {
  if (value === 0) return <span className="text-muted-foreground text-xs">—</span>;
  if (type === "new")
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-100 rounded-full px-2 py-0.5"><TrendingUp className="w-3 h-3" />+{value}</span>;
  if (type === "fixed")
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-100 rounded-full px-2 py-0.5"><TrendingDown className="w-3 h-3" />-{value}</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"><Minus className="w-3 h-3" />{value}</span>;
}

function IssueSection({
  title, issues, color,
}: { title: string; issues: ComparisonIssue[]; color: "red" | "green" | "slate" }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;
  const bg = color === "red" ? "border-red-200 bg-red-50" : color === "green" ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50";
  const titleCls = color === "red" ? "text-red-700" : color === "green" ? "text-green-700" : "text-slate-600";
  const sorted = [...issues].sort((a, b) => impactOrder(a.impact) - impactOrder(b.impact));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={`w-full flex items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors hover:brightness-95 ${bg}`}>
        <span className={`text-xs font-semibold ${titleCls}`}>
          {title} <span className="font-bold">({issues.length})</span>
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rule</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Impact</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">WCAG</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Selector</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((issue, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-1.5 font-mono font-medium">{issue.ruleId}</td>
                  <td className="px-3 py-1.5">{getImpactBadge(issue.impact)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{issue.wcagCriteria ?? "—"}{issue.wcagLevel ? ` (${issue.wcagLevel})` : ""}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground max-w-[180px] truncate" title={issue.selector ?? undefined}>{issue.selector ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{issue.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PageRow({ page }: { page: ComparisonPage }) {
  const [open, setOpen] = useState(false);
  const net = page.newIssues.length - page.fixedIssues.length;
  const rowHighlight =
    page.newIssues.length > 0 && net > 0 ? "bg-red-50/50" :
    net < 0 ? "bg-green-50/40" : "";

  return (
    <>
      <TableRow
        className={`cursor-pointer hover:bg-muted/30 transition-colors ${rowHighlight} ${open ? "border-b-0" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <TableCell className="w-8 pl-3">
          {open
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-mono text-xs break-all py-3">{page.url}</TableCell>
        <TableCell className="text-center text-sm text-muted-foreground">{page.scan1Page.issueCount}</TableCell>
        <TableCell className="text-center text-sm font-medium">{page.scan2Page.issueCount}</TableCell>
        <TableCell className="text-center"><DeltaBadge value={page.newIssues.length}        type="new"       /></TableCell>
        <TableCell className="text-center"><DeltaBadge value={page.fixedIssues.length}      type="fixed"     /></TableCell>
        <TableCell className="text-center"><DeltaBadge value={page.persistingIssues.length} type="unchanged" /></TableCell>
        <TableCell className="text-center text-xs font-semibold">
          {net > 0 ? <span className="text-red-600">+{net}</span>
           : net < 0 ? <span className="text-green-600">{net}</span>
           : <span className="text-muted-foreground">0</span>}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8} className="px-8 py-4 bg-muted/10">
            <div className="space-y-2">
              <IssueSection title="New Issues"        issues={page.newIssues}        color="red"   />
              <IssueSection title="Fixed Issues"      issues={page.fixedIssues}      color="green" />
              <IssueSection title="Persisting Issues" issues={page.persistingIssues} color="slate" />
              {page.newIssues.length === 0 && page.fixedIssues.length === 0 && page.persistingIssues.length === 0 && (
                <div className="flex items-center gap-2 text-green-600 text-sm py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  No accessibility issues in either scan for this page.
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScanCompare() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const [scan1Id, setScan1Id] = useState(params.get("scan1") ?? "");
  const [scan2Id, setScan2Id] = useState(params.get("scan2") ?? "");
  const [strip1, setStrip1] = useState("");
  const [strip2, setStrip2] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "regression" | "improved" | "unchanged">("all");

  const { data: scans, isLoading: scansLoading } = useListScans();

  const readyToCompare = scan1Id && scan2Id && scan1Id !== scan2Id;

  const buildApiUrl = (base: string) => {
    const qs = new URLSearchParams({ scan1Id, scan2Id });
    if (strip1.trim()) qs.set("strip1", strip1.trim());
    if (strip2.trim()) qs.set("strip2", strip2.trim());
    return `${base}?${qs.toString()}`;
  };

  const { data: result, isLoading: compareLoading, error: compareError } = useQuery<ComparisonResult>({
    queryKey: ["scan-compare", scan1Id, scan2Id, strip1.trim(), strip2.trim()],
    queryFn: () => apiFetch<ComparisonResult>(buildApiUrl("/api/scans/compare")),
    enabled: Boolean(readyToCompare),
  });

  const filteredPages = useMemo(() => {
    if (!result) return [];
    return result.pages.filter(p =>
      filterMode === "regression" ? p.newIssues.length > p.fixedIssues.length :
      filterMode === "improved"   ? p.fixedIssues.length > p.newIssues.length  :
      filterMode === "unchanged"  ? p.newIssues.length === 0 && p.fixedIssues.length === 0 :
      true
    );
  }, [result, filterMode]);

  const regressionCount = result?.pages.filter(p => p.newIssues.length > p.fixedIssues.length).length ?? 0;
  const improvedCount   = result?.pages.filter(p => p.fixedIssues.length > p.newIssues.length).length ?? 0;
  const unchangedCount  = result?.pages.filter(p => p.newIssues.length === 0 && p.fixedIssues.length === 0).length ?? 0;

  const csvUrl = readyToCompare ? buildApiUrl("/api/scans/compare/csv") : "#";

  const scanLabel = (s: NonNullable<typeof scans>[0]) => {
    const base = (s as { name?: string | null; projectName?: string | null });
    const name = base.name ?? base.projectName ?? `Scan #${s.id}`;
    return `${name} — ${formatDate(s.createdAt)} (${s.totalUrls} pages)`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-primary" />
            Scan Comparison
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Select two scans to track new issues, fixed issues, and regressions across environments or deployments.
          </p>
        </div>
        {result && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <a href={csvUrl} download>
                <Download className="w-4 h-4 mr-1.5" />
                Export CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print / PDF
            </Button>
          </div>
        )}
      </div>

      {/* Scan pickers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([
          { label: "Baseline Scan (A)",    id: scan1Id, setId: setScan1Id, strip: strip1, setStrip: setStrip1, color: "blue"   as const },
          { label: "Comparison Scan (B)", id: scan2Id, setId: setScan2Id, strip: strip2, setStrip: setStrip2, color: "indigo" as const },
        ]).map(({ label, id, setId, strip, setStrip, color }) => {
          const borderCls = color === "blue" ? "border-blue-200" : "border-indigo-200";
          const headerBg  = color === "blue" ? "bg-blue-50"      : "bg-indigo-50";
          const labelCls  = color === "blue" ? "text-blue-700"   : "text-indigo-700";
          const ringCls   = color === "blue" ? "accent-blue-600" : "accent-indigo-600";
          const rowSelCls = color === "blue" ? "bg-blue-50 border-blue-200" : "bg-indigo-50 border-indigo-200";
          const inputFocusCls = color === "blue" ? "focus:ring-blue-400 focus:border-blue-400" : "focus:ring-indigo-400 focus:border-indigo-400";
          const chosen = scans?.find(s => String(s.id) === id);
          return (
            <Card key={label} className={`border-2 ${borderCls} overflow-hidden`}>
              {/* Header */}
              <div className={`px-4 py-3 ${headerBg} border-b ${borderCls} flex items-center justify-between`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${labelCls}`}>{label}</span>
                {chosen && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Globe className="w-3 h-3 shrink-0" />
                    {chosen.totalUrls} pages · {chosen.totalIssues} issues
                  </span>
                )}
              </div>

              {/* Scrollable radio listbox */}
              <div
                role="listbox"
                aria-label={label}
                className="overflow-y-auto divide-y"
                style={{ maxHeight: "220px" }}
              >
                {scansLoading ? (
                  <div className="p-4 space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
                  </div>
                ) : (scans ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No scans available.</div>
                ) : (
                  (scans ?? []).map(s => {
                    const sid = String(s.id);
                    const checked = id === sid;
                    const base = s as { name?: string | null; projectName?: string | null };
                    const name = base.name ?? base.projectName ?? `Scan #${s.id}`;
                    return (
                      <label
                        key={sid}
                        role="option"
                        aria-selected={checked}
                        className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors select-none ${
                          checked ? `${rowSelCls} border-l-2` : "hover:bg-muted/40 border-l-2 border-l-transparent"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`scan-picker-${color}`}
                          value={sid}
                          checked={checked}
                          onChange={() => setId(sid)}
                          className={`mt-0.5 shrink-0 ${ringCls}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight">{name}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">
                            {formatDate(s.createdAt)} · {s.totalUrls} pages · {s.totalIssues} issues
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Base URL strip input */}
              <div className={`px-4 py-3 border-t ${borderCls}`}>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Base URL <span className="font-normal">(optional — for cross-environment matching)</span>
                </label>
                <input
                  type="url"
                  value={strip}
                  onChange={e => setStrip(e.target.value)}
                  placeholder="https://www.example.com"
                  className={`w-full text-xs font-mono rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-offset-1 ${inputFocusCls}`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  URLs will be matched by path only after stripping this prefix.
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Validation nudge */}
      {scan1Id && scan2Id && scan1Id === scan2Id && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Please select two different scans to compare.
        </div>
      )}

      {/* Loading */}
      {compareLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Building comparison…
        </div>
      )}

      {/* Error */}
      {compareError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {(compareError as Error).message}
        </div>
      )}

      {/* Results */}
      {result && !compareLoading && (
        <>
          {/* Scan meta banner */}
          <div className="rounded-xl border bg-muted/30 px-5 py-4 flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-xs text-blue-600 uppercase font-semibold mr-2">A</span>
              <span className="font-semibold">{result.scan1.name ?? `Scan #${result.scan1.id}`}</span>
              {result.scan1.projectName && <span className="text-muted-foreground ml-2">({result.scan1.projectName})</span>}
              <span className="text-muted-foreground ml-2">{formatDate(result.scan1.createdAt)}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <span className="text-xs text-indigo-600 uppercase font-semibold mr-2">B</span>
              <span className="font-semibold">{result.scan2.name ?? `Scan #${result.scan2.id}`}</span>
              {result.scan2.projectName && <span className="text-muted-foreground ml-2">({result.scan2.projectName})</span>}
              <span className="text-muted-foreground ml-2">{formatDate(result.scan2.createdAt)}</span>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pages Compared</p>
                <p className="text-3xl font-bold mt-1">{result.summary.pagesCompared}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.summary.pagesOnlyInScan1 === 0 && result.summary.pagesOnlyInScan2 === 0
                    ? "All pages matched"
                    : [
                        result.summary.pagesOnlyInScan1 > 0 ? `+${result.summary.pagesOnlyInScan1} only in A` : "",
                        result.summary.pagesOnlyInScan2 > 0 ? `+${result.summary.pagesOnlyInScan2} only in B` : "",
                      ].filter(Boolean).join(" · ")}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-5">
                <p className="text-xs text-red-600 font-medium uppercase tracking-wide">New Issues</p>
                <p className="text-3xl font-bold text-red-700 mt-1">+{result.summary.totalNew}</p>
                <p className="text-xs text-red-500 mt-1">{regressionCount} page{regressionCount !== 1 ? "s" : ""} regressed</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-5">
                <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Fixed Issues</p>
                <p className="text-3xl font-bold text-green-700 mt-1">-{result.summary.totalFixed}</p>
                <p className="text-xs text-green-500 mt-1">{improvedCount} page{improvedCount !== 1 ? "s" : ""} improved</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50">
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Persisting</p>
                <p className="text-3xl font-bold text-slate-700 mt-1">{result.summary.totalPersisting}</p>
                <p className="text-xs text-slate-400 mt-1">
                  net:{" "}
                  <span className={
                    result.summary.totalNew - result.summary.totalFixed > 0 ? "text-red-600 font-semibold" :
                    result.summary.totalNew - result.summary.totalFixed < 0 ? "text-green-600 font-semibold" : ""
                  }>
                    {result.summary.totalNew - result.summary.totalFixed > 0 ? "+" : ""}
                    {result.summary.totalNew - result.summary.totalFixed}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
            {([
              ["all",        `All pages (${result.pages.length})`],
              ["regression", `Regressions (${regressionCount})`],
              ["improved",   `Improved (${improvedCount})`],
              ["unchanged",  `No change (${unchangedCount})`],
            ] as const).map(([mode, lbl]) => (
              <Button
                key={mode}
                size="sm"
                variant={filterMode === mode ? "default" : "outline"}
                onClick={() => setFilterMode(mode)}
                className="rounded-full"
              >
                {lbl}
              </Button>
            ))}
          </div>

          {/* Per-page comparison table */}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8 pl-3" />
                  <TableHead>Page URL</TableHead>
                  <TableHead className="text-center w-28">Baseline (A)</TableHead>
                  <TableHead className="text-center w-28">Current (B)</TableHead>
                  <TableHead className="text-center w-24 text-red-600">New</TableHead>
                  <TableHead className="text-center w-24 text-green-600">Fixed</TableHead>
                  <TableHead className="text-center w-24">Persisting</TableHead>
                  <TableHead className="text-center w-20">Net Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPages.map(p => <PageRow key={p.url} page={p} />)}
                {filteredPages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      No pages match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pages only in one scan */}
          {(result.onlyInScan1.length > 0 || result.onlyInScan2.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.onlyInScan1.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="outline" className="text-blue-600 border-blue-300">A only</Badge>
                      Pages removed in B ({result.onlyInScan1.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      These URLs were in the baseline but not in the comparison scan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {result.onlyInScan1.map(url => (
                        <li key={url} className="text-xs font-mono text-muted-foreground break-all">{url}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {result.onlyInScan2.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="outline" className="text-indigo-600 border-indigo-300">B only</Badge>
                      New pages in B ({result.onlyInScan2.length})
                    </CardTitle>
                    <CardDescription className="text-xs">
                      New URLs in the comparison scan with no baseline to compare against.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {result.onlyInScan2.map(url => (
                        <li key={url} className="text-xs font-mono text-muted-foreground break-all">{url}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!scan1Id && !scan2Id && (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-4">
          <GitCompare className="w-10 h-10 opacity-30" />
          <div>
            <p className="text-base font-medium">Select two scans above to compare</p>
            <p className="text-sm mt-1">Choose a baseline (A) and a comparison scan (B) to see what changed.</p>
          </div>
        </div>
      )}
    </div>
  );
}
