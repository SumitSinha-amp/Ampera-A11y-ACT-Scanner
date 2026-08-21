import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Download, Globe2, Layers, Search, Target, X } from "lucide-react";
import { BASE, PageGroup, ScoreRing, SiteBreadcrumb, useSite, useAutoActiveSite } from "@/pages/site/shared";
import { Switch } from "@/components/ui/switch";

interface Props { siteId: number }

export default function SitePageGroups({ siteId }: Props) {
  useAutoActiveSite(siteId);
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const siteQ = useSite(siteId);
  const groupsQ = useQuery<{ groups: PageGroup[]; totalScanned: number }>({
    queryKey: ["site-page-groups", siteId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/sites/${siteId}/page-groups`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load page groups");
      return r.json();
    },
  });
  const preferencesQ = useQuery<{ preferences: Record<string, boolean> }>({
    queryKey: ["site-page-group-preferences", siteId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/sites/${siteId}/page-group-preferences`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load Page Group preferences");
      return r.json();
    },
  });
  const savePreference = useMutation<{ pageType: string; included: boolean }, Error, { pageType: string; included: boolean }>({
    mutationFn: async (preference) => {
      const r = await fetch(`${BASE}/api/sites/${siteId}/page-group-preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preference),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save Page Group preference");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-page-group-preferences", siteId] });
    },
  });
  const groups = groupsQ.data?.groups ?? [];
  const filteredGroups = useMemo(
    () => groups.filter((group) => group.page_type.toLowerCase().includes(query.trim().toLowerCase())),
    [groups, query],
  );

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
  const totalPages = groupsQ.data?.totalScanned ?? groups.reduce((sum, group) => sum + group.scanned_pages, 0);
  const totalIssues = groups.reduce((sum, group) => sum + group.issues_count, 0);
  const scoredGroups = groups.filter((group): group is PageGroup & { score: number; points_to_target: number } =>
    group.score !== null && group.points_to_target !== null,
  );
  const averageScore = scoredGroups.length
    ? scoredGroups.reduce((sum, group) => sum + group.score, 0) / scoredGroups.length
    : null;
  const groupsOnTarget = scoredGroups.filter((group) => group.points_to_target <= 0).length;

  const exportGroups = () => {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ["Group name", "Accessibility score", "Points to target", "Discovered pages", "Scanned pages", "Issues", "Potential issues", "Pages with issues"],
      ...filteredGroups.map((group) => [
        group.page_type,
        group.score === null ? "Not scanned" : group.score.toFixed(1),
        group.points_to_target === null ? "—" : group.points_to_target.toFixed(2),
        group.pages,
        group.scanned_pages,
        group.issues_count,
        group.potential_issues_count,
        group.pages_with_issues,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-page-groups.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="vision-page vision-page-groups w-full space-y-5 pb-10">
      <header className="border-b border-[#e5e9f0] pb-5">
        <SiteBreadcrumb siteId={siteId} siteName={site.name} current="Page Groups" />
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#6d48c7]">Site intelligence</p>
            <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-[#172b4d]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700">
                <Layers className="h-4 w-4" />
              </span>
              Page groups
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-[#7b8aaa]">
              <Globe2 className="h-3.5 w-3.5" />
              {site.name}
            </p>
          </div>
          <Button variant="outline" className="border-[#dce2ec] bg-white shadow-sm hover:bg-[#f8f9fc]" onClick={exportGroups} disabled={groupsQ.isLoading || !filteredGroups.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      {groupsQ.isLoading ? (
        <Card className="rounded-2xl border-white/80 bg-white shadow-[0_10px_30px_rgba(69,57,112,.05)]">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">Loading page groups…</CardContent>
        </Card>
      ) : groupsQ.isError ? (
        <Card className="rounded-2xl border-rose-200 bg-rose-50/50 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertTriangle className="h-8 w-8 text-rose-600" />
            <div>
              <p className="font-semibold text-foreground">Page groups could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">Try refreshing the page to load the latest scan data.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Page groups", value: groups.length.toLocaleString(), hint: "Across this site", icon: Layers, surface: "bg-violet-100", iconClass: "text-violet-700" },
              { label: "Pages analysed", value: totalPages.toLocaleString(), hint: "Latest completed crawl", icon: Globe2, surface: "bg-sky-100", iconClass: "text-sky-700" },
                { label: "Average score", value: averageScore === null ? "—" : averageScore.toFixed(1), hint: "Across scanned groups", icon: Target, surface: "bg-emerald-100", iconClass: "text-emerald-700" },
              { label: "Open issues", value: totalIssues.toLocaleString(), hint: `${groupsOnTarget} group${groupsOnTarget === 1 ? "" : "s"} on target`, icon: AlertTriangle, surface: "bg-rose-100", iconClass: "text-rose-700" },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <Card key={metric.label} className="border-white/80 bg-white shadow-[0_8px_24px_rgba(69,57,112,.06)]">
                  <CardContent className="flex items-center gap-3 p-4 sm:p-5">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${metric.surface}`}>
                      <Icon className={`h-4 w-4 ${metric.iconClass}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xl font-bold leading-none tracking-tight text-[#172b4d]">{metric.value}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-[#52627e]">{metric.label}</p>
                      <p className="mt-0.5 hidden text-[10px] text-[#98a4b8] sm:block">{metric.hint}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="overflow-hidden rounded-2xl border-white/80 bg-white shadow-[0_10px_30px_rgba(69,57,112,.06)]">
            <CardHeader className="gap-4 border-b border-[#ebeef5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <CardTitle className="text-[15px] font-bold text-[#172b4d]">Accessibility status across your groups</CardTitle>
                <p className="mt-1 text-xs text-[#7b8aaa]">Compare content clusters and choose which groups are included in your next accessibility scan.</p>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                {filteredGroups.length} of {groups.length} groups
              </span>
            </CardHeader>
            <div className="flex flex-col gap-3 border-b border-[#ebeef5] bg-[#fcfcfe] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <label className="relative block w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b98af]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search group name"
                  className="h-9 border-[#dfe5ee] bg-white pl-9 pr-9 text-sm shadow-sm focus-visible:ring-primary"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear group search"
                    className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[#8b98af] hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
              <p className="text-xs text-[#7b8aaa]">Changes apply when the next crawler accessibility phase begins.</p>
            </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
                <Table className="min-w-[1160px]">
              <TableHeader>
                <TableRow className="border-[#ebeef5] bg-[#f8f9fc] hover:bg-[#f8f9fc]">
                  <TableHead className="h-11 min-w-[260px] pl-6 text-xs font-bold text-[#596981]">Group name</TableHead>
                  <TableHead className="h-11 w-40 text-center text-xs font-bold text-[#596981]">Accessibility score</TableHead>
                  <TableHead className="h-11 w-40 text-right text-xs font-bold text-[#596981]">Points to target</TableHead>
                   <TableHead className="h-11 w-24 text-right text-xs font-bold text-[#596981]">Discovered</TableHead>
                   <TableHead className="h-11 w-24 text-right text-xs font-bold text-[#596981]">Scanned</TableHead>
                  <TableHead className="h-11 w-24 text-right text-xs font-bold text-[#596981]">Issues</TableHead>
                  <TableHead className="h-11 w-32 text-right text-xs font-bold text-[#596981]">Potential issues</TableHead>
                  <TableHead className="h-11 w-32 pr-6 text-right text-xs font-bold text-[#596981]">Pages affected</TableHead>
                   <TableHead className="h-11 w-36 pr-6 text-right text-xs font-bold text-[#596981]">Include in scans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filteredGroups.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-14 text-center text-muted-foreground">
                      {query ? "No page groups match your search." : "No page groups found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGroups.map((g) => (
                    <TableRow key={g.page_type} className="border-[#edf0f5] transition-colors hover:bg-violet-50/35">
                      <TableCell className="py-3.5 pl-6">
                        <div>
                          <p className="font-semibold text-[#405575]">{g.page_type}</p>
                          <p className="mt-0.5 text-[11px] text-[#8a97ac]">
                            {g.scanned_pages === 0 ? "Not scanned in the latest crawl" : `${g.total_occurrences.toLocaleString()} total findings`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          {g.score === null
                            ? <span className="text-xs font-medium text-[#8a97ac]">Not scanned</span>
                            : <ScoreRing score={g.score} />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {g.points_to_target === null
                          ? <span className="text-muted-foreground">—</span>
                          : g.points_to_target > 0
                          ? (
                            <span className="inline-flex items-center gap-1 text-[#53647f]">
                              <Target className="h-3.5 w-3.5 text-[#8a98ad]" />
                              {g.points_to_target.toFixed(2)} pts
                            </span>
                          )
                          : <span className="font-semibold text-emerald-600">On target</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums text-[#405575]">
                        {g.pages.toLocaleString()}
                      </TableCell>
                       <TableCell className="text-right text-sm font-medium tabular-nums text-[#405575]">
                         {g.scanned_pages.toLocaleString()}
                       </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {g.issues_count > 0
                          ? <span className="font-semibold text-rose-600">{g.issues_count.toLocaleString()}</span>
                          : <span className="font-semibold text-emerald-600">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {g.potential_issues_count > 0
                          ? <span className="font-semibold text-amber-600">{g.potential_issues_count.toLocaleString()}</span>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="pr-6 text-right text-sm font-medium tabular-nums text-[#405575]">
                        {g.pages_with_issues.toLocaleString()}
                      </TableCell>
                       <TableCell className="pr-6 text-right">
                         <div className="inline-flex flex-col items-end gap-1">
                           <Switch
                             checked={preferencesQ.data?.preferences[g.page_type] ?? true}
                             onCheckedChange={(included) => savePreference.mutate({ pageType: g.page_type, included })}
                             disabled={preferencesQ.isLoading || savePreference.isPending}
                             aria-label={`${preferencesQ.data?.preferences[g.page_type] ?? true ? "Exclude" : "Include"} ${g.page_type} in future accessibility scans`}
                           />
                           <span className="text-[10px] font-medium text-[#7b8aaa]">
                             {preferencesQ.data?.preferences[g.page_type] ?? true ? "Included" : "Excluded"}
                           </span>
                         </div>
                       </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
