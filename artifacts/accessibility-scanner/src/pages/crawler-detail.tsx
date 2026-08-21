import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Globe,
  Loader2,
  Pause,
  Play,
  XCircle,
  ExternalLink,
  Upload,
  AlertTriangle,
  Link2,
  CheckCircle2,
  XIcon,
  Clock,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Search,
  ScanLine,
  LayoutGrid,
  Database,
  RefreshCw,
  Zap,
  Download,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { CrawlerLiveOverview } from "@/components/crawler-live-overview";

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
  status: string;
  config: Record<string, unknown>;
  crawlBoost?: boolean;
  scanSessionId: number | null;
  totalDiscovered: number;
  totalScanned: number;
  totalFailed: number;
  totalSkipped: number;
  totalIssues: number;
  totalRules: number;
  pagesWithIssues?: number;
  brokenLinksCount: number;
  createdAt: string;
  startedAt: string | null;
  discoveredAt: string | null;
  scanStartedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  scheduledStartAt: string | null;
  errorMessage: string | null;
  pendingPages?: number;
  scanningPages?: number;
  discoveredPages?: number;
}

interface CrawlerPage {
  id: number;
  url: string;
  status: string;
  depth: number;
  discoveredFrom: string | null;
  issueCount: number;
  ruleCount: number;
  httpStatus: number | null;
  pageType: string | null;
  errorMessage: string | null;
  scannedAt: string | null;
}

interface BrokenLink {
  id: number;
  sourceUrl: string;
  brokenUrl: string;
  httpStatus: number | null;
  errorType: string | null;
  anchorText: string | null;
  checkedAt: string;
}

interface PageTypeRow {
  page_type: string;
  count: number;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:     "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    starting:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    discovering: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    discovered:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    crawled:     "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    scanning:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    completed:   "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    failed:      "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    skipped:     "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
    paused:      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    cancelled:   "bg-gray-100 text-gray-500",
  };
  return map[status] ?? map["pending"];
}

function sessionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending:     "Queued",
    starting:    "Starting",
    discovering: "Phase 1 — Crawling",
    crawled:     "Crawl Complete — Ready to Scan",
    scanning:    "Phase 2 — Scanning",
    completed:   "Completed",
    failed:      "Failed",
    paused:      "Paused",
    cancelled:   "Cancelled",
  };
  return labels[status] ?? status;
}

function pageStatusLabel(status: string, isCrawlBoost = false) {
  if (isCrawlBoost) {
    if (status === "discovered") return "DOM Captured";
    if (status === "scanning")   return "Snapshot Captured";
  }
  const labels: Record<string, string> = {
    pending:    "Queued",
    discovered: "Discovered",
    scanning:   "Analysing",
    completed:  "Completed",
    failed:     "Failed",
    skipped:    "Unchanged",
    broken:     "Unreachable",
  };
  return labels[status] ?? status;
}

function pageStatusBadgeClass(status: string, isCrawlBoost = false) {
  if (isCrawlBoost && status === "discovered") return "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300";
  if (isCrawlBoost && status === "scanning")   return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return statusBadge(status);
}

// ── Page-level progress pipeline ─────────────────────────────────────────────

const DISC_BOOST_STEPS = [
  "Queued", "Loading Page", "Rendering Page", "Capturing DOM",
  "Capturing Snapshot", "Running Analysis", "Extracting Links", "Saving Results", "Completed",
];
const DISC_NORMAL_STEPS = [
  "Queued", "Loading Page", "Extracting Links", "Saving Results", "Completed",
];
const SCAN_STEPS_LIST = [
  "Queued for Scan", "Starting Scan", "Running Rules",
  "Processing Issues", "Saving Results", "Completed",
];

interface PageStepInfo {
  label: string;
  step: number;   // 0-indexed
  total: number;  // max index (steps.length - 1)
  color: string;
  isActive: boolean;
  phase: "discovery" | "scan" | "terminal";
}

function getPageStepInfo(
  pageStatus: string,
  sessionStatus: string,
  crawlBoost: boolean,
  now: number,
): PageStepInfo {
  if (pageStatus === "failed")
    return { label: "Failed", step: 0, total: 0, color: "#ef4444", isActive: false, phase: "terminal" };
  if (pageStatus === "broken")
    return { label: "Unreachable", step: 0, total: 0, color: "#f97316", isActive: false, phase: "terminal" };
  if (pageStatus === "skipped")
    return { label: "Unchanged", step: 0, total: 0, color: "#9ca3af", isActive: false, phase: "terminal" };

  // Determine phase: scan phase when the session or page is in scan territory
  const inScanPhase =
    pageStatus === "scanning" ||
    pageStatus === "completed" ||
    (pageStatus === "discovered" &&
      (sessionStatus === "scanning" || sessionStatus === "completed"));

  if (!inScanPhase) {
    const steps = crawlBoost ? DISC_BOOST_STEPS : DISC_NORMAL_STEPS;
    const maxStep = steps.length - 1;
    const step = pageStatus === "discovered" ? maxStep : 0;
    return {
      label: steps[step],
      step,
      total: maxStep,
      color: crawlBoost ? "#8b5cf6" : "#a855f7",
      isActive: false,
      phase: "discovery",
    };
  }

  // Scan phase
  const maxStep = SCAN_STEPS_LIST.length - 1;
  let step: number;
  let isActive = false;

  if (pageStatus === "discovered") {
    step = 0; // Queued for Scan
  } else if (pageStatus === "scanning") {
    // Cycle through steps 1–4 every 2 s so the label feels live
    step = (Math.floor(now / 2000) % 4) + 1;
    isActive = true;
  } else {
    step = maxStep; // completed
  }

  return {
    label: SCAN_STEPS_LIST[step],
    step,
    total: maxStep,
    color: step === maxStep ? "#22c55e" : "#3b82f6",
    isActive,
    phase: "scan",
  };
}

function PageStageIndicator({ info }: { info: PageStepInfo }) {
  const r = 8.5;
  const circ = 2 * Math.PI * r;

  if (info.phase === "terminal") {
    const pct = info.label === "Unchanged" ? 1 : 0;
    const filled = pct * circ;
    return (
      <div className="flex items-center gap-1.5">
        <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
          <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.5"
            stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
          <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.5"
            stroke={info.color} strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`}
            style={{ transform: "rotate(-90deg)", transformOrigin: "11px 11px" }} />
        </svg>
        <span className="text-xs font-medium" style={{ color: info.color }}>{info.label}</span>
      </div>
    );
  }

  const pct = info.total > 0 ? info.step / info.total : 0;
  const filled = pct * circ;

  return (
    <div className="flex items-center gap-1.5 min-w-[9rem]">
      <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
        {/* Track */}
        <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.5"
          stroke="currentColor" className="text-gray-200 dark:text-gray-700" />
        {/* Progress arc */}
        <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.5"
          stroke={info.color} strokeLinecap="round"
          strokeDasharray={`${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`}
          style={{ transform: "rotate(-90deg)", transformOrigin: "11px 11px", transition: "stroke-dasharray 0.4s ease" }} />
        {/* Spinning chaser for active scanning */}
        {info.isActive && (
          <circle cx="11" cy="11" r={r} fill="none" strokeWidth="2.5"
            stroke={info.color} strokeLinecap="round" strokeOpacity="0.55"
            strokeDasharray={`${(circ * 0.22).toFixed(2)} ${(circ * 0.78).toFixed(2)}`}
            className="animate-spin"
            style={{ animationDuration: "1.4s", transformOrigin: "11px 11px" }} />
        )}
      </svg>
      <div className="flex flex-col leading-tight min-w-0">
        <span className={`text-xs font-medium truncate${info.isActive ? " animate-pulse" : ""}`}
          style={{ color: info.color }}>
          {info.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {info.step + 1} / {info.total + 1}
        </span>
      </div>
    </div>
  );
}

function pageStatusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  if (status === "failed") return <XIcon className="w-3.5 h-3.5 text-red-500" />;
  if (status === "broken") return <XIcon className="w-3.5 h-3.5 text-orange-500" />;
  if (status === "scanning" || status === "discovering") return <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
  if (status === "discovered") return <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />;
  if (status === "skipped") return <SkipForward className="w-3.5 h-3.5 text-gray-400" />;
  return <Clock className="w-3.5 h-3.5 text-gray-300" />;
}

function progressPct(s: CrawlerSession): number {
  if (s.totalDiscovered === 0) return 0;
  return Math.round(((s.totalScanned + s.totalFailed + s.totalSkipped) / s.totalDiscovered) * 100);
}

function discoveryPct(s: CrawlerSession): number {
  if (s.totalDiscovered === 0) return 0;
  const disc = (s.discoveredPages ?? 0) + s.totalScanned + s.totalFailed + s.totalSkipped;
  return Math.min(100, Math.round((disc / s.totalDiscovered) * 100));
}

const ACTIVE_STATUSES = ["pending", "starting", "discovering", "scanning", "running"];

const PAGE_TYPE_COLORS: Record<string, string> = {
  "Home":              "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  "About":             "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  "Events":            "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  "News & Blog":       "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  "Products":          "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  "Contact":           "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  "Support":           "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  "Legal & Policy":    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  "Careers":           "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
  "Media & Resources": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  "Partners":          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  "Search":            "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  "Locations":         "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  "Investors":         "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  "General":           "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function pageTypeBadge(type: string | null) {
  const t = type ?? "General";
  return PAGE_TYPE_COLORS[t] ?? PAGE_TYPE_COLORS["General"];
}

function fmtDurationCompact(ms: number | null, includeSeconds = false): string {
  if (ms === null || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return includeSeconds ? `${hours}h ${mins}m ${secs}s` : `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return includeSeconds ? `${days}d ${hours % 24}h ${mins}m` : `${days}d ${hours % 24}h`;
}

export default function CrawlerDetailPage() {
  const { id } = useParams();
  const sessionId = parseInt(id as string, 10);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pagesPage, setPagesPage] = useState(1);
  const [pagesStatusFilter, setPagesStatusFilter] = useState("all");
  const [pagesPageTypeFilter, setPagesPageTypeFilter] = useState("all");
  const [pagesLocaleFilter, setPagesLocaleFilter] = useState("");
  const [pagesExtensionFilter, setPagesExtensionFilter] = useState("");
  const [brokenPage, setBrokenPage] = useState(1);
  const [activeTab, setActiveTab] = useState("pages");
  const [sseSession, setSseSession] = useState<CrawlerSession | null>(null);
  const [sseKey, setSseKey] = useState(0);
  // Track last known page progress so we only invalidate when something actually changed
  const lastPageProgressRef = useRef<number>(-1);

  // SSE for live progress — reconnects when sseKey increments (e.g. after starting scan)
  useEffect(() => {
    if (isNaN(sessionId)) return;
    lastPageProgressRef.current = -1;
    const es = new EventSource(`${BASE}/api/crawler/sessions/${sessionId}/progress`, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as CrawlerSession;
        setSseSession(data);
        // When page-level counts change (Phase 1 crawled a page / Phase 2 scanned one),
        // immediately refresh the pages table so status badges update in near-realtime
        // instead of waiting for the 3-second polling interval.
        const progress = (data.discoveredPages ?? 0) + data.totalScanned + data.totalFailed + data.totalSkipped;
        if (progress !== lastPageProgressRef.current) {
          lastPageProgressRef.current = progress;
          void qc.invalidateQueries({ queryKey: ["crawler-pages", sessionId] });
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      // Clear stale SSE snapshot so the REST polling data takes over immediately
      setSseSession(null);
      void qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] });
    };
    return () => es.close();
  }, [sessionId, sseKey]);

  const { data: session, isLoading } = useQuery({
    queryKey: ["crawler-session", sessionId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json() as Promise<CrawlerSession>;
    },
    enabled: !isNaN(sessionId),
    refetchInterval: 5000,
  });

  const [localeSearch, setLocaleSearch] = useState("");

  // Reset all page-list filters whenever the user navigates to a different
  // crawler session. Wouter keeps this component mounted across /crawler/:id
  // navigations, so without this the filters from session A bleed into session B.
  useEffect(() => {
    setPagesPage(1);
    setPagesStatusFilter("all");
    setPagesPageTypeFilter("all");
    setPagesLocaleFilter("");
    setPagesExtensionFilter("");
    setLocaleSearch("");
    setBrokenPage(1);
  }, [sessionId]);

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ["crawler-pages", sessionId, pagesPage, pagesStatusFilter, pagesLocaleFilter, pagesPageTypeFilter, pagesExtensionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(pagesPage), limit: "50" });
      if (pagesStatusFilter !== "all") params.set("status", pagesStatusFilter);
      if (pagesLocaleFilter) params.set("locale", pagesLocaleFilter);
      if (pagesPageTypeFilter !== "all") params.set("pageType", pagesPageTypeFilter);
      if (pagesExtensionFilter) params.set("extension", pagesExtensionFilter);
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/pages?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ pages: CrawlerPage[]; total: number; page: number }>;
    },
    enabled: !isNaN(sessionId),
    refetchInterval: 3000,
  });

  const { data: brokenData, isLoading: brokenLoading } = useQuery({
    queryKey: ["crawler-broken", sessionId, brokenPage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(brokenPage), limit: "50" });
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/broken-links?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ links: BrokenLink[]; total: number }>;
    },
    enabled: !isNaN(sessionId),
  });

  const { data: pageTypes } = useQuery({
    queryKey: ["crawler-page-types", sessionId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/page-types`, { credentials: "include" });
      if (!res.ok) return [] as PageTypeRow[];
      return res.json() as Promise<PageTypeRow[]>;
    },
    enabled: !isNaN(sessionId),
    refetchInterval: 8000,
  });

  // Unfiltered total — always reflects the true count of all pages regardless of active filters
  const { data: unfilteredTotal } = useQuery({
    queryKey: ["crawler-pages-total", sessionId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/pages?limit=1`, { credentials: "include" });
      if (!res.ok) return { total: 0 };
      return res.json() as Promise<{ total: number }>;
    },
    enabled: !isNaN(sessionId),
    refetchInterval: 3000,
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/pause`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] }); },
    onError: () => { toast({ title: "Failed to pause", variant: "destructive" }); },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/resume`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { toast({ title: "Crawler resumed" }); qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] }); },
    onError: () => { toast({ title: "Failed to resume", variant: "destructive" }); },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/cancel`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] }); },
    onError: () => { toast({ title: "Failed to cancel", variant: "destructive" }); },
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/retry-failed`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ reset: number; ok: boolean }>;
    },
    onSuccess: (data) => {
      toast({ title: `Retrying ${data.reset} failed page${data.reset !== 1 ? "s" : ""}` });
      setSseKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] });
      qc.invalidateQueries({ queryKey: ["crawler-pages", sessionId] });
    },
    onError: () => { toast({ title: "Failed to retry pages", variant: "destructive" }); },
  });

  const startScanMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/start-scan`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "Accessibility scan started", description: "Phase 2 is now running." });
      setSseKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] });
    },
    onError: () => { toast({ title: "Failed to start scan", variant: "destructive" }); },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/import-urls`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json() as Promise<{ added: number; total: number }>;
    },
    onSuccess: (data) => {
      toast({ title: `Imported ${data.added} URLs`, description: `${data.added} of ${data.total} valid URLs added.` });
      qc.invalidateQueries({ queryKey: ["crawler-pages", sessionId] });
      qc.invalidateQueries({ queryKey: ["crawler-session", sessionId] });
    },
    onError: () => { toast({ title: "Import failed", variant: "destructive" }); },
  });

  const displaySession = sseSession
    ? { ...sseSession, pagesWithIssues: session?.pagesWithIssues }
    : session;

  // Derived status flags — computed defensively so hooks below can use them before early returns
  const isActive = ACTIVE_STATUSES.includes(displaySession?.status ?? "");
  const isPending = displaySession?.status === "pending";
  const isDiscovering = displaySession?.status === "discovering";
  const isScanning = displaySession?.status === "scanning";
  const isTimingStopped = ["paused", "completed", "failed", "cancelled"].includes(displaySession?.status ?? "");
  const isDiscoveryStillRunning = Boolean(
    displaySession
    && !displaySession.discoveredAt
    && !isTimingStopped
    && (displaySession.startedAt ?? displaySession.createdAt),
  );
  const shouldTickClock = isActive || isDiscoveryStillRunning;

  // Live clock for elapsed time — continues until discovery is recorded as
  // complete, including transient crawler statuses emitted during discovery.
  // Must be declared BEFORE any early returns to satisfy rules of hooks
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!shouldTickClock) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [shouldTickClock]);

  if (isLoading && !sseSession) {
    return <div className="text-muted-foreground text-sm">Loading…</div>;
  }
  if (!displaySession) {
    return <div className="text-destructive">Crawler session not found.</div>;
  }

  const pct = progressPct(displaySession);
  const discPct = discoveryPct(displaySession);
  const isCrawlOnly = displaySession.config?.crawlOnly === true;
  // Crawl-only sessions do not have an accessibility phase until the user
  // explicitly starts it. scanSessionId/scanStartedAt are created at that point.
  // A scan session is allocated before discovery ends for standard crawls, so it
  // does not prove that accessibility analysis has started. The live overview
  // must keep Phase 2 in its waiting state until the server records the start.
  const phase2Started = Boolean(displaySession.scanStartedAt)
    || ["scanning", "completed"].includes(displaySession.status);

  const phase1StartRef = displaySession.startedAt ?? displaySession.createdAt;
  const phase1ElapsedMs = isDiscoveryStillRunning && phase1StartRef
    ? Math.max(0, now - new Date(phase1StartRef).getTime()) : null;
  const phase2StartRef = displaySession.scanStartedAt ?? displaySession.discoveredAt;
  const phase2ElapsedMs = isScanning && phase2StartRef
    ? Math.max(0, now - new Date(phase2StartRef).getTime()) : null;
  const activeElapsedMs = isScanning ? phase2ElapsedMs : phase1ElapsedMs;
  const durationBetween = (start: string | null, end: string | null): number | null => {
    if (!start || !end) return null;
    const duration = new Date(end).getTime() - new Date(start).getTime();
    return duration >= 0 ? duration : null;
  };
  const sessionElapsedMs = !displaySession.completedAt && displaySession.startedAt
    ? Math.max(0, now - new Date(displaySession.startedAt).getTime())
    : null;
  const crawlTimeMs = phase1ElapsedMs ?? durationBetween(displaySession.startedAt, displaySession.discoveredAt);
  const scanTimeMs = phase2ElapsedMs ?? durationBetween(displaySession.scanStartedAt ?? displaySession.discoveredAt, displaySession.completedAt);
  const processingTimeMs = sessionElapsedMs ?? durationBetween(displaySession.startedAt, displaySession.completedAt);

  const pages = pagesData?.pages ?? [];
  const totalPages = pagesData?.total ?? 0;
  const totalPagesPages = Math.ceil(totalPages / 50);
  const trueTotalPages = unfilteredTotal?.total ?? displaySession.totalDiscovered;
  const brokenLinks = brokenData?.links ?? [];
  const totalBroken = brokenData?.total ?? 0;
  const totalBrokenPages = Math.ceil(totalBroken / 50);

  const totalPtPages = (pageTypes ?? []).reduce((a, r) => a + r.count, 0);
  const uniquePageTypes = Array.from(new Set((pageTypes ?? []).map((r) => r.page_type)));
  const canExport = user?.permissions?.canExport ?? false;

  const exportPages = async () => {
    const params = new URLSearchParams();
    if (pagesStatusFilter !== "all") params.set("status", pagesStatusFilter);
    if (pagesLocaleFilter) params.set("locale", pagesLocaleFilter);
    if (pagesPageTypeFilter !== "all") params.set("pageType", pagesPageTypeFilter);
    if (pagesExtensionFilter) params.set("extension", pagesExtensionFilter);
    const response = await fetch(`${BASE}/api/crawler/sessions/${sessionId}/pages/export?${params}`, {
      credentials: "include",
    });
    if (!response.ok) {
      toast({ title: "Export failed", description: "The filtered page report could not be downloaded.", variant: "destructive" });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `crawler-${sessionId}-pages.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const timezone = (displaySession.config?.timezone as string) || undefined;
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(d));
    } catch { return new Date(d).toLocaleString(); }
  };

  return (
    <div className="vision-page vision-crawler-detail relative space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/crawler" className="text-muted-foreground hover:text-foreground" aria-label="Back to crawler history">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </Link>
            <h1 className="text-xl font-bold truncate">{displaySession.name}</h1>
            <Badge className={`text-xs ${statusBadge(displaySession.status)}`}>
              {sessionStatusLabel(displaySession.status)}
            </Badge>
            {displaySession.crawlBoost && (
              <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Crawl Boost
              </Badge>
            )}
            {isCrawlOnly && (
              <Badge className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300">
                Crawl Only
              </Badge>
            )}
          </div>
          <a href={displaySession.seedUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 w-fit"
            aria-label={`Open seed URL ${displaySession.seedUrl} in a new tab`}>
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            {displaySession.seedUrl}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          {timezone && (
            <p className="text-xs text-muted-foreground mt-0.5">Timezone: {timezone}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            Triggered by:{" "}
            <span className="font-medium text-foreground">
              {displaySession.triggeredBy?.fullName ??
                (displaySession.userId ? `User #${displaySession.userId}` : "Unknown user")}
            </span>
            {displaySession.triggeredBy?.username && (
              <span> (@{displaySession.triggeredBy.username})</span>
            )}
          </p>
          {displaySession.scheduledStartAt && displaySession.status === "pending" && (
            <p className="text-xs text-primary mt-1">
              Scheduled to start: {fmtDate(displaySession.scheduledStartAt)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {displaySession.scanSessionId && displaySession.status !== "crawled" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/scans/${displaySession.scanSessionId}`}>
                <Eye className="w-4 h-4 mr-1.5" />
                View Scan Results
              </Link>
            </Button>
          )}
          {displaySession.status === "crawled" && (
            <Button size="sm" onClick={() => startScanMutation.mutate()} disabled={startScanMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white">
              <ScanLine className="w-4 h-4 mr-1.5" />
              {startScanMutation.isPending ? "Starting…" : "Start Accessibility Scan"}
            </Button>
          )}
          {(displaySession.status === "pending" || displaySession.status === "paused") && (
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" />
              Import URLs
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importMutation.mutate(f);
              e.target.value = "";
            }}
          />
          {(isDiscovering || isScanning) && (
            <Button aria-label="Pause crawler" variant="outline" size="sm" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              <Pause className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Pause
            </Button>
          )}
          {(displaySession.status === "paused" || displaySession.status === "failed") && (
            <Button aria-label="Resume crawler" size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <Play className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Resume
            </Button>
          )}
          {(isActive || displaySession.status === "paused" || displaySession.status === "failed") && (
            <Button aria-label="Cancel crawler" variant="destructive" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <CrawlerLiveOverview
        session={displaySession}
        trueTotalPages={trueTotalPages}
        progress={pct}
        discoveryProgress={discPct}
        phase2Started={phase2Started}
        elapsedTime={activeElapsedMs === null ? null : fmtDurationCompact(activeElapsedMs, true)}
        timeDetails={{
          elapsed: (sessionElapsedMs ?? processingTimeMs) === null ? null : fmtDurationCompact(sessionElapsedMs ?? processingTimeMs, shouldTickClock),
          crawl: crawlTimeMs === null ? null : fmtDurationCompact(crawlTimeMs, isDiscoveryStillRunning),
          scan: scanTimeMs === null ? null : fmtDurationCompact(scanTimeMs, isScanning),
          processing: processingTimeMs === null ? null : fmtDurationCompact(processingTimeMs, shouldTickClock),
        }}
      />

      <div className="hidden">
      {/* Two-phase progress */}
      {(isActive || displaySession.status === "paused" || displaySession.status === "crawled") && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            {/* Phase 1 */}
            {(() => {
              const cfg = displaySession.config as any;
              const usedCache = cfg?.skipDiscovery === true;
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className={`flex items-center gap-1.5 font-medium ${(isPending || isDiscovering) ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground"}`}>
                      {(isPending || isDiscovering)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Search className="w-3.5 h-3.5" />
                      }
                      Phase 1 — URL Crawl
                      {usedCache && (
                        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded font-normal">
                          <Database className="w-3 h-3" />
                          from cache
                        </span>
                      )}
                      {isPending && (
                        <span className="text-xs font-normal">queued…</span>
                      )}
                      {displaySession.discoveredAt && (
                        <span className="text-xs text-muted-foreground font-normal ml-1">
                          {usedCache ? "loaded" : "completed"} {fmtDate(displaySession.discoveredAt)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground text-xs">
                      {(isPending || isDiscovering) && phase1ElapsedMs !== null && (
                        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                          <Clock className="w-3 h-3" />
                          {fmtDurationCompact(phase1ElapsedMs)}
                        </span>
                      )}
                      <span>{trueTotalPages} URLs found</span>
                    </span>
                  </div>
                  {/* Custom bar — avoids Tailwind arbitrary-variant issues on Progress internals */}
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                    {isPending ? (
                      <div className="h-full w-2/5 bg-purple-500 rounded-full animate-pulse" />
                    ) : (
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${displaySession.discoveredAt ? "bg-purple-500" : "bg-purple-500"}`}
                        style={{ width: `${isDiscovering ? Math.max(5, discPct) : (displaySession.discoveredAt ? 100 : 0)}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Phase 2 — deferred for Crawl Only until the explicit start action */}
            {phase2Started && <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className={`flex items-center gap-1.5 font-medium ${isScanning ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                  <ScanLine className="w-3.5 h-3.5" />
                  Phase 2 — Accessibility Scan
                </span>
                <span className="flex items-center gap-2 text-muted-foreground text-xs">
                  {isScanning && phase2ElapsedMs !== null && (
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <Clock className="w-3 h-3" />
                      {fmtDurationCompact(phase2ElapsedMs)}
                    </span>
                  )}
                  <span>
                    {isScanning || displaySession.status === "completed"
                      ? `${displaySession.totalScanned} / ${displaySession.totalDiscovered} pages · ${pct}%`
                      : displaySession.status === "crawled"
                      ? "Click 'Start Accessibility Scan' to begin"
                      : isPending
                      ? "waiting for crawl to start…"
                      : "waiting for crawl to complete…"}
                  </span>
                </span>
              </div>
              <Progress
                value={isScanning || displaySession.status === "completed" ? pct : 0}
                className="h-1.5"
              />
            </div>}

            {displaySession.status === "crawled" && (
              <div className="flex items-center gap-2 p-3 bg-teal-50 dark:bg-teal-950/30 rounded-lg border border-teal-200 dark:border-teal-800 text-sm text-teal-800 dark:text-teal-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Phase 1 complete — <strong>{displaySession.totalDiscovered}</strong> URLs crawled. Click <strong>Start Accessibility Scan</strong> above to begin Phase 2.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">URLs Crawled</p>
            <p className="text-2xl font-bold">{trueTotalPages}</p>
          </CardContent>
        </Card>
        <Card className={isScanning ? "border-blue-300 dark:border-blue-700" : ""}>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {isScanning && <ScanLine className="w-3 h-3 text-blue-500 animate-pulse" />}
              Currently Scanning
            </p>
            <p className={`text-2xl font-bold ${isScanning ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
              {isScanning ? (displaySession.scanningPages ?? 0) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pages Scanned</p>
            <p className="text-2xl font-bold">{displaySession.totalScanned}</p>
          </CardContent>
        </Card>
        <Card className={displaySession.totalFailed > 0 ? "border-red-200 dark:border-red-800" : ""}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-1">
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className={`text-2xl font-bold ${displaySession.totalFailed > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  {displaySession.totalFailed}
                </p>
              </div>
              {displaySession.totalFailed > 0 && ["scanning", "completed", "failed"].includes(displaySession.status) && (
                <button
                  className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                  onClick={() => retryFailedMutation.mutate()}
                  disabled={retryFailedMutation.isPending}
                  title="Retry all failed pages"
                >
                  <RefreshCw className={`w-3 h-3 ${retryFailedMutation.isPending ? "animate-spin" : ""}`} />
                  Retry
                </button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pages with Issues</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{(displaySession.pagesWithIssues ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">pages with violations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              Broken Links
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{displaySession.brokenLinksCount}</p>
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Timing summary (when complete) */}
      {displaySession.status === "completed" && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Started</p>
                <p className="font-medium">{fmtDate(displaySession.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Discovery completed</p>
                <p className="font-medium">{fmtDate(displaySession.discoveredAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scan completed</p>
                <p className="font-medium">{fmtDate(displaySession.completedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed / Skipped</p>
                <p className="font-medium">{displaySession.totalFailed} / {displaySession.totalSkipped}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {displaySession.errorMessage && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {displaySession.errorMessage}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="overflow-hidden rounded-[22px] border border-white/80 bg-white/65 p-2 shadow-[0_14px_34px_rgba(69,57,112,.06)] backdrop-blur-xl">
        <TabsList aria-label="Crawler detail sections" className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-[#edf0f7] bg-transparent px-1 pb-2">
          <TabsTrigger value="pages" aria-label={`Pages${totalPages > 0 ? `, ${totalPages} total` : ""}`}>
            Pages
            {totalPages > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{totalPages}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="page-types" aria-label="Page types">
            <LayoutGrid className="w-3.5 h-3.5 mr-1" />
            Page Types
            {(pageTypes ?? []).length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{(pageTypes ?? []).length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="broken" aria-label={`Broken links${totalBroken > 0 ? `, ${totalBroken} total` : ""}`}>
            Broken Links
            {totalBroken > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{totalBroken}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="config" aria-label="Crawl configuration">Config</TabsTrigger>
        </TabsList>

        {/* Pages Tab */}
        <TabsContent value="pages" className="space-y-3 pt-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Label htmlFor="crawler-status-filter" className="text-xs text-muted-foreground shrink-0">Status:</Label>
            <Select value={pagesStatusFilter} onValueChange={(v) => { setPagesStatusFilter(v); setPagesPage(1); }}>
              <SelectTrigger id="crawler-status-filter" aria-label="Filter pages by status" className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Queued</SelectItem>
                <SelectItem value="discovered">{displaySession.crawlBoost ? "DOM Captured" : "Discovered"}</SelectItem>
                <SelectItem value="scanning">{displaySession.crawlBoost ? "Snapshot Captured" : "Analysing"}</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="broken">Unreachable</SelectItem>
                <SelectItem value="skipped">Unchanged</SelectItem>
              </SelectContent>
            </Select>

            <Label htmlFor="crawler-page-type-filter" className="text-xs text-muted-foreground shrink-0">Page Type:</Label>
            <Select value={pagesPageTypeFilter} onValueChange={(v) => { setPagesPageTypeFilter(v); setPagesPage(1); }}>
              <SelectTrigger id="crawler-page-type-filter" aria-label="Filter pages by page type" className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniquePageTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label htmlFor="crawler-path-filter" className="text-xs text-muted-foreground shrink-0">Path:</Label>
            <div className="flex items-center gap-1">
              <Input
                id="crawler-path-filter"
                aria-label="Filter pages by URL path"
                className="h-8 text-xs w-36"
                placeholder="/us/en"
                value={localeSearch}
                onChange={(e) => setLocaleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setPagesLocaleFilter(localeSearch); setPagesPage(1); }
                }}
              />
              <Button size="sm" variant="outline" className="h-8 text-xs px-2"
                onClick={() => { setPagesLocaleFilter(localeSearch); setPagesPage(1); }}>
                Filter
              </Button>
              {pagesLocaleFilter && (
                <Button size="sm" variant="ghost" className="h-8 text-xs px-2"
                  onClick={() => { setPagesLocaleFilter(""); setLocaleSearch(""); setPagesPage(1); }}>
                  Clear
                </Button>
              )}
            </div>
            <Label htmlFor="crawler-extension-filter" className="text-xs text-muted-foreground shrink-0">URL extension:</Label>
            <div className="flex items-center gap-1">
              <Input
                id="crawler-extension-filter"
                aria-label="Filter pages by URL extension"
                className="h-8 text-xs w-28"
                placeholder="pdf or html"
                value={pagesExtensionFilter}
                onChange={(e) => { setPagesExtensionFilter(e.target.value.replace(/^\./, "").trim().toLowerCase()); setPagesPage(1); }}
              />
              {pagesExtensionFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs px-2"
                  aria-label="Clear URL extension filter"
                  onClick={() => { setPagesExtensionFilter(""); setPagesPage(1); }}
                >
                  Clear
                </Button>
              )}
            </div>
            {canExport && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                aria-label="Export filtered crawler pages as CSV"
                onClick={() => void exportPages()}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Export CSV
              </Button>
            )}
          </div>

          {pagesLoading ? (
            <div className="text-muted-foreground text-sm py-4">Loading pages…</div>
          ) : pages.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">No pages found.</div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="w-28">Page Type</TableHead>
                      <TableHead className="w-16">Depth</TableHead>
                      <TableHead className="w-20">Issues</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pages.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{pageStatusIcon(p.status)}</TableCell>
                        <TableCell className="max-w-xs">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate"
                          >
                            {p.url}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          {p.errorMessage && (
                            <p className="text-xs text-destructive truncate">{p.errorMessage}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.pageType && (
                            <Badge className={`text-xs ${pageTypeBadge(p.pageType)}`}>{p.pageType}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.depth}</TableCell>
                        <TableCell>
                          {p.ruleCount > 0 && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300" title={`${p.ruleCount} rule${p.ruleCount !== 1 ? "s" : ""} with violations (${p.issueCount} total occurrence${p.issueCount !== 1 ? "s" : ""})`}>
                              {p.ruleCount}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[9.5rem]">
                          <PageStageIndicator info={getPageStepInfo(
                            p.status,
                            displaySession.status,
                            displaySession.crawlBoost ?? false,
                            now,
                          )} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPagesPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {pagesPage} of {totalPagesPages} ({totalPages} total)
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" aria-label="Go to first pages page" disabled={pagesPage <= 1} onClick={() => setPagesPage(1)} title="First page">
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" aria-label="Go to previous pages page" disabled={pagesPage <= 1} onClick={() => setPagesPage((p) => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" aria-label="Go to next pages page" disabled={pagesPage >= totalPagesPages} onClick={() => setPagesPage((p) => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" aria-label="Go to last pages page" disabled={pagesPage >= totalPagesPages} onClick={() => setPagesPage(totalPagesPages)} title="Last page">
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Page Types Tab */}
        <TabsContent value="page-types" className="pt-2 space-y-4">
          {(pageTypes ?? []).length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <LayoutGrid className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                Page types are classified during Phase 1 (URL discovery). Start a crawl to see the breakdown.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                URLs are automatically classified by page type based on their URL path. Click a type to filter the Pages tab.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(pageTypes ?? []).map((row) => {
                  const pct = totalPtPages > 0 ? Math.round((row.count / totalPtPages) * 100) : 0;
                  return (
                    <Card
                      key={row.page_type}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        setPagesPageTypeFilter(row.page_type);
                        setPagesStatusFilter("all");
                        setPagesPage(1);
                      }}
                    >
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className={`text-xs ${pageTypeBadge(row.page_type)}`}>{row.page_type}</Badge>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                        <p className="text-2xl font-bold">{row.count.toLocaleString()}</p>
                        <Progress value={pct} className="h-1" />
                        <p className="text-xs text-muted-foreground">pages</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        {/* Broken Links Tab */}
        <TabsContent value="broken" className="space-y-3 pt-2">
          {brokenLoading ? (
            <div className="text-muted-foreground text-sm py-4">Loading broken links…</div>
          ) : brokenLinks.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Link2 className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {displaySession.status === "completed"
                  ? "No broken links found — great!"
                  : "Broken link detection runs after Phase 2 completes."}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broken URL</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-24">Error Type</TableHead>
                      <TableHead>Found On</TableHead>
                      <TableHead>Link Text</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brokenLinks.map((bl) => (
                      <TableRow key={bl.id}>
                        <TableCell className="max-w-xs">
                          <a href={bl.brokenUrl} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 truncate">
                            {bl.brokenUrl}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell>
                          {bl.httpStatus ? (
                            <Badge className="text-xs bg-red-100 text-red-700">{bl.httpStatus}</Badge>
                          ) : (
                            <Badge className="text-xs bg-gray-100 text-gray-500">—</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{bl.errorType ?? "—"}</span>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <a href={bl.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block">
                            {bl.sourceUrl}
                          </a>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{bl.anchorText ?? "—"}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalBrokenPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {brokenPage} of {totalBrokenPages} ({totalBroken} total)
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" aria-label="Go to first broken links page" disabled={brokenPage <= 1} onClick={() => setBrokenPage(1)} title="First page">
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" aria-label="Go to previous broken links page" disabled={brokenPage <= 1} onClick={() => setBrokenPage((p) => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" aria-label="Go to next broken links page" disabled={brokenPage >= totalBrokenPages} onClick={() => setBrokenPage((p) => p + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" aria-label="Go to last broken links page" disabled={brokenPage >= totalBrokenPages} onClick={() => setBrokenPage(totalBrokenPages)} title="Last page">
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="pt-2">
          <Card>
            <CardHeader>
              <CardTitle>Crawl Configuration</CardTitle>
              <CardDescription>Settings used for this crawl session.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {Object.entries(displaySession.config ?? {}).map(([key, value]) => {
                  if (key === "authPassword") return null;
                  const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
                  return (
                    <div key={key} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium text-xs break-all">
                        {typeof value === "boolean"
                          ? value ? "Yes" : "No"
                          : Array.isArray(value)
                          ? value.join(", ") || "—"
                          : value == null
                          ? "—"
                          : String(value)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
