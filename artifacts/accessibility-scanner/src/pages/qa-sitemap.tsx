import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const pageGroupId = useQAPageGroup();

  const { data, isLoading } = useQuery<SitemapData>({
    queryKey: ["qa-sitemap", scanId, page, limit, filter, search, pageGroupId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), filter, search });
      if (pageGroupId !== null) params.set("page_group", String(pageGroupId));
      const r = await fetch(
        `${QA_BASE}/api/scans/${scanId}/qa/sitemap?${params}`,
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

      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search URL or page title…"
        filters={[{
          label: "Sitemap",
          value: filter,
          onChange: (value) => { setFilter(value as SitemapFilter); setPage(1); },
          options: filterTabs.map((tab) => ({
            value: tab.value,
            label: `${tab.label} (${tab.count.toLocaleString()})`,
          })),
        }]}
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
      />

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
          <div className={QA_TABLE_SHELL_CLASS}>
            <table className={`w-full text-sm ${QA_TABLE_CLASS}`}>
                <thead>
                  <tr className="border-b">
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">URL</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Title</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Sitemap</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Status</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Words</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => (
                    <tr key={i} className="border-b transition-colors hover:bg-muted/50 last:border-0">
                      <td className="p-2 align-middle max-w-[260px]">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${QA_URL_CLASS} text-xs truncate block`}
                          title={row.url}
                        >
                          {row.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </a>
                      </td>
                      <td className="p-2 align-middle max-w-[200px]">
                        <span className="truncate block text-xs" title={row.title ?? ""}>
                          {row.title || <span className="italic text-muted-foreground">(no title)</span>}
                        </span>
                      </td>
                      <td className="p-2 align-middle">
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
                      <td className="p-2 align-middle">
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
                      <td className="p-2 align-middle text-xs text-muted-foreground">
                        {row.wordCount?.toLocaleString() ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>

          {totalPages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}

export default function QASitemapPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sitemap coverage</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pages discovered during the crawl compared to pages declared in the XML sitemap.
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
