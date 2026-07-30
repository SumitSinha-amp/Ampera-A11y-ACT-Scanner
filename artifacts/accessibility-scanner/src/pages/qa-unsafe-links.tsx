import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE } from "@/pages/qa-shared";
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
  const limit = 50;

  const { data, isLoading } = useQuery<UnsafeLinksData>({
    queryKey: ["qa-unsafe-links", scanId, page],
    queryFn: async () => {
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/unsafe-links?page=${page}&limit=${limit}`, {
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
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{total.toLocaleString()}</span> HTTP link{total !== 1 ? "s" : ""} found on HTTPS pages
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Source page</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">HTTP destination</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Anchor text</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="py-2.5 px-4 max-w-[220px]">
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs font-mono truncate block"
                      title={row.sourceUrl}
                    >
                      {row.sourceUrl.replace(/^https?:\/\/[^/]+/, "")}
                    </a>
                  </td>
                  <td className="py-2.5 px-4 max-w-[240px]">
                    <div className="flex items-center gap-1">
                      <a
                        href={row.destUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-600 hover:underline text-xs font-mono truncate"
                        title={row.destUrl}
                      >
                        {row.destUrl.length > 60 ? row.destUrl.slice(0, 60) + "…" : row.destUrl}
                      </a>
                      <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                    </div>
                  </td>
                  <td className="py-2.5 px-4 max-w-[160px]">
                    <span className="truncate block text-xs text-muted-foreground" title={row.anchorText ?? ""}>
                      {row.anchorText || <span className="italic">(no text)</span>}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <Badge variant="secondary" className="text-xs capitalize">{row.linkType}</Badge>
                  </td>
                  <td className="py-2.5 px-4">{statusBadge(row.httpStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
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
    </div>
  );
}

export default function QAUnsafeLinksPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unsafe links</h1>
        <p className="text-muted-foreground text-sm mt-1">
          HTTP links found on HTTPS pages — potential mixed-content or security downgrade issues.
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
