import { AlertCircle, Globe } from "lucide-react";
import { IssuesTable, PagesWithIssuesTable, SiteBreadcrumb, useSite, useAutoActiveSite } from "@/pages/site/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props { siteId: number }

export default function SiteIssues({ siteId }: Props) {
  useAutoActiveSite(siteId);
  const siteQ = useSite(siteId);

  if (siteQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading issues…
      </div>
    );
  }
  if (siteQ.isError || !siteQ.data) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive text-sm">
        Failed to load site.
      </div>
    );
  }

  const site = siteQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <SiteBreadcrumb siteId={siteId} siteName={site.name} current="Issues" />
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertCircle className="w-6 h-6 text-muted-foreground" />
          Issues
        </h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> {site.name}
        </p>
      </div>

      <Tabs defaultValue="issues" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="pages">Pages with issues</TabsTrigger>
        </TabsList>
        <TabsContent value="issues" className="mt-4">
          <IssuesTable
            siteId={siteId}
            type="issues"
            label="Issues (Critical & Serious)"
            scopeImpacts={["critical", "serious"]}
          />
        </TabsContent>
        <TabsContent value="pages" className="mt-4">
          <PagesWithIssuesTable siteId={siteId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
