import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, AreaChart, Area, Line, Cell, LabelList,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
  Plus, Globe, MoreHorizontal, Trash2, Pause, Play, XCircle,
  Eye, Search, ScanLine, Clock, CalendarDays, ExternalLink,
  Sparkles, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { useSite } from "@/contexts/site";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CrawlerSession {
  id: number;
  userId: string | null;
  triggeredBy?: {
    id: number;
    fullName: string;
    username: string;
    role: string;
  } | null;
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
  config?: Record<string, unknown>;
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

const STATUS_VIEW: Record<string, { label: string; dot: string; text: string; bg: string; phase?: string }> = {
  discovering: { label: "Crawling", dot: "bg-[#43a047]", text: "text-[#2e7d32]", bg: "bg-[#e8f5e9]", phase: "Phase 1 — Crawling" },
  scanning: { label: "Scanning", dot: "bg-[#5c6bc0]", text: "text-[#3949ab]", bg: "bg-[#e8eaf6]", phase: "Phase 2 — Scanning" },
  crawled: { label: "Ready to Scan", dot: "bg-[#ffb300]", text: "text-[#f57f17]", bg: "bg-[#fff8e1]" },
  completed: { label: "Completed", dot: "bg-[#2196f3]", text: "text-[#1565c0]", bg: "bg-[#e3f0fb]" },
  failed: { label: "Failed", dot: "bg-[#e53935]", text: "text-[#c62828]", bg: "bg-[#fce4ec]" },
  paused: { label: "Paused", dot: "bg-[#9e9e9e]", text: "text-[#555555]", bg: "bg-[#fafafa]" },
  cancelled: { label: "Cancelled", dot: "bg-[#9c27b0]", text: "text-[#6a1b9a]", bg: "bg-[#f3e5f5]" },
  pending: { label: "Queued", dot: "bg-[#7986cb]", text: "text-[#3949ab]", bg: "bg-[#e8eaf6]" },
};

function StatusPill({ status }: { status: string }) {
  const view = STATUS_VIEW[status] ?? STATUS_VIEW.pending;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${view.bg} ${view.text}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${view.dot} ${isActiveStatus(status) ? "animate-pulse" : ""}`} />
        {view.label}
      </span>
      {view.phase && <span className={`pl-1 text-[10px] font-medium ${view.text}`}>{view.phase}</span>}
    </span>
  );
}

function PhaseStrip({ session }: { session: CrawlerSession }) {
  const crawlComplete = ["crawled", "scanning", "completed"].includes(session.status);
  const scanComplete = session.status === "completed";
  const crawlProgress = session.status === "discovering"
    ? Math.min(100, Math.max(10, Math.round((session.totalDiscovered / Math.max(session.totalDiscovered, 140)) * 100)))
    : session.status === "pending" ? 0 : 100;
  const scanProgress = scanComplete
    ? 100
    : session.status === "scanning"
      ? Math.min(100, Math.max(5, progressPct(session)))
      : 0;
  return (
    <div className="min-w-[145px] space-y-1">
      <div className="flex gap-1.5">
        {[
          ["CRAWL", crawlProgress, crawlComplete ? "bg-secondary" : "bg-amber-500", crawlComplete ? "text-secondary" : "text-amber-600"],
          ["SCAN", scanProgress, scanComplete || session.status === "scanning" ? "bg-violet-500" : "bg-muted-foreground/20", scanComplete || session.status === "scanning" ? "text-violet-600" : "text-muted-foreground"],
        ].map(([label, value, bar, text]) => (
          <div key={label} className="min-w-0 flex-1">
            <div className={`mb-1 text-[9px] font-bold tracking-wide ${text}`}>{label}</div>
            <div className="h-1 rounded-full bg-muted">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#9eadca]">
        {session.totalDiscovered > 0 ? `${session.totalDiscovered.toLocaleString()} discovered` : "—"}
        {session.totalScanned > 0 ? ` · ${session.totalScanned.toLocaleString()} scanned` : ""}
      </p>
    </div>
  );
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

function calcCrawlElapsedMs(s: CrawlerSession, nowMs: number): number | null {
  if (s.status !== "discovering") return null;
  if (!s.startedAt) return null;
  return Math.max(0, nowMs - new Date(s.startedAt).getTime());
}

function calcTotalElapsedMs(s: CrawlerSession, nowMs: number): number | null {
  if (!s.startedAt) return null;
  return Math.max(0, nowMs - new Date(s.startedAt).getTime());
}

export default function CrawlerListPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeSite } = useSite();

  const selectedSiteId = activeSite ? String(activeSite.id) : "all";
  const canDeleteCrawl = user?.permissions?.canDeleteCrawl ?? false;

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const allSessions = data?.sessions ?? [];
  const sessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allSessions.filter((session) => {
      const matchesStatus = statusFilter === "all" || session.status === statusFilter;
      const matchesSearch =
        !query ||
        session.name.toLowerCase().includes(query) ||
        session.seedUrl.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [allSessions, search, statusFilter]);
  const totalHistoryPages = Math.max(1, Math.ceil(sessions.length / historyPageSize));
  const visibleHistoryPage = Math.min(historyPage, totalHistoryPages);
  const visibleSessions = sessions.slice(
    (visibleHistoryPage - 1) * historyPageSize,
    visibleHistoryPage * historyPageSize,
  );
  const hasActive = sessions.some((s) => isActiveStatus(s.status) && s.status !== "paused" && s.status !== "crawled");
  const now = useNow(hasActive);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedSiteId, historyPageSize, search, statusFilter]);

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
  }, [historyPage, totalHistoryPages]);

  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === "completed" || s.status === "failed" || s.status === "cancelled"),
    [sessions],
  );

  const pagesChartData = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.totalDiscovered > 0)
        .slice(0, 6)
        .reverse()
        .map((s) => ({
          name: s.name.length > 14 ? `${s.name.slice(0, 14)}…` : s.name,
          Discovered: s.totalDiscovered,
          Scanned: s.totalScanned,
          Failed: s.totalFailed,
        })),
    [sessions],
  );

  const issuesTrendData = useMemo(
    () =>
      [...completedSessions]
        .slice(0, 8)
        .reverse()
        .map((s) => ({
          date: new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          Issues: s.totalIssues,
        })),
    [completedSessions],
  );

  const brokenLinksData = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.brokenLinksCount > 0)
        .sort((a, b) => b.brokenLinksCount - a.brokenLinksCount)
        .slice(0, 3),
    [sessions],
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm space-y-1 min-w-40">
        <p className="font-semibold text-foreground mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.fill }} />
              <span className="text-muted-foreground">{p.name}</span>
            </span>
            <span className="font-medium">{Number(p.value ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  };

  const DiscoveredValueLabel = ({ x, y, width, value }: any) => {
    if (!value || Number(value) <= 0) return null;
    return (
      <text
        x={Number(x) + Number(width) / 2}
        y={Math.max(14, Number(y) - 8)}
        textAnchor="middle"
        fill="#198f88"
        fontSize={12}
        fontWeight={700}
      >
        {Number(value).toLocaleString()}
      </text>
    );
  };

  const latestIssues = issuesTrendData[issuesTrendData.length - 1]?.Issues ?? 0;
  const previousIssues = issuesTrendData[issuesTrendData.length - 2]?.Issues ?? 0;
  const issuesDelta = previousIssues > 0
    ? Math.round(((latestIssues - previousIssues) / previousIssues) * 100)
    : null;

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

  const startScanMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${id}/start-scan`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "Accessibility scan started", description: "Phase 2 is now running." });
      qc.invalidateQueries({ queryKey: ["crawler-sessions", selectedSiteId] });
    },
    onError: () => { toast({ title: "Failed to start scan", variant: "destructive" }); },
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
    <div className="vision-page vision-crawler-history relative min-h-full space-y-5 bg-[#f5f6fb] p-1 font-['Inter',sans-serif]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-secondary" aria-hidden="true" />
            <h1 className="text-[22px] font-bold tracking-tight text-[#172b4d]">Crawler Scan History</h1>
          </div>
          <p className="text-[13px] text-[#7b8aaa]">
            Showing {sessions.length} of {allSessions.length} crawl sessions ·{" "}
            {sessions.filter((s) => isActiveStatus(s.status) && s.status !== "paused").length} active
          </p>
        </div>
        {user?.permissions.canCreateCrawl && (
          <div className="flex items-center gap-3">
            <Button variant="outline" className="text-[13px]" asChild>
              <Link href="/crawler">Manage crawlers</Link>
            </Button>
            <Button className="text-[13px]" asChild>
              <Link href="/crawler/new">
                <Plus className="w-4 h-4 mr-2" />
                New Crawler
              </Link>
            </Button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-card/60" />)}
        </div>
      )}

      {!isLoading && allSessions.length === 0 && (
        <Card className="rounded-2xl border-white/80 bg-card/70 shadow-[0_10px_30px_rgba(69,57,112,.06)] backdrop-blur-xl">
          <CardContent className="py-16 text-center space-y-3">
            <Globe className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No crawler sessions yet.</p>
            {user?.permissions.canCreateCrawl && (
              <Button asChild variant="outline">
                <Link href="/crawler/new">Start your first crawl</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {allSessions.length > 0 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
            {[
              ["Total Crawlers", sessions.length.toLocaleString(), "text-[#172b4d]", "🕷️"],
              ["Active", sessions.filter((s) => isActiveStatus(s.status) && s.status !== "paused").length.toLocaleString(), "text-[#198f88]", "⚡"],
              ["Ready to Scan", sessions.filter((s) => s.status === "crawled").length.toLocaleString(), "text-[#f57f17]", "⌛"],
              ["Pages Scanned", sessions.reduce((sum, s) => sum + s.totalScanned, 0).toLocaleString(), "text-[#6d48c7]", "📄"],
              ["Broken Links", sessions.reduce((sum, s) => sum + s.brokenLinksCount, 0).toLocaleString(), "text-[#e84a3d]", "🔗"],
            ].map(([label, value, color, icon]) => (
              <div key={String(label)} className="flex min-w-0 items-center gap-2.5 rounded-[14px] border border-white/70 bg-white/75 px-3.5 py-3 shadow-[0_2px_10px_rgba(0,0,0,.06)] backdrop-blur-xl">
                <span className={`shrink-0 text-xl leading-none ${color}`} aria-hidden="true">{icon}</span>
                <div className="min-w-0">
                  <p className={`text-[20px] font-bold leading-none ${color}`}>{value}</p>
                  <p className="mt-1 truncate text-[11px] text-[#7b8aaa]">{label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="rounded-[18px] border-white/70 bg-white/80 shadow-[0_2px_12px_rgba(0,0,0,.06)] backdrop-blur-xl">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-[13px] font-bold text-[#172b4d]">Pages Discovered vs Scanned</CardTitle>
                    <p className="mt-0.5 text-[11px] text-[#9eadca]">Per crawler · completed sessions</p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-[#7b8aaa]">
                    {[
                      ["Discovered", "bg-secondary"],
                      ["Scanned", "bg-primary"],
                      ["Failed", "bg-destructive"],
                      ].map(([label, color]) => (
                      <span key={label} className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-[2px] ${color}`} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="h-[260px] pt-2">
                {pagesChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pagesChartData} margin={{ top: 22, right: 10, left: 8, bottom: 2 }} barGap={4} barCategoryGap="28%">
                      <CartesianGrid stroke="#f0f2f8" vertical={false} />
                      <XAxis
                        dataKey="name"
                        height={36}
                        tickMargin={9}
                        tick={{ fontSize: 11, fill: "#7b8aaa" }}
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                      />
                      <YAxis
                        width={38}
                        tickMargin={8}
                        tickCount={5}
                        domain={[0, "dataMax"]}
                        tick={{ fontSize: 11, fill: "#9eadca" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "#198f88", opacity: 0.05 }} />
                      <Bar dataKey="Discovered" stackId="discovered" barSize={28} radius={[3, 3, 0, 0]}>
                        {pagesChartData.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={entry.Scanned === 0 ? "#198f8855" : "#198f88"} />
                        ))}
                        <LabelList content={<DiscoveredValueLabel />} />
                      </Bar>
                      <Bar dataKey="Failed" stackId="discovered" barSize={28} fill="#e53935" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="Scanned" barSize={28} fill="#6d48c7" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No crawl totals available yet.</div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Card className="rounded-[18px] border-white/70 bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,.06)] backdrop-blur-xl">
                <CardHeader className="pb-1">
                  <CardTitle className="text-[13px] font-bold text-[#172b4d]">Issues found — trend</CardTitle>
                  <p className="text-[11px] text-[#9eadca]">Last 8 completed scans (all crawlers)</p>
                </CardHeader>
                <CardContent className="pt-1">
                  {issuesTrendData.length > 0 ? (
                    <>
                      <div className="mb-1 flex items-end justify-between gap-3">
                        <p className="text-[22px] font-extrabold leading-none text-[#e84a3d]">{latestIssues.toLocaleString()}</p>
                        {issuesDelta !== null && (
                          <p className={`pb-0.5 text-[11px] font-semibold ${issuesDelta <= 0 ? "text-[#198f88]" : "text-[#e84a3d]"}`}>
                            {issuesDelta <= 0 ? "▼" : "▲"} {Math.abs(issuesDelta)}% vs prior
                          </p>
                        )}
                      </div>
                      <div className="h-[94px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={issuesTrendData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                            <defs>
                              <linearGradient id="crawler-issues-gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#e84a3d" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="#e84a3d" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#9eadca" }} axisLine={false} tickLine={false} interval={0} />
                            <YAxis hide />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="Issues" stroke="none" fill="url(#crawler-issues-gradient)" />
                            <Line type="monotone" dataKey="Issues" stroke="#e84a3d" strokeWidth={2} dot={{ r: 2.5, fill: "#ffffff", stroke: "#e84a3d", strokeWidth: 1.5 }} activeDot={{ r: 4, fill: "#e84a3d", stroke: "#e84a3d" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No completed sessions yet.</div>
                  )}
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border-white/70 bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,.06)] backdrop-blur-xl">
                <CardHeader className="pb-1">
                  <CardTitle className="text-[13px] font-bold text-[#172b4d]">Broken links by crawler</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {brokenLinksData.length > 0 ? brokenLinksData.map((session) => {
                    const maxBroken = brokenLinksData[0].brokenLinksCount || 1;
                    return (
                      <div key={session.id}>
                        <div className="mb-1 flex justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-foreground">{session.name}</span>
                          <span className="font-semibold text-destructive">{session.brokenLinksCount}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-destructive/75" style={{ width: `${(session.brokenLinksCount / maxBroken) * 100}%` }} />
                        </div>
                      </div>
                    );
                  }) : <p className="text-xs text-muted-foreground">No broken links reported.</p>}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75 px-[18px] py-[14px] shadow-[0_2px_12px_rgba(0,0,0,.05)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-[1_1_220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9eadca]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search crawlers…"
                  aria-label="Search crawlers"
                  className="h-9 rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] pl-8 text-[13px] text-[#172b4d] shadow-none placeholder:text-[#9eadca]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Filter crawler status">
                {["all", "discovering", "scanning", "crawled", "completed", "paused", "failed", "cancelled"].map((status) => {
                  const selected = statusFilter === status;
                  const label = status === "all" ? "All" : (STATUS_VIEW[status]?.label ?? statusLabel(status));
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      aria-pressed={selected}
                      className={`rounded-full border px-3 py-[5px] text-[12px] font-semibold capitalize transition-colors ${
                        selected
                          ? "border-[#198f88] bg-[#198f88] text-white"
                          : "border-[#e0e4ef] bg-white text-[#667788] hover:border-[#198f88]/60 hover:text-[#172b4d]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Unified history table — all sessions (active + completed) */}
          <Card className="overflow-hidden rounded-[20px] border-0 bg-white/75 shadow-[0_2px_16px_rgba(0,0,0,.07)] backdrop-blur-xl">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[1375px] table-fixed text-[11px]">
                  <TableHeader>
                    <TableRow className="h-10 border-[#eef0f8] bg-[#f5f6fb]/90 hover:bg-[#f5f6fb]/90">
                      <TableHead className="w-[250px] px-[18px] text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Crawler / Site</TableHead>
                      <TableHead className="w-[150px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Status</TableHead>
                      <TableHead className="w-[220px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Phase progress</TableHead>
                      <TableHead className="w-[90px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Crawl time</TableHead>
                      <TableHead className="w-[90px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Scan time</TableHead>
                      <TableHead className="w-[115px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Processing time</TableHead>
                      <TableHead className="w-[80px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Discovered</TableHead>
                      <TableHead className="w-[80px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Scanned</TableHead>
                      <TableHead className="w-[70px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Issues</TableHead>
                      <TableHead className="w-[120px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Schedule</TableHead>
                      <TableHead className="w-[110px] px-2 text-[11px] font-bold uppercase tracking-[0.04em] text-[#7b8aaa]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                          No crawler sessions match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : visibleSessions.map((s) => {
                      const active = isActiveStatus(s.status);
                      const isPaused = s.status === "paused";
                      const isCrawlOnly = s.config?.crawlOnly === true;
                      const schedule = typeof s.config?.schedule === "string" ? s.config.schedule : "Manual";
                      const scheduled = schedule !== "Manual";
                      const crawlElapsed = calcCrawlElapsedMs(s, now);
                      const scanElapsed = calcPhase2ElapsedMs(s, now);
                      const totalElapsed = calcTotalElapsedMs(s, now);
                      const crawlDuration = !isCrawlOnly ? (crawlElapsed ?? crawlMs(s)) : null;
                      const scanDuration = !isCrawlOnly ? (scanElapsed ?? processMs(s)) : null;
                      const processingDuration = !isCrawlOnly ? (totalElapsed ?? totalMs(s)) : null;
                      return (
                        <TableRow key={s.id} className={`border-[#f0f2f8] align-middle hover:bg-[#198f88]/[0.03] ${active ? "bg-[#198f88]/[0.025]" : ""}`}>
                          <TableCell className="px-[18px] py-3.5">
                            <Link href={`/crawler/${s.id}`} className="block max-w-[240px] truncate text-[13px] font-semibold text-[#172b4d] hover:text-[#198f88] hover:underline">
                              {s.name || "Unnamed crawler"}
                            </Link>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-[#9eadca]">
                              <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="max-w-[230px] truncate">{s.seedUrl}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#9eadca]">
                              {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}
                            </p>
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            <StatusPill status={s.status} />
                            {!isCrawlOnly && (
                              <span className="mt-1 flex items-center gap-1 pl-1 text-[10px] font-medium text-[#198f88]">
                                <ScanLine className="h-2.5 w-2.5" aria-hidden="true" />
                                Crawl + Scan
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            <PhaseStrip session={s} />
                          </TableCell>
                          <TableCell className="px-2 py-3.5 text-[12px] font-semibold text-[#172b4d]">
                            {crawlDuration !== null ? fmtDuration(crawlDuration, true) : <span className="font-normal text-[#9eadca]">—</span>}
                          </TableCell>
                          <TableCell className="px-2 py-3.5 text-[12px] font-semibold text-[#172b4d]">
                            {scanDuration !== null ? fmtDuration(scanDuration, true) : <span className="font-normal text-[#9eadca]">—</span>}
                          </TableCell>
                          <TableCell className="px-2 py-3.5 text-[12px] font-semibold text-[#172b4d]">
                            {processingDuration !== null ? fmtDuration(processingDuration, true) : <span className="font-normal text-[#9eadca]">—</span>}
                          </TableCell>
                          <TableCell className="px-2 py-3.5 text-[13px] font-semibold text-[#172b4d]">
                            {s.totalDiscovered > 0 ? s.totalDiscovered.toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="px-2 py-3.5 text-[13px] text-[#172b4d]">
                            {s.totalScanned > 0 ? s.totalScanned.toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            {s.totalIssues > 0
                              ? <span className="text-[13px] font-bold text-[#e84a3d]">{s.totalIssues.toLocaleString()}</span>
                              : <span className="text-[#cccccc]">—</span>}
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#667788]">
                              {scheduled
                                ? <CalendarDays className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                                : <Clock className="h-3.5 w-3.5 text-[#9e9e9e]" aria-hidden="true" />}
                              {schedule}
                            </span>
                          </TableCell>
                          <TableCell className="px-2 py-3">
                            <div className="flex items-center gap-1">
                              {s.status === "crawled" && (
                                <Button
                                  variant="outline"
                                  className="h-7 rounded-lg border-secondary/50 bg-secondary/5 px-2 text-[10px] font-bold text-secondary hover:bg-secondary/10"
                                  onClick={() => startScanMutation.mutate(s.id)}
                                >
                                  Scan now
                                </Button>
                              )}
                              <Button asChild variant="outline" size="icon" className="h-7 w-7 rounded-lg border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300" aria-label={`View crawler ${s.name || `#${s.id}`}`}>
                                <Link href={`/crawler/${s.id}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                              </Button>
                              {(s.status === "discovering" || s.status === "scanning") && (
                                <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" onClick={() => pauseMutation.mutate(s.id)} aria-label={`Pause crawler ${s.name || `#${s.id}`}`}>
                                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-7 w-7 rounded-lg" aria-label={`More actions for crawler ${s.name || `#${s.id}`}`}>
                                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/crawler/${s.id}`} className="flex cursor-pointer items-center gap-2"><Eye className="h-4 w-4" /> View Details</Link>
                                  </DropdownMenuItem>
                                  {s.scanSessionId && (
                                    <DropdownMenuItem asChild>
                                      <Link href={`/scans/${s.scanSessionId}`} className="flex cursor-pointer items-center gap-2"><Eye className="h-4 w-4" /> View Scan Results</Link>
                                    </DropdownMenuItem>
                                  )}
                                  {isPaused && (
                                    <DropdownMenuItem onClick={() => resumeMutation.mutate(s.id)} className="gap-2"><Play className="h-4 w-4" /> Resume</DropdownMenuItem>
                                  )}
                                  {(active && !isPaused) || isPaused ? (
                                    <DropdownMenuItem onClick={() => cancelMutation.mutate(s.id)} className="gap-2 text-orange-600"><XCircle className="h-4 w-4" /> Cancel</DropdownMenuItem>
                                  ) : null}
                                  {canDeleteCrawl && (
                                    <DropdownMenuItem onClick={() => setDeleteId(s.id)} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="hidden">
              <Table className="min-w-[980px] text-[11px]">
                <TableHeader>
                  <TableRow className="h-11 bg-muted/45 hover:bg-muted/45">
                    <TableHead className="w-28 px-2 text-[10px] font-medium text-muted-foreground">Scan date</TableHead>
                    <TableHead className="w-28 px-2 text-[10px] font-medium text-muted-foreground">Triggered by</TableHead>
                    <TableHead className="w-32 px-2 text-[10px] font-medium text-muted-foreground">Queue time</TableHead>
                    <TableHead className="w-36 px-2 text-[10px] font-medium text-muted-foreground">Crawl time</TableHead>
                    <TableHead className="w-36 px-2 text-[10px] font-medium text-muted-foreground">Processing time</TableHead>
                    <TableHead className="w-28 px-2 text-[10px] font-medium text-muted-foreground">Total scan time</TableHead>
                    <TableHead className="w-20 px-2 text-right text-[10px] font-medium leading-tight text-muted-foreground">Pages crawled</TableHead>
                    <TableHead className="w-20 px-2 text-right text-[10px] font-medium leading-tight text-muted-foreground">Pages scanned</TableHead>
                    <TableHead className="w-24 px-2 text-[10px] font-medium text-muted-foreground">Mode</TableHead>
                    <TableHead className="w-9 px-1"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSessions.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                        No crawler sessions match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : visibleSessions.map((s) => {
                    const active = isActiveStatus(s.status);
                    const isDiscovering = s.status === "discovering";
                    const isScanning = s.status === "scanning";
                    const isPaused = s.status === "paused";
                    const isCrawlOnly = s.config?.crawlOnly === true;
                    const pct = progressPct(s);

                    const qMs = queueMs(s);
                    const cMs = crawlMs(s);
                    const pMs = processMs(s);
                    const tMs = totalMs(s);

                    // Live values for active rows
                    const crawlElapsed = isDiscovering ? calcCrawlElapsedMs(s, now) : null;
                    const phase2Elapsed = calcPhase2ElapsedMs(s, now);
                    const totalElapsed = (active && !s.completedAt) ? calcTotalElapsedMs(s, now) : null;

                    return (
                      <TableRow
                        key={s.id}
                          className={`align-top hover:bg-muted/30 ${active ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}`}
                      >
                        {/* Scan date + status */}
                        <TableCell className="px-2 py-3 font-medium text-[11px]">
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

                        {/* Triggered by */}
                        <TableCell className="px-2 py-3 text-[11px]">
                          {s.triggeredBy ? (
                            <>
                              <p className="font-medium">{s.triggeredBy.fullName}</p>
                              {s.triggeredBy.username && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  @{s.triggeredBy.username}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground text-xs">Unknown user</span>
                          )}
                        </TableCell>

                        {/* Queue time */}
                        <TableCell className="px-2 py-3 text-[11px]">
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
                        <TableCell className="px-2 py-3 text-[11px]">
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
                        <TableCell className="px-2 py-3 text-[11px]">
                          {isScanning ? (
                            <div className="space-y-1">
                              {phase2Elapsed !== null && (
                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs">
                                  <Clock className="w-3 h-3" />{fmtDuration(phase2Elapsed, true)} elapsed
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
                        <TableCell className="px-2 py-3 text-[11px] font-medium">
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
                        <TableCell className="px-2 py-3 text-right text-[11px]">
                          {isDiscovering ? (
                            <>
                              <span className="font-semibold">{s.totalDiscovered.toLocaleString()}</span>
                              <p className="text-xs text-muted-foreground">found</p>
                            </>
                          ) : (
                            <>
                              <span className="font-semibold">{s.totalDiscovered.toLocaleString()}</span>
                            </>
                          )}
                        </TableCell>

                        {/* Pages scanned */}
                        <TableCell className="px-2 py-3 text-right text-[11px]">
                          <span className="font-semibold">{s.totalScanned.toLocaleString()}</span>
                          {isScanning && s.totalDiscovered > 0 && (
                            <div className="mt-1 w-full max-w-20 ml-auto">
                              <Progress value={pct} className="h-1" />
                              <p className="text-[10px] text-muted-foreground text-right mt-0.5">{pct}%</p>
                            </div>
                          )}
                        </TableCell>

                        {/* Crawl mode */}
                        <TableCell className="px-2 py-3">
                          <Badge
                            variant={isCrawlOnly ? "default" : "outline"}
                            className={isCrawlOnly
                              ? "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300"
                              : "text-muted-foreground"}
                          >
                            {isCrawlOnly ? "Crawl Only" : "Crawl + Scan"}
                          </Badge>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="px-1 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Actions for crawler ${s.name || `#${s.id}`}`}
                              >
                                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
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
                              {canDeleteCrawl && (
                                <DropdownMenuItem onClick={() => setDeleteId(s.id)} className="gap-2 text-destructive focus:text-destructive">
                                  <Trash2 className="w-4 h-4" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              {sessions.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Showing {((visibleHistoryPage - 1) * historyPageSize) + 1}–{Math.min(visibleHistoryPage * historyPageSize, sessions.length)} of {sessions.length} scans
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Show pages</span>
                      <Select
                        value={String(historyPageSize)}
                        onValueChange={(value) => setHistoryPageSize(Number(value))}
                      >
                        <SelectTrigger className="h-8 w-[78px] text-xs" aria-label="Show pages">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[10, 25, 50, 100].map((size) => (
                            <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                        disabled={visibleHistoryPage === 1}
                        aria-label="Previous crawler history page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="min-w-[72px] text-center text-xs text-muted-foreground">
                        Page {visibleHistoryPage} of {totalHistoryPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                        disabled={visibleHistoryPage === totalHistoryPages}
                        aria-label="Next crawler history page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
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
