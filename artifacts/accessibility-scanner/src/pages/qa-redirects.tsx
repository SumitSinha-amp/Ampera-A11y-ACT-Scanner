import { useQASites, useQASelectedSite, QASiteSelector } from "@/pages/qa-shared";
import { RedirectsTab } from "@/pages/scan-qa";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowRight } from "lucide-react";

export default function QARedirectsPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [selectedSiteId, selected, setSite] = useQASelectedSite(sites);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Redirects</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Links that redirect (3xx responses) discovered during the crawl.
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

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected?.scanId ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <ArrowRight className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view redirects.
            </p>
          </CardContent>
        </Card>
      ) : (
        <RedirectsTab scanId={selected.scanId} />
      )}
    </div>
  );
}
