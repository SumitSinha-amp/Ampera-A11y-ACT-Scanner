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
  getGetScanQueryKey,
  type ListScansParams,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useSite } from "@/contexts/site";
import { ProjectSelector } from "@/components/project-selector";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/utils";
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
    siteId?: number | null;
    initiatorName?: string | null;
    initiatorRole?: string | null;
  };
  open: boolean;
  onClose: () => void;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

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
  initiatorName?: string | null;
  initiatorRole?: string | null;
};

function formatElapsed(scan: { createdAt: string; completedAt?: string | null; status: string }) {
  const start = new Date(scan.createdAt).getTime();
  const end = scan.completedAt ? new Date(scan.completedAt).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
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
        <div className="space-y-0.5">
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

  useEffect(() => {
    if (!open) return;
    setName(scan.name ?? "");
    setProjectId(scan.projectId ?? null);
    setSiteId(scan.siteId ?? null);
    setInitiatorName(scan.initiatorName ?? "");
    setInitiatorRole(scan.initiatorRole ?? "");
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
            <Label htmlFor="edit-scan-name">Scan Name</Label>
            <Input
              id="edit-scan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter scan name"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <ProjectSelector
                value={projectId}
                onChange={(nextProjectId) => setProjectId(nextProjectId)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-scan-site">Site</Label>
              <Select
                value={siteId === null ? "none" : String(siteId)}
                onValueChange={(value) => setSiteId(value === "none" ? null : Number(value))}
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
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [editingScan, setEditingScan] = useState<{
    id: number;
    name: string | null;
    projectId?: number | null;
    siteId?: number | null;
    initiatorName?: string | null;
    initiatorRole?: string | null;
  } | null>(null);

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

  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const scan of scans ?? []) {
      const s = scan as typeof scan & { projectName?: string | null };
      if (s.projectName) names.add(s.projectName);
    }
    return Array.from(names).sort().map((n) => ({ value: n, label: n }));
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
      const matchesProject =
        projectFilter.length === 0 ||
        (s.projectName ? projectFilter.includes(s.projectName) : false);
      return (
        matchesName && matchesInitiator && matchesDateFrom && matchesDateTo &&
        matchesStatus && matchesProject
      );
    });
  }, [scans, nameFilter, initiatorFilter, dateFromFilter, dateToFilter, statusFilter, projectFilter, activeSite]);

  const hasActiveFilters =
    nameFilter || initiatorFilter || dateFromFilter || dateToFilter ||
    statusFilter.length > 0 || projectFilter.length > 0;

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
  }, [nameFilter, initiatorFilter, dateFromFilter, dateToFilter, statusFilter, projectFilter]);

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
    <div className="space-y-6">
      {editingScan && (
        <EditScanDialog
          scan={editingScan}
          open={true}
          onClose={() => setEditingScan(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manual Scan History</h1>
          <p className="text-muted-foreground mt-2">
            {activeSite
              ? <>Showing scans for <span className="font-semibold text-foreground">{activeSite.name}</span>. Select a different site in the header to switch.</>
              : "View past manual page audits and reports."}
          </p>
        </div>
        <Link href="/new">
          <Button>Manual Page Check</Button>
        </Link>
      </div>

      <div className="p-3 border rounded-lg bg-card">
        <div className="flex items-end gap-2 w-full">
          <div className="flex-1 min-w-0 space-y-1">
            <Label className="text-xs text-muted-foreground">Scan Name</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Filter by scan name…"
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <Label className="text-xs text-muted-foreground">Initiator</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={initiatorFilter}
                onChange={(e) => setInitiatorFilter(e.target.value)}
                placeholder="Filter by initiator…"
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          <div className="shrink-0 space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <MultiSelectFilter
              label="Status"
              options={ALL_STATUSES}
              selected={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          {projectOptions.length > 0 && (
            <div className="shrink-0 space-y-1">
              <Label className="text-xs text-muted-foreground">Project</Label>
              <MultiSelectFilter
                label="Project"
                options={projectOptions}
                selected={projectFilter}
                onChange={setProjectFilter}
              />
            </div>
          )}

          <div className="shrink-0 space-y-1">
            <Label className="text-xs text-muted-foreground">Date Range</Label>
            <div className="flex items-center gap-1.5">
              <div
                className="flex items-center gap-1.5 border rounded-md px-2.5 h-9 bg-background cursor-pointer hover:border-primary/50 transition-colors"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  try { input?.showPicker(); } catch { input?.focus(); }
                }}
                data-testid="date-from-box"
              >
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground shrink-0">From</span>
                <input
                  type="date"
                  value={dateFromFilter}
                  onChange={(e) => setDateFromFilter(e.target.value)}
                  aria-label="From date"
                  className="bg-transparent text-sm outline-none w-[118px] text-foreground [color-scheme:dark] cursor-pointer"
                />
              </div>
              <div
                className="flex items-center gap-1.5 border rounded-md px-2.5 h-9 bg-background cursor-pointer hover:border-primary/50 transition-colors"
                onClick={(e) => {
                  const input = e.currentTarget.querySelector("input");
                  try { input?.showPicker(); } catch { input?.focus(); }
                }}
                data-testid="date-to-box"
              >
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground shrink-0">To</span>
                <input
                  type="date"
                  value={dateToFilter}
                  onChange={(e) => setDateToFilter(e.target.value)}
                  aria-label="To date"
                  className="bg-transparent text-sm outline-none w-[118px] text-foreground [color-scheme:dark] cursor-pointer"
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
                  setProjectFilter([]);
                }}
                className="h-9 text-muted-foreground"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between -mt-2 px-1 min-h-[20px]">
        {hasActiveFilters ? (
          <p className="text-sm text-muted-foreground">
            Showing {filteredScans.length} of {(scans ?? []).length} scans
          </p>
        ) : <span />}

        <AnimatePresence>
          {isPolling && (
            <motion.div
              key="live-badge"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500"
              title={lastRefreshedAt ? `Last updated at ${lastRefreshedAt.toLocaleTimeString()}` : undefined}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Auto-refreshing
              {secondsSinceRefresh > 0 && (
                <span className="text-emerald-500/70 font-normal">
                  · updated {secondsSinceRefresh}s ago
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-3">
                <Checkbox
                  checked={allSelectableSelected}
                  data-state={someSelectableSelected && !allSelectableSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleSelectAll}
                  disabled={selectableIds.length === 0}
                  aria-label="Select all cancelled/failed scans"
                  title={selectableIds.length === 0 ? "No cancelled/failed scans to select" : "Select all cancelled/failed scans"}
                />
              </TableHead>
              <TableHead>Project / Scan Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>ETA / Elapsed</TableHead>
              <TableHead>Issues (Critical)</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredScans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground"
                >
                  No scans found.{" "}
                  {hasActiveFilters
                    ? "Try adjusting your filters."
                    : "Start your first audit!"}
                </TableCell>
              </TableRow>
            ) : (
              filteredScans.map((scan) => {
                const s = scan as typeof scan & {
                  projectName?: string | null;
                  initiatorName?: string | null;
                  initiatorRole?: string | null;
                };
                const isRunning = scan.status === "running";
                const isPaused = (scan.status as string) === "paused";
                const isSelectable = scan.status === "cancelled" || scan.status === "failed";
                const isSelected = selectedIds.has(scan.id);
                return (
                  <TableRow key={scan.id} className={isSelected ? "bg-muted/40" : undefined}>
                    <TableCell className="pl-3">
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
                    <TableCell className="font-medium">
                      {s.projectName && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            {s.projectName}
                          </span>
                        </div>
                      )}
                      <span
                        className="inline-block cursor-pointer"
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
                          className="hover:underline text-primary"
                        >
                          {scan.name || `Scan #${scan.id}`}
                        </Link>
                      </span>
                      <div className="text-xs text-muted-foreground mt-0.5">
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
                    <TableCell>{getStatusBadge(scan.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {scan.scannedUrls} / {scan.totalUrls} URLs
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{formatEta(scan)}</span>
                        <span>
                          {scan.completedAt
                            ? `Time taken ${formatElapsed(scan)}`
                            : `Elapsed ${formatElapsed(scan)}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {scan.totalIssues > 0 ? (
                        <span className="font-mono">
                          {scan.totalIssues}{" "}
                          <span className="text-chart-1 font-bold">
                            ({scan.criticalIssues})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(scan.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {isRunning && (
                          <Button
                            variant="ghost"
                            size="icon"
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
                            title="View Detail"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
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
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
