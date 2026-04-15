import { useParams, Link } from "wouter";
import { useGetScanReport, useGetScan, getGetScanQueryKey, getGetScanReportQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

export default function ScanReport() {
  const { id } = useParams();
  const scanId = Number(id);

  const { data: scan } = useGetScan(scanId, { query: { enabled: !!scanId, queryKey: getGetScanQueryKey(scanId) } });
  const { data: report, isLoading } = useGetScanReport(scanId, { query: { enabled: !!scanId, queryKey: getGetScanReportQueryKey(scanId) } });

  if (isLoading || !report) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const impactData = [
    { name: "Critical", value: report.issuesByImpact.critical, color: "var(--color-chart-1)" },
    { name: "Serious", value: report.issuesByImpact.serious, color: "var(--color-chart-2)" },
    { name: "Moderate", value: report.issuesByImpact.moderate, color: "var(--color-chart-3)" },
    { name: "Minor", value: report.issuesByImpact.minor, color: "var(--color-chart-4)" },
  ].filter(d => d.value > 0);

  const wcagData = [
    { name: "A", value: report.issuesByWcagLevel.A },
    { name: "AA", value: report.issuesByWcagLevel.AA },
    { name: "AAA", value: report.issuesByWcagLevel.AAA },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href={`/scans/${scanId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Report</h1>
          <p className="text-muted-foreground mt-1">{scan?.name || `Scan #${scanId}`}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{report.totalIssues}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scanned Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{report.scannedPages}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-destructive">{report.issuesByImpact.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Issues / Page</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {report.scannedPages > 0 ? Math.round((report.totalIssues / report.scannedPages) * 10) / 10 : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Issues by Impact</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {impactData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={impactData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {impactData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [`${value} issues`, 'Count']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-background)' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No issues found</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>WCAG Level Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {wcagData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wcagData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" />
                  <YAxis stroke="var(--color-muted-foreground)" />
                  <Tooltip 
                    cursor={{fill: 'var(--color-muted)', opacity: 0.4}}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-background)' }}
                  />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No issues found</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Violated Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {report.topRules.length > 0 ? report.topRules.map((rule, idx) => (
                <div key={idx} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div>
                    <div className="font-semibold text-foreground">{rule.description}</div>
                    <div className="text-sm text-muted-foreground font-mono mt-1">{rule.ruleId}</div>
                  </div>
                  <div className="text-xl font-mono font-bold bg-muted px-4 py-2 rounded-lg">
                    {rule.count}
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">No violated rules recorded.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
