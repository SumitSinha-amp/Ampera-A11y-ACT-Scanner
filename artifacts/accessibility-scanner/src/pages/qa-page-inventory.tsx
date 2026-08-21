import { useQASites, useQASelectedSite, QAPageShell } from "@/pages/qa-shared";
import { PagesTab } from "@/pages/scan-qa";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutGrid, Loader2 } from "lucide-react";

export default function QAInventoryPagesPage() {
  const { data: sites = [], isLoading, isError, error, refetch } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="pages"
    >
      {isLoading ? (
        <div className="rounded-2xl border border-white/90 bg-white/82 py-16 shadow-[0_4px_22px_rgba(0,0,0,.07)] backdrop-blur-xl">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </div>
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
        <PagesTab scanId={selected.scanId} siteName={selected.siteName} compact />
      )}
    </QAPageShell>
  );
}
