import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Download, ExternalLink, Loader2, Star } from "lucide-react";
import {
  useQASites,
  useQASelectedSite,
  useQAPageGroup,
  QA_BASE,
  QAListToolbar,
  QAPagination,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
  QA_URL_CLASS,
} from "@/pages/qa-shared";
import { exportCSV, truncate, httpStatusBadge } from "@/pages/scan-qa";

interface QAPage {
  id: number;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  httpStatus: number | null;
  wordCount: number | null;
  inlinkCount: number;
  crawlDepth: number | null;
}

function PriorityPagesContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const pageGroupId = useQAPageGroup();

  const { data, isLoading } = useQuery({
    queryKey: ["qa-priority-pages", scanId, page, limit, search, pageGroupId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (pageGroupId !== null) params.set("page_group", String(pageGroupId));
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/priority-pages?${params}`, {
        credentials: "include",
      });
      return r.json() as Promise<{ data: QAPage[]; total: number; page: number; limit: number }>;
    },
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Star className="w-10 h-10" />
          <p className="font-medium text-foreground">No page data found</p>
          <p className="text-sm text-center max-w-sm">
            Priority pages are populated after a full crawler scan.
          </p>
        </CardContent>
      </Card>
    );
  }

  const exportData = rows.map((r) => ({
    URL: r.url,
    Title: r.title ?? "",
    H1: r.h1 ?? "",
    "Inlink Count": r.inlinkCount,
    "Word Count": r.wordCount ?? "",
    "Crawl Depth": r.crawlDepth ?? "",
    "HTTP Status": r.httpStatus ?? "",
  }));

  return (
    <div className="space-y-3">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search URL or title…"
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `priority-pages-scan-${scanId}.csv`)}
      />
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} page{total !== 1 ? "s" : ""}, ranked by inlinks
      </p>

      <div className={QA_TABLE_SHELL_CLASS}>
        <Table className={QA_TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Page</TableHead>
              <TableHead className="text-right w-20">Inlinks</TableHead>
              <TableHead className="text-right w-20 hidden sm:table-cell">Words</TableHead>
              <TableHead className="w-20 hidden md:table-cell">Status</TableHead>
              <TableHead className="text-right w-16 hidden md:table-cell">Depth</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const rank = (page - 1) * limit + i + 1;
              return (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground text-sm font-mono">{rank}</TableCell>
                  <TableCell>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={QA_URL_CLASS}
                    >
                      {truncate(row.url, 70)}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                    {row.title && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {truncate(row.title, 80)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={row.inlinkCount > 10 ? "default" : "outline"}
                      className="font-mono"
                    >
                      {row.inlinkCount.toLocaleString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                    {row.wordCount?.toLocaleString() ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {httpStatusBadge(row.httpStatus)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground hidden md:table-cell">
                    {row.crawlDepth ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
    </div>
  );
}

export default function QAPriorityPagesPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Priority pages</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pages ranked by inlink count — the more pages link to a page, the higher its priority. Focus accessibility and content fixes here first.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Star className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view priority pages.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PriorityPagesContent scanId={selected.scanId} />
      )}
    </div>
  );
}
