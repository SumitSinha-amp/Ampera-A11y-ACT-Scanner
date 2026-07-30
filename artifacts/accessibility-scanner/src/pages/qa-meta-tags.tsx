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
import { Input } from "@/components/ui/input";
import { Download, ExternalLink, Loader2, Search, Tag } from "lucide-react";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE } from "@/pages/qa-shared";
import { exportCSV, truncate } from "@/pages/scan-qa";

interface QAPage {
  id: number;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  httpStatus: number | null;
  wordCount: number | null;
  inlinkCount: number;
}

function qualityBadge(value: string | null, minLen: number, maxLen: number) {
  if (!value || value.trim() === "") {
    return <Badge variant="destructive" className="text-xs">Missing</Badge>;
  }
  if (value.length < minLen) {
    return <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">Too short</Badge>;
  }
  if (value.length > maxLen) {
    return <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">Too long</Badge>;
  }
  return <Badge variant="outline" className="text-xs text-green-600 border-green-600">OK</Badge>;
}

function MetaTagsContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["qa-pages", scanId, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/pages?${params}`, {
        credentials: "include",
      });
      return r.json() as Promise<{ data: QAPage[]; total: number; page: number; limit: number }>;
    },
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  const missingTitle = rows.filter((r) => !r.title).length;
  const missingDesc = rows.filter((r) => !r.metaDescription).length;
  const missingH1 = rows.filter((r) => !r.h1).length;

  const exportData = rows.map((r) => ({
    URL: r.url,
    Title: r.title ?? "",
    "Title Length": r.title?.length ?? 0,
    "Meta Description": r.metaDescription ?? "",
    "Description Length": r.metaDescription?.length ?? 0,
    H1: r.h1 ?? "",
    "Word Count": r.wordCount ?? "",
    "Inlinks": r.inlinkCount,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rows.length && !search) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Tag className="w-10 h-10" />
          <p className="font-medium text-foreground">No page data found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!search && rows.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          {missingTitle > 0 && (
            <Badge variant="destructive">{missingTitle} missing title{missingTitle !== 1 ? "s" : ""}</Badge>
          )}
          {missingDesc > 0 && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              {missingDesc} missing description{missingDesc !== 1 ? "s" : ""}
            </Badge>
          )}
          {missingH1 > 0 && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-600">
              {missingH1} missing H1{missingH1 !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search URL or title…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch}>
          <Search className="w-4 h-4" />
        </Button>
        <div className="flex-1 text-right">
          <Button variant="outline" size="sm" onClick={() => exportCSV(exportData, `meta-tags-scan-${scanId}.csv`)}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} page{total !== 1 ? "s" : ""}
      </p>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead className="w-20">Title</TableHead>
              <TableHead className="w-20">Desc</TableHead>
              <TableHead className="w-16">H1</TableHead>
              <TableHead className="text-right w-20">Words</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="min-w-0">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm font-mono flex items-center gap-1 max-w-xs truncate"
                  >
                    {truncate(row.url, 60)}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  {row.title && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                      {truncate(row.title, 60)}
                      <span className="text-muted-foreground/60 ml-1">({row.title.length})</span>
                    </p>
                  )}
                  {row.metaDescription && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5 truncate max-w-xs">
                      {truncate(row.metaDescription, 80)}
                      <span className="ml-1">({row.metaDescription.length})</span>
                    </p>
                  )}
                </TableCell>
                <TableCell>{qualityBadge(row.title, 10, 70)}</TableCell>
                <TableCell>{qualityBadge(row.metaDescription, 50, 160)}</TableCell>
                <TableCell>
                  {!row.h1 ? (
                    <Badge variant="destructive" className="text-xs">Missing</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-600">OK</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {row.wordCount?.toLocaleString() ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-muted-foreground py-2">Page {page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

export default function QAMetaTagsPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meta tags</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Title, meta description, and H1 for every crawled page. Green = OK, yellow = too short/long, red = missing.
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
            <Tag className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
          </CardContent>
        </Card>
      ) : (
        <MetaTagsContent scanId={selected.scanId} />
      )}
    </div>
  );
}
