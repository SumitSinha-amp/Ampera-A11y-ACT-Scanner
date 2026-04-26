import { useMemo, useState } from "react";
import { useListScans, useDeleteScan, useUpdateScan, getListScansQueryKey, getGetScanQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, FileText, Loader2, Search, X, CalendarDays, FolderOpen, Pencil } from "lucide-react";
import { getStatusBadge } from "@/lib/status-badge";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface EditScanDialogProps {
  scan: { id: number; name: string | null; initiatorName?: string | null; initiatorRole?: string | null };
  open: boolean;
  onClose: () => void;
}

function EditScanDialog({ scan, open, onClose }: EditScanDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateScan = useUpdateScan();
  const [name, setName] = useState(scan.name ?? "");
  const [initiatorName, setInitiatorName] = useState(scan.initiatorName ?? "");
  const [initiatorRole, setInitiatorRole] = useState(scan.initiatorRole ?? "");

  const handleSave = () => {
    updateScan.mutate(
      { id: scan.id, data: { name: name.trim() || undefined, initiatorName: initiatorName.trim() || null, initiatorRole: initiatorRole.trim() || null } },
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
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Scan Details</DialogTitle>
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
          <div className="space-y-1.5">
            <Label htmlFor="edit-initiator-name">Scan Initiator</Label>
            <Input
              id="edit-initiator-name"
              value={initiatorName}
              onChange={(e) => setInitiatorName(e.target.value)}
              placeholder="e.g. Jane Smith"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-initiator-role">Initiator Role</Label>
            <Input
              id="edit-initiator-role"
              value={initiatorRole}
              onChange={(e) => setInitiatorRole(e.target.value)}
              placeholder="e.g. QA Engineer"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateScan.isPending}>
            {updateScan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
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
  const [editingScan, setEditingScan] = useState<{ id: number; name: string | null; initiatorName?: string | null; initiatorRole?: string | null } | null>(null);

  const formatElapsed = (scan: { createdAt: string; completedAt?: string | null; status: string }) => {
    const start = new Date(scan.createdAt).getTime();
    const end = scan.completedAt ? new Date(scan.completedAt).getTime() : Date.now();
    const diff = Math.max(0, end - start);
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "< 1 min";
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  };

  const formatEta = (scan: { createdAt: string; scannedUrls: number; totalUrls: number; status: string }) => {
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

  const filteredScans = useMemo(() => {
    return (scans ?? []).filter((scan) => {
      const s = scan as typeof scan & { projectName?: string | null; initiatorName?: string | null; initiatorRole?: string | null };
      const searchTarget = [scan.name, s.projectName, s.initiatorName, s.initiatorRole, `scan #${scan.id}`].filter(Boolean).join(" ").toLowerCase();
      const matchesName = !nameFilter || searchTarget.includes(nameFilter.toLowerCase());
      const matchesInitiator =
        !initiatorFilter ||
        (s.initiatorName ?? "").toLowerCase().includes(initiatorFilter.toLowerCase());
      const createdDate = new Date(scan.createdAt).toISOString().slice(0, 10);
      const matchesDateFrom = !dateFromFilter || createdDate >= dateFromFilter;
      const matchesDateTo = !dateToFilter || createdDate <= dateToFilter;
      return matchesName && matchesInitiator && matchesDateFrom && matchesDateTo;
    });
  }, [scans, nameFilter, initiatorFilter, dateFromFilter, dateToFilter]);

  const handleDelete = (id: number) => {
    deleteScan.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Scan deleted" });
        queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
      },
      onError: () => {
        toast({ title: "Error deleting scan", description: "Could not delete the scan", variant: "destructive" });
      }
    });
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
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
          <p className="text-muted-foreground mt-2">View past audits and reports.</p>
        </div>
        <Link href="/">
          <Button>New Scan</Button>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-3 p-4 border rounded-lg bg-card">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by scan name"
            className="pl-9"
          />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={initiatorFilter}
            onChange={(e) => setInitiatorFilter(e.target.value)}
            placeholder="Filter by initiator name"
            className="pl-9"
          />
        </div>
        <div className="space-y-1 w-full md:w-44 shrink-0">
          <Label className="text-xs text-muted-foreground">From</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              className="pl-9"
              aria-label="From date"
            />
          </div>
        </div>
        <div className="space-y-1 w-full md:w-44 shrink-0">
          <Label className="text-xs text-muted-foreground">To</Label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="pl-9"
              aria-label="To date"
            />
          </div>
        </div>
        {(nameFilter || dateFromFilter || dateToFilter) && (
          <Button variant="ghost" onClick={() => { setNameFilter(""); setInitiatorFilter(""); setDateFromFilter(""); setDateToFilter(""); }}>
            <X className="w-4 h-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

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
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No scans found. Start your first audit!
                </TableCell>
              </TableRow>
            ) : (
              filteredScans.map((scan) => {
                const s = scan as typeof scan & { projectName?: string | null; initiatorName?: string | null; initiatorRole?: string | null };
                return (
                <TableRow key={scan.id}>
                  <TableCell className="font-medium">
                    {s.projectName && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{s.projectName}</span>
                      </div>
                    )}
                    <Link href={`/scans/${scan.id}`} className="hover:underline text-primary">
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
                    <span>{scan.completedAt ? `Time taken ${formatElapsed(scan)}` : `Elapsed ${formatElapsed(scan)}`}</span>
                  </div>
                </TableCell>
                  <TableCell>
                    {scan.totalIssues > 0 ? (
                      <span className="font-mono">
                        {scan.totalIssues} <span className="text-chart-1 font-bold">({scan.criticalIssues})</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(scan.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/scans/${scan.id}`}>
                        <Button variant="ghost" size="icon" title="View Detail">
                          <FileText className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit scan details"
                        onClick={() => setEditingScan({ id: scan.id, name: scan.name, initiatorName: s.initiatorName, initiatorRole: s.initiatorRole })}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Scan</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this scan? This action cannot be undone and will permanently remove all associated issue data.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(scan.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
