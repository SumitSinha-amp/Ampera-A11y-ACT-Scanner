import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE } from "@/pages/qa-shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, Map, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

type SitemapFilter = "all" | "in-sitemap" | "not-in-sitemap";

interface SitemapPageRow {
  url: string;
  title: string | null;
  inSitemap: boolean;
  httpStatus: number | null;
  wordCount: number | null;
  scannedAt: string | null;
}

interface SitemapStats {
  total: number;
  inSitemap: number;
  notInSitemap: number;
}

interface SitemapData {
  total: number;
  page: number;
  limit: number;
  items: SitemapPageRow[];
  stats: SitemapStats;
}

function SitemapCoverageContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<SitemapFilter>("all");
  const limit = 50;

  const { data, isLoading } = useQuery<SitemapData>({
    queryKey: ["qa-sitemap", scanId, page, filter],
    queryFn: async () => {
      const r = await fetch(
        `${QA_BASE}/api/scans/${scanId}/qa/sitemap?page=${page}&limit=${limit}&filter=${filter}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to load sitemap data");
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data?.stats ?? { total: 0, inSitemap: 0, notInSitemap: 0 };
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const pct = stats.total > 0 ? Math.round((stats.inSitemap / stats.total) * 100) : 0;

  const filterTabs: { label: string; value: SitemapFilter; count: number }[] = [
    { label: "All pages", value: "all", count: stats.total },
    { label: "In sitemap", value: "in-sitemap", count: stats.inSitemap },
    { label: "Not in sitemap", value: "not-in-sitemap", count: stats.notInSitemap },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Total pages</p>
            <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">In sitemap</p>
            <p className="text-2xl font-bold text-green-600">{stats.inSitemap.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Sitemap coverage</p>
            <p className="text-2xl font-bold">{pct}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filterTabs.map((tab) => (
          <Button
            key={tab.value}
            variant={filter === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilter(tab.value); setPage(1); }}
          >
            {tab.label}
            <Badge variant="secondary" className="ml-1.5 text-xs">{tab.count}</Badge>
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Map className="w-10 h-10" />
            <p className="font-medium text-foreground">No pages found</p>
            <p className="text-sm text-center max-w-sm">
              {filter === "in-sitemap"
                ? "No crawled pages were found in the sitemap. Check that useSitemap is enabled for this site."
                : "No pages matching the current filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">URL</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Title</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Sitemap</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Words</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2.5 px-4 max-w-[260px]">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs font-mono truncate block"
                          title={row.url}
                        >
                          {row.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </a>
                      </td>
                      <td className="py-2.5 px-4 max-w-[200px]">
                        <span className="truncate block text-xs" title={row.title ?? ""}>
                          {row.title || <span className="italic text-muted-foreground">(no title)</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {row.inSitemap ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="text-xs">Yes</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span className="text-xs">No</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {row.httpStatus ? (
                          <Badge
                            variant={row.httpStatus >= 400 ? "destructive" : "outline"}
                            className="text-xs"
                          >
                            {row.httpStatus}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground">
                        {row.wordCount?.toLocaleString() ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function QASitemapPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sitemap coverage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pages discovered during the crawl compared to pages declared in the XML sitemap.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Site:</span>
        <QASiteSelector value={selectedSiteId} onChange={setSite} sites={sites} loading={isLoading} />
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
              Select a site with a completed crawler scan to view sitemap coverage.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SitemapCoverageContent scanId={selected.scanId} />
      )}
    </div>
  );
}
