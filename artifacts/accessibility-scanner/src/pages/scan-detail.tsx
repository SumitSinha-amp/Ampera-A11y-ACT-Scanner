import { useState, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetScan,
  useGetScanStatus,
  useCancelScan,
  useCreateScan,
  getGetScanStatusQueryKey,
  getGetScanQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  BarChart2,
  StopCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  X,
  RotateCcw,
} from "lucide-react";
import { getStatusBadge } from "@/lib/status-badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function ImpactBadge({ impact }: { impact: string }) {
  switch (impact) {
    case "critical": return <Badge variant="outline" className="bg-[#E11D48] text-white border-transparent">Critical</Badge>;
    case "serious":  return <Badge variant="outline" className="bg-[#EA580C] text-white border-transparent">Serious</Badge>;
    case "moderate": return <Badge variant="outline" className="bg-[#EAB308] text-black border-transparent">Moderate</Badge>;
    case "minor":    return <Badge variant="outline" className="bg-[#3B82F6] text-white border-transparent">Minor</Badge>;
    default: return <Badge>{impact}</Badge>;
  }
}

function ImpactIcon({ impact }: { impact: string }) {
  switch (impact) {
    case "critical": return <AlertTriangle className="w-4 h-4 text-[#E11D48]" />;
    case "serious":  return <AlertTriangle className="w-4 h-4 text-[#EA580C]" />;
    case "moderate": return <AlertCircle className="w-4 h-4 text-[#EAB308]" />;
    case "minor":    return <Info className="w-4 h-4 text-[#3B82F6]" />;
    default:         return <Info className="w-4 h-4" />;
  }
}

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

interface Issue {
  id: number;
  ruleId: string;
  impact: string;
  description: string;
  element: string | null;
  selector: string | null;
  wcagCriteria: string | null;
  wcagLevel: string | null;
  remediation: string | null;
}

interface IssueFilters {
  search: string;
  ruleId: string;
  severity: string;
  wcag: string;
}

function IssueFilterBar({
  issues,
  filters,
  onChange,
}: {
  issues: Issue[];
  filters: IssueFilters;
  onChange: (f: IssueFilters) => void;
}) {
  const ruleIds = useMemo(
    () => Array.from(new Set(issues.map((i) => i.ruleId))).sort(),
    [issues]
  );
  const severities = useMemo(
    () => Array.from(new Set(issues.map((i) => i.impact))).sort((a, b) => (IMPACT_ORDER[a] ?? 9) - (IMPACT_ORDER[b] ?? 9)),
    [issues]
  );
  const wcagCriteria = useMemo(
    () => Array.from(new Set(issues.map((i) => i.wcagCriteria).filter(Boolean) as string[])).sort(),
    [issues]
  );

  const hasFilters = filters.search || filters.ruleId !== "all" || filters.severity !== "all" || filters.wcag !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
      <Filter className="w-4 h-4 text-muted-foreground shrink-0" />

      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search issue description..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <Select
        value={filters.ruleId}
        onValueChange={(v) => onChange({ ...filters, ruleId: v })}
      >
        <SelectTrigger className="h-8 text-xs w-[130px]">
          <SelectValue placeholder="Rule ID" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Rules</SelectItem>
          {ruleIds.map((id) => (
            <SelectItem key={id} value={id} className="font-mono text-xs">
              {id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.severity}
        onValueChange={(v) => onChange({ ...filters, severity: v })}
      >
        <SelectTrigger className="h-8 text-xs w-[120px]">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Severities</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="serious">Serious</SelectItem>
          <SelectItem value="moderate">Moderate</SelectItem>
          <SelectItem value="minor">Minor</SelectItem>
        </SelectContent>
      </Select>

      {wcagCriteria.length > 0 && (
        <Select
          value={filters.wcag}
          onValueChange={(v) => onChange({ ...filters, wcag: v })}
        >
          <SelectTrigger className="h-8 text-xs w-[140px]">
            <SelectValue placeholder="WCAG Rule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All WCAG</SelectItem>
            {wcagCriteria.map((wc) => (
              <SelectItem key={wc} value={wc} className="font-mono text-xs">
                {wc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => onChange({ search: "", ruleId: "all", severity: "all", wcag: "all" })}
        >
          <X className="w-3 h-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}

function IssueGroupList({ issues, filters }: { issues: Issue[]; filters: IssueFilters }) {
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filters.search && !issue.description.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.ruleId !== "all" && issue.ruleId !== filters.ruleId) return false;
      if (filters.severity !== "all" && issue.impact !== filters.severity) return false;
      if (filters.wcag !== "all" && issue.wcagCriteria !== filters.wcag) return false;
      return true;
    });
  }, [issues, filters]);

  const grouped = filteredIssues.reduce<Record<string, Issue[]>>((acc, issue) => {
    if (!acc[issue.ruleId]) acc[issue.ruleId] = [];
    acc[issue.ruleId].push(issue);
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => {
    const ai = IMPACT_ORDER[a[0].impact] ?? 99;
    const bi = IMPACT_ORDER[b[0].impact] ?? 99;
    return ai - bi;
  });

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-md border-dashed bg-muted/10 mt-4">
        <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No issues match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-4 border-t pt-4">
      <p className="text-xs text-muted-foreground mb-3">
        Showing {filteredIssues.length} issue{filteredIssues.length !== 1 ? "s" : ""} across {groups.length} rule{groups.length !== 1 ? "s" : ""}
      </p>
      <Accordion type="multiple" className="space-y-2">
        {groups.map((group) => {
          const first = group[0];
          const count = group.length;
          return (
            <AccordionItem
              key={first.ruleId}
              value={first.ruleId}
              className="border rounded-md bg-muted/20 px-4"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center justify-between w-full pr-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ImpactIcon impact={first.impact} />
                    <span className="font-medium text-sm text-foreground truncate text-left">{first.description}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {count} {count === 1 ? "occurrence" : "occurrences"}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs bg-background">{first.ruleId}</Badge>
                    <ImpactBadge impact={first.impact} />
                    {first.wcagCriteria && (
                      <Badge variant="secondary" className="text-xs font-mono hidden lg:inline-flex">
                        WCAG {first.wcagCriteria}
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {first.remediation && (
                  <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-md text-sm">
                    <span className="font-medium text-primary">How to fix: </span>
                    <span className="text-foreground/80">{first.remediation}</span>
                  </div>
                )}

                {count === 1 ? (
                  <div className="space-y-2">
                    {first.element && (
                      <div>
                        <span className="text-xs text-muted-foreground">Element:</span>
                        <code className="block mt-1 bg-background border p-2 rounded text-xs break-all font-mono text-primary whitespace-pre-wrap">
                          {first.element}
                        </code>
                      </div>
                    )}
                    {first.selector && (
                      <div>
                        <span className="text-xs text-muted-foreground">Selector:</span>
                        <code className="block mt-1 bg-background border p-1 px-2 rounded text-xs break-all font-mono">
                          {first.selector}
                        </code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground mb-2">
                      {count} elements affected:
                    </p>
                    <div className="border rounded-md overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium w-10">#</th>
                              <th className="text-left px-3 py-2 font-medium">Selector</th>
                              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Element</th>
                              {group.some((i) => i.description !== first.description) && (
                                <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Note</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {group.map((issue, idx) => (
                              <tr key={issue.id} className="border-t hover:bg-muted/30">
                                <td className="px-3 py-2 text-muted-foreground font-mono">
                                  {idx + 1}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs max-w-[200px]">
                                  {issue.selector ? (
                                    <span
                                      className="block truncate text-foreground/80"
                                      title={issue.selector}
                                    >
                                      {issue.selector}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden md:table-cell max-w-[300px]">
                                  {issue.element ? (
                                    <code
                                      className="block truncate text-primary font-mono text-xs"
                                      title={issue.element}
                                    >
                                      {issue.element.length > 80
                                        ? issue.element.substring(0, 80) + "…"
                                        : issue.element}
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                {group.some((i) => i.description !== first.description) && (
                                  <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground italic max-w-[200px]">
                                    {issue.description !== first.description ? (
                                      <span className="truncate block" title={issue.description}>
                                        {issue.description}
                                      </span>
                                    ) : null}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export default function ScanDetail() {
  const { id } = useParams();
  const scanId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [filters, setFilters] = useState<IssueFilters>({
    search: "",
    ruleId: "all",
    severity: "all",
    wcag: "all",
  });

  const { data: scan, isLoading: scanLoading } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
    },
  });

  const isRunning = scan?.status === "running" || scan?.status === "pending";
  const canRetry = scan?.status === "failed" || scan?.status === "cancelled";

  const { data: liveStatus } = useGetScanStatus(scanId, {
    query: {
      enabled: !!scanId && isRunning,
      queryKey: getGetScanStatusQueryKey(scanId),
      refetchInterval: 2000,
    },
  });

  const cancelScan = useCancelScan();
  const retryScan = useCreateScan();

  const handleCancel = () => {
    cancelScan.mutate(
      { id: scanId },
      {
        onSuccess: () => {
          toast({ title: "Scan cancelled" });
          queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
        },
        onError: () => {
          toast({ title: "Error cancelling scan", variant: "destructive" });
        },
      }
    );
  };

  const handleRetry = () => {
    if (!scan) return;
    const urls = (scan.pages ?? []).map((p: { url: string }) => p.url).filter(Boolean);
    if (urls.length === 0) {
      toast({ title: "No URLs to retry", variant: "destructive" });
      return;
    }
    const opts = (scan.options ?? {}) as Record<string, unknown>;
    retryScan.mutate(
      {
        data: {
          urls,
          name: scan.name ? `${scan.name} (retry)` : undefined,
          options: {
            maxConcurrency: (opts.maxConcurrency as number) ?? 5,
            ...(Array.isArray(opts.rules) && opts.rules.length > 0 ? { rules: opts.rules as string[] } : {}),
            ...(opts.proxyPacUrl ? { proxyPacUrl: opts.proxyPacUrl as string } : {}),
          },
        },
      },
      {
        onSuccess: (data) => {
          toast({ title: "Retry scan started" });
          setLocation(`/scans/${data.id}`);
        },
        onError: () => {
          toast({ title: "Failed to start retry scan", variant: "destructive" });
        },
      }
    );
  };

  if (scanLoading || !scan) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayStatus = liveStatus?.status || scan.status;
  const totalUrls = liveStatus?.totalUrls || scan.totalUrls;
  const scannedUrls = liveStatus?.scannedUrls || scan.scannedUrls;
  const progressPercent = totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;

  const allIssues = scan.pages?.flatMap((p) => p.issues || []) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{scan.name || `Scan #${scan.id}`}</h1>
            {getStatusBadge(displayStatus)}
          </div>
          <p className="text-muted-foreground font-mono text-sm">
            ID: {scan.id} | Created: {new Date(scan.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleCancel}
              disabled={cancelScan.isPending}
            >
              {cancelScan.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <StopCircle className="w-4 h-4 mr-2" />
              )}
              Cancel
            </Button>
          )}
          {canRetry && (
            <Button
              variant="outline"
              onClick={handleRetry}
              disabled={retryScan.isPending}
            >
              {retryScan.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Retry Scan
            </Button>
          )}
          {!isRunning && scan.status === "completed" && (
            <Link href={`/scans/${scan.id}/report`}>
              <Button>
                <BarChart2 className="w-4 h-4 mr-2" />
                View Report
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan Progress</CardTitle>
          {liveStatus?.currentUrl && (
            <CardDescription className="font-mono truncate">
              Currently scanning: {liveStatus.currentUrl}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm font-medium">
            <span>{scannedUrls} of {totalUrls} URLs scanned</span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </CardContent>
      </Card>

      {/* Completed page results */}
      {!isRunning && scan.pages && scan.pages.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">Page Results</h2>

          <Accordion type="multiple" className="space-y-4">
            {scan.pages.map((page) => {
              const pageIssues = page.issues || [];
              return (
                <AccordionItem
                  key={page.id}
                  value={`page-${page.id}`}
                  className="border bg-card rounded-lg px-4 shadow-sm"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {page.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        ) : page.status === "failed" ? (
                          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                        ) : (
                          <Clock className="w-5 h-5 text-yellow-500 shrink-0" />
                        )}
                        <span
                          className="font-mono text-sm truncate max-w-lg"
                          title={page.url}
                        >
                          {page.url}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {page.status === "failed" && (
                          <Badge variant="destructive" className="ml-auto">Failed</Badge>
                        )}
                        {page.issueCount > 0 && (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono">
                              {page.issueCount} total
                            </Badge>
                            {page.criticalCount > 0 && (
                              <Badge
                                variant="default"
                                className="bg-[#E11D48] hover:bg-[#E11D48] font-mono"
                              >
                                {page.criticalCount} critical
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    {page.errorMessage && (
                      <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md mb-4 border border-destructive/20">
                        {page.errorMessage.includes("Cloudflare") ||
                        page.errorMessage.includes("Bot Protection") ? (
                          <div className="flex items-start gap-2">
                            <span className="text-lg shrink-0">🛡️</span>
                            <div>
                              <p className="font-semibold mb-1">
                                Cloudflare Bot Protection blocked this page
                              </p>
                              <p className="text-xs opacity-80">
                                This website uses Cloudflare's bot detection and did not allow
                                the scanner through.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono">Error: {page.errorMessage}</span>
                        )}
                      </div>
                    )}

                    {pageIssues.length > 0 ? (
                      <div className="space-y-3">
                        <IssueFilterBar
                          issues={pageIssues}
                          filters={filters}
                          onChange={setFilters}
                        />
                        <IssueGroupList issues={pageIssues} filters={filters} />
                      </div>
                    ) : page.status === "completed" ? (
                      <div className="p-8 text-center text-muted-foreground border rounded-md mt-4 border-dashed bg-muted/10">
                        <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                        No accessibility issues found on this page.
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {/* Cross-page filter summary when filters are active */}
          {(filters.search || filters.ruleId !== "all" || filters.severity !== "all" || filters.wcag !== "all") && allIssues.length > 0 && (
            <div className="text-sm text-muted-foreground text-center">
              Filters applied across all pages. &nbsp;
              <button
                className="text-primary underline underline-offset-2"
                onClick={() => setFilters({ search: "", ruleId: "all", severity: "all", wcag: "all" })}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Live running state view */}
      {isRunning && liveStatus?.pages && liveStatus.pages.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Live Progress</h3>
          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">URL</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {liveStatus.pages.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td
                        className="p-3 font-mono text-xs truncate max-w-[300px]"
                        title={p.url}
                      >
                        {p.url}
                      </td>
                      <td className="p-3">
                        {p.status === "scanning" ? (
                          <span className="flex items-center text-primary">
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" /> Scanning
                          </span>
                        ) : p.status === "completed" ? (
                          <span className="flex items-center text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-2" /> Done
                          </span>
                        ) : p.status === "failed" ? (
                          <span className="flex items-center text-red-600">
                            <XCircle className="w-3 h-3 mr-2" /> Failed
                          </span>
                        ) : (
                          <span className="flex items-center text-muted-foreground">
                            <Clock className="w-3 h-3 mr-2" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {p.issueCount > 0 ? (
                          <span className="font-mono">{p.issueCount}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
