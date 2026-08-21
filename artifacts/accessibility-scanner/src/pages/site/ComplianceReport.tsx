import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight as ChevronRightIcon, FileCheck2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BASE, ConformanceBadge, ImpactIcon, SiteBreadcrumb, useSite, useAutoActiveSite } from "@/pages/site/shared";
import { usePageGroup } from "@/contexts/page-group";
import {
  WCAG_TAXONOMY,
  FRAMEWORK_META,
  formatScLabel,
  type Framework,
} from "@/pages/site/wcagTaxonomy";

interface RuleAgg {
  rule_id: string;
  impact: string;
  description: string;
  wcag_level: string | null;
  occurrences: number;
  pages_affected: number;
}

interface ComplianceData {
  criteria: Record<string, { occurrences: number; pages: number; rules: RuleAgg[] }>;
  bestPractice: { occurrences: number; pages: number; rules: RuleAgg[] } | null;
  hasData: boolean;
}

function useCompliance(siteId: number) {
  const { selectedGroup } = usePageGroup();
  return useQuery<ComplianceData>({
    queryKey: ["site-compliance", siteId, selectedGroup?.id ?? "all"],
    queryFn: async () => {
      const pageGroupQuery = selectedGroup
        ? `?page_group=${encodeURIComponent(selectedGroup.id)}`
        : "";
      const r = await fetch(`${BASE}/api/sites/${siteId}/compliance${pageGroupQuery}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load compliance data");
      return r.json();
    },
  });
}

function IssueBreakdownRow({ rule }: { rule: RuleAgg }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-t border-border/60 first:border-t-0 pl-4">
      <div className="flex items-start gap-2 min-w-0">
        <ImpactIcon impact={rule.impact} />
        <div className="min-w-0">
          <p className="text-sm leading-snug">{rule.description?.split(": ")[0] ?? rule.rule_id}</p>
          <p className="text-xs text-muted-foreground">{rule.rule_id}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        <span className="text-xs text-muted-foreground w-16">
          {rule.occurrences.toLocaleString()} occ.
        </span>
        <span className="text-xs text-muted-foreground w-16">
          {rule.pages_affected.toLocaleString()} pages
        </span>
      </div>
    </div>
  );
}

function CriterionRow({
  scLabel, level, occurrences, pages, rules,
}: {
  scLabel: string;
  level: "A" | "AA" | "AAA";
  occurrences: number;
  pages: number;
  rules: RuleAgg[];
}) {
  const [open, setOpen] = useState(false);
  const hasIssues = rules.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasIssues && setOpen((v) => !v)}
        disabled={!hasIssues}
        className={`w-full flex items-center gap-2 py-2 pl-2 pr-3 text-left rounded-md ${
          hasIssues ? "hover:bg-muted/60 cursor-pointer" : "cursor-default opacity-70"
        }`}
      >
        {hasIssues ? (
          open ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRightIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <ConformanceBadge level={level} />
        <span className="flex-1 text-sm min-w-0 truncate">{scLabel}</span>
        <span className={`text-sm tabular-nums font-medium ${occurrences > 0 ? "" : "text-muted-foreground"}`}>
          {occurrences > 0 ? occurrences.toLocaleString() : "—"}
        </span>
      </button>
      {open && hasIssues && (
        <div className="ml-9 mr-2 mb-2 rounded-md bg-muted/30 px-2">
          {rules
            .slice()
            .sort((a, b) => b.occurrences - a.occurrences)
            .map((r) => <IssueBreakdownRow key={`${r.rule_id}-${r.impact}`} rule={r} />)}
          <div className="flex items-center justify-between py-2 border-t border-border/60 pl-4 text-xs text-muted-foreground">
            <span>Total</span>
            <div className="flex items-center gap-4 shrink-0">
              <span className="w-16">{occurrences.toLocaleString()}</span>
              <span className="w-16">{pages.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ComplianceReport({ siteId, framework }: { siteId: number; framework: Framework }) {
  useAutoActiveSite(siteId);
  const siteQ = useSite(siteId);
  const complianceQ = useCompliance(siteId);
  const meta = FRAMEWORK_META[framework];

  if (siteQ.isLoading || complianceQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading {meta.title}…
      </div>
    );
  }
  if (siteQ.isError || !siteQ.data || complianceQ.isError || !complianceQ.data) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive text-sm">
        Failed to load {meta.title}.
      </div>
    );
  }

  const site = siteQ.data;
  const data = complianceQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <SiteBreadcrumb siteId={siteId} siteName={site.name} current={meta.title} />
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-muted-foreground" />
          {meta.title}
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">{meta.blurb}</p>
      </div>

      {!data.hasData ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No completed scan found for this site yet. Run a scan to generate a compliance report.
          </CardContent>
        </Card>
      ) : (
        <>
          {WCAG_TAXONOMY.map((principle) => {
            const principleOccurrences = principle.categories
              .flatMap((c) => c.criteria)
              .reduce((sum, sc) => sum + (data.criteria[sc.sc]?.occurrences ?? 0), 0);

            return (
              <Card key={principle.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{principle.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{principle.description}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {principleOccurrences.toLocaleString()} occurrences
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {principle.categories.map((category) => (
                    <div key={category.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 pl-2">
                        {category.name}
                      </p>
                      <div className="space-y-0.5">
                        {category.criteria.map((sc) => {
                          const agg = data.criteria[sc.sc];
                          return (
                            <CriterionRow
                              key={sc.sc}
                              scLabel={formatScLabel(framework, sc.sc, sc.name)}
                              level={sc.level}
                              occurrences={agg?.occurrences ?? 0}
                              pages={agg?.pages ?? 0}
                              rules={agg?.rules ?? []}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}

          {data.bestPractice && data.bestPractice.rules.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Best practices: Quality</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Resolving issues at this level isn't required for conformance, but improves overall usability.
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {data.bestPractice.occurrences.toLocaleString()} occurrences
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CriterionRow
                  scLabel="Accessibility best practices"
                  level="A"
                  occurrences={data.bestPractice.occurrences}
                  pages={data.bestPractice.pages}
                  rules={data.bestPractice.rules}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
