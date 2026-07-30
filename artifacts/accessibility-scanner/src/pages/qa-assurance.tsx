import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Globe,
  History,
  Loader2,
  XCircle,
} from "lucide-react";
import { useQASites, useQASelectedSite, QASiteSelector, QA_BASE, type QASiteEntry } from "@/pages/qa-shared";

interface QAStatus {
  running: boolean;
  totalPages: number;
  totalLinks: number;
  checked: number;
  broken: number;
  redirects: number;
  unchecked: number;
}

function QAStatCard({
  label,
  value,
  icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: "default" | "warning" | "destructive";
}) {
  const color =
    variant === "destructive"
      ? "text-destructive"
      : variant === "warning"
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-primary";
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <div className={`${color} shrink-0`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewContent({ site }: { site: QASiteEntry }) {
  const { data: status, isLoading } = useQuery<QAStatus | null>({
    queryKey: ["qa-status", site.scanId],
    queryFn: async () => {
      if (!site.scanId) return null;
      const r = await fetch(`${QA_BASE}/api/scans/${site.scanId}/qa/status`, {
        credentials: "include",
      });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!site.scanId,
    staleTime: 30_000,
  });

  if (!site.scanId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <AlertTriangle className="w-10 h-10" />
        <p className="text-base font-medium">No completed scan linked to this site.</p>
        <p className="text-sm text-center max-w-sm">
          Run a crawler scan from the{" "}
          <Link href="/crawler" className="underline text-primary">
            Crawler
          </Link>{" "}
          and link it to this site to see QA data.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const crawledDate = site.crawledAt
    ? new Date(site.crawledAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Globe className="w-4 h-4 shrink-0" />
        <a
          href={site.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline truncate max-w-sm hover:text-foreground"
        >
          {site.siteUrl}
        </a>
        <span className="ml-auto flex items-center gap-1">
          <History className="w-3.5 h-3.5" />
          Last crawled: {crawledDate}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <QAStatCard
          label="Pages scanned"
          value={status?.totalPages ?? site.pageCount ?? 0}
          icon={<Globe className="w-5 h-5" />}
        />
        <QAStatCard
          label="Links checked"
          value={status?.checked ?? 0}
          icon={<ArrowRight className="w-5 h-5" />}
        />
        <QAStatCard
          label="Broken links"
          value={status?.broken ?? site.brokenLinksCount ?? 0}
          icon={<XCircle className="w-5 h-5" />}
          variant={
            (status?.broken ?? site.brokenLinksCount ?? 0) > 0
              ? "destructive"
              : "default"
          }
        />
        <QAStatCard
          label="Redirects"
          value={status?.redirects ?? 0}
          icon={<ArrowRight className="w-5 h-5" />}
          variant={(status?.redirects ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <Link href="/quality-assurance/links/broken">
                <XCircle className="w-4 h-4" />
                View broken links
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <Link href="/quality-assurance/inventory/pages">
                <Globe className="w-4 h-4" />
                Browse page inventory
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" asChild>
              <Link href="/quality-assurance/check-history">
                <History className="w-4 h-4" />
                Check history
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scan details</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <div className="flex justify-between">
              <span>Scan ID</span>
              <span className="font-mono text-foreground">#{site.scanId}</span>
            </div>
            <div className="flex justify-between">
              <span>Crawler session</span>
              <span className="font-mono text-foreground">#{site.crawlerSessionId}</span>
            </div>
            <div className="flex justify-between">
              <span>Pages scanned</span>
              <span className="text-foreground">{site.pageCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Crawl date</span>
              <span className="text-foreground">{crawledDate}</span>
            </div>
            <div className="mt-3 pt-3 border-t">
              <Button variant="ghost" size="sm" className="p-0 h-auto text-xs gap-1 text-primary" asChild>
                <Link href={`/scans/${site.scanId}`}>
                  View full scan report <ArrowRight className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function QualityAssurancePage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quality Assurance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor content quality, links, spelling, and inventory across your crawled sites.
        </p>
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

      {!isLoading && sites.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4 text-muted-foreground">
            <Globe className="w-10 h-10" />
            <p className="font-medium text-foreground">No crawler-linked sites found</p>
            <p className="text-sm text-center max-w-sm">
              QA data is linked to crawler scans. Run a full crawler scan from the{" "}
              <Link href="/crawler" className="text-primary underline">Crawler</Link>{" "}
              and assign it to a site to see QA metrics here.
            </p>
            <Button asChild>
              <Link href="/crawler/new">Start a crawler scan</Link>
            </Button>
          </CardContent>
        </Card>
      ) : selected ? (
        <OverviewContent site={selected} />
      ) : null}
    </div>
  );
}
