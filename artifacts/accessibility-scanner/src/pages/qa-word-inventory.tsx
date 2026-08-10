import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE } from "@/pages/qa-shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, BookOpen } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  QAListToolbar,
  QAPagination,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
} from "@/pages/qa-shared";

interface WordRow {
  word: string;
  pageCount: number;
  totalCount: number;
}

interface WordInventoryData {
  total: number;
  page: number;
  limit: number;
  items: WordRow[];
}

function WordInventoryContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [limit, setLimit] = useState(100);

  const { data, isLoading } = useQuery<WordInventoryData>({
    queryKey: ["qa-word-inventory", scanId, page, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/word-inventory?${params}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load word inventory");
      return r.json();
    },
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const maxCount = items[0]?.totalCount ?? 1;

  if (!isLoading && total === 0 && !debouncedSearch) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <BookOpen className="w-10 h-10" />
          <p className="font-medium text-foreground">No word inventory yet</p>
          <p className="text-sm text-center max-w-sm">
            Word inventory is extracted after the crawler scan completes. Run a crawler scan with this site to populate the inventory.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search words…"
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No words matching "{debouncedSearch}"
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{total.toLocaleString()}</span> unique word{total !== 1 ? "s" : ""}
            {debouncedSearch ? ` matching "${debouncedSearch}"` : ""}
          </p>

          <div className={QA_TABLE_SHELL_CLASS}>
              <table className={`w-full text-sm ${QA_TABLE_CLASS}`}>
                <thead>
                  <tr className="border-b">
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-10">#</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Word</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Frequency</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">Pages</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-40">Relative frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, i) => (
                    <tr key={row.word} className="border-b transition-colors hover:bg-muted/50 last:border-0">
                      <td className="p-2 align-middle text-xs text-muted-foreground">
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="p-2 align-middle font-mono font-medium">{row.word}</td>
                      <td className="p-2 align-middle tabular-nums">{row.totalCount.toLocaleString()}</td>
                      <td className="p-2 align-middle text-muted-foreground tabular-nums">{row.pageCount.toLocaleString()}</td>
                      <td className="p-2 align-middle">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.round((row.totalCount / maxCount) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {Math.round((row.totalCount / maxCount) * 100)}%
                          </span>
                        </div>
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

export default function QAWordInventoryPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Word inventory</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Words extracted from page body text across the site, sorted by frequency. Stop words are excluded.
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
              Select a site with a completed crawler scan to view the word inventory.
            </p>
          </CardContent>
        </Card>
      ) : (
        <WordInventoryContent scanId={selected.scanId} />
      )}
    </div>
  );
}
