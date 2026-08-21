import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchQAJson,
  qaErrorMessage,
  QA_BASE,
  QAListToolbar,
  QAPageShell,
  QAPagination,
  QA_TABLE_CLASS,
  useQASelectedSite,
  useQASites,
  useQAPageGroup,
} from "@/pages/qa-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

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

function WordInventoryContent({ scanId, siteName }: { scanId: number; siteName: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [limit, setLimit] = useState(100);
  const pageGroupId = useQAPageGroup();

  const { data, isLoading, isError, error, refetch } = useQuery<WordInventoryData>({
    queryKey: ["qa-word-inventory", scanId, page, limit, debouncedSearch, pageGroupId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (pageGroupId !== null) params.set("page_group", String(pageGroupId));
      return fetchQAJson<WordInventoryData>(`${QA_BASE}/api/scans/${scanId}/qa/word-inventory?${params}`);
    },
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);
  const maxCount = items[0]?.totalCount ?? 1;
  const topWords = debouncedSearch ? [] : items.slice(0, 6);

  return (
    <section className="rounded-2xl border border-white/90 bg-white/82 p-5 shadow-[0_4px_22px_rgba(0,0,0,.07)] backdrop-blur-xl">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#172b4d]">Word Inventory</h2>
          <p className="mt-0.5 text-xs text-[#7b8aaa]">
            Top keywords across all scanned pages{siteName ? ` for ${siteName}` : ""}.
          </p>
        </div>
        <QAListToolbar
          compact
          search={search}
          onSearch={(value) => { setSearch(value); setPage(1); }}
          searchPlaceholder="Search word…"
          limit={limit}
          onLimitChange={(value) => { setLimit(value); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <XCircle className="h-9 w-9 text-destructive" />
          <div>
            <p className="font-medium text-foreground">Unable to load word inventory</p>
            <p className="mt-1 text-sm text-muted-foreground">{qaErrorMessage(error)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </div>
      ) : total === 0 && !debouncedSearch ? (
        <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
          <BookOpen className="h-10 w-10" />
          <p className="font-medium text-foreground">No word inventory yet</p>
          <p className="max-w-sm text-center text-sm">
            Word inventory is extracted after a crawler scan completes. Run a crawler scan with this site to populate the inventory.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No words matching &ldquo;{debouncedSearch}&rdquo;
        </div>
      ) : (
        <div className="space-y-4">
          {topWords.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {topWords.map((word) => (
                <button
                  key={word.word}
                  type="button"
                  onClick={() => { setSearch(word.word); setPage(1); }}
                  className="rounded-xl border border-primary/20 bg-primary/[.06] px-3.5 py-2 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="text-[13px] font-bold text-primary">{word.word}</span>
                  <span className="ml-2 text-[11px] text-[#9eadca]">×{word.totalCount.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className={`w-full ${QA_TABLE_CLASS} text-[13px]`}>
              <thead>
                <tr className="bg-[#f5f6fb]">
                  <th className="h-9 px-3 text-left text-[10px] font-bold uppercase tracking-[.04em] text-[#9eadca]">Keyword</th>
                  <th className="h-9 px-3 text-left text-[10px] font-bold uppercase tracking-[.04em] text-[#9eadca]">Occurrences</th>
                  <th className="h-9 px-3 text-left text-[10px] font-bold uppercase tracking-[.04em] text-[#9eadca]">Pages</th>
                  <th className="h-9 px-3 text-left text-[10px] font-bold uppercase tracking-[.04em] text-[#9eadca]">Relative frequency</th>
                </tr>
              </thead>
              <tbody>
                {items.map((word) => {
                  const ratio = Math.round((word.totalCount / maxCount) * 100);
                  return (
                    <tr key={word.word} className="border-t border-[#f0f2f8] transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-bold text-[#172b4d]">{word.word}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-primary">{word.totalCount.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-[#7b8aaa]">{word.pageCount.toLocaleString()} {word.pageCount === 1 ? "page" : "pages"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-[160px] items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0f2f8]">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs font-medium text-[#7b8aaa]">{ratio}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
        </div>
      )}
    </section>
  );
}

export default function QAWordInventoryPage() {
  const { data: sites = [], isLoading, isError, error, refetch } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="word-inventory"
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card className="rounded-2xl border border-white/90 bg-white/82 shadow-[0_4px_22px_rgba(0,0,0,.07)] backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <BookOpen className="h-10 w-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="max-w-sm text-center text-sm">
              Select a site with a completed crawler scan to view the word inventory.
            </p>
          </CardContent>
        </Card>
      ) : (
        <WordInventoryContent scanId={selected.scanId} siteName={selected.siteName} />
      )}
    </QAPageShell>
  );
}