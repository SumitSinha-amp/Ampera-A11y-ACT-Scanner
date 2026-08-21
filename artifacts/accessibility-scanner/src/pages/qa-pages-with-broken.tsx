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
import { CheckCircle2, Download, ExternalLink, Loader2, XCircle } from "lucide-react";
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
import { exportCSV, truncate } from "@/pages/scan-qa";

interface PageWithBroken {
  sourceUrl: string;
  brokenCount: number;
  brokenUrls: string[] | null;
}

function PagesWithBrokenContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const pageGroupId = useQAPageGroup();

  const { data, isLoading } = useQuery({
    queryKey: ["qa-pages-with-broken", scanId, page, limit, search, pageGroupId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (pageGroupId !== null) params.set("page_group", String(pageGroupId));
      const r = await fetch(
        `${QA_BASE}/api/scans/${scanId}/qa/pages-with-broken?${params}`,
        { credentials: "include" }
      );
      return r.json() as Promise<{
        data: PageWithBroken[];
        total: number;
        page: number;
        limit: number;
      }>;
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
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <p className="font-medium text-green-600">No pages with broken links found</p>
          <p className="text-sm text-center max-w-sm">
            All checked links on every page responded successfully.
          </p>
        </CardContent>
      </Card>
    );
  }

  const exportData = rows.map((r) => ({
    "Source Page": r.sourceUrl,
    "Broken Link Count": r.brokenCount,
    "Broken URLs": (r.brokenUrls ?? []).slice(0, 5).join("; "),
  }));

  const toggleExpand = (url: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search source page URL…"
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `pages-with-broken-scan-${scanId}.csv`)}
      />
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} page{total !== 1 ? "s" : ""} with broken links
      </p>

       <div className={QA_TABLE_SHELL_CLASS}>
         <Table className={QA_TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead>Source page</TableHead>
              <TableHead className="text-right w-32">Broken links</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const isExpanded = expanded.has(row.sourceUrl);
              const brokenUrls = row.brokenUrls ?? [];
              return (
                <>
                  <TableRow key={i} className={isExpanded ? "border-b-0" : undefined}>
                    <TableCell>
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={QA_URL_CLASS}
                      >
                        {truncate(row.sourceUrl, 80)}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive" className="font-mono">
                        <XCircle className="w-3 h-3 mr-1" />
                        {row.brokenCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {brokenUrls.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => toggleExpand(row.sourceUrl)}
                        >
                          {isExpanded ? "Hide" : "Show"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && brokenUrls.length > 0 && (
                    <TableRow key={`${i}-expanded`}>
                      <TableCell colSpan={3} className="bg-muted/30 pt-0 pb-3">
                        <div className="space-y-1 pl-2">
                          <p className="text-xs text-muted-foreground font-medium mb-2">
                            Broken links on this page:
                          </p>
                          {brokenUrls.slice(0, 10).map((url, j) => (
                            <div key={j} className="flex items-center gap-2">
                              <XCircle className="w-3 h-3 text-destructive shrink-0" />
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1 break-all"
                              >
                                {truncate(url, 90)}
                                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                              </a>
                            </div>
                          ))}
                          {brokenUrls.length > 10 && (
                            <p className="text-xs text-muted-foreground pl-5">
                              +{brokenUrls.length - 10} more broken links
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
    </div>
  );
}

export default function QAPagesWithBrokenPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pages with broken links</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pages that contain at least one broken outbound link, ordered by number of broken links.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <XCircle className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view pages with broken links.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PagesWithBrokenContent scanId={selected.scanId} />
      )}
    </div>
  );
}
