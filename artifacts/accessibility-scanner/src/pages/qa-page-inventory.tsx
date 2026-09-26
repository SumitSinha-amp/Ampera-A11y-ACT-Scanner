import { useQASites, useQASelectedSite, QAPageShell } from "@/pages/qa-shared";
import { PagesTab } from "@/pages/scan-qa";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutGrid } from "lucide-react";
import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function QAInventoryPagesPage() {
  const { data: sites = [], isLoading, isError, error, refetch } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="pages"
    >
      {isLoading ? (
        <PageLoadingSkeleton variant="table" message="Loading sites…" />
      ) : !selected?.scanId ? (
        <Card className="rounded-2xl border border-white/90 bg-white/82 shadow-[0_4px_22px_rgba(0,0,0,.07)] backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <LayoutGrid className="h-10 w-10" />
            <p className="font-medium text-foreground">No scan data available</p>
            <p className="max-w-sm text-center text-sm">
              Select a site with a completed crawler scan to view the page inventory.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="loaded-reveal">
          <PagesTab scanId={selected.scanId} siteName={selected.siteName} compact />
        </div>
      )}
    </QAPageShell>
  );
}
