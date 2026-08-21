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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
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

interface QAIssue {
  url: string;
  type: string;
  severity: "high" | "medium" | "low";
  detail: string;
  inlinkCount: number;
}

interface IssuesResponse {
  data: QAIssue[];
  total: number;
  page: number;
  limit: number;
  summary: Record<string, number>;
}

const ISSUE_TYPE_META: Record<string, { label: string; description: string }> = {
  missing_title: { label: "Missing title", description: "Pages without a <title> tag" },
  short_title: { label: "Short title", description: "Title tag under 10 characters" },
  long_title: { label: "Long title", description: "Title tag over 70 characters" },
  missing_h1: { label: "Missing H1", description: "Pages without an <h1> heading" },
  missing_meta_desc: { label: "Missing meta description", description: "No meta description tag" },
  long_meta_desc: { label: "Long meta description", description: "Meta description over 160 characters" },
  thin_content: { label: "Thin content", description: "Pages with fewer than 50 words" },
  http_error: { label: "HTTP error", description: "Pages returning 4xx/5xx status codes" },
};

const SEVERITY_ORDER: ("high" | "medium" | "low")[] = ["high", "medium", "low"];

function severityBadge(severity: "high" | "medium" | "low") {
  if (severity === "high") return <Badge variant="destructive" className="text-xs">High</Badge>;
  if (severity === "medium") return <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600">Medium</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">Low</Badge>;
}

function IssuesContent({ scanId }: { scanId: number }) {
  const [page, setPage] = useState(1);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const pageGroupId = useQAPageGroup();

  const { data, isLoading } = useQuery<IssuesResponse>({
    queryKey: ["qa-issues", scanId, page, limit, activeType, search, pageGroupId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (activeType) params.set("type", activeType);
      if (search) params.set("search", search);
      if (pageGroupId !== null) params.set("page_group", String(pageGroupId));
      const r = await fetch(`${QA_BASE}/api/scans/${scanId}/qa/issues?${params}`, {
        credentials: "include",
      });
      return r.json();
    },
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);
  const summary = data?.summary ?? {};
  const totalIssues = Object.values(summary).reduce((a, b) => a + b, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (totalIssues === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <TriangleAlert className="w-10 h-10" />
          <p className="font-medium text-green-600">No QA issues found</p>
          <p className="text-sm text-center max-w-sm">
            All pages have titles, H1 headings, and meta descriptions.
          </p>
        </CardContent>
      </Card>
    );
  }

  const exportData = rows.map((r) => ({
    URL: r.url,
    "Issue Type": ISSUE_TYPE_META[r.type]?.label ?? r.type,
    Severity: r.severity,
    Detail: r.detail,
    Inlinks: r.inlinkCount,
  }));

  return (
    <div className="space-y-4">
      {Object.keys(summary).length > 0 && (
        <div className="space-y-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {totalIssues.toLocaleString()} issue{totalIssues !== 1 ? "s" : ""} across{" "}
                {Object.keys(summary).length} categor{Object.keys(summary).length !== 1 ? "ies" : "y"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={activeType === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setActiveType(null); setPage(1); }}
                >
                  All ({totalIssues.toLocaleString()})
                </Button>
                {SEVERITY_ORDER.flatMap((sev) =>
                  Object.entries(summary)
                    .filter(([type]) => {
                      const isHighSev = ["missing_title", "missing_h1", "http_error"].includes(type);
                      const isMedSev = ["short_title", "missing_meta_desc", "thin_content"].includes(type);
                      return sev === "high" ? isHighSev : sev === "medium" ? isMedSev : !isHighSev && !isMedSev;
                    })
                    .map(([type, count]) => (
                      <Button
                        key={type}
                        variant={activeType === type ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setActiveType(type); setPage(1); }}
                      >
                        {ISSUE_TYPE_META[type]?.label ?? type} ({count.toLocaleString()})
                      </Button>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search page URL or issue detail…"
        filters={[{
          label: "Issue type",
          value: activeType ?? "all",
          onChange: (value) => { setActiveType(value === "all" ? null : value); setPage(1); },
          options: [
            { value: "all", label: "All issue types" },
            ...Object.keys(ISSUE_TYPE_META).map((type) => ({
              value: type,
              label: ISSUE_TYPE_META[type].label,
            })),
          ],
        }]}
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `qa-issues-scan-${scanId}.csv`)}
      />
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} issue{total !== 1 ? "s" : ""}
        {activeType ? ` — ${ISSUE_TYPE_META[activeType]?.label ?? activeType}` : ""}
      </p>

      <div className={QA_TABLE_SHELL_CLASS}>
        <Table className={QA_TABLE_CLASS}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Severity</TableHead>
              <TableHead>Page</TableHead>
              <TableHead className="hidden md:table-cell">Issue</TableHead>
              <TableHead className="text-right w-20 hidden sm:table-cell">Inlinks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{severityBadge(row.severity)}</TableCell>
                <TableCell>
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={QA_URL_CLASS}
                  >
                    {truncate(row.url, 70)}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.detail}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className="text-xs">
                    {ISSUE_TYPE_META[row.type]?.label ?? row.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                  {row.inlinkCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && <QAPagination page={page} total={total} limit={limit} onPageChange={setPage} />}
    </div>
  );
}

export default function QAIssuesPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Content quality issues detected across all crawled pages — missing titles, H1 headings, meta descriptions, thin content, and HTTP errors.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <TriangleAlert className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view QA issues.
            </p>
          </CardContent>
        </Card>
      ) : (
        <IssuesContent scanId={selected.scanId} />
      )}
    </div>
  );
}
