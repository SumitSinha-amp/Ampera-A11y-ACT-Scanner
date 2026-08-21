import { useQASites, useQASelectedSite, QAPageShell } from "@/pages/qa-shared";
import { RedirectsTab } from "@/pages/scan-qa";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowRight } from "lucide-react";

export default function QARedirectsPage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="redirects"
    >
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
    </QAPageShell>
  );
}
