import { useListScans, useDeleteScan, getListScansQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, FileText, Loader2 } from "lucide-react";
import { getStatusBadge } from "@/lib/status-badge";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
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

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Issues (Critical)</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No scans found. Start your first audit!
                </TableCell>
              </TableRow>
            ) : (
              scans?.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell className="font-medium">
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
