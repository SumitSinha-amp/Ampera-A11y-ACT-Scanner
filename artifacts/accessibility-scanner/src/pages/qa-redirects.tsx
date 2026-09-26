import { useQASites, useQASelectedSite, QAPageShell } from "@/pages/qa-shared";
import { RedirectsTab } from "@/pages/scan-qa";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function QARedirectsPage() {
  const { data: sites = [], isLoading, isError, error, refetch } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="redirects"
    >
      {isLoading ? (
        <PageLoadingSkeleton variant="table" message="Loading site scan data…" />
      ) : isError ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertTitle>Could not load site scan data</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : "Please try again."}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : !selected?.scanId ? (
        <Card className="loaded-reveal">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <ArrowRight className="w-10 h-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="text-sm text-center max-w-sm">
              Select a site with a completed crawler scan to view redirects.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="loaded-reveal"><RedirectsTab scanId={selected.scanId} /></div>
      )}
    </QAPageShell>
  );
}
