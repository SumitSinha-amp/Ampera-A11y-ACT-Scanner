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
import { Download, ExternalLink, Link2, Loader2 } from "lucide-react";
import {
  useQASites,
  useQASelectedSite,
  QASiteSelector,
  QA_BASE,
  QAListToolbar,
  QAPagination,
  QA_TABLE_CLASS,
  QA_TABLE_SHELL_CLASS,
} from "@/pages/qa-shared";
import { httpStatusBadge, exportCSV, truncate } from "@/pages/scan-qa";

interface LinkRow {
  destUrl: string;
  sourceUrl: string;
  anchorText: string | null;
  linkType: string;
  httpStatus: number | null;
  isRedirect: boolean;
  redirectTo: string | null;
  checkedAt: string | null;
}

type Category =
  | "all"
  | "internal"
  | "external"
  | "email"
  | "phone"
  | "document"
  | "media"
  | "javascript"
  | "css";

const CATEGORY_META: Record<
  Category,
  { title: string; description: string; emptyMsg: string }
> = {
  all: {
    title: "Links",
    description: "All links discovered during the crawl.",
    emptyMsg: "No links found.",
  },
  internal: {
    title: "Internal links",
    description: "Links pointing to pages within the same site.",
    emptyMsg: "No internal links found.",
  },
  external: {
    title: "External links",
    description: "Links pointing to pages on other domains.",
    emptyMsg: "No external links found.",
  },
  email: {
    title: "Email addresses",
    description: "mailto: links discovered across all crawled pages.",
    emptyMsg: "No email (mailto:) links found.",
  },
  phone: {
    title: "Phone numbers",
    description: "tel: links discovered across all crawled pages.",
    emptyMsg: "No phone (tel:) links found.",
  },
  document: {
    title: "Documents",
    description: "PDF and document files (PDF, Word, Excel, PowerPoint, etc.) linked from crawled pages.",
    emptyMsg: "No document links found.",
  },
  media: {
    title: "Media files",
    description: "Images, videos, and audio files linked from crawled pages.",
    emptyMsg: "No media file links found.",
  },
  javascript: {
    title: "JavaScript files",
    description: "JavaScript (.js, .mjs) files referenced by crawled pages.",
    emptyMsg: "No JavaScript file links found.",
  },
  css: {
    title: "CSS files",
    description: "CSS stylesheets referenced by crawled pages.",
    emptyMsg: "No CSS file links found.",
  },
};

function LinkInventoryContent({
  scanId,
  category,
}: {
  scanId: number;
  category: Category;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [type, setType] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["qa-link-inventory", scanId, category, page, limit, search, type],
    queryFn: async () => {
      const params = new URLSearchParams({
        category,
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("search", search);
      if (category === "all" && type !== "all") params.set("type", type);
      const r = await fetch(
        `${QA_BASE}/api/scans/${scanId}/qa/link-inventory?${params}`,
        { credentials: "include" }
      );
      return r.json() as Promise<{
        data: LinkRow[];
        total: number;
        page: number;
        limit: number;
      }>;
    },
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  const exportData = rows.map((r) => ({
    "URL": r.destUrl,
    "Source Page": r.sourceUrl,
    "Anchor Text": r.anchorText ?? "",
    "Type": r.linkType,
    "HTTP Status": r.httpStatus ?? "",
    "Redirect": r.isRedirect ? "yes" : "no",
    "Redirects To": r.redirectTo ?? "",
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const meta = CATEGORY_META[category];

  if (!rows.length && !search && type === "all") {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Link2 className="w-10 h-10" />
          <p className="font-medium text-foreground">{meta.emptyMsg}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <QAListToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder="Search URL or anchor text…"
        filters={category === "all" ? [{
          label: "Type",
          value: type,
          onChange: (value: string) => { setType(value); setPage(1); },
          options: [
            { value: "all", label: "All types" },
            { value: "internal", label: "Internal" },
            { value: "external", label: "External" },
          ],
        }] : []}
        limit={limit}
        onLimitChange={(value) => { setLimit(value); setPage(1); }}
        onExport={() => exportCSV(exportData, `links-${category}-scan-${scanId}.csv`)}
      />

      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} link{total !== 1 ? "s" : ""}
        {search ? ` matching "${search}"` : ""}
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
                  {row.anchorText && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      "{truncate(row.anchorText, 60)}"
                    </p>
                  )}
                  {row.isRedirect && row.redirectTo && (
                    <p className="text-xs text-yellow-600 mt-0.5">
                      → {truncate(row.redirectTo, 60)}
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <a
                    href={row.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-xs font-mono flex items-center gap-1"
                  >
                    {truncate(row.sourceUrl, 60)}
                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                  </a>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className="text-xs capitalize">
                    {row.linkType}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.checkedAt ? (
                    httpStatusBadge(row.httpStatus)
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">
                      —
                    </Badge>
                  )}
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

function QALinkInventoryPage({ category }: { category: Category }) {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);
  const meta = CATEGORY_META[category];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
        <p className="text-muted-foreground text-sm mt-1">{meta.description}</p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Site:</span>
        <QASiteSelector
          value={selectedSiteId}
          onChange={setSite}
          sites={sites}
          loading={isLoading}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Link2 className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view this inventory.
            </p>
          </CardContent>
        </Card>
      ) : (
        <LinkInventoryContent scanId={selected.scanId} category={category} />
      )}
    </div>
  );
}

export function QAInventoryLinksPage() { return <QALinkInventoryPage category="all" />; }
export function QAInventoryDocumentsPage() { return <QALinkInventoryPage category="document" />; }
export function QAInventoryMediaPage() { return <QALinkInventoryPage category="media" />; }
export function QAInventoryEmailPage() { return <QALinkInventoryPage category="email" />; }
export function QAInventoryPhonesPage() { return <QALinkInventoryPage category="phone" />; }
export function QAInventoryJavascriptPage() { return <QALinkInventoryPage category="javascript" />; }
export function QAInventoryCSSPage() { return <QALinkInventoryPage category="css" />; }
