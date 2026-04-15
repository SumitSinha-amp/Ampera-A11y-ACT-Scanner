import { useParams, Link } from "wouter";
import { 
  useGetScan, 
  useGetScanStatus, 
  useCancelScan,
  getGetScanStatusQueryKey,
  getGetScanQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, AlertTriangle, AlertCircle, Info, ChevronRight, BarChart2, StopCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { getStatusBadge } from "@/lib/status-badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function ImpactBadge({ impact }: { impact: string }) {
  switch (impact) {
    case "critical": return <Badge variant="outline" className="bg-[#E11D48] text-white border-transparent">Critical</Badge>;
    case "serious": return <Badge variant="outline" className="bg-[#EA580C] text-white border-transparent">Serious</Badge>;
    case "moderate": return <Badge variant="outline" className="bg-[#EAB308] text-black border-transparent">Moderate</Badge>;
    case "minor": return <Badge variant="outline" className="bg-[#3B82F6] text-white border-transparent">Minor</Badge>;
    default: return <Badge>{impact}</Badge>;
  }
}

function ImpactIcon({ impact }: { impact: string }) {
  switch (impact) {
    case "critical": return <AlertTriangle className="w-4 h-4 text-[#E11D48]" />;
    case "serious": return <AlertTriangle className="w-4 h-4 text-[#EA580C]" />;
    case "moderate": return <AlertCircle className="w-4 h-4 text-[#EAB308]" />;
    case "minor": return <Info className="w-4 h-4 text-[#3B82F6]" />;
    default: return <Info className="w-4 h-4" />;
  }
}

export default function ScanDetail() {
  const { id } = useParams();
  const scanId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scan, isLoading: scanLoading } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
    }
  });

  const isRunning = scan?.status === "running" || scan?.status === "pending";

  const { data: liveStatus } = useGetScanStatus(scanId, {
    query: {
      enabled: !!scanId && isRunning,
      queryKey: getGetScanStatusQueryKey(scanId),
      refetchInterval: 2000,
    }
  });

  const cancelScan = useCancelScan();

  const handleCancel = () => {
    cancelScan.mutate({ id: scanId }, {
      onSuccess: () => {
        toast({ title: "Scan cancelled" });
        queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
      },
      onError: () => {
        toast({ title: "Error cancelling scan", variant: "destructive" });
      }
    });
  };

  if (scanLoading || !scan) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  // Merge live status with full scan detail if running
  const displayStatus = liveStatus?.status || scan.status;
  const totalUrls = liveStatus?.totalUrls || scan.totalUrls;
  const scannedUrls = liveStatus?.scannedUrls || scan.scannedUrls;
  const progressPercent = totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{scan.name || `Scan #${scan.id}`}</h1>
            {getStatusBadge(displayStatus)}
          </div>
          <p className="text-muted-foreground font-mono text-sm">
            ID: {scan.id} | Created: {new Date(scan.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={handleCancel} disabled={cancelScan.isPending}>
              {cancelScan.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <StopCircle className="w-4 h-4 mr-2" />}
              Cancel
            </Button>
          )}
          {!isRunning && scan.status === "completed" && (
            <Link href={`/scans/${scan.id}/report`}>
              <Button>
                <BarChart2 className="w-4 h-4 mr-2" />
                View Report
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan Progress</CardTitle>
          {liveStatus?.currentUrl && (
            <CardDescription className="font-mono truncate">
              Currently scanning: {liveStatus.currentUrl}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm font-medium">
            <span>{scannedUrls} of {totalUrls} URLs scanned</span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </CardContent>
      </Card>

      {/* Detail Results */}
      {!isRunning && scan.pages && scan.pages.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">Page Results</h2>
          
          <Accordion type="multiple" className="space-y-4">
            {scan.pages.map((page) => (
              <AccordionItem key={page.id} value={`page-${page.id}`} className="border bg-card rounded-lg px-4 shadow-sm">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {page.status === "completed" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : page.status === "failed" ? (
                        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="w-5 h-5 text-yellow-500 shrink-0" />
                      )}
                      <span className="font-mono text-sm truncate max-w-lg" title={page.url}>{page.url}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {page.status === "failed" && (
                        <Badge variant="destructive" className="ml-auto">Failed</Badge>
                      )}
                      {page.issueCount > 0 && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono">{page.issueCount} total</Badge>
                          {page.criticalCount > 0 && (
                            <Badge variant="default" className="bg-[#E11D48] hover:bg-[#E11D48] font-mono">
                              {page.criticalCount} critical
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-4">
                  {page.errorMessage && (
                    <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md mb-4 border border-destructive/20 font-mono">
                      Error: {page.errorMessage}
                    </div>
                  )}
                  
                  {page.issues && page.issues.length > 0 ? (
                    <div className="space-y-4 mt-4 border-t pt-4">
                      {page.issues.map((issue) => (
                        <div key={issue.id} className="border rounded-md p-4 bg-muted/30">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <ImpactIcon impact={issue.impact} />
                              <span className="font-semibold text-foreground">{issue.description}</span>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Badge variant="outline" className="font-mono bg-background">{issue.ruleId}</Badge>
                              <ImpactBadge impact={issue.impact} />
                            </div>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4 mt-4 text-sm">
                            <div className="space-y-2">
                              {issue.element && (
                                <div>
                                  <span className="text-muted-foreground block mb-1">Element Snippet:</span>
                                  <code className="block bg-background border p-2 rounded text-xs break-all whitespace-pre-wrap font-mono text-primary">
                                    {issue.element}
                                  </code>
                                </div>
                              )}
                              {issue.selector && (
                                <div>
                                  <span className="text-muted-foreground block mb-1">Selector:</span>
                                  <code className="block bg-background border p-1 px-2 rounded text-xs break-all font-mono">
                                    {issue.selector}
                                  </code>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              {issue.remediation && (
                                <div>
                                  <span className="text-muted-foreground block mb-1">How to fix:</span>
                                  <p className="bg-primary/5 text-primary-foreground/90 border border-primary/20 p-2 rounded text-sm">
                                    {issue.remediation}
                                  </p>
                                </div>
                              )}
                              <div className="flex gap-2 mt-2">
                                {issue.wcagCriteria && (
                                  <Badge variant="secondary" className="text-xs font-mono">WCAG {issue.wcagCriteria}</Badge>
                                )}
                                {issue.wcagLevel && (
                                  <Badge variant="secondary" className="text-xs font-mono">Level {issue.wcagLevel}</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : page.status === "completed" ? (
                    <div className="p-8 text-center text-muted-foreground border rounded-md mt-4 border-dashed bg-muted/10">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                      No accessibility issues found on this page.
                    </div>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* Live Running State view */}
      {isRunning && liveStatus?.pages && liveStatus.pages.length > 0 && (
         <div className="space-y-4">
           <h3 className="font-semibold text-lg">Live Progress</h3>
           <div className="border rounded-lg bg-card overflow-hidden">
             <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">URL</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-right p-3 font-medium">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveStatus.pages.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3 font-mono text-xs truncate max-w-[300px]" title={p.url}>{p.url}</td>
                        <td className="p-3">
                          {p.status === 'scanning' ? (
                            <span className="flex items-center text-primary"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Scanning</span>
                          ) : p.status === 'completed' ? (
                            <span className="flex items-center text-green-600"><CheckCircle2 className="w-3 h-3 mr-2"/> Done</span>
                          ) : p.status === 'failed' ? (
                            <span className="flex items-center text-red-600"><XCircle className="w-3 h-3 mr-2"/> Failed</span>
                          ) : (
                            <span className="flex items-center text-muted-foreground"><Clock className="w-3 h-3 mr-2"/> Pending</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {p.issueCount > 0 ? (
                            <span className="font-mono">{p.issueCount}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
           </div>
         </div>
      )}
    </div>
  );
}
