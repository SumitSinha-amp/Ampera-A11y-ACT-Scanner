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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, Type } from "lucide-react";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE } from "@/pages/qa-shared";
import { exportCSV, truncate } from "@/pages/scan-qa";

interface LinkTextRow {
  anchorText: string | null;
  count: number;
  uniqueUrls: number;
  uniquePages: number;
}

function LinkTextContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["qa-link-text", scanId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/link-text?${params}`, {
        credentials: "include",
      });
      return r.json() as Promise<{ data: LinkTextRow[]; total: number; page: number; limit: number }>;
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
          <Type className="w-10 h-10" />
          <p className="font-medium text-foreground">No anchor text data found</p>
          <p className="text-sm text-center max-w-sm">
            No links with anchor text were found for this scan.
          </p>
        </CardContent>
      </Card>
    );
  }

  const exportData = rows.map((r) => ({
    "Anchor Text": r.anchorText ?? "(empty)",
    "Usage Count": r.count,
    "Unique URLs": r.uniqueUrls,
    "Source Pages": r.uniquePages,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} unique anchor text{total !== 1 ? "s" : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCSV(exportData, `link-text-scan-${scanId}.csv`)}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anchor text</TableHead>
              <TableHead className="text-right w-24">Uses</TableHead>
              <TableHead className="text-right w-28">Unique URLs</TableHead>
              <TableHead className="text-right w-28">Pages</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-sm">
                  {row.anchorText ? (
                    <span>"{truncate(row.anchorText, 100)}"</span>
                  ) : (
                    <span className="text-muted-foreground italic">(empty)</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{row.count.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{row.uniqueUrls.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{row.uniquePages.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span className="text-sm text-muted-foreground py-2">Page {page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function QALinkTextPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Link text</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Anchor text used across all links, ranked by frequency. Useful for identifying non-descriptive link text like "click here".
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
            <Type className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
          </CardContent>
        </Card>
      ) : (
        <LinkTextContent scanId={selected.scanId} />
      )}
    </div>
  );
}
