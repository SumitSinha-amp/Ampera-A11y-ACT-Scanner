import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus, Globe, MoreHorizontal, Trash2, Pause, Play, XCircle,
  Eye, LinkIcon, Search, ScanLine, Clock, Timer, Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { useSite } from "@/contexts/site";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CrawlerSession {
  id: number;
  name: string;
  seedUrl: string;
  siteId: number | null;
  status: string;
  totalDiscovered: number;
  totalScanned: number;
  totalFailed: number;
  totalSkipped: number;
  totalIssues: number;
  brokenLinksCount: number;
  scanSessionId: number | null;
  createdAt: string;
  startedAt: string | null;
  discoveredAt: string | null;
  scanStartedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  errorMessage: string | null;
}

interface Site { id: number; name: string; baseUrl: string; }

const ACTIVE_STATUSES = new Set(["pending", "discovering", "scanning", "crawled", "running"]);

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    discovering: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    crawled:     "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    scanning:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    paused:      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    completed:   "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    failed:      "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    cancelled:   "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return map[status] ?? map["pending"];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending:     "Pending",
    discovering: "Phase 1 — Discovering",
    crawled:     "Crawl Complete",
    scanning:    "Phase 2 — Scanning",
    paused:      "Paused",
    completed:   "Completed",
    failed:      "Failed",
    cancelled:   "Cancelled",
  };
  return labels[status] ?? status;
}

function isActiveStatus(status: string) {
  return ACTIVE_STATUSES.has(status) || status === "paused";
}

function progressPct(s: CrawlerSession): number {
  if (s.totalDiscovered === 0) return 0;
  return Math.round(((s.totalScanned + s.totalFailed + s.totalSkipped) / s.totalDiscovered) * 100);
}

function queueMs(s: CrawlerSession): number | null {
  if (!s.startedAt || !s.createdAt) return null;
  const v = new Date(s.startedAt).getTime() - new Date(s.createdAt).getTime();
  return v >= 0 ? v : null;
}

function crawlMs(s: CrawlerSession): number | null {
  if (!s.startedAt || !s.discoveredAt) return null;
  const v = new Date(s.discoveredAt).getTime() - new Date(s.startedAt).getTime();
  return v >= 0 ? v : null;
}

function processMs(s: CrawlerSession): number | null {
  const start = s.scanStartedAt ?? s.discoveredAt;
  if (!start || !s.completedAt) return null;
  const v = new Date(s.completedAt).getTime() - new Date(start).getTime();
  return v >= 0 ? v : null;
}

function totalMs(s: CrawlerSession): number | null {
  if (!s.startedAt || !s.completedAt) return null;
  const v = new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
  return v >= 0 ? v : null;
}

function fmtDuration(ms: number | null, compact = false): string {
  if (ms === null || ms < 0) return "Not available";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return compact ? `${seconds}s` : `${seconds} second${seconds !== 1 ? "s" : ""}`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) {
    return compact
      ? `${minutes}m ${secs}s`
      : `${minutes} minute${minutes !== 1 ? "s" : ""} ${secs} second${secs !== 1 ? "s" : ""}`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) {
    return compact
      ? `${hours}h ${mins}m`
      : `${hours} hour${hours !== 1 ? "s" : ""} ${mins} minute${mins !== 1 ? "s" : ""}`;
  }
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return compact
    ? `${days}d ${hrs}h`
    : `${days} day${days !== 1 ? "s" : ""} ${hrs} hour${hrs !== 1 ? "s" : ""}`;
}

function fmtDateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function msToHours(ms: number | null): number {
  if (ms === null) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}

function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}

function calcPhase2ElapsedMs(s: CrawlerSession, nowMs: number): number | null {
  if (s.status !== "scanning") return null;
  const ref = s.scanStartedAt ?? s.discoveredAt ?? s.startedAt;
  if (!ref) return null;
  return Math.max(0, nowMs - new Date(ref).getTime());
}

function calcEtaMs(s: CrawlerSession, nowMs: number): number | null {
  const pct = progressPct(s);
  if (pct <= 0 || pct >= 100 || s.status !== "scanning") return null;
  const start = s.scanStartedAt ?? s.discoveredAt ?? s.startedAt;
  if (!start) return null;
  const elapsed = nowMs - new Date(start).getTime();
  if (elapsed <= 0) return null;
  return (elapsed / pct) * (100 - pct);
}

function calcCrawlElapsedMs(s: CrawlerSession, nowMs: number): number | null {
  if (s.status !== "discovering") return null;
  if (!s.startedAt) return null;
  return Math.max(0, nowMs - new Date(s.startedAt).getTime());
}

function calcTotalElapsedMs(s: CrawlerSession, nowMs: number): number | null {
  if (!s.startedAt) return null;
  return Math.max(0, nowMs - new Date(s.startedAt).getTime());
}

const CHART_COLORS = {
  queue:   "#1e3a5f",
  crawl:   "#2563eb",
  process: "#0d9488",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = (payload[0]?.value ?? 0) + (payload[1]?.value ?? 0) + (payload[2]?.value ?? 0);
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm space-y-1 min-w-40">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
          </span>
          <span className="font-medium">{fmtDuration(p.value * 3600000, true)}</span>
        </div>
      ))}
      <div className="border-t pt-1 mt-1 flex justify-between">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold">{fmtDuration(total * 3600000, true)}</span>
      </div>
    </div>
  );
};

export default function CrawlerListPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeSite } = useSite();

  const selectedSiteId = activeSite ? String(activeSite.id) : "all";

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["crawler-sessions", selectedSiteId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedSiteId !== "all") params.set("siteId", selectedSiteId);
      const res = await fetch(`${BASE}/api/crawler/sessions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<{ sessions: CrawlerSession[]; total: number }>;
    },
    refetchInterval: 5000,
  });

  const sessions = data?.sessions ?? [];
  const hasActive = sessions.some((s) => isActiveStatus(s.status) && s.status !== "paused" && s.status !== "crawled");
  const now = useNow(hasActive);

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === "completed" || s.status === "failed" || s.status === "cancelled"),
    [sessions],
  );

  const chartData = useMemo(() => {
    return [...completedSessions].reverse().slice(-20).map((s) => ({
      date: new Date(s.createdAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
      "Queue time": msToHours(queueMs(s)),
      "Crawl time": msToHours(crawlMs(s)),
      "Processing time": msToHours(processMs(s)),
    }));
  }, [completedSessions]);

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${id}/pause`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crawler-sessions", selectedSiteId] }); },
    onError: () => { toast({ title: "Failed to pause", variant: "destructive" }); },
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${id}/resume`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { toast({ title: "Crawler resumed" }); qc.invalidateQueries({ queryKey: ["crawler-sessions", selectedSiteId] }); },
    onError: () => { toast({ title: "Failed to resume", variant: "destructive" }); },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${id}/cancel`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crawler-sessions", selectedSiteId] }); },
    onError: () => { toast({ title: "Failed to cancel", variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { toast({ title: "Crawler deleted" }); qc.invalidateQueries({ queryKey: ["crawler-sessions", selectedSiteId] }); },
    onError: () => { toast({ title: "Failed to delete", variant: "destructive" }); },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Crawler Scan History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeSite
              ? `Showing history for ${activeSite.name}`
              : "View crawl timing and history per site."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/crawler/new">
              <Plus className="w-4 h-4 mr-2" />
              New Crawler
            </Link>
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm">Loading crawler sessions…</div>
      )}

      {!isLoading && sessions.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Globe className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No crawler sessions yet.</p>
            <Button asChild variant="outline">
              <Link href="/crawler/new">Start your first crawl</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {sessions.length > 0 && (
        <div className="space-y-4">
          {/* Bar chart — completed scans only */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Scan Time Breakdown</CardTitle>
                <p className="text-xs text-muted-foreground">Last {chartData.length} completed scans — Y axis in hours</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v === 0 ? "0" : v < 1 ? `${Math.round(v * 60)}m` : `${v}h`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="square" iconSize={10} />
                    <Bar dataKey="Queue time"      stackId="a" fill={CHART_COLORS.queue}   radius={0} />
                    <Bar dataKey="Crawl time"      stackId="a" fill={CHART_COLORS.crawl}   radius={0} />
                    <Bar dataKey="Processing time" stackId="a" fill={CHART_COLORS.process} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Unified history table — all sessions (active + completed) */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Scan date</TableHead>
                    <TableHead>Queue time</TableHead>
                    <TableHead>Crawl time</TableHead>
                    <TableHead>Processing time</TableHead>
                    <TableHead>Total scan time</TableHead>
                    <TableHead className="text-right">Pages crawled</TableHead>
                    <TableHead className="text-right">Issues found</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => {
                    const active = isActiveStatus(s.status);
                    const isDiscovering = s.status === "discovering";
                    const isScanning = s.status === "scanning";
                    const isPaused = s.status === "paused";
                    const isCrawled = s.status === "crawled";
                    const pct = progressPct(s);

                    const qMs = queueMs(s);
                    const cMs = crawlMs(s);
                    const pMs = processMs(s);
                    const tMs = totalMs(s);

                    // Live values for active rows
                    const crawlElapsed = isDiscovering ? calcCrawlElapsedMs(s, now) : null;
                    const phase2Elapsed = calcPhase2ElapsedMs(s, now);
                    const etaMs = calcEtaMs(s, now);
                    const totalElapsed = (active && !s.completedAt) ? calcTotalElapsedMs(s, now) : null;

                    return (
                      <TableRow
                        key={s.id}
                        className={`align-top ${active ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}`}
                      >
                        {/* Scan date + status */}
                        <TableCell className="py-3 font-medium text-sm">
                          <Link href={`/crawler/${s.id}`} className="hover:underline text-foreground">
                            {new Date(s.createdAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                          </Link>
                          <Badge className={`block w-fit mt-1 text-[10px] px-1.5 ${statusBadge(s.status)}`}>
                            {statusLabel(s.status)}
                          </Badge>
                          {/* Mini phase indicator for active */}
                          {(isDiscovering || isScanning) && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px]">
                              <span className={`flex items-center gap-0.5 ${isDiscovering ? "text-purple-600 dark:text-purple-400 font-semibold" : "text-muted-foreground line-through"}`}>
                                <Search className="w-2.5 h-2.5" />Ph1
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className={`flex items-center gap-0.5 ${isScanning ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-muted-foreground"}`}>
                                <ScanLine className="w-2.5 h-2.5" />Ph2
                              </span>
                            </div>
                          )}
                        </TableCell>

                        {/* Queue time */}
                        <TableCell className="py-3 text-sm">
                          {qMs !== null ? (
                            <>
                              <p className="font-medium">{fmtDuration(qMs)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Started: {fmtDateTime(s.startedAt)}</p>
                              <p className="text-xs text-muted-foreground">Finished: {fmtDateTime(s.startedAt)}</p>
                            </>
                          ) : s.status === "pending" ? (
                            <span className="text-xs text-muted-foreground italic">In queue…</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not available</span>
                          )}
                        </TableCell>

                        {/* Crawl time (Phase 1) */}
                        <TableCell className="py-3 text-sm">
                          {isDiscovering && crawlElapsed !== null ? (
                            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium text-xs">
                              <Clock className="w-3 h-3" />{fmtDuration(crawlElapsed, true)} elapsed · {s.totalDiscovered} URLs found
                            </span>
                          ) : cMs !== null ? (
                            <>
                              <p className="font-medium">{fmtDuration(cMs)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Started: {fmtDateTime(s.startedAt)}</p>
                              <p className="text-xs text-muted-foreground">Finished: {fmtDateTime(s.discoveredAt)}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not available</span>
                          )}
                        </TableCell>

                        {/* Processing time (Phase 2) */}
                        <TableCell className="py-3 text-sm">
                          {isScanning ? (
                            <div className="space-y-1">
                              {phase2Elapsed !== null && (
                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs">
                                  <Clock className="w-3 h-3" />{fmtDuration(phase2Elapsed, true)} elapsed
                                </span>
                              )}
                              {etaMs !== null && (
                                <span className="flex items-center gap-1 text-blue-500 dark:text-blue-300 text-xs">
                                  <Timer className="w-3 h-3" />ETA {fmtDuration(etaMs, true)}
                                </span>
                              )}
                            </div>
                          ) : pMs !== null ? (
                            <>
                              <p className="font-medium">{fmtDuration(pMs)}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Started: {fmtDateTime(s.scanStartedAt ?? s.discoveredAt)}
                              </p>
                              <p className="text-xs text-muted-foreground">Finished: {fmtDateTime(s.completedAt)}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not available</span>
                          )}
                        </TableCell>

                        {/* Total scan time */}
                        <TableCell className="py-3 text-sm font-medium">
                          {totalElapsed !== null ? (
                            <span className="flex items-center gap-1 text-foreground text-xs">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              {fmtDuration(totalElapsed, true)}
                            </span>
                          ) : tMs !== null ? (
                            fmtDuration(tMs)
                          ) : (
                            <span className="text-muted-foreground text-xs">Not available</span>
                          )}
                        </TableCell>

                        {/* Pages crawled */}
                        <TableCell className="py-3 text-right text-sm">
                          {isScanning || isCrawled ? (
                            <>
                              <span className="font-semibold">{s.totalScanned.toLocaleString()}</span>
                              {s.totalDiscovered > 0 && (
                                <p className="text-xs font-normal text-muted-foreground">
                                  of {s.totalDiscovered.toLocaleString()}
                                </p>
                              )}
                              {isScanning && s.totalDiscovered > 0 && (
                                <div className="mt-1 w-full max-w-20 ml-auto">
                                  <Progress value={pct} className="h-1" />
                                  <p className="text-[10px] text-muted-foreground text-right mt-0.5">{pct}%</p>
                                </div>
                              )}
                            </>
                          ) : isDiscovering ? (
                            <>
                              <span className="font-semibold">{s.totalDiscovered.toLocaleString()}</span>
                              <p className="text-xs text-muted-foreground">found</p>
                            </>
                          ) : (
                            <>
                              <span className="font-semibold">{s.totalScanned.toLocaleString()}</span>
                              {s.totalDiscovered > 0 && s.totalDiscovered !== s.totalScanned && (
                                <p className="text-xs font-normal text-muted-foreground">
                                  of {s.totalDiscovered.toLocaleString()}
                                </p>
                              )}
                            </>
                          )}
                        </TableCell>

                        {/* Issues found */}
                        <TableCell className="py-3 text-right text-sm">
                          {s.totalIssues > 0
                            ? <span className="font-semibold text-orange-600 dark:text-orange-400">{s.totalIssues.toLocaleString()}</span>
                            : <span className="text-muted-foreground">—</span>}
                          {s.brokenLinksCount > 0 && (
                            <p className="text-xs text-red-500 flex items-center justify-end gap-0.5 mt-0.5">
                              <LinkIcon className="w-3 h-3" />{s.brokenLinksCount}
                            </p>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/crawler/${s.id}`} className="flex items-center gap-2 cursor-pointer">
                                  <Eye className="w-4 h-4" /> View Details
                                </Link>
                              </DropdownMenuItem>
                              {s.scanSessionId && (
                                <DropdownMenuItem asChild>
                                  <Link href={`/scans/${s.scanSessionId}`} className="flex items-center gap-2 cursor-pointer">
                                    <Eye className="w-4 h-4" /> View Scan Results
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              {(isDiscovering || isScanning) && (
                                <DropdownMenuItem onClick={() => pauseMutation.mutate(s.id)} className="gap-2">
                                  <Pause className="w-4 h-4" /> Pause
                                </DropdownMenuItem>
                              )}
                              {isPaused && (
                                <DropdownMenuItem onClick={() => resumeMutation.mutate(s.id)} className="gap-2">
                                  <Play className="w-4 h-4" /> Resume
                                </DropdownMenuItem>
                              )}
                              {(active && !isPaused) || isPaused ? (
                                <DropdownMenuItem onClick={() => cancelMutation.mutate(s.id)} className="gap-2 text-orange-600">
                                  <XCircle className="w-4 h-4" /> Cancel
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem onClick={() => setDeleteId(s.id)} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="w-4 h-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete crawler session?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the crawler session, all discovered pages, broken link data, and linked accessibility results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId !== null) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
