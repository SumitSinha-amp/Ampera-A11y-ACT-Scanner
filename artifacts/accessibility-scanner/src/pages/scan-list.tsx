import { useMemo, useState } from "react";
import { useListScans, useDeleteScan, getListScansQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, FileText, Loader2, Search, X, CalendarDays, FolderOpen } from "lucide-react";
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

export default function ScanList() {
  const { data: scans, isLoading } = useListScans();
  const deleteScan = useDeleteScan();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nameFilter, setNameFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  const filteredScans = useMemo(() => {
    return (scans ?? []).filter((scan) => {
      const s = scan as typeof scan & { projectName?: string | null };
      const searchTarget = [scan.name, s.projectName, `scan #${scan.id}`].filter(Boolean).join(" ").toLowerCase();
      const matchesName = !nameFilter || searchTarget.includes(nameFilter.toLowerCase());
      const createdDate = new Date(scan.createdAt).toISOString().slice(0, 10);
      const matchesDateFrom = !dateFromFilter || createdDate >= dateFromFilter;
      const matchesDateTo = !dateToFilter || createdDate <= dateToFilter;
      return matchesName && matchesDateFrom && matchesDateTo;
    });
  }, [scans, nameFilter, dateFromFilter, dateToFilter]);

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
          <Button variant="ghost" onClick={() => { setNameFilter(""); setDateFromFilter(""); setDateToFilter(""); }}>
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
                const s = scan as typeof scan & { projectName?: string | null };
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
                  </TableCell>
                  <TableCell>{getStatusBadge(scan.status)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {scan.scannedUrls} / {scan.totalUrls} URLs
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
