import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Globe, XCircle } from "lucide-react";
import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";
import {
  useQASites,
  useQASelectedSite,
  QA_BASE,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
  QAPageShell,
} from "@/pages/qa-shared";
import "./qa-pages.css";

interface CrawlHistoryRow {
  crawlerSessionId: number;
  scanId: number | null;
  crawledAt: string | null;
  startedAt: string | null;
  pageCount: number;
  totalDiscovered: number;
  brokenLinksCount: number;
  status: string;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed"
      ? "default"
      : status === "scanning" || status === "crawling"
      ? "secondary"
      : status === "failed" || status === "error"
      ? "destructive"
      : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export default function QACheckHistoryPage() {
  const { data: sites = [], isLoading: sitesLoading } = useQASites();
  const [selectedSiteId] = useQASelectedSite(sites);

  const { data: history = [], isLoading: historyLoading } = useQuery<CrawlHistoryRow[]>({
    queryKey: ["qa-check-history", selectedSiteId],
    queryFn: async () => {
      if (!selectedSiteId) return [];
      const r = await fetch(`${QA_BASE}/api/qa/sites/${selectedSiteId}/history`, {
        credentials: "include",
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedSiteId,
    staleTime: 30_000,
  });

  if (sitesLoading) {
    return <PageLoadingSkeleton variant="table" message="Loading QA history…" />;
  }

  return (
    <QAPageShell activeTab="overview">
      <div className="qa-history space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Check history</h1>
        <p className="text-muted-foreground text-sm mt-1">
          All completed crawler scans for the selected site, newest first.
        </p>
      </div>

      {!selectedSiteId ? (
        <Card className="qa-panel">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Globe className="w-10 h-10" />
            <p className="font-medium text-foreground">No site selected</p>
            <p className="text-sm">Select a site from the header to view its check history.</p>
          </CardContent>
        </Card>
      ) : historyLoading ? (
        <div className="qa-panel space-y-3" aria-busy="true" aria-label="Loading history">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full rounded-lg" />
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : history.length === 0 ? (
        <Card className="qa-panel">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Globe className="w-10 h-10" />
            <p className="font-medium text-foreground">No crawl history found</p>
            <p className="text-sm">No completed crawler scans linked to this site yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className={`${QA_TABLE_SHELL_CLASS} qa-table-shell`}>
          <Table className={QA_TABLE_CLASS}>
            <TableHeader>
              <TableRow>
                <TableHead>Crawl date</TableHead>
                <TableHead className="text-right">Pages discovered</TableHead>
                <TableHead className="text-right">Pages scanned</TableHead>
                <TableHead className="text-right">Broken links</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((row) => (
                <TableRow key={row.crawlerSessionId}>
                  <TableCell className="font-medium">
                    {formatDate(row.crawledAt)}
                  </TableCell>
                  <TableCell className="text-right">{row.totalDiscovered.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.pageCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {row.brokenLinksCount > 0 ? (
                      <span className="flex items-center justify-end gap-1 text-destructive font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        {row.brokenLinksCount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {row.scanId && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" asChild>
                          <Link href={`/scans/${row.scanId}`}>
                            <ExternalLink className="w-3 h-3" />
                            View scan
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </div>
    </QAPageShell>
  );
}
