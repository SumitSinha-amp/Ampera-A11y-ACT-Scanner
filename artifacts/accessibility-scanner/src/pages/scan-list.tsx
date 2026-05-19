import { useMemo, useState, useEffect } from "react";
import {
  useListScans,
  useDeleteScan,
  useUpdateScan,
  getListScansQueryKey,
  getGetScanQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Link } from "wouter";
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
    initiatorName?: string | null;
    initiatorRole?: string | null;
  };
  open: boolean;
  onClose: () => void;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type AdminUser = { id: number; fullName: string; username: string; groups: { id: number; name: string }[] };

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateScan = useUpdateScan();
  const [name, setName] = useState(scan.name ?? "");
  const [initiatorName, setInitiatorName] = useState(scan.initiatorName ?? "");
  const [initiatorRole, setInitiatorRole] = useState(scan.initiatorRole ?? "");
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);

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

export default function ScanList() {
  const { data: scans, isLoading } = useListScans();
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

  const formatElapsed = (scan: {
    createdAt: string;
    completedAt?: string | null;
    status: string;
  }) => {
    const start = new Date(scan.createdAt).getTime();
    const end = scan.completedAt
      ? new Date(scan.completedAt).getTime()
      : Date.now();
    const diff = Math.max(0, end - start);
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "< 1 min";
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  };

  const formatEta = (scan: {
    createdAt: string;
    scannedUrls: number;
    totalUrls: number;
    status: string;
  }) => {
    if (scan.status !== "running" && scan.status !== "pending") return "—";
    if (scan.scannedUrls <= 0 || scan.totalUrls <= 0) return "ETA unknown";
    const elapsed = Date.now() - new Date(scan.createdAt).getTime();
    const avgMs = elapsed / scan.scannedUrls;
    const remaining = Math.max(0, scan.totalUrls - scan.scannedUrls);
    const etaMins = Math.round((avgMs * remaining) / 60000);
    if (etaMins < 1) return "ETA < 1 min";
    if (etaMins < 60) return `ETA ~${etaMins} min`;
    const hrs = Math.floor(etaMins / 60);
    const mins = etaMins % 60;
    return `ETA ~${hrs}h ${mins}m`;
  };

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
      };
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
  }, [scans, nameFilter, initiatorFilter, dateFromFilter, dateToFilter, statusFilter, projectFilter]);

  const hasActiveFilters =
    nameFilter || initiatorFilter || dateFromFilter || dateToFilter ||
    statusFilter.length > 0 || projectFilter.length > 0;

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
          <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
          <p className="text-muted-foreground mt-2">
            View past audits and reports.
          </p>
        </div>
        <Link href="/new">
          <Button>New Scan</Button>
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
            <div className="flex items-center gap-1.5 border rounded-md px-2.5 h-9 bg-background">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                type="date"
                value={dateFromFilter}
                onChange={(e) => setDateFromFilter(e.target.value)}
                aria-label="From date"
                className="bg-transparent text-sm outline-none w-[118px] text-foreground [color-scheme:dark]"
              />
              <span className="text-muted-foreground text-xs">–</span>
              <input
                type="date"
                value={dateToFilter}
                onChange={(e) => setDateToFilter(e.target.value)}
                aria-label="To date"
                className="bg-transparent text-sm outline-none w-[118px] text-foreground [color-scheme:dark]"
              />
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

      {hasActiveFilters && (
        <p className="text-sm text-muted-foreground -mt-2 px-1">
          Showing {filteredScans.length} of {(scans ?? []).length} scans
        </p>
      )}

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
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
                  colSpan={7}
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
                const isPaused = scan.status === "paused";
                return (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium">
                      {s.projectName && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            {s.projectName}
                          </span>
                        </div>
                      )}
                      <Link
                        href={`/scans/${scan.id}`}
                        className="hover:underline text-primary"
                      >
                        {scan.name || `Scan #${scan.id}`}
                      </Link>
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
    </div>
  );
}
