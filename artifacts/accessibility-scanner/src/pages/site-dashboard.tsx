import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Globe,
  ChevronRight,
  ExternalLink,
  BarChart3,
  Minus,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileText,
  Layers,
  Download,
  XCircle,
  CheckCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { BASE, DashboardData, ScoreHistoryPoint, ScoreGauge, useAutoActiveSite } from "@/pages/site/shared";
import { useAuth } from "@/contexts/auth";

interface Props { siteId: number }

const LEVEL_META: Record<string, {
  label: string;
  badgeCls: string;
  ringColor: string;
  textCls: string;
}> = {
  "A":             { label: "WCAG A",         badgeCls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",    ringColor: "#22c55e", textCls: "text-green-600 dark:text-green-400" },
  "AA":            { label: "WCAG AA",        badgeCls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",        ringColor: "#3b82f6", textCls: "text-blue-600 dark:text-blue-400" },
  "AAA":           { label: "WCAG AAA",       badgeCls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", ringColor: "#a855f7", textCls: "text-purple-600 dark:text-purple-400" },
  "WAI-ARIA":      { label: "WAI-ARIA",       badgeCls: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",        ringColor: "#14b8a6", textCls: "text-teal-600 dark:text-teal-400" },
  "Best Practice": { label: "Best Practices", badgeCls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", ringColor: "#f97316", textCls: "text-orange-600 dark:text-orange-400" },
};

const IMPACT_COLOR: Record<string, string> = {
  critical: "text-red-500",
  serious:  "text-orange-500",
  moderate: "text-yellow-500",
  minor:    "text-blue-400",
};

function scoreStatus(score: number): { icon: React.ReactNode; label: string; cls: string } {
  if (score >= 90) return { icon: <CheckCircle2 className="w-4 h-4" />, label: "Good",     cls: "text-green-600 dark:text-green-400" };
  if (score >= 70) return { icon: <AlertTriangle className="w-4 h-4" />, label: "Fair",    cls: "text-yellow-600 dark:text-yellow-400" };
  return              { icon: <AlertCircle className="w-4 h-4" />,      label: "Critical", cls: "text-red-600 dark:text-red-400" };
}

const DATE_RANGES = [
  { label: "Last 3 months",  months: 3 },
  { label: "Last 6 months",  months: 6 },
  { label: "Last 12 months", months: 12 },
  { label: "All time",       months: 0 },
];

function exportCsv(data: ScoreHistoryPoint[], mode: "issues" | "potential") {
  const header = mode === "issues"
    ? "Date,Score,Pages,Total Issues,Level A Issues,Level AA Issues"
    : "Date,Score,Pages,Total Potential,Level A Potential,Level AA Potential";
  const rows = data.map((p) => {
    const dt = new Date(p.scanned_at).toLocaleDateString();
    if (mode === "issues") {
      return `${dt},${p.score.toFixed(1)},${p.total_scanned ?? 0},${p.total_issues ?? 0},${p.level_a_issues ?? 0},${p.level_aa_issues ?? 0}`;
    }
    return `${dt},${p.score.toFixed(1)},${p.total_scanned ?? 0},${p.total_potential_issues ?? 0},${p.level_a_potential ?? 0},${p.level_aa_potential ?? 0}`;
  });
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `score-history-${mode}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SiteDashboard({ siteId }: Props) {
  useAutoActiveSite(siteId);
  const { user } = useAuth();

  const [improveTab, setImproveTab] = useState<"issues" | "potential">("issues");
  const [historyTab, setHistoryTab] = useState<"issues" | "potential">("issues");
  const [historyMetric, setHistoryMetric] = useState<"count" | "occurrences">("count");
  const [dateRange, setDateRange] = useState(6);

  const dashQ = useQuery<DashboardData>({
    queryKey: ["site-dashboard", siteId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/sites/${siteId}/dashboard`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load dashboard");
      return r.json();
    },
  });

  const historyQ = useQuery<{ history: ScoreHistoryPoint[] }>({
    queryKey: ["site-score-history", siteId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/sites/${siteId}/score-history`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load score history");
      return r.json();
    },
  });

  const d = dashQ.data;
  const site = d?.site;

  const filteredHistory = useMemo(() => {
    const all = historyQ.data?.history ?? [];
    if (dateRange === 0) return all;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - dateRange);
    return all.filter((p) => new Date(p.scanned_at) >= cutoff);
  }, [historyQ.data, dateRange]);

  if (dashQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading dashboard…
      </div>
    );
  }
  if (dashQ.isError || !site) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive text-sm">
        Failed to load site dashboard.
      </div>
    );
  }

  const impactOrder = ["critical", "serious", "moderate", "minor"];
  const impactColors: Record<string, string> = {
    critical: "bg-red-500",
    serious:  "bg-orange-500",
    moderate: "bg-yellow-400",
    minor:    "bg-blue-400",
  };
  const impactBarColors: Record<string, string> = {
    critical: "bg-red-500",
    serious:  "bg-orange-400",
    moderate: "bg-yellow-400",
    minor:    "bg-blue-400",
  };
  const impactMap = Object.fromEntries((d?.impactBreakdown ?? []).map((r) => [r.impact, r]));
  const maxImpact = Math.max(...(d?.impactBreakdown ?? []).map((r) => r.occurrences), 1);

  const topActiveIssues  = improveTab === "issues" ? (d?.topIssues ?? []) : (d?.topPotentialIssues ?? []);
  const resolvedIssues   = d?.resolvedIssues ?? [];

  const totalIssues    = (d?.impactBreakdown ?? []).filter((r) => ["critical","serious"].includes(r.impact)).reduce((s, r) => s + r.occurrences, 0);
  const totalPotential = (d?.impactBreakdown ?? []).filter((r) => ["moderate","minor"].includes(r.impact)).reduce((s, r) => s + r.occurrences, 0);

  const history = filteredHistory;
  const scoreColor = (d?.score ?? 100) >= 80 ? "#22c55e" : (d?.score ?? 100) >= 65 ? "#eab308" : "#ef4444";

  const chartData = history.map((p) => ({
    score: +p.score.toFixed(1),
    date: new Date(p.scanned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
    total_issues: p.total_issues ?? 0,
    level_a_issues: p.level_a_issues ?? 0,
    level_aa_issues: p.level_aa_issues ?? 0,
    total_potential: p.total_potential_issues ?? 0,
    level_a_potential: p.level_a_potential ?? 0,
    level_aa_potential: p.level_aa_potential ?? 0,
    pages: p.total_scanned ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb + Header ── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/crawler/sites" className="hover:underline">Sites</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{site.name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-muted-foreground" />
              {site.name}
            </h1>
            <a href={site.baseUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-0.5">
              {site.baseUrl}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {d?.session && (
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <p>Last scan: {new Date(d.session.completedAt).toLocaleDateString()}</p>
              {user?.permissions.canViewCrawlHistory && (
                <Link href={`/crawler/${d.session.crawlerId}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 justify-end mt-0.5">
                  View crawl session <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {!d?.session ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No completed crawler scan found for this site.</p>
            <p className="text-xs text-muted-foreground">
              Run a crawler scan and link it to this site to see the accessibility dashboard.
            </p>
            {user?.permissions.canCreateCrawl && (
              <Button variant="outline" asChild>
                <Link href="/crawler/new">Start a crawler scan</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Row 1: Unified stat card + Score history ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            {/* Unified top card: Score + Impact Breakdown + Conformance Scores */}
            <Card className="overflow-hidden">
              <CardContent className="p-0 h-full">
                <div className="grid grid-cols-[auto_1fr_1fr] divide-x h-full">

                  {/* Col 1: Score gauge */}
                  <div className="flex flex-col items-center justify-center gap-2 p-5 w-44 shrink-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
                      Accessibility Score
                    </p>
                    {d.score !== null ? (
                      <>
                        <ScoreGauge score={d.score} />
                        {d.scoreDelta !== null && (
                          <div className={`flex items-center gap-1 text-xs font-semibold ${
                            d.scoreDelta > 0 ? "text-green-600 dark:text-green-400"
                            : d.scoreDelta < 0 ? "text-red-500"
                            : "text-muted-foreground"
                          }`}>
                            {d.scoreDelta > 0
                              ? <TrendingUp className="w-3 h-3" />
                              : d.scoreDelta < 0
                              ? <TrendingDown className="w-3 h-3" />
                              : <Minus className="w-3 h-3" />}
                            <span>{d.scoreDelta > 0 ? "+" : ""}{d.scoreDelta} vs last scan</span>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground text-center leading-tight">
                          {d.score >= 80
                            ? "Good — keep fixing issues to reach 90+"
                            : d.score >= 65
                            ? "Fair — significant issues need attention"
                            : "Poor — critical accessibility barriers present"}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">N/A</p>
                    )}
                  </div>

                  {/* Col 2: Impact Breakdown (compact) */}
                  <div className="p-4 flex flex-col justify-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Impact Breakdown
                    </p>
                    <div className="space-y-2.5">
                      {impactOrder.map((impact) => {
                        const row = impactMap[impact];
                        const count = row?.occurrences ?? 0;
                        const pct = Math.round((count / maxImpact) * 100);
                        return (
                          <div key={impact}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${impactColors[impact]}`} />
                                <span className="text-xs font-medium capitalize">{impact}</span>
                              </div>
                              <span className="text-xs font-semibold tabular-nums text-foreground">
                                {count.toLocaleString()}
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${impactBarColors[impact]}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Col 3: Conformance Level Scores (compact) */}
                  <div className="p-4 flex flex-col justify-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Conformance Scores
                    </p>
                    <div className="space-y-2">
                      {(d.levelScores ?? []).map((ls) => {
                        const meta = LEVEL_META[ls.level] ?? { label: ls.level, badgeCls: "bg-muted text-foreground", ringColor: "#94a3b8", textCls: "text-muted-foreground" };
                        return (
                          <div key={ls.level} className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 ${meta.badgeCls}`}>
                              {meta.label}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${ls.score}%`, backgroundColor: meta.ringColor }} />
                            </div>
                            <span className={`text-sm font-bold tabular-nums ${meta.textCls} w-8 text-right shrink-0`}>
                              {ls.score.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                      {(d.levelScores ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground">No conformance data</p>
                      )}
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* Score history chart */}
            {chartData.length >= 2 ? (
              <Card className="h-full">
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Score History
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">{chartData.length} scan{chartData.length !== 1 ? "s" : ""}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Accessibility score trend across all completed crawl sessions</p>
                </CardHeader>
                <CardContent className="pt-2 pb-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis domain={[Math.max(0, Math.floor(Math.min(...chartData.map(p => p.score)) / 10) * 10 - 5), 100]} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} width={32} />
                      <ChartTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                        formatter={(val: number) => [`${val.toFixed(1)} / 100`, "Score"]}
                      />
                      <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.5} label={{ value: "Good", position: "right", fontSize: 9, fill: "#22c55e", opacity: 0.7 }} />
                      <Line type="monotone" dataKey="score" stroke={scoreColor} strokeWidth={2}
                        dot={{ r: 3, fill: scoreColor, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: scoreColor }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex items-center justify-center h-full min-h-[180px]">
                <p className="text-sm text-muted-foreground">Run more scans to see score history</p>
              </Card>
            )}
          </div>

          {/* ── Improve your score ── */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Improve your score</h2>
            <Card>
              <CardContent className="p-0">
                {/* Tab bar */}
                <div className="flex items-center gap-0 border-b px-4">
                  {[
                    { id: "issues",    label: "Issues",           count: totalIssues },
                    { id: "potential", label: "Potential issues",  count: totalPotential },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setImproveTab(tab.id as "issues" | "potential")}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                        improveTab === tab.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {improveTab === tab.id
                        ? <XCircle className="w-4 h-4 text-red-500" />
                        : <AlertTriangle className="w-4 h-4 text-orange-400" />}
                      {tab.label}
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        improveTab === tab.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}>{tab.count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>

                {/* Two-column panels */}
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
                  {/* Fix these issues */}
                  <div className="p-4 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">Fix these issues to improve your score</p>
                    {/* Header row */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium pb-1 border-b">
                      <span className="flex-1">Issues</span>
                      <span className="w-20 text-right">Occurrences</span>
                      <span className="w-28 text-right">Points you can gain</span>
                    </div>
                    {topActiveIssues.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No {improveTab === "issues" ? "issues" : "potential issues"} found</p>
                    ) : topActiveIssues.map((issue) => (
                      <div key={`${issue.rule_id}-${issue.impact}`} className="flex items-center gap-2 py-2 border-b last:border-b-0">
                        <XCircle className={`w-4 h-4 shrink-0 ${IMPACT_COLOR[issue.impact] ?? "text-muted-foreground"}`} />
                        <Link href={`/sites/${siteId}/issues/${encodeURIComponent(issue.rule_id)}`}
                          className="flex-1 text-sm text-foreground hover:text-primary hover:underline truncate flex items-center gap-1">
                          {issue.description}
                          <ArrowRight className="w-3 h-3 shrink-0 opacity-40" />
                        </Link>
                        <span className="w-20 text-right text-sm tabular-nums text-muted-foreground shrink-0">
                          {issue.occurrences.toLocaleString()}
                        </span>
                        <span className="w-28 text-right text-sm font-bold tabular-nums shrink-0">
                          {(+issue.points_to_gain).toFixed(2)} points
                        </span>
                      </div>
                    ))}
                    <div className="pt-2">
                      <Link href={`/sites/${siteId}/issues`}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                        View all issues <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Resolved issues */}
                  <div className="p-4 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">Resolved issues</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium pb-1 border-b">
                      <span className="flex-1">Resolved issues</span>
                      <span className="w-20 text-right">Occurrences</span>
                      <span className="w-28 text-right">Points already gained</span>
                    </div>
                    {resolvedIssues.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        {d?.previousScore === null ? "No previous scan to compare" : "No resolved issues since last scan"}
                      </p>
                    ) : resolvedIssues.map((issue) => (
                      <div key={`${issue.rule_id}-${issue.impact}`} className="flex items-center gap-2 py-2 border-b last:border-b-0">
                        <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
                        <span className="flex-1 text-sm text-foreground truncate flex items-center gap-1">
                          {issue.description}
                          <ArrowRight className="w-3 h-3 shrink-0 opacity-40" />
                        </span>
                        <span className="w-20 text-right text-sm tabular-nums text-muted-foreground shrink-0">
                          {issue.occurrences.toLocaleString()}
                        </span>
                        <span className="w-28 text-right text-sm font-bold tabular-nums text-green-600 dark:text-green-400 shrink-0">
                          {(+issue.points_to_gain).toFixed(2)} points
                        </span>
                      </div>
                    ))}
                    <div className="pt-2">
                      <span className="text-xs text-muted-foreground">
                        {resolvedIssues.length > 0 ? `${resolvedIssues.length} rule${resolvedIssues.length !== 1 ? "s" : ""} resolved since last scan` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Progress over time ── */}
          {chartData.length >= 2 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Progress over time</h2>
              <Card>
                <CardContent className="p-0">
                  {/* Tab bar */}
                  <div className="flex items-center border-b px-4">
                    {[
                      { id: "issues",    label: "History of issues" },
                      { id: "potential", label: "History of potential issues" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setHistoryTab(tab.id as "issues" | "potential")}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                          historyTab === tab.id
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Filter controls */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b flex-wrap">
                    {/* Issues / Occurrences toggle */}
                    <div className="flex rounded-md border overflow-hidden text-xs font-medium">
                      {([["count", "Issues"], ["occurrences", "Occurrences"]] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setHistoryMetric(val)}
                          className={`px-3 py-1.5 transition-colors ${
                            historyMetric === val
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Date range */}
                    <select
                      value={dateRange}
                      onChange={(e) => setDateRange(+e.target.value)}
                      className="text-xs border rounded-md px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {DATE_RANGES.map((r) => (
                        <option key={r.months} value={r.months}>{r.label}</option>
                      ))}
                    </select>

                    {/* Export to CSV */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 ml-auto"
                      onClick={() => exportCsv(filteredHistory, historyTab as "issues" | "potential")}
                    >
                      <Download className="w-3 h-3" />
                      Export to CSV
                    </Button>
                  </div>

                  {/* Chart */}
                  <div className="p-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={chartData} margin={{ top: 10, right: 48, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} width={40} label={{ value: "Number of issues", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 9, fill: "currentColor", opacity: 0.5 } }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }} tickLine={false} axisLine={false} width={40} label={{ value: "Number of pages", angle: 90, position: "insideRight", offset: 10, style: { fontSize: 9, fill: "currentColor", opacity: 0.5 } }} />
                        <ChartTooltip
                          contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                        {historyTab === "issues" ? (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey="level_a_issues" name="Level A" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                            <Line yAxisId="left" type="monotone" dataKey="level_aa_issues" name="Level AA" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#a855f7", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                          </>
                        ) : (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey="level_a_potential" name="Level A" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                            <Line yAxisId="left" type="monotone" dataKey="level_aa_potential" name="Level AA" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#a855f7", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                          </>
                        )}
                        <Line yAxisId="right" type="monotone" dataKey="pages" name="Number of pages" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2, fill: "#94a3b8", strokeWidth: 0 }} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Quick links ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { href: `/sites/${siteId}/page-groups`,     icon: <Layers className="w-4 h-4" />,   label: "Page Groups",     desc: "Accessibility by page type" },
              { href: `/sites/${siteId}/issues`,          icon: <AlertCircle className="w-4 h-4" />, label: "Issues",       desc: "Critical & serious issues" },
              { href: `/sites/${siteId}/potential-issues`, icon: <FileText className="w-4 h-4" />, label: "Potential Issues", desc: "Moderate & minor to review" },
            ].map(({ href, icon, label, desc }) => (
              <Link key={href} href={href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<p className="text-sm font-semibold text-foreground">{label}</p></div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
