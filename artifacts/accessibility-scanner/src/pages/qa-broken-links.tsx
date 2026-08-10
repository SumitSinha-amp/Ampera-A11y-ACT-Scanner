import { useQASites, useQASelectedSite, QASiteSelector, QAComingSoon } from "@/pages/qa-shared";
import { BrokenLinksTab } from "@/pages/scan-qa";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { qaErrorMessage } from "@/pages/qa-shared";

export default function QABrokenLinksPage() {
  const { data: sites = [], isLoading, isError, error, refetch } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Broken links</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Links that return HTTP errors (4xx, 5xx) or fail to connect, discovered during the crawl.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Site:</span>
        <QASiteSelector
          value={selectedSiteId}
          onChange={setSite}
          sites={sites}
          loading={isLoading}
          error={isError ? error : undefined}
          onRetry={() => refetch()}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <XCircle className="w-10 h-10 text-destructive" />
            <p className="font-medium text-foreground">Unable to load broken links</p>
            <p className="text-sm text-center max-w-md">{qaErrorMessage(error)}</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <XCircle className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view broken links.
            </p>
          </CardContent>
        </Card>
      ) : (
        <BrokenLinksTab scanId={selected.scanId} />
      )}
    </div>
  );
}
