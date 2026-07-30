import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Layers, Globe } from "lucide-react";
import { BASE, PageGroup, ScoreRing, SiteBreadcrumb, useSite, useAutoActiveSite } from "@/pages/site/shared";

interface Props { siteId: number }

export default function SitePageGroups({ siteId }: Props) {
  useAutoActiveSite(siteId);
  const siteQ = useSite(siteId);
  const groupsQ = useQuery<{ groups: PageGroup[]; totalScanned: number }>({
    queryKey: ["site-page-groups", siteId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/sites/${siteId}/page-groups`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load page groups");
      return r.json();
    },
  });

  if (siteQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading page groups…
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
        <SiteBreadcrumb siteId={siteId} siteName={site.name} current="Page Groups" />
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="w-6 h-6 text-muted-foreground" />
          Page Groups
        </h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> {site.name}
        </p>
      </div>

      {groupsQ.isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading page groups…</div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Accessibility status across your page groups</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group name</TableHead>
                  <TableHead className="w-36 text-center">Accessibility score</TableHead>
                  <TableHead className="w-36 text-right">Points to target</TableHead>
                  <TableHead className="w-20 text-right">Pages</TableHead>
                  <TableHead className="w-24 text-right">Issues</TableHead>
                  <TableHead className="w-32 text-right">Potential issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groupsQ.data?.groups ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No page groups found.
                    </TableCell>
                  </TableRow>
                ) : (
                  (groupsQ.data?.groups ?? []).map((g) => (
                    <TableRow key={g.page_type}>
                      <TableCell className="font-medium">{g.page_type}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <ScoreRing score={g.score} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {g.points_to_target > 0
                          ? `${g.points_to_target.toFixed(2)} pts`
                          : <span className="text-green-600">On target</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {g.pages.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {g.issues_count > 0
                          ? <span className="text-red-600 font-semibold">{g.issues_count.toLocaleString()}</span>
                          : <span className="text-green-600">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {g.potential_issues_count > 0
                          ? <span className="text-orange-500 font-semibold">{g.potential_issues_count.toLocaleString()}</span>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
