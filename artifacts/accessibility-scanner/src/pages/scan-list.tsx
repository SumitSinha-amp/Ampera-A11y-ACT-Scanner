import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  useListScans,
  useDeleteScan,
  useUpdateScan,
  useGetScanStatus,
  useGetScanReport,
  getGetScanStatusQueryKey,
  getGetScanReportQueryKey,
  getListScansQueryKey,
  getListProjectsQueryKey,
  getGetScanQueryKey,
  useListProjects,
  type ListScansParams,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useSite } from "@/contexts/site";
import { ProjectSelector } from "@/components/project-selector";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Trash2,
  FileText,
  Loader2,
  Search,
  X,
  CalendarDays,
  FolderOpen,
  Pencil,
  ChevronDown,
  Pause,
  Play,
  ExternalLink,
  AlertTriangle,
  Globe,
  Timer,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Activity,
} from "lucide-react";
import { getStatusBadge } from "@/lib/status-badge";
import { isUrlLikeScanName, SCAN_NAME_URL_ERROR } from "@/lib/scan-name";
import { FieldMessage } from "@/components/ui/field-message";
import { formatDate } from "@/lib/utils";
import {
  getScanRuleDisplay,
  SCAN_LEVEL_BADGES,
  type ScanRuleDisplayOptions,
} from "@/lib/scan-rule-display";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EditScanDialogProps {
  scan: {
    id: number;
    name: string | null;
    projectId?: number | null;
    projectName?: string | null;
    siteId?: number | null;
    initiatorName?: string | null;
    initiatorRole?: string | null;
  };
  open: boolean;
  onClose: () => void;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const ALL_RULES_FILTER = "__all_rules__";

type AdminUser = { id: number; fullName: string; username: string; groups: { id: number; name: string }[] };

type ScanItem = {
  id: number;
  name: string | null;
  status: string;
  totalUrls: number;
  scannedUrls: number;
  totalIssues: number;
  criticalIssues: number;
  createdAt: string;
  completedAt?: string | null;
  projectName?: string | null;
  projectId?: number | null;
  siteId?: number | null;
  options?: ScanRuleDisplayOptions | null;
  pagesWithIssues?: number;
  initiatorName?: string | null;
  initiatorRole?: string | null;
};

function getScanRuleIds(scan: { options?: unknown | null }): string[] {
  if (!scan.options || typeof scan.options !== "object") return [];
  const rules = (scan.options as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) return [];
  return Array.from(
    new Set(
      rules
        .filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0)
        .map((rule) => {
          const normalized = rule.trim().toUpperCase();
          return normalized.startsWith("SIA-")
            ? `ACT-${normalized.slice("SIA-".length)}`
            : normalized;
        }),
    ),
  );
}

function ScanRulesSummary({ options }: { options?: ScanRuleDisplayOptions | null }) {
  const display = getScanRuleDisplay(options);
  const appliedRulesDescription = display.appliedRules.length > 0
    ? `Applied rules (${display.appliedRules.length})`
    : "All scanner rules are applied";
  const visibleValues = display.mode === "rules" ? display.values.slice(0, 6) : display.values;
  const remainingRuleCount = display.mode === "rules"
    ? display.values.length - visibleValues.length
    : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex max-w-[11rem] cursor-help flex-wrap gap-1"
          aria-label={
            display.mode === "levels"
              ? `Accessibility scope: ${display.values.join(", ")}. ${appliedRulesDescription}.`
              : display.mode === "rules"
                ? `Selected rules: ${display.values.join(", ")}. ${appliedRulesDescription}.`
                : appliedRulesDescription
          }
        >
          {display.mode === "all" ? (
            <Badge
              variant="outline"
              className="border-[#d9d0f8] bg-[#eee9ff] px-1.5 py-0 text-[10px] leading-4 font-semibold text-[#6d48c7] whitespace-nowrap shadow-none"
            >
              All rules
            </Badge>
          ) : display.mode === "levels" ? (
            visibleValues.map((level) => (
              <Badge
                key={level}
                variant="outline"
                className="border-[#d9d0f8] bg-[#eee9ff] px-1.5 py-0 text-[10px] leading-4 font-semibold text-[#6d48c7] whitespace-nowrap shadow-none"
              >
                {SCAN_LEVEL_BADGES[level] ?? level}
              </Badge>
            ))
          ) : (
            <>
              {visibleValues.map((ruleId) => (
                <Badge
                  key={ruleId}
                  variant="outline"
                  className="border-[#d9d0f8] bg-[#eee9ff] px-1.5 py-0 font-mono text-[10px] leading-4 font-semibold text-[#6d48c7] whitespace-nowrap shadow-none"
                >
                  {ruleId}
                </Badge>
              ))}
              {remainingRuleCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-[#d9d0f8] bg-white px-1.5 py-0 text-[10px] leading-4 font-semibold text-[#6d48c7] whitespace-nowrap shadow-none"
                >
                  +{remainingRuleCount}
                </Badge>
              )}
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-[24rem] p-3">
        <p className="mb-1 text-[11px] font-semibold">{appliedRulesDescription}</p>
        {display.appliedRules.length > 0 ? (
          <p className="max-h-28 overflow-y-auto font-mono text-[10px] leading-4">
            {display.appliedRules.join(", ")}
          </p>
        ) : (
          <p className="text-[10px] leading-4">
            This scan did not store a rule subset, so all available rules were applied.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function formatElapsed(scan: { createdAt: string; completedAt?: string | null; status: string }) {
  const start = new Date(scan.createdAt).getTime();
  const end = scan.completedAt ? new Date(scan.completedAt).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${String(rem).padStart(2, "0")}m`;
}

const HISTORY_STATUS_CONFIG: Record<string, {
  label: string;
  bg: string;
  color: string;
  dot: string;
}> = {
  running: { label: "Running", bg: "#e8f5e9", color: "#2e7d32", dot: "#43a047" },
  paused: { label: "Paused", bg: "#fff8e1", color: "#f57f17", dot: "#ffb300" },
  pending: { label: "Pending", bg: "#e8eaf6", color: "#3949ab", dot: "#5c6bc0" },
  completed: { label: "Completed", bg: "#e3f0fb", color: "#1565c0", dot: "#2196f3" },
  failed: { label: "Failed", bg: "#fce4ec", color: "#c62828", dot: "#e53935" },
  cancelled: { label: "Cancelled", bg: "#f3e5f5", color: "#6a1b9a", dot: "#9c27b0" },
};

function HistoryStatusBadge({ status }: { status: string }) {
  const config = HISTORY_STATUS_CONFIG[status] ?? {
    label: status || "Unknown",
    bg: "#f3f4f6",
    color: "#667085",
    dot: "#98a2b3",
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === "running" ? "animate-pulse" : ""}`}
        style={{ backgroundColor: config.dot }}
      />
      {config.label}
    </span>
  );
}

function getHistoryProgress(scan: { status: string; scannedUrls: number; totalUrls: number }) {
  if (scan.status === "completed") return 100;
  if (scan.totalUrls <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((scan.scannedUrls / scan.totalUrls) * 100)));
}

function formatEta(scan: { createdAt: string; scannedUrls: number; totalUrls: number; status: string }) {
  if (scan.status !== "running" && scan.status !== "pending") return "—";
  if (scan.scannedUrls <= 0 || scan.totalUrls <= 0) return "unknown";
  const elapsed = Date.now() - new Date(scan.createdAt).getTime();
  const avgMs = elapsed / scan.scannedUrls;
  const remaining = Math.max(0, scan.totalUrls - scan.scannedUrls);
  const etaMins = Math.round((avgMs * remaining) / 60000);
  if (etaMins < 1) return "< 1 min";
  if (etaMins < 60) return `~${etaMins} min`;
  const hrs = Math.floor(etaMins / 60);
  const mins = etaMins % 60;
  return `~${hrs}h ${mins}m`;
}

function StatTile({
  label,
  value,
  colorClass = "text-foreground",
  icon,
}: {
  label: string;
  value: string | number;
  colorClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-muted/60 border border-border/60 px-2 py-2 text-center flex flex-col items-center gap-0.5">
      {icon && <span className="mb-0.5">{icon}</span>}
      <p className={`text-lg font-bold leading-none ${colorClass}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-[9px] text-muted-foreground leading-none mt-0.5">{label}</p>
    </div>
  );
}

function ScanPreviewPopup({
  scan,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
  onClose,
}: {
  scan: ScanItem;
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const isLive = scan.status === "running" || (scan.status as string) === "paused" || scan.status === "pending";

  const { data: statusData } = useGetScanStatus(scan.id, {
    query: {
      queryKey: getGetScanStatusQueryKey(scan.id),
      refetchInterval: isLive ? 2000 : false,
    },
  });

  const { data: reportData } = useGetScanReport(scan.id, {
    query: {
      queryKey: getGetScanReportQueryKey(scan.id),
      enabled: !isLive,
    },
  });

  // Issue totals: always from the scan list item (accurate; updated after each page completes)
  const totalIssues = scan.totalIssues;
  const criticalIssues = scan.criticalIssues;

  // Page counts from the aggregated counts map (much more accurate than filtering pages[])
  const countsMap = statusData?.counts ?? {};

  // Live scan: active page rows let us derive per-stage counts
  const activePages = statusData?.pages ?? [];
  const pagesScanning = activePages.filter((p) => p.status === "scanning").length;
  const pagesPending = activePages.filter((p) => p.status === "pending").length;
  const pagesDone = countsMap["completed"] ?? 0;

  // Completed / cancelled breakdown: use server-computed pagesWithIssues + counts
  const pagesWithIssues = statusData?.pagesWithIssues ?? 0;
  const pagesNoIssues = Math.max(0, (countsMap["completed"] ?? 0) - pagesWithIssues);
  const pagesFailed = (countsMap["failed"] ?? 0) + (countsMap["not_available"] ?? 0);
  const pagesSkipped = countsMap["skipped"] ?? 0;

  const scannedUrls = statusData?.scannedUrls ?? scan.scannedUrls;
  const totalUrls = statusData?.totalUrls ?? scan.totalUrls;
  const currentUrl = statusData?.currentUrl;
  const progress = totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;

  // Top pages: from report endpoint (only available for completed scans)
  const topPages = reportData?.pagesWithMostIssues?.slice(0, 4) ?? [];

  const POPUP_WIDTH = 500;
  const POPUP_EST_HEIGHT = isLive ? 360 : 420;
  const margin = 10;
  const showAbove = anchorRect.top > POPUP_EST_HEIGHT + 40;
  const left = Math.max(margin, Math.min(anchorRect.left, window.innerWidth - POPUP_WIDTH - margin));
  const top = showAbove ? anchorRect.top - margin : anchorRect.bottom + margin;

  const handleGoToDetails = () => {
    onClose();
    navigate(`/scans/${scan.id}`);
  };

  return (
    <motion.div
      className="fixed z-[9999] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      style={{ width: POPUP_WIDTH, left, top, transformOrigin: showAbove ? "bottom left" : "top left" }}
      initial={{ opacity: 0, y: showAbove ? 10 : -10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: showAbove ? 6 : -6, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          {scan.status === "running" && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          {(scan.status as string) === "paused" && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
          {scan.status === "pending" && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate">{scan.name || `Scan #${scan.id}`}</span>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline underline-offset-2 cursor-pointer hover:opacity-80 shrink-0 whitespace-nowrap"
          onClick={handleGoToDetails}
        >
          Go to Full Details <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Status + meta row */}
      <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
        {getStatusBadge(scan.status)}
        <span className="text-xs text-muted-foreground">{formatDate(scan.createdAt)}</span>
        {scan.projectName && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[150px]">
            <FolderOpen className="w-3 h-3 shrink-0" />{scan.projectName}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-4 space-y-2.5">
        {isLive ? (
          <>
            {/* Current URL chip */}
            {currentUrl && (
              <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/60 px-3 py-1.5">
                <Activity className="w-3 h-3 shrink-0 text-emerald-500 animate-pulse" />
                <span className="truncate text-[11px] font-mono text-muted-foreground">{currentUrl}</span>
              </div>
            )}

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{scannedUrls} of {totalUrls} pages</span>
                <span className="font-mono font-semibold text-foreground">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-primary to-violet-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* Page stage breakdown */}
            <div className="grid grid-cols-4 gap-1.5">
              <StatTile label="Done" value={pagesDone} colorClass="text-emerald-500" icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />} />
              <StatTile label="Scanning" value={pagesScanning} colorClass="text-blue-500" icon={<Activity className="w-3.5 h-3.5 text-blue-500" />} />
              <StatTile label="In Queue" value={pagesPending} colorClass="text-muted-foreground" icon={<Clock className="w-3.5 h-3.5 text-muted-foreground" />} />
              <StatTile label="Failed" value={pagesFailed} colorClass="text-destructive" icon={<XCircle className="w-3.5 h-3.5 text-destructive" />} />
            </div>

            {/* Issues summary */}
            <div className="grid grid-cols-3 gap-1.5">
              <StatTile label="Total Issues" value={totalIssues} colorClass="text-foreground" icon={<TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />} />
              <StatTile label="Critical" value={criticalIssues} colorClass="text-destructive" icon={<AlertTriangle className="w-3.5 h-3.5 text-destructive" />} />
              <StatTile label="Pages w/ Issues" value={pagesWithIssues} colorClass="text-amber-500" icon={<Globe className="w-3.5 h-3.5 text-amber-500" />} />
            </div>

            {/* ETA + elapsed */}
            <div className="flex items-center justify-between rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Timer className="w-3 h-3" />ETA: <span className="font-semibold text-foreground">{formatEta(scan)}</span></span>
              <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" />Elapsed: <span className="font-semibold text-foreground">{formatElapsed(scan)}</span></span>
            </div>
          </>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 border border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" />{scannedUrls} of {totalUrls} pages scanned</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{formatElapsed(scan)}</span>
            </div>

            {/* Issues grid */}
            <div className="grid grid-cols-3 gap-1.5">
              <StatTile label="Total Issues" value={totalIssues} colorClass="text-foreground" icon={<TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />} />
              <StatTile label="Critical" value={criticalIssues} colorClass="text-destructive" icon={<AlertTriangle className="w-3.5 h-3.5 text-destructive" />} />
              <StatTile label="Non-Critical" value={Math.max(0, totalIssues - criticalIssues)} colorClass="text-amber-500" icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-500" />} />
            </div>

            {/* Page status breakdown */}
            <div className="grid grid-cols-4 gap-1.5">
              <StatTile label="w/ Issues" value={pagesWithIssues} colorClass="text-amber-500" icon={<AlertTriangle className="w-3 h-3 text-amber-500" />} />
              <StatTile label="No Issues" value={pagesNoIssues} colorClass="text-emerald-500" icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />} />
              <StatTile label="Failed" value={pagesFailed} colorClass="text-destructive" icon={<XCircle className="w-3 h-3 text-destructive" />} />
              <StatTile label="Skipped" value={pagesSkipped} colorClass="text-muted-foreground" icon={<MinusCircle className="w-3 h-3 text-muted-foreground" />} />
            </div>

            {/* Top pages with most issues */}
            {topPages.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Top pages by issues</p>
                <div className="space-y-0.5">
                  {topPages.map((p) => (
                    <div key={p.url} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40">
                      <span className="flex-1 truncate text-[11px] font-mono text-muted-foreground min-w-0">
                        {p.url.replace(/^https?:\/\//, "")}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.criticalCount > 0 && (
                          <span className="text-[10px] font-semibold text-destructive flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" />{p.criticalCount}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-foreground bg-muted/80 rounded px-1.5 py-0.5">{p.issueCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending for cancelled scans */}
            {pagesPending > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground rounded-lg bg-muted/40 border border-border/60 px-3 py-1.5">
                <MinusCircle className="w-3 h-3 shrink-0" />
                <span>{pagesPending} pages not scanned (scan was {scan.status})</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom accent */}
      <div className="h-[2px] bg-gradient-to-r from-violet-600 via-primary to-transparent" />
    </motion.div>
  );
}

const ALL_STATUSES = [
  { value: "running",   label: "Running" },
  { value: "paused",    label: "Paused" },
  { value: "pending",   label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "failed",    label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 h-10 font-normal"
        >
          <span className="truncate max-w-[120px]">{displayLabel}</span>
          {selected.length > 0 && (
            <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
              {selected.length}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <p className="text-xs font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wide">
          {label}
        </p>
        <div className={`space-y-0.5 ${label === "Rules" ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(opt.value)}
                onCheckedChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <>
            <div className="my-1.5 border-t" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function EditScanDialog({ scan, open, onClose }: EditScanDialogProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const { sites, isLoading: sitesLoading } = useSite();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateScan = useUpdateScan();
  const [name, setName] = useState(scan.name ?? "");
  const [projectId, setProjectId] = useState<number | null>(scan.projectId ?? null);
  const [siteId, setSiteId] = useState<number | null>(scan.siteId ?? null);
  const [initiatorName, setInitiatorName] = useState(scan.initiatorName ?? "");
  const [initiatorRole, setInitiatorRole] = useState(scan.initiatorRole ?? "");
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(scan.name ?? "");
    setProjectId(scan.projectId ?? null);
    setSiteId(scan.siteId ?? null);
    setInitiatorName(scan.initiatorName ?? "");
    setInitiatorRole(scan.initiatorRole ?? "");
    setNameError(null);
  }, [open, scan]);

  useEffect(() => {
    if (!isSuperAdmin || !open) return;
    fetch(`${BASE_URL}/api/admin/users`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: AdminUser[]) => setAllUsers(data))
      .catch(() => {});
  }, [isSuperAdmin, open]);

  const handleUserSelect = (fullName: string) => {
    setInitiatorName(fullName);
    const selected = allUsers.find(u => u.fullName === fullName);
    if (selected && selected.groups.length > 0) {
      setInitiatorRole(selected.groups[0].name);
    }
  };

  const handleSave = () => {
    if (isUrlLikeScanName(name)) {
      setNameError(SCAN_NAME_URL_ERROR);
      return;
    }
    setNameError(null);
    const data: Parameters<typeof updateScan.mutate>[0]["data"] = {
      name: name.trim() || undefined,
      projectId,
      siteId,
      ...(isSuperAdmin ? {
        initiatorName: initiatorName.trim() || null,
        initiatorRole: initiatorRole.trim() || null,
      } : {}),
    };
    updateScan.mutate(
      { id: scan.id, data },
      {
        onSuccess: () => {
          toast({ title: "Scan updated" });
          queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scan.id) });
          onClose();
        },
        onError: () => {
          toast({ title: "Failed to update scan", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Scan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-scan-name">Scan Title</Label>
            <Input
              id="edit-scan-name"
              value={name}
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
                setNameError(isUrlLikeScanName(value) ? SCAN_NAME_URL_ERROR : null);
              }}
              placeholder="Enter scan title"
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "edit-scan-name-error" : undefined}
            />
            {nameError && (
              <FieldMessage id="edit-scan-name-error" tone="error">
                {nameError}
              </FieldMessage>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <ProjectSelector
                value={projectId}
                onChange={(nextProjectId) => setProjectId(nextProjectId)}
                siteId={siteId}
                legacyProjectName={scan.projectName}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-scan-site">Site</Label>
              <Select
                value={siteId === null ? "none" : String(siteId)}
                 onValueChange={(value) => {
                   setSiteId(value === "none" ? null : Number(value));
                   setProjectId(null);
                 }}
                disabled={sitesLoading}
              >
                <SelectTrigger id="edit-scan-site">
                  <SelectValue placeholder={sitesLoading ? "Loading sites…" : "Select site…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No site</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={String(site.id)}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isSuperAdmin ? (
            <>
              <div className="space-y-1.5">
                <Label>Scan Initiator</Label>
                {allUsers.length > 0 ? (
                  <Select value={initiatorName} onValueChange={handleUserSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map(u => (
                        <SelectItem key={u.id} value={u.fullName}>
                          {u.fullName}{" "}
                          <span className="text-muted-foreground text-xs">({u.username})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={initiatorName}
                    onChange={(e) => setInitiatorName(e.target.value)}
                    placeholder="e.g. Jane Smith"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Initiator Role</Label>
                <Input
                  value={initiatorRole}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                  placeholder="Auto-filled from user's group"
                />
              </div>
            </>
          ) : (
            (scan.initiatorName || scan.initiatorRole) && (
              <div className="rounded-md bg-muted/50 border px-3 py-2.5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Scan metadata (read-only)</p>
                {scan.initiatorName && (
                  <p className="text-sm">Initiator: <span className="font-medium">{scan.initiatorName}</span></p>
                )}
                {scan.initiatorRole && (
                  <p className="text-sm">Role: <span className="font-medium">{scan.initiatorRole}</span></p>
                )}
                <p className="text-xs text-muted-foreground mt-1">Only a super administrator can change these fields.</p>
              </div>
            )
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateScan.isPending}>
            {updateScan.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTIVE_STATUSES = ["running", "pending", "paused"];

export default function ScanList() {
  const { activeSite } = useSite();
  // Fetch the complete accessible history. Older manual scans were created before
  // site association existed, so they have a null siteId and must not disappear
  // just because the user currently has a site selected.
  const listParams: ListScansParams = {};
  const { data: scans, isLoading } = useListScans(listParams, {
    query: {
      queryKey: getListScansQueryKey(listParams),
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!Array.isArray(data)) return false;
        const hasActive = data.some((s: ScanItem) => ACTIVE_STATUSES.includes(s.status));
        return hasActive ? 10_000 : false;
      },
    },
  });

  const isPolling = Array.isArray(scans) && scans.some((s) => ACTIVE_STATUSES.includes(s.status));

  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState(0);

  useEffect(() => {
    if (scans !== undefined) {
      setLastRefreshedAt(new Date());
      setSecondsSinceRefresh(0);
    }
  }, [scans]);

  useEffect(() => {
    if (!isPolling) return;
    const id = setInterval(() => {
      setSecondsSinceRefresh((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isPolling]);

  const deleteScan = useDeleteScan();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nameFilter, setNameFilter] = useState("");
  const [initiatorFilter, setInitiatorFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [rulesFilter, setRulesFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [editingScan, setEditingScan] = useState<{
    id: number;
    name: string | null;
    projectId?: number | null;
    siteId?: number | null;
    initiatorName?: string | null;
    initiatorRole?: string | null;
  } | null>(null);

  const projectFilterParams = activeSite ? { siteId: activeSite.id } : undefined;
  const { data: siteProjects = [], isLoading: isLoadingProjects } = useListProjects(
    projectFilterParams,
    {
      query: {
        queryKey: getListProjectsQueryKey(projectFilterParams),
        enabled: activeSite != null,
      },
    },
  );

  const pauseScan = useMutation({
    mutationFn: async (scanId: number) => {
      const res = await fetch(`${BASE_URL}/api/scans/${scanId}/pause`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to pause");
    },
    onSuccess: () => {
      toast({ title: "Scan paused" });
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    },
    onError: () => toast({ title: "Could not pause scan", variant: "destructive" }),
  });

  const resumeScan = useMutation({
    mutationFn: async (scanId: number) => {
      const res = await fetch(`${BASE_URL}/api/scans/${scanId}/resume`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to resume");
    },
    onSuccess: () => {
      toast({ title: "Scan resumed" });
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    },
    onError: () => toast({ title: "Could not resume scan", variant: "destructive" }),
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch(`${BASE_URL}/api/scans/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      toast({ title: `${data.deleted} scan${data.deleted === 1 ? "" : "s"} deleted` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    },
    onError: () => toast({ title: "Failed to delete scans", variant: "destructive" }),
  });

  // Hover preview state
  const [hoveredScan, setHoveredScan] = useState<{ scan: ScanItem; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScanNameEnter = useCallback((scan: ScanItem, e: React.MouseEvent<HTMLElement>) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => setHoveredScan({ scan, rect }), 320);
  }, []);

  const handleScanNameLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredScan(null), 120);
  }, []);

  const cancelHideTimer = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const ruleOptions = useMemo(() => {
    const ruleIds = new Set<string>();
    for (const scan of scans ?? []) {
      for (const ruleId of getScanRuleIds(scan as ScanItem)) {
        ruleIds.add(ruleId);
      }
    }
    return [
      { value: ALL_RULES_FILTER, label: "All rules" },
      ...Array.from(ruleIds).sort().map((ruleId) => ({ value: ruleId, label: ruleId })),
    ];
  }, [scans]);

  const filteredScans = useMemo(() => {
    return (scans ?? []).filter((scan) => {
      const s = scan as typeof scan & {
        projectName?: string | null;
        initiatorName?: string | null;
        initiatorRole?: string | null;
        siteId?: number | null;
      };
      // Manual Scan History intentionally excludes crawler-generated scans.
      if (scan.name?.startsWith("[Crawler]")) return false;
      // Keep site-specific history scoped to the selected site, but retain legacy
      // manual scans with no siteId so old history remains visible.
      if (activeSite && s.siteId != null && s.siteId !== activeSite.id) return false;
      const searchTarget = [
        scan.name,
        s.projectName,
        s.initiatorName,
        s.initiatorRole,
        `scan #${scan.id}`,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesName =
        !nameFilter || searchTarget.includes(nameFilter.toLowerCase());
      const matchesInitiator =
        !initiatorFilter ||
        (s.initiatorName ?? "")
          .toLowerCase()
          .includes(initiatorFilter.toLowerCase());
      const createdDate = new Date(scan.createdAt).toISOString().slice(0, 10);
      const matchesDateFrom = !dateFromFilter || createdDate >= dateFromFilter;
      const matchesDateTo = !dateToFilter || createdDate <= dateToFilter;
      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(scan.status);
      const scanRuleIds = getScanRuleIds(scan as ScanItem);
      const matchesRules =
        rulesFilter.length === 0 ||
        rulesFilter.some((ruleId) =>
          ruleId === ALL_RULES_FILTER
            ? scanRuleIds.length === 0
            : scanRuleIds.includes(ruleId),
        );
      const matchesProject =
        projectFilter == null || s.projectId === projectFilter;
      return (
        matchesName && matchesInitiator && matchesDateFrom && matchesDateTo &&
        matchesStatus && matchesRules && matchesProject
      );
    });
  }, [
    scans,
    nameFilter,
    initiatorFilter,
    dateFromFilter,
    dateToFilter,
    statusFilter,
    rulesFilter,
    projectFilter,
    activeSite,
  ]);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const totalHistoryPages = Math.max(1, Math.ceil(filteredScans.length / historyPageSize));
  const visibleHistoryPage = Math.min(historyPage, totalHistoryPages);
  const visibleScans = filteredScans.slice(
    (visibleHistoryPage - 1) * historyPageSize,
    visibleHistoryPage * historyPageSize,
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [
    nameFilter,
    initiatorFilter,
    dateFromFilter,
    dateToFilter,
    statusFilter,
    rulesFilter,
    projectFilter,
    activeSite?.id,
    historyPageSize,
  ]);

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
  }, [historyPage, totalHistoryPages]);

  const hasActiveFilters =
    nameFilter || initiatorFilter || dateFromFilter || dateToFilter ||
    statusFilter.length > 0 || rulesFilter.length > 0 || projectFilter != null;

  const siteScopedScans = useMemo(
    () => (scans ?? []).filter((scan) => {
      const siteScan = scan as ScanItem;
      return (
        !scan.name?.startsWith("[Crawler]") &&
        (!activeSite || siteScan.siteId == null || siteScan.siteId === activeSite.id)
      );
    }),
    [scans, activeSite],
  );
  const activeScanCount = siteScopedScans.filter((scan) => ACTIVE_STATUSES.includes(scan.status)).length;
  const completedScanCount = siteScopedScans.filter((scan) => scan.status === "completed").length;
  const failedScanCount = siteScopedScans.filter((scan) => scan.status === "failed").length;

  const selectableIds = useMemo(
    () => filteredScans.filter((s) => s.status === "cancelled" || s.status === "failed").map((s) => s.id),
    [filteredScans],
  );
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelectableSelected = selectableIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear selection when visible scans change (filter change / refresh)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    nameFilter,
    initiatorFilter,
    dateFromFilter,
    dateToFilter,
    statusFilter,
    rulesFilter,
    projectFilter,
  ]);

  useEffect(() => {
    setProjectFilter(null);
  }, [activeSite?.id]);

  const handleDelete = (id: number) => {
    deleteScan.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Scan deleted" });
          queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
        },
        onError: () => {
          toast({
            title: "Error deleting scan",
            description: "Could not delete the scan",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="vision-page vision-scan-history relative min-h-full space-y-5 overflow-hidden p-4 sm:p-6">
      {editingScan && (
        <EditScanDialog
          scan={editingScan}
          open={true}
          onClose={() => setEditingScan(null)}
        />
      )}

      <div className="relative flex w-full flex-wrap items-start justify-between gap-4 pt-1">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#6d48c7]">
            <FileText className="h-4 w-4" />
            Scan history
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#172b4d]">Manual Scan History</h1>
          <p className="mt-1 text-xs text-[#7b8aaa]">
            {activeSite
              ? <>Showing scans for <span className="font-semibold text-foreground">{activeSite.name}</span>. Select a different site in the header to switch.</>
              : "View past manual page audits and reports."}{" "}
            <span className="text-[#9eadca]">· Auto-refreshes every 10s while active</span>
          </p>
        </div>
        <Link href="/new" className="shrink-0">
          <Button className="h-9 rounded-[10px] bg-[#6d48c7] px-5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(109,72,199,.2)] hover:bg-[#5c3bb5]">
            <span className="mr-1 text-base leading-none">+</span>
            New Scan
          </Button>
        </Link>
      </div>

      <div className="relative grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total scans", value: siteScopedScans.length, icon: FileText, color: "#6d48c7", bg: "#eee9ff" },
          { label: "Active now", value: activeScanCount, icon: Activity, color: "#198f88", bg: "#e4f7f0" },
          { label: "Completed", value: completedScanCount, icon: CheckCircle2, color: "#3778c8", bg: "#e3f0fb" },
          { label: "Failed scans", value: failedScanCount, icon: AlertTriangle, color: "#e84a3d", bg: "#fff0ed" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/75 px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,.06)] backdrop-blur-xl">
            <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: bg, color }}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[22px] font-bold leading-none" style={{ color }}>{value.toLocaleString()}</div>
              <div className="mt-1 text-xs text-[#7b8aaa]">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative w-full rounded-[18px] border border-white/80 bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,0,0,.06)] backdrop-blur-xl">
        <div className="flex w-full flex-wrap items-end gap-2.5">
          <div className="flex-1 min-w-0 space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Scan title</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9eadca]" />
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Search by title…"
                className="h-9 rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] pl-8 text-xs text-[#172b4d] placeholder:text-[#9eadca] focus:border-[#8f73dc] focus:ring-0"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Initiator</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9eadca]" />
              <Input
                value={initiatorFilter}
                onChange={(e) => setInitiatorFilter(e.target.value)}
                placeholder="Filter by initiator…"
                className="h-9 rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] pl-8 text-xs text-[#172b4d] placeholder:text-[#9eadca] focus:border-[#8f73dc] focus:ring-0"
              />
            </div>
          </div>

          <div className="shrink-0 space-y-1">
            <Label htmlFor="history-project-filter" className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">
              Project
            </Label>
            <Select
              value={projectFilter == null ? "all" : String(projectFilter)}
              onValueChange={(value) => setProjectFilter(value === "all" ? null : Number(value))}
              disabled={!activeSite || isLoadingProjects}
            >
              <SelectTrigger id="history-project-filter" className="h-9 min-w-[150px] rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] text-xs font-normal text-[#172b4d]">
                <SelectValue
                  placeholder={
                    !activeSite
                      ? "Select a site"
                      : isLoadingProjects
                        ? "Loading projects…"
                        : "All projects"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {siteProjects.length > 0 ? (
                  siteProjects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-projects" disabled>
                    No projects under this site
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {ruleOptions.length > 0 && (
            <div className="shrink-0 space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Rules</Label>
              <MultiSelectFilter
                label="Rules"
                options={ruleOptions}
                selected={rulesFilter}
                onChange={setRulesFilter}
              />
            </div>
          )}

          <div className="shrink-0 space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Date range</Label>
            <div className="flex items-center gap-1.5">
              <div
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#e8edf5] bg-[#f7f8fd] px-2.5 transition-colors hover:border-[#8f73dc]/60"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  try { input?.showPicker(); } catch { input?.focus(); }
                }}
                data-testid="date-from-box"
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9eadca]" />
                <span className="shrink-0 text-xs text-[#7b8aaa]">From</span>
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  aria-label="From date"
                  className="w-[118px] cursor-pointer bg-transparent text-xs text-[#172b4d] outline-none [color-scheme:light]"
                />
              </div>
              <div
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#e8edf5] bg-[#f7f8fd] px-2.5 transition-colors hover:border-[#8f73dc]/60"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  try { input?.showPicker(); } catch { input?.focus(); }
                }}
                data-testid="date-to-box"
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9eadca]" />
                <span className="shrink-0 text-xs text-[#7b8aaa]">To</span>
                <input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  aria-label="To date"
                  className="w-[118px] cursor-pointer bg-transparent text-xs text-[#172b4d] outline-none [color-scheme:light]"
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="shrink-0 space-y-1">
              <div className="h-4" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNameFilter("");
                  setInitiatorFilter("");
                  setDateFromFilter("");
                  setDateToFilter("");
                  setStatusFilter([]);
                   setRulesFilter([]);
                   setProjectFilter(null);
                }}
                className="h-9 rounded-[10px] border border-[#e0e4ef] bg-white px-3 text-xs text-[#667085] hover:bg-[#f7f8fd]"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#eef0f8] pt-3">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Status</span>
          <button
            type="button"
            onClick={() => setStatusFilter([])}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${statusFilter.length === 0 ? "border-[#6d48c7] bg-[#6d48c7] text-white" : "border-[#e0e4ef] bg-[#fafafa] text-[#667085] hover:border-[#bdb1ed]"}`}
          >
            All
          </button>
          {ALL_STATUSES.map((status) => {
            const config = HISTORY_STATUS_CONFIG[status.value];
            const active = statusFilter.includes(status.value);
            return (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter((current) => current.includes(status.value)
                  ? current.filter((value) => value !== status.value)
                  : [...current, status.value])}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={active
                  ? { borderColor: config?.dot, backgroundColor: config?.bg, color: config?.color }
                  : { borderColor: "#e0e4ef", backgroundColor: "#fafafa", color: "#667085" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config?.dot }} />
                {status.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 text-xs text-[#9eadca]">
            {isPolling && (
              <span
                className="flex items-center gap-1.5"
                title={lastRefreshedAt ? `Last updated at ${lastRefreshedAt.toLocaleTimeString()}` : undefined}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#43a047] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#43a047]" />
                </span>
                Live refresh{secondsSinceRefresh > 0 ? ` · ${secondsSinceRefresh}s ago` : ""}
              </span>
            )}
            <span>{filteredScans.length} result{filteredScans.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-[20px] border border-white/80 bg-white/75 shadow-[0_2px_16px_rgba(0,0,0,.07)] backdrop-blur-xl">
        <Table className="min-w-[1120px] table-fixed">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "29%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <TableHeader className="bg-[#f5f6fb]/80">
            <TableRow className="border-[#eef0f8] hover:bg-transparent">
              <TableHead className="w-10 pl-4 text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">
                <Checkbox
                  checked={allSelectableSelected}
                  data-state={someSelectableSelected && !allSelectableSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleSelectAll}
                  disabled={selectableIds.length === 0}
                  aria-label="Select all cancelled/failed scans"
                  title={selectableIds.length === 0 ? "No cancelled/failed scans to select" : "Select all cancelled/failed scans"}
                />
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Scan / Project</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Progress</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Duration</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Scan rules</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Issues</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Date</TableHead>
              <TableHead className="pr-4 text-right text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-14 text-center text-sm text-[#7b8aaa]"
                >
                  No scans found.{" "}
                  {hasActiveFilters
                    ? "Try adjusting your filters."
                    : "Start your first audit!"}
                </TableCell>
              </TableRow>
            ) : (
              visibleScans.map((scan) => {
                const s = scan as typeof scan & {
                  projectName?: string | null;
                  initiatorName?: string | null;
                  initiatorRole?: string | null;
                  options?: unknown | null;
                  pagesWithIssues?: number;
                };
                const historyScan = scan as typeof scan & ScanItem;
                const isRunning = scan.status === "running";
                const isPaused = (scan.status as string) === "paused";
                const isSelectable = scan.status === "cancelled" || scan.status === "failed";
                const isSelected = selectedIds.has(scan.id);
                const progress = getHistoryProgress(scan);
                const progressColor = isRunning
                  ? "#6d48c7"
                  : scan.status === "completed"
                    ? "#198f88"
                    : scan.status === "failed"
                      ? "#e53935"
                      : "#9eadca";
                return (
                    <TableRow key={scan.id} className={`border-[#f0f2f8] transition-colors hover:bg-[#6d48c7]/[.03] ${isSelected ? "bg-[#eee9ff]/55" : ""}`}>
                    <TableCell className="pl-4">
                      {isSelectable ? (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(scan.id)}
                          aria-label={`Select ${scan.name || `Scan #${scan.id}`}`}
                        />
                      ) : (
                        <span className="w-4 h-4 block" />
                      )}
                    </TableCell>
                    <TableCell className="min-w-0 max-w-[42rem] py-3 font-medium">
                      {s.projectName && (
                        <div className="mb-0.5 flex items-center gap-1">
                          <FolderOpen className="h-3 w-3 shrink-0 text-[#9eadca]" />
                          <span className="truncate text-[11px] text-[#9eadca]">
                            {s.projectName}
                          </span>
                        </div>
                      )}
                      <span
                        className="block min-w-0"
                        onMouseEnter={(e) => handleScanNameEnter(s as ScanItem, e)}
                        onMouseLeave={handleScanNameLeave}
                        onTouchStart={(e) => {
                          if (hoverTimer.current) clearTimeout(hoverTimer.current);
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (hoveredScan?.scan.id === scan.id) return;
                          e.preventDefault();
                          setHoveredScan({ scan: s as ScanItem, rect });
                        }}
                      >
                        <Link
                          href={`/scans/${scan.id}`}
                          className="block max-w-full break-words text-[13px] font-semibold text-[#172b4d] [overflow-wrap:anywhere] hover:text-[#6d48c7] hover:underline"
                          title={scan.name || `Scan #${scan.id}`}
                        >
                          {scan.name || `Scan #${scan.id}`}
                        </Link>
                      </span>
                      <div className="mt-0.5 text-[11px] text-[#9eadca]">
                        {s.initiatorName || s.initiatorRole ? (
                          <>
                            Initiated by {s.initiatorName || "Unknown"}
                            {s.initiatorRole ? ` · ${s.initiatorRole}` : ""}
                          </>
                        ) : (
                          "Initiated by —"
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3"><HistoryStatusBadge status={scan.status} /></TableCell>
                    <TableCell className="min-w-0 py-3 pr-4">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eeeef3]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progress}%`, backgroundColor: progressColor }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-[11px] text-[#7b8aaa]">{progress}%</span>
                      </div>
                      <div className={`mt-1 truncate whitespace-nowrap text-[10px] ${isRunning ? "font-semibold text-[#6d48c7]" : "text-[#9eadca]"}`}>
                        {scan.scannedUrls} / {scan.totalUrls} URLs
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#667085]">
                      <span>{formatElapsed(scan)}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <ScanRulesSummary options={historyScan.options} />
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={`font-mono text-[13px] font-bold ${(historyScan.pagesWithIssues ?? 0) > 0 ? "text-[#e84a3d]" : "text-[#b8c1cf]"}`}>
                        {(historyScan.pagesWithIssues ?? 0) > 0 ? `${(historyScan.pagesWithIssues ?? 0).toLocaleString()} pages` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#9eadca]">
                      {formatDate(scan.createdAt)}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        {isRunning && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg border border-[#ffe082] bg-[#fffde7] text-[#f57f17] hover:bg-[#fff8cc] hover:text-[#d46b08]"
                            title="Pause scan"
                            onClick={() => pauseScan.mutate(scan.id)}
                            disabled={pauseScan.isPending}
                          >
                            {pauseScan.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Pause className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {isPaused && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg border border-[#c8e6c9] bg-[#f1f8f1] text-[#2e7d32] hover:bg-[#e1f4e2] hover:text-[#1f6a2a]"
                            title="Resume scan"
                            onClick={() => resumeScan.mutate(scan.id)}
                            disabled={resumeScan.isPending}
                          >
                            {resumeScan.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        <Link href={`/scans/${scan.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg border border-[#d9d0f8] bg-[#eee9ff] text-[#6d48c7] hover:bg-[#e3dcff] hover:text-[#5c3bb5]"
                            title="View Detail"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                            className="h-7 w-7 rounded-lg border border-[#e0e4ef] bg-[#fafafa] text-[#667085] hover:bg-[#f0f2f8] hover:text-[#374151]"
                          title="Edit scan details"
                          onClick={() =>
                            setEditingScan({
                              id: scan.id,
                              name: scan.name,
                              projectId: s.projectId,
                              siteId: s.siteId,
                              initiatorName: s.initiatorName,
                              initiatorRole: s.initiatorRole,
                            })
                          }
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg border border-[#ffcdd2] bg-[#fff5f5] text-[#e53935] hover:bg-[#ffe7e7] hover:text-[#c62828]"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Scan</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this scan? This
                                action cannot be undone and will permanently
                                remove all associated issue data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(scan.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {filteredScans.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f8] px-4 py-3">
            <p className="text-xs text-[#9eadca]">
              Showing {((visibleHistoryPage - 1) * historyPageSize) + 1}–{Math.min(visibleHistoryPage * historyPageSize, filteredScans.length)} of {filteredScans.length} scans
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-[#9eadca]">Show pages</span>
                <Select
                  value={String(historyPageSize)}
                  onValueChange={(value) => setHistoryPageSize(Number(value))}
                >
                  <SelectTrigger className="h-8 w-[78px] rounded-lg border-[#e0e4ef] bg-white text-xs text-[#667085]" aria-label="Show pages">
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
                  className="h-8 w-8 rounded-lg border-[#e0e4ef] bg-white text-[#667085] hover:bg-[#f7f8fd]"
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={visibleHistoryPage === 1}
                  aria-label="Previous manual history page"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </Button>
                <span className="min-w-[72px] text-center text-xs text-[#7b8aaa]">
                  Page {visibleHistoryPage} of {totalHistoryPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg border-[#e0e4ef] bg-white text-[#667085] hover:bg-[#f7f8fd]"
                  onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                  disabled={visibleHistoryPage === totalHistoryPages}
                  aria-label="Next manual history page"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {hoveredScan && (
          <ScanPreviewPopup
            key={hoveredScan.scan.id}
            scan={hoveredScan.scan}
            anchorRect={hoveredScan.rect}
            onMouseEnter={cancelHideTimer}
            onMouseLeave={() => setHoveredScan(null)}
            onClose={() => setHoveredScan(null)}
          />
        )}
      </AnimatePresence>

      {/* Floating bulk-action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            key="bulk-bar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-2.5 shadow-2xl"
          >
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} scan{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {selectedIds.size} selected
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} scan{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} cancelled/failed scan{selectedIds.size === 1 ? "" : "s"} and all
              associated issue data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
fresh((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isPolling]);

  const deleteScan = useDeleteScan();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nameFilter, setNameFilter] = useState("");
  const [initiatorFilter, setInitiatorFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [rulesFilter, setRulesFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<number | null>(null);
  const [editingScan, setEditingScan] = useState<{
    id: number;
    name: string | null;
    projectId?: number | null;
    siteId?: number | null;
    initiatorName?: string | null;
    initiatorRole?: string | null;
  } | null>(null);

  const projectFilterParams = activeSite ? { siteId: activeSite.id } : undefined;
  const { data: siteProjects = [], isLoading: isLoadingProjects } = useListProjects(
    projectFilterParams,
    {
      query: {
        queryKey: getListProjectsQueryKey(projectFilterParams),
        enabled: activeSite != null,
      },
    },
  );

  const pauseScan = useMutation({
    mutationFn: async (scanId: number) => {
      const res = await fetch(`${BASE_URL}/api/scans/${scanId}/pause`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to pause");
    },
    onSuccess: () => {
      toast({ title: "Scan paused" });
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    },
    onError: () => toast({ title: "Could not pause scan", variant: "destructive" }),
  });

  const resumeScan = useMutation({
    mutationFn: async (scanId: number) => {
      const res = await fetch(`${BASE_URL}/api/scans/${scanId}/resume`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to resume");
    },
    onSuccess: () => {
      toast({ title: "Scan resumed" });
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    },
    onError: () => toast({ title: "Could not resume scan", variant: "destructive" }),
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch(`${BASE_URL}/api/scans/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      toast({ title: `${data.deleted} scan${data.deleted === 1 ? "" : "s"} deleted` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
    },
    onError: () => toast({ title: "Failed to delete scans", variant: "destructive" }),
  });

  // Hover preview state
  const [hoveredScan, setHoveredScan] = useState<{ scan: ScanItem; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScanNameEnter = useCallback((scan: ScanItem, e: React.MouseEvent<HTMLElement>) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimer.current = setTimeout(() => setHoveredScan({ scan, rect }), 320);
  }, []);

  const handleScanNameLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredScan(null), 120);
  }, []);

  const cancelHideTimer = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const ruleOptions = useMemo(() => {
    const ruleIds = new Set<string>();
    for (const scan of scans ?? []) {
      for (const ruleId of getScanRuleIds(scan as ScanItem)) {
        ruleIds.add(ruleId);
      }
    }
    return [
      { value: ALL_RULES_FILTER, label: "All rules" },
      ...Array.from(ruleIds).sort().map((ruleId) => ({ value: ruleId, label: ruleId })),
    ];
  }, [scans]);

  const filteredScans = useMemo(() => {
    return (scans ?? []).filter((scan) => {
      const s = scan as typeof scan & {
        projectName?: string | null;
        initiatorName?: string | null;
        initiatorRole?: string | null;
        siteId?: number | null;
      };
      // Manual Scan History intentionally excludes crawler-generated scans.
      if (scan.name?.startsWith("[Crawler]")) return false;
      // Keep site-specific history scoped to the selected site, but retain legacy
      // manual scans with no siteId so old history remains visible.
      if (activeSite && s.siteId != null && s.siteId !== activeSite.id) return false;
      const searchTarget = [
        scan.name,
        s.projectName,
        s.initiatorName,
        s.initiatorRole,
        `scan #${scan.id}`,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesName =
        !nameFilter || searchTarget.includes(nameFilter.toLowerCase());
      const matchesInitiator =
        !initiatorFilter ||
        (s.initiatorName ?? "")
          .toLowerCase()
          .includes(initiatorFilter.toLowerCase());
      const createdDate = new Date(scan.createdAt).toISOString().slice(0, 10);
      const matchesDateFrom = !dateFromFilter || createdDate >= dateFromFilter;
      const matchesDateTo = !dateToFilter || createdDate <= dateToFilter;
      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(scan.status);
      const scanRuleIds = getScanRuleIds(scan as ScanItem);
      const matchesRules =
        rulesFilter.length === 0 ||
        rulesFilter.some((ruleId) =>
          ruleId === ALL_RULES_FILTER
            ? scanRuleIds.length === 0
            : scanRuleIds.includes(ruleId),
        );
      const matchesProject =
        projectFilter == null || s.projectId === projectFilter;
      return (
        matchesName && matchesInitiator && matchesDateFrom && matchesDateTo &&
        matchesStatus && matchesRules && matchesProject
      );
    });
  }, [
    scans,
    nameFilter,
    initiatorFilter,
    dateFromFilter,
    dateToFilter,
    statusFilter,
    rulesFilter,
    projectFilter,
    activeSite,
  ]);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const totalHistoryPages = Math.max(1, Math.ceil(filteredScans.length / historyPageSize));
  const visibleHistoryPage = Math.min(historyPage, totalHistoryPages);
  const visibleScans = filteredScans.slice(
    (visibleHistoryPage - 1) * historyPageSize,
    visibleHistoryPage * historyPageSize,
  );

  useEffect(() => {
    setHistoryPage(1);
  }, [
    nameFilter,
    initiatorFilter,
    dateFromFilter,
    dateToFilter,
    statusFilter,
    rulesFilter,
    projectFilter,
    activeSite?.id,
    historyPageSize,
  ]);

  useEffect(() => {
    if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages);
  }, [historyPage, totalHistoryPages]);

  const hasActiveFilters =
    nameFilter || initiatorFilter || dateFromFilter || dateToFilter ||
    statusFilter.length > 0 || rulesFilter.length > 0 || projectFilter != null;

  const siteScopedScans = useMemo(
    () => (scans ?? []).filter((scan) => {
      const siteScan = scan as ScanItem;
      return (
        !scan.name?.startsWith("[Crawler]") &&
        (!activeSite || siteScan.siteId == null || siteScan.siteId === activeSite.id)
      );
    }),
    [scans, activeSite],
  );
  const activeScanCount = siteScopedScans.filter((scan) => ACTIVE_STATUSES.includes(scan.status)).length;
  const completedScanCount = siteScopedScans.filter((scan) => scan.status === "completed").length;
  const failedScanCount = siteScopedScans.filter((scan) => scan.status === "failed").length;

  const selectableIds = useMemo(
    () => filteredScans.filter((s) => s.status === "cancelled" || s.status === "failed").map((s) => s.id),
    [filteredScans],
  );
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelectableSelected = selectableIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear selection when visible scans change (filter change / refresh)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    nameFilter,
    initiatorFilter,
    dateFromFilter,
    dateToFilter,
    statusFilter,
    rulesFilter,
    projectFilter,
  ]);

  useEffect(() => {
    setProjectFilter(null);
  }, [activeSite?.id]);

  const handleDelete = (id: number) => {
    deleteScan.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Scan deleted" });
          queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
        },
        onError: () => {
          toast({
            title: "Error deleting scan",
            description: "Could not delete the scan",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="vision-page vision-scan-history relative min-h-full space-y-5 overflow-hidden p-4 sm:p-6">
      {editingScan && (
        <EditScanDialog
          scan={editingScan}
          open={true}
          onClose={() => setEditingScan(null)}
        />
      )}

      <div className="relative flex w-full flex-wrap items-start justify-between gap-4 pt-1">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#6d48c7]">
            <FileText className="h-4 w-4" />
            Scan history
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-[#172b4d]">Manual Scan History</h1>
          <p className="mt-1 text-xs text-[#7b8aaa]">
            {activeSite
              ? <>Showing scans for <span className="font-semibold text-foreground">{activeSite.name}</span>. Select a different site in the header to switch.</>
              : "View past manual page audits and reports."}{" "}
            <span className="text-[#9eadca]">· Auto-refreshes every 10s while active</span>
          </p>
        </div>
        <Link href="/new" className="shrink-0">
          <Button className="h-9 rounded-[10px] bg-[#6d48c7] px-5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(109,72,199,.2)] hover:bg-[#5c3bb5]">
            <span className="mr-1 text-base leading-none">+</span>
            New Scan
          </Button>
        </Link>
      </div>

      <div className="relative grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total scans", value: siteScopedScans.length, icon: FileText, color: "#6d48c7", bg: "#eee9ff" },
          { label: "Active now", value: activeScanCount, icon: Activity, color: "#198f88", bg: "#e4f7f0" },
          { label: "Completed", value: completedScanCount, icon: CheckCircle2, color: "#3778c8", bg: "#e3f0fb" },
          { label: "Failed scans", value: failedScanCount, icon: AlertTriangle, color: "#e84a3d", bg: "#fff0ed" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/75 px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,.06)] backdrop-blur-xl">
            <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: bg, color }}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[22px] font-bold leading-none" style={{ color }}>{value.toLocaleString()}</div>
              <div className="mt-1 text-xs text-[#7b8aaa]">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative w-full rounded-[18px] border border-white/80 bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,0,0,.06)] backdrop-blur-xl">
        <div className="flex w-full flex-wrap items-end gap-2.5">
          <div className="flex-1 min-w-0 space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Scan title</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9eadca]" />
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Search by title…"
                className="h-9 rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] pl-8 text-xs text-[#172b4d] placeholder:text-[#9eadca] focus:border-[#8f73dc] focus:ring-0"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Initiator</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9eadca]" />
              <Input
                value={initiatorFilter}
                onChange={(e) => setInitiatorFilter(e.target.value)}
                placeholder="Filter by initiator…"
                className="h-9 rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] pl-8 text-xs text-[#172b4d] placeholder:text-[#9eadca] focus:border-[#8f73dc] focus:ring-0"
              />
            </div>
          </div>

          <div className="shrink-0 space-y-1">
            <Label htmlFor="history-project-filter" className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">
              Project
            </Label>
            <Select
              value={projectFilter == null ? "all" : String(projectFilter)}
              onValueChange={(value) => setProjectFilter(value === "all" ? null : Number(value))}
              disabled={!activeSite || isLoadingProjects}
            >
              <SelectTrigger id="history-project-filter" className="h-9 min-w-[150px] rounded-[10px] border-[#e8edf5] bg-[#f7f8fd] text-xs font-normal text-[#172b4d]">
                <SelectValue
                  placeholder={
                    !activeSite
                      ? "Select a site"
                      : isLoadingProjects
                        ? "Loading projects…"
                        : "All projects"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {siteProjects.length > 0 ? (
                  siteProjects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-projects" disabled>
                    No projects under this site
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {ruleOptions.length > 0 && (
            <div className="shrink-0 space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Rules</Label>
              <MultiSelectFilter
                label="Rules"
                options={ruleOptions}
                selected={rulesFilter}
                onChange={setRulesFilter}
              />
            </div>
          )}

          <div className="shrink-0 space-y-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Date range</Label>
            <div className="flex items-center gap-1.5">
              <div
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#e8edf5] bg-[#f7f8fd] px-2.5 transition-colors hover:border-[#8f73dc]/60"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  try { input?.showPicker(); } catch { input?.focus(); }
                }}
                data-testid="date-from-box"
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9eadca]" />
                <span className="shrink-0 text-xs text-[#7b8aaa]">From</span>
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  aria-label="From date"
                  className="w-[118px] cursor-pointer bg-transparent text-xs text-[#172b4d] outline-none [color-scheme:light]"
                />
              </div>
              <div
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#e8edf5] bg-[#f7f8fd] px-2.5 transition-colors hover:border-[#8f73dc]/60"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  try { input?.showPicker(); } catch { input?.focus(); }
                }}
                data-testid="date-to-box"
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9eadca]" />
                <span className="shrink-0 text-xs text-[#7b8aaa]">To</span>
                <input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  aria-label="To date"
                  className="w-[118px] cursor-pointer bg-transparent text-xs text-[#172b4d] outline-none [color-scheme:light]"
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="shrink-0 space-y-1">
              <div className="h-4" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNameFilter("");
                  setInitiatorFilter("");
                  setDateFromFilter("");
                  setDateToFilter("");
                  setStatusFilter([]);
                   setRulesFilter([]);
                   setProjectFilter(null);
                }}
                className="h-9 rounded-[10px] border border-[#e0e4ef] bg-white px-3 text-xs text-[#667085] hover:bg-[#f7f8fd]"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#eef0f8] pt-3">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[#9eadca]">Status</span>
          <button
            type="button"
            onClick={() => setStatusFilter([])}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${statusFilter.length === 0 ? "border-[#6d48c7] bg-[#6d48c7] text-white" : "border-[#e0e4ef] bg-[#fafafa] text-[#667085] hover:border-[#bdb1ed]"}`}
          >
            All
          </button>
          {ALL_STATUSES.map((status) => {
            const config = HISTORY_STATUS_CONFIG[status.value];
            const active = statusFilter.includes(status.value);
            return (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter((current) => current.includes(status.value)
                  ? current.filter((value) => value !== status.value)
                  : [...current, status.value])}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={active
                  ? { borderColor: config?.dot, backgroundColor: config?.bg, color: config?.color }
                  : { borderColor: "#e0e4ef", backgroundColor: "#fafafa", color: "#667085" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config?.dot }} />
                {status.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 text-xs text-[#9eadca]">
            {isPolling && (
              <span
                className="flex items-center gap-1.5"
                title={lastRefreshedAt ? `Last updated at ${lastRefreshedAt.toLocaleTimeString()}` : undefined}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#43a047] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#43a047]" />
                </span>
                Live refresh{secondsSinceRefresh > 0 ? ` · ${secondsSinceRefresh}s ago` : ""}
              </span>
            )}
            <span>{filteredScans.length} result{filteredScans.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-[20px] border border-white/80 bg-white/75 shadow-[0_2px_16px_rgba(0,0,0,.07)] backdrop-blur-xl">
        <Table className="min-w-[1120px] table-fixed">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "29%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <TableHeader className="bg-[#f5f6fb]/80">
            <TableRow className="border-[#eef0f8] hover:bg-transparent">
              <TableHead className="w-10 pl-4 text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">
                <Checkbox
                  checked={allSelectableSelected}
                  data-state={someSelectableSelected && !allSelectableSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleSelectAll}
                  disabled={selectableIds.length === 0}
                  aria-label="Select all cancelled/failed scans"
                  title={selectableIds.length === 0 ? "No cancelled/failed scans to select" : "Select all cancelled/failed scans"}
                />
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Scan / Project</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Progress</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Duration</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Scan rules</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Issues</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Date</TableHead>
              <TableHead className="pr-4 text-right text-[11px] font-bold uppercase tracking-[.04em] text-[#7b8aaa]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-14 text-center text-sm text-[#7b8aaa]"
                >
                  No scans found.{" "}
                  {hasActiveFilters
                    ? "Try adjusting your filters."
                    : "Start your first audit!"}
                </TableCell>
              </TableRow>
            ) : (
              visibleScans.map((scan) => {
                const s = scan as typeof scan & {
                  projectName?: string | null;
                  initiatorName?: string | null;
                  initiatorRole?: string | null;
                  options?: unknown | null;
                  pagesWithIssues?: number;
                };
                const historyScan = scan as typeof scan & ScanItem;
                const isRunning = scan.status === "running";
                const isPaused = (scan.status as string) === "paused";
                const isSelectable = scan.status === "cancelled" || scan.status === "failed";
                const isSelected = selectedIds.has(scan.id);
                const progress = getHistoryProgress(scan);
                const progressColor = isRunning
                  ? "#6d48c7"
                  : scan.status === "completed"
                    ? "#198f88"
                    : scan.status === "failed"
                      ? "#e53935"
                      : "#9eadca";
                return (
                    <TableRow key={scan.id} className={`border-[#f0f2f8] transition-colors hover:bg-[#6d48c7]/[.03] ${isSelected ? "bg-[#eee9ff]/55" : ""}`}>
                    <TableCell className="pl-4">
                      {isSelectable ? (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(scan.id)}
                          aria-label={`Select ${scan.name || `Scan #${scan.id}`}`}
                        />
                      ) : (
                        <span className="w-4 h-4 block" />
                      )}
                    </TableCell>
                    <TableCell className="min-w-0 max-w-[42rem] py-3 font-medium">
                      {s.projectName && (
                        <div className="mb-0.5 flex items-center gap-1">
                          <FolderOpen className="h-3 w-3 shrink-0 text-[#9eadca]" />
                          <span className="truncate text-[11px] text-[#9eadca]">
                            {s.projectName}
                          </span>
                        </div>
                      )}
                      <span
                        className="block min-w-0"
                        onMouseEnter={(e) => handleScanNameEnter(s as ScanItem, e)}
                        onMouseLeave={handleScanNameLeave}
                        onTouchStart={(e) => {
                          if (hoverTimer.current) clearTimeout(hoverTimer.current);
                          const rect = e.currentTarget.getBoundingClientRect();
                          if (hoveredScan?.scan.id === scan.id) return;
                          e.preventDefault();
                          setHoveredScan({ scan: s as ScanItem, rect });
                        }}
                      >
                        <Link
                          href={`/scans/${scan.id}`}
                          className="block max-w-full break-words text-[13px] font-semibold text-[#172b4d] [overflow-wrap:anywhere] hover:text-[#6d48c7] hover:underline"
                          title={scan.name || `Scan #${scan.id}`}
                        >
                          {scan.name || `Scan #${scan.id}`}
                        </Link>
                      </span>
                      <div className="mt-0.5 text-[11px] text-[#9eadca]">
                        {s.initiatorName || s.initiatorRole ? (
                          <>
                            Initiated by {s.initiatorName || "Unknown"}
                            {s.initiatorRole ? ` · ${s.initiatorRole}` : ""}
                          </>
                        ) : (
                          "Initiated by —"
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3"><HistoryStatusBadge status={scan.status} /></TableCell>
                    <TableCell className="min-w-0 py-3 pr-4">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eeeef3]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${progress}%`, backgroundColor: progressColor }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-[11px] text-[#7b8aaa]">{progress}%</span>
                      </div>
                      <div className={`mt-1 truncate whitespace-nowrap text-[10px] ${isRunning ? "font-semibold text-[#6d48c7]" : "text-[#9eadca]"}`}>
                        {scan.scannedUrls} / {scan.totalUrls} URLs
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#667085]">
                      <span>{formatElapsed(scan)}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span
                        className="text-sm"
                        title={getScanRuleIds(historyScan).join(", ") || "This scan ran all rules"}
                      >
                        {getScanRuleIds(historyScan).length === 0 ? (
                          <Badge
                            variant="outline"
                            className="border-[#d9d0f8] bg-[#eee9ff] px-1.5 py-0 text-[10px] leading-4 font-semibold text-[#6d48c7] whitespace-nowrap shadow-none"
                          >
                            All rules
                          </Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {getScanRuleIds(historyScan).map((ruleId) => (
                              <Badge
                                key={ruleId}
                                variant="outline"
                                className="border-[#d9d0f8] bg-[#eee9ff] px-1.5 py-0 font-mono text-[10px] leading-4 font-semibold text-[#6d48c7] whitespace-nowrap shadow-none"
                              >
                                {ruleId}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className={`font-mono text-[13px] font-bold ${(historyScan.pagesWithIssues ?? 0) > 0 ? "text-[#e84a3d]" : "text-[#b8c1cf]"}`}>
                        {(historyScan.pagesWithIssues ?? 0) > 0 ? `${(historyScan.pagesWithIssues ?? 0).toLocaleString()} pages` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-[#9eadca]">
                      {formatDate(scan.createdAt)}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        {isRunning && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg border border-[#ffe082] bg-[#fffde7] text-[#f57f17] hover:bg-[#fff8cc] hover:text-[#d46b08]"
                            title="Pause scan"
                            onClick={() => pauseScan.mutate(scan.id)}
                            disabled={pauseScan.isPending}
                          >
                            {pauseScan.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Pause className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        {isPaused && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg border border-[#c8e6c9] bg-[#f1f8f1] text-[#2e7d32] hover:bg-[#e1f4e2] hover:text-[#1f6a2a]"
                            title="Resume scan"
                            onClick={() => resumeScan.mutate(scan.id)}
                            disabled={resumeScan.isPending}
                          >
                            {resumeScan.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                        <Link href={`/scans/${scan.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg border border-[#d9d0f8] bg-[#eee9ff] text-[#6d48c7] hover:bg-[#e3dcff] hover:text-[#5c3bb5]"
                            title="View Detail"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                            className="h-7 w-7 rounded-lg border border-[#e0e4ef] bg-[#fafafa] text-[#667085] hover:bg-[#f0f2f8] hover:text-[#374151]"
                          title="Edit scan details"
                          onClick={() =>
                            setEditingScan({
                              id: scan.id,
                              name: scan.name,
                              projectId: s.projectId,
                              siteId: s.siteId,
                              initiatorName: s.initiatorName,
                              initiatorRole: s.initiatorRole,
                            })
                          }
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg border border-[#ffcdd2] bg-[#fff5f5] text-[#e53935] hover:bg-[#ffe7e7] hover:text-[#c62828]"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Scan</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this scan? This
                                action cannot be undone and will permanently
                                remove all associated issue data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(scan.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {filteredScans.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f8] px-4 py-3">
            <p className="text-xs text-[#9eadca]">
              Showing {((visibleHistoryPage - 1) * historyPageSize) + 1}–{Math.min(visibleHistoryPage * historyPageSize, filteredScans.length)} of {filteredScans.length} scans
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-[#9eadca]">Show pages</span>
                <Select
                  value={String(historyPageSize)}
                  onValueChange={(value) => setHistoryPageSize(Number(value))}
                >
                  <SelectTrigger className="h-8 w-[78px] rounded-lg border-[#e0e4ef] bg-white text-xs text-[#667085]" aria-label="Show pages">
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
                  className="h-8 w-8 rounded-lg border-[#e0e4ef] bg-white text-[#667085] hover:bg-[#f7f8fd]"
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={visibleHistoryPage === 1}
                  aria-label="Previous manual history page"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </Button>
                <span className="min-w-[72px] text-center text-xs text-[#7b8aaa]">
                  Page {visibleHistoryPage} of {totalHistoryPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg border-[#e0e4ef] bg-white text-[#667085] hover:bg-[#f7f8fd]"
                  onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                  disabled={visibleHistoryPage === totalHistoryPages}
                  aria-label="Next manual history page"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {hoveredScan && (
          <ScanPreviewPopup
            key={hoveredScan.scan.id}
            scan={hoveredScan.scan}
            anchorRect={hoveredScan.rect}
            onMouseEnter={cancelHideTimer}
            onMouseLeave={() => setHoveredScan(null)}
            onClose={() => setHoveredScan(null)}
          />
        )}
      </AnimatePresence>

      {/* Floating bulk-action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            key="bulk-bar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-2.5 shadow-2xl"
          >
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} scan{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs gap-1.5"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {selectedIds.size} selected
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} scan{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} cancelled/failed scan{selectedIds.size === 1 ? "" : "s"} and all
              associated issue data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
