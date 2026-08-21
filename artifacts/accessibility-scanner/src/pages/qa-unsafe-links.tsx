import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useQASites,
  useQASelectedSite,
  QA_BASE,
  QAListToolbar,
  QAPagination,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
  QA_URL_CLASS,
  QA_SECONDARY_URL_CLASS,
} from "@/pages/qa-shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, ShieldAlert, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

interface UnsafeLinkRow {
  sourceUrl: string;
  destUrl: string;
  anchorText: string | null;
  linkType: string;
  httpStatus: number | null;
}

interface UnsafeLinksData {
  total: number;
  page: number;
  limit: number;
  items: UnsafeLinkRow[];
}

function UnsafeLinksTable({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  const { data, isLoading } = useQuery<UnsafeLinksData>({
    queryKey: ["qa-unsafe-links", scanId, page, limit, search, type],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (type !== "all") params.set("type", type);
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/unsafe-links?${params}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load unsafe links");
      return r.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <ShieldAlert className="w-10 h-10 text-green-500" />
          <p className="font-medium text-foreground">No unsafe links found</p>
          <p className="text-sm text-center max-w-sm">
            All links on this site use HTTPS or are non-navigable links.
          </p>
        </CardContent>
      </Card>
    );
  }

  const statusBadge = (status: number | null) => {
    if (status === null) return <Badge variant="outline" className="text-xs text-muted-foreground">unchecked</Badge>;
    if (status >= 400) return <Badge variant="destructive" className="text-xs">{status}</Badge>;
    if (status >= 300) return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    return <Badge variant="outline" className="text-xs text-green-600">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search source or destination URL…"
        filters={[{
          label: "Type",
          value: type,
          onChange: (value) => { setType(value); setPage(1); },
          options: [
            { value: "all", label: "All types" },
            { value: "internal", label: "Internal" },
            { value: "external", label: "External" },
          ],
        }]}
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
      />
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{total.toLocaleString()}</span> HTTP link{total !== 1 ? "s" : ""} found on HTTPS pages
      </p>

      <div className={QA_TABLE_SHELL_CLASS}>
          <table className={`w-full text-sm ${QA_TABLE_CLASS}`}>
            <thead>
              <tr className="border-b">
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Source page</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">HTTP destination</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Anchor text</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Type</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i} className="border-b transition-colors hover:bg-muted/50 last:border-0">
                  <td className="p-2 align-middle max-w-[220px]">
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${QA_SECONDARY_URL_CLASS} truncate block`}
                      title={row.sourceUrl}
                    >
                      {row.sourceUrl.replace(/^https?:\/\/[^/]+/, "")}
                    </a>
                  </td>
                  <td className="p-2 align-middle max-w-[240px]">
                    <div className="flex items-center gap-1">
                      <a
                        href={row.destUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${QA_SECONDARY_URL_CLASS} text-amber-600 dark:text-amber-400 truncate`}
                        title={row.destUrl}
                      >
                        {row.destUrl.length > 60 ? row.destUrl.slice(0, 60) + "…" : row.destUrl}
                      </a>
                      <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                    </div>
                  </td>
                  <td className="p-2 align-middle max-w-[160px]">
                    <span className="truncate block text-xs text-muted-foreground" title={row.anchorText ?? ""}>
                      {row.anchorText || <span className="italic">(no text)</span>}
                    </span>
                  </td>
                  <td className="p-2 align-middle">
                    <Badge variant="secondary" className="text-xs capitalize">{row.linkType}</Badge>
                  </td>
                  <td className="p-2 align-middle">{statusBadge(row.httpStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {totalPages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
    </div>
  );
}

export default function QAUnsafeLinksPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unsafe links</h1>
        <p className="text-muted-foreground text-sm mt-1">
          HTTP links found on HTTPS pages — potential mixed-content or security downgrade issues.
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
              Select a site with a completed crawler scan to view unsafe links.
            </p>
          </CardContent>
        </Card>
      ) : (
        <UnsafeLinksTable scanId={selected.scanId} />
      )}
    </div>
  );
}
