import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import {
  fetchQAJson,
  qaErrorMessage,
  QAListToolbar,
  QAPagination,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
  QA_URL_CLASS,
  QA_SECONDARY_URL_CLASS,
} from "@/pages/qa-shared";

export interface QAStatus {
  running: boolean;
  totalPages: number;
  totalLinks: number;
  checked: number;
  broken: number;
  redirects: number;
  unchecked: number;
}

export interface BrokenLink {
  destUrl: string;
  httpStatus: number | null;
  linkType: string;
  checkedAt: string | null;
  sourceCount: number;
  sources: string[];
  anchorTexts: string[];
}

export interface Redirect {
  destUrl: string;
  redirectTo: string | null;
  httpStatus: number | null;
  linkType: string;
  sourceCount: number;
  sources: string[];
}

export interface QAPage {
  id: number;
  scanId: number;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  httpStatus: number | null;
  wordCount: number | null;
  inlinkCount: number;
  lastModified: string | null;
  scannedAt: string | null;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type QATab = "overview" | "broken-links" | "redirects" | "pages";

function QAQueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <p className="text-lg font-medium text-destructive">Unable to load QA data</p>
      <p className="max-w-md text-sm">{qaErrorMessage(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" /> Try again
      </Button>
    </div>
  );
}

export function httpStatusBadge(status: number | null) {
  if (status === null) return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  if (status === 0) return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Timeout</Badge>;
  if (status >= 500) return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{status}</Badge>;
  if (status >= 400) return <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300">{status}</Badge>;
  if (status >= 300) return <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300">{status}</Badge>;
  return <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300">{status}</Badge>;
}

export function linkTypeBadge(type: string) {
  if (type === "external") return <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs">External</Badge>;
  if (type === "pdf") return <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs">PDF</Badge>;
  return <Badge variant="outline" className="text-muted-foreground text-xs capitalize">{type || "Internal"}</Badge>;
}

export function truncate(s: string, n = 80) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.join(","),
    ...rows.map((r) =>
      keys.map((k) => JSON.stringify(String(r[k] ?? ""))).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OverviewCards({ status }: { status: QAStatus }) {
  const pct = status.totalLinks > 0 ? Math.round((status.checked / status.totalLinks) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="bg-[#1a1a2e] border-[#2a2a4a]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-1 text-gray-400 text-sm"><FileText className="w-4 h-4" /> Pages crawled</div>
          <div className="text-3xl font-bold text-white">{status.totalPages.toLocaleString()}</div>
        </CardContent>
      </Card>
      <Card className="bg-[#1a1a2e] border-[#2a2a4a]">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-1 text-gray-400 text-sm"><Link2 className="w-4 h-4" /> Links found</div>
          <div className="text-3xl font-bold text-white">{status.totalLinks.toLocaleString()}</div>
          {status.running && (
            <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking… {pct}%
            </div>
          )}
        </CardContent>
      </Card>
      <Card className={`bg-[#1a1a2e] border-[#2a2a4a] ${status.broken > 0 ? "border-red-800" : ""}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-1 text-gray-400 text-sm"><XCircle className="w-4 h-4 text-red-400" /> Broken links</div>
          <div className={`text-3xl font-bold ${status.broken > 0 ? "text-red-400" : "text-white"}`}>
            {status.broken.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      <Card className={`bg-[#1a1a2e] border-[#2a2a4a] ${status.redirects > 0 ? "border-yellow-800" : ""}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-1 text-gray-400 text-sm"><ArrowRight className="w-4 h-4 text-yellow-400" /> Redirects</div>
          <div className={`text-3xl font-bold ${status.redirects > 0 ? "text-yellow-400" : "text-white"}`}>
            {status.redirects.toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function BrokenLinksTab({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qa-broken-links", scanId, page, limit, search, type, status],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      if (type !== "all") params.set("type", type);
      if (status !== "all") params.set("status", status);
      return fetchQAJson<{ data: BrokenLink[]; total: number; page: number; limit: number }>(
        `${BASE}/api/scans/${scanId}/qa/broken-links?${params}`,
      );
    },
    refetchInterval: 10000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  const exportData = rows.map((r) => ({
    "Broken URL": r.destUrl,
    "HTTP Status": r.httpStatus ?? "timeout",
    "Link Type": r.linkType,
    "Source Pages": r.sourceCount,
    "Source URLs": (r.sources ?? []).slice(0, 5).join("; "),
    "Anchor Texts": (r.anchorTexts ?? []).slice(0, 3).join("; "),
  }));

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <QAQueryError error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search URL, source page, or anchor text…"
        filters={[
          {
            label: "Error code",
            value: status,
            onChange: (value) => { setStatus(value); setPage(1); },
            options: [
              { value: "all", label: "All error codes" },
              { value: "4xx", label: "4xx errors" },
              { value: "5xx", label: "5xx errors" },
              { value: "timeout", label: "Timeouts" },
              { value: "400", label: "400 Bad Request" },
              { value: "401", label: "401 Unauthorized" },
              { value: "404", label: "404 Not Found" },
              { value: "408", label: "408 Timeout" },
              { value: "410", label: "410 Gone" },
              { value: "429", label: "429 Too Many Requests" },
              { value: "500", label: "500 Server Error" },
              { value: "502", label: "502 Bad Gateway" },
              { value: "503", label: "503 Unavailable" },
            ],
          },
          {
            label: "Type",
            value: type,
            onChange: (value) => { setType(value); setPage(1); },
            options: [
              { value: "all", label: "All types" },
              { value: "internal", label: "Internal" },
              { value: "external", label: "External" },
              { value: "document", label: "Document" },
              { value: "media", label: "Media" },
            ],
          },
        ]}
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `broken-links-scan-${scanId}.csv`)}
      />

      {!rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            <p className="font-medium text-foreground">
              {search || type !== "all" || status !== "all" ? "No broken links match these filters" : "No broken links found"}
            </p>
            <p className="text-sm">All checked links responded successfully.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} broken link{total !== 1 ? "s" : ""} found
          </p>

           <div className={QA_TABLE_SHELL_CLASS}>
         <Table className={QA_TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="hidden md:table-cell">Source page</TableHead>
              <TableHead className="hidden sm:table-cell w-24">Type</TableHead>
              <TableHead className="w-20">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>
                  <a
                    href={row.destUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm font-mono flex items-center gap-1 break-all"
                  >
                    {truncate(row.destUrl, 80)}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  {row.anchorTexts?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      "{truncate(row.anchorTexts[0], 60)}"
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {row.sources?.[0] ? (
                    <a
                      href={row.sources[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-xs font-mono flex items-center gap-1 break-all"
                    >
                      {truncate(row.sources[0], 60)}
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {row.sourceCount > 1 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      +{row.sourceCount - 1} more source{row.sourceCount - 1 !== 1 ? "s" : ""}
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{linkTypeBadge(row.linkType)}</TableCell>
                <TableCell>{httpStatusBadge(row.httpStatus)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          </div>

          {pages > 1 && (
            <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

export function RedirectsTab({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qa-redirects", scanId, page, limit, search, type],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (type !== "all") params.set("type", type);
      return fetchQAJson<{ data: Redirect[]; total: number; page: number; limit: number }>(
        `${BASE}/api/scans/${scanId}/qa/redirects?${params}`,
      );
    },
    refetchInterval: 10000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  const exportData = rows.map((r) => ({
    "Original URL": r.destUrl,
    "Redirects To": r.redirectTo ?? "",
    "Link Type": r.linkType,
    "Source Pages": r.sourceCount,
    "Source URLs": (r.sources ?? []).slice(0, 5).join("; "),
  }));

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <QAQueryError error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search original, destination, or source URL…"
        filters={[{
          label: "Type",
          value: type,
          onChange: (value) => { setType(value); setPage(1); },
          options: [
            { value: "all", label: "All types" },
            { value: "internal", label: "Internal" },
            { value: "external", label: "External" },
            { value: "document", label: "Document" },
            { value: "media", label: "Media" },
          ],
        }]}
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `redirects-scan-${scanId}.csv`)}
      />

      {!rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            <p className="font-medium text-foreground">
              {search || type !== "all" ? "No redirects match these filters" : "No redirects found"}
            </p>
            <p className="text-sm">All links point directly to their destinations.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} redirect{total !== 1 ? "s" : ""} found</p>

      <div className={QA_TABLE_SHELL_CLASS}>
        <Table className={QA_TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Type</TableHead>
              <TableHead>Original URL</TableHead>
              <TableHead>Redirects to</TableHead>
              <TableHead className="w-24 text-right">Source pages</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{linkTypeBadge(row.linkType)}</TableCell>
                <TableCell>
                  <a href={row.destUrl} target="_blank" rel="noopener noreferrer"
                    className={QA_URL_CLASS}>
                    {truncate(row.destUrl, 70)}<ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  {row.sources?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">{truncate(row.sources[0], 60)}</p>
                  )}
                </TableCell>
                <TableCell>
                  {row.redirectTo ? (
                    <a href={row.redirectTo} target="_blank" rel="noopener noreferrer"
                      className={QA_URL_CLASS}>
                      {truncate(row.redirectTo, 60)}<ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  ) : <span className="text-muted-foreground text-sm">—</span>}
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">{row.sourceCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />
      )}
        </>
      )}
    </div>
  );
}

export function PagesTab({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["qa-pages", scanId, page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      return fetchQAJson<{ data: QAPage[]; total: number; page: number; limit: number }>(
        `${BASE}/api/scans/${scanId}/qa/pages?${params}`,
      );
    },
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  const exportData = rows.map((r) => ({
    URL: r.url,
    Title: r.title ?? "",
    H1: r.h1 ?? "",
    "Meta Description": r.metaDescription ?? "",
    "HTTP Status": r.httpStatus ?? "",
    "Word Count": r.wordCount ?? "",
    "Inlink Count": r.inlinkCount,
    "Last Modified": r.lastModified ?? "",
  }));

  return (
    <div className="space-y-3">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search URL or title…"
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `pages-scan-${scanId}.csv`)}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <QAQueryError error={error} onRetry={() => refetch()} />
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <FileText className="w-10 h-10" />
          <p>{search ? "No pages match your search." : "No page inventory yet. Run a scan first."}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} page{total !== 1 ? "s" : ""}</p>
            <div className={QA_TABLE_SHELL_CLASS}>
            <Table className={QA_TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead>URL / Title</TableHead>
                  <TableHead className="w-32">H1</TableHead>
                  <TableHead className="w-20 text-right">Words</TableHead>
                  <TableHead className="w-20 text-right">Inlinks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <a href={row.url} target="_blank" rel="noopener noreferrer"
                        className={QA_URL_CLASS}>
                        {truncate(row.url, 80)}<ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                      {row.title && <p className="text-xs text-muted-foreground mt-0.5">{truncate(row.title, 80)}</p>}
                      {row.metaDescription && <p className="text-xs text-muted-foreground/70 mt-0.5">{truncate(row.metaDescription, 100)}</p>}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{row.h1 ? truncate(row.h1, 40) : <span className="text-muted-foreground/70">—</span>}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.wordCount?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.inlinkCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}

export function ScanQATab({ scanId }: { scanId: number }) {
  const [activeTab, setActiveTab] = useState<QATab>("overview");
  const queryClient = useQueryClient();

  const { data: status, isLoading, isError, error, refetch } = useQuery<QAStatus>({
    queryKey: ["qa-status", scanId],
    queryFn: async () => {
      return fetchQAJson<QAStatus>(`${BASE}/api/scans/${scanId}/qa/status`);
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && (d as QAStatus).running) return 3000;
      if (d && (d as QAStatus).unchecked > 0) return 5000;
      return false;
    },
  });

  const handleRecheck = useCallback(async () => {
    await fetch(`${BASE}/api/scans/${scanId}/qa/recheck`, { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["qa-status", scanId] });
    queryClient.invalidateQueries({ queryKey: ["qa-broken-links", scanId] });
    queryClient.invalidateQueries({ queryKey: ["qa-redirects", scanId] });
  }, [scanId, queryClient]);

  const tabs: { id: QATab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: <Shield className="w-4 h-4" /> },
    { id: "broken-links", label: "Broken Links", icon: <XCircle className="w-4 h-4" />, badge: status?.broken },
    { id: "redirects", label: "Redirects", icon: <ArrowRight className="w-4 h-4" />, badge: status?.redirects },
    { id: "pages", label: "Page Inventory", icon: <FileText className="w-4 h-4" />, badge: status?.totalPages },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (isError) {
    return <QAQueryError error={error} onRetry={() => refetch()} />;
  }

  const noData = !status || (status.totalPages === 0 && status.totalLinks === 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Quality Assurance
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Link health, redirects, and page inventory collected during the accessibility scan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status?.running && (
            <span className="text-sm text-blue-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking links…
            </span>
          )}
          {status && !status.running && (
            <Button variant="outline" size="sm" onClick={handleRecheck} className="border-[#2a2a4a] hover:bg-[#1a1a2e]">
              <RefreshCw className="w-4 h-4 mr-2" /> Re-check links
            </Button>
          )}
        </div>
      </div>

      {noData ? (
        <Card className="bg-[#1a1a2e] border-[#2a2a4a]">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-gray-400">
            <Clock className="w-10 h-10" />
            <p className="text-lg font-medium">No QA data yet</p>
            <p className="text-sm text-center max-w-sm">
              QA data is collected automatically during accessibility scans. Run a scan to populate this tab.
              <br />New scans will include the link graph and page metadata.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex items-center gap-1 border-b border-[#2a2a4a] pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? "text-white bg-[#1a1a2e] border border-b-0 border-[#2a2a4a]"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <Badge
                    className={`ml-1 text-xs ${
                      tab.id === "broken-links"
                        ? "bg-red-900/50 text-red-300"
                        : tab.id === "redirects"
                        ? "bg-yellow-900/50 text-yellow-300"
                        : "bg-blue-900/50 text-blue-300"
                    }`}
                  >
                    {tab.badge.toLocaleString()}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "overview" && status && (
              <div className="space-y-6">
                <OverviewCards status={status} />

                {status.unchecked > 0 && !status.running && (
                  <Card className="bg-yellow-950/30 border-yellow-800">
                    <CardContent className="py-4 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-yellow-200 font-medium">{status.unchecked.toLocaleString()} links not yet checked</p>
                        <p className="text-xs text-yellow-500">Click "Re-check links" to verify their HTTP status codes.</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-[#1a1a2e] border-[#2a2a4a] cursor-pointer hover:border-red-700 transition-colors" onClick={() => setActiveTab("broken-links")}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-red-400">
                        <XCircle className="w-4 h-4" /> Broken Links
                      </CardTitle>
                      <CardDescription>4xx and 5xx responses, network timeouts</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">{status.broken.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">Click to view full list →</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-[#1a1a2e] border-[#2a2a4a] cursor-pointer hover:border-yellow-700 transition-colors" onClick={() => setActiveTab("redirects")}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-yellow-400">
                        <ArrowRight className="w-4 h-4" /> Redirects
                      </CardTitle>
                      <CardDescription>301, 302 and redirect chains</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-bold text-white">{status.redirects.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">Click to view full list →</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === "broken-links" && <BrokenLinksTab scanId={scanId} />}
            {activeTab === "redirects" && <RedirectsTab scanId={scanId} />}
            {activeTab === "pages" && <PagesTab scanId={scanId} />}
          </div>
        </>
      )}
    </div>
  );
}
