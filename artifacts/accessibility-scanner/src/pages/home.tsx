import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useCreateScan, useParseSitemap, useGetScan, useGetScanStatus, getGetScanStatusQueryKey, getGetScanQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, Globe, Link as LinkIcon, Loader2, AlertCircle, X, Plus, Filter, CheckCircle2, XCircle, Clock, BarChart2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getStatusBadge } from "@/lib/status-badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const ALL_RULES: { id: string; label: string }[] = [
  { id: "SIA-R1",   label: "Page title" },
  { id: "SIA-R2",   label: "Image alt text" },
  { id: "SIA-R3",   label: "Duplicate IDs" },
  { id: "SIA-R4",   label: "Image alt attribute" },
  { id: "SIA-R8",   label: "Link purpose" },
  { id: "SIA-R9",   label: "Empty headings" },
  { id: "SIA-R10",  label: "Form labels" },
  { id: "SIA-R11",  label: "Input label" },
  { id: "SIA-R12",  label: "Button name" },
  { id: "SIA-R14",  label: "Label in name" },
  { id: "SIA-R16",  label: "Audio description" },
  { id: "SIA-R17",  label: "Media alternatives" },
  { id: "SIA-R21",  label: "Audio/video controls" },
  { id: "SIA-R22",  label: "Video captions" },
  { id: "SIA-R25",  label: "Frame titles" },
  { id: "SIA-R30",  label: "Text contrast" },
  { id: "SIA-R31",  label: "Link contrast" },
  { id: "SIA-R32",  label: "Duplicate IDs in ARIA" },
  { id: "SIA-R34",  label: "Table headers" },
  { id: "SIA-R35",  label: "Text not in landmark" },
  { id: "SIA-R36",  label: "Deprecated HTML" },
  { id: "SIA-R40",  label: "Accessible names" },
  { id: "SIA-R41",  label: "Select label" },
  { id: "SIA-R42",  label: "Keyboard navigation" },
  { id: "SIA-R43",  label: "Focus visible" },
  { id: "SIA-R44",  label: "Focus order" },
  { id: "SIA-R47",  label: "List structure" },
  { id: "SIA-R48",  label: "Skip navigation" },
  { id: "SIA-R58",  label: "Skip to main content" },
  { id: "SIA-R59",  label: "Link purpose (context)" },
  { id: "SIA-R62",  label: "Heading structure" },
  { id: "SIA-R64",  label: "Heading hierarchy" },
  { id: "SIA-R65",  label: "Focus indicator" },
  { id: "SIA-R68",  label: "Text resize clipping" },
  { id: "SIA-R69",  label: "Button accessible name" },
  { id: "SIA-R74",  label: "Multiple ways" },
  { id: "SIA-R82",  label: "Error identification" },
  { id: "SIA-R84",  label: "Error suggestion" },
  { id: "SIA-R87",  label: "Main landmark" },
  { id: "SIA-R88",  label: "ARIA labels" },
  { id: "SIA-R91",  label: "Parsing errors" },
  { id: "SIA-R92",  label: "Form instructions" },
  { id: "SIA-R93",  label: "PDF accessibility" },
  { id: "SIA-R94",  label: "Status messages" },
  { id: "SIA-R110", label: "Images of text" },
  { id: "SIA-R114", label: "Link opens new window" },
  { id: "SIA-R115", label: "Consistent navigation" },
  { id: "SIA-R116", label: "Consistent identification" },
  { id: "SIA-R117", label: "Change on request" },
];

function RuleFilterSelector({
  selectedRules,
  onChange,
}: {
  selectedRules: string[];
  onChange: (rules: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = ALL_RULES.filter(
    (r) =>
      !selectedRules.includes(r.id) &&
      (r.id.toLowerCase().includes(query.toLowerCase()) ||
        r.label.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const addRule = (ruleId: string) => {
    if (!selectedRules.includes(ruleId)) {
      onChange([...selectedRules, ruleId]);
    }
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeRule = (ruleId: string) => {
    onChange(selectedRules.filter((r) => r !== ruleId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 relative">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            placeholder="Search rule ID or name (e.g. SIA-R14, contrast)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="pr-8"
          />
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {open && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="border rounded-md bg-background shadow-md max-h-52 overflow-y-auto z-50 relative"
        >
          {filtered.slice(0, 20).map((rule) => (
            <button
              key={rule.id}
              type="button"
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                addRule(rule.id);
              }}
            >
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary shrink-0">
                {rule.id}
              </span>
              <span className="text-muted-foreground">{rule.label}</span>
              <Plus className="w-3.5 h-3.5 ml-auto text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {selectedRules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedRules.map((ruleId) => {
            const rule = ALL_RULES.find((r) => r.id === ruleId);
            return (
              <Badge
                key={ruleId}
                variant="secondary"
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 text-sm"
              >
                <span className="font-mono text-xs">{ruleId}</span>
                {rule && (
                  <span className="text-muted-foreground text-xs hidden sm:inline">
                    — {rule.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeRule(ruleId)}
                  className="rounded-sm hover:bg-muted-foreground/20 p-0.5 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          })}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            onClick={() => onChange([])}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function ImpactBadgeSmall({ impact }: { impact: string }) {
  switch (impact) {
    case "critical": return <Badge variant="outline" className="bg-[#E11D48] text-white border-transparent text-xs">Critical</Badge>;
    case "serious":  return <Badge variant="outline" className="bg-[#EA580C] text-white border-transparent text-xs">Serious</Badge>;
    case "moderate": return <Badge variant="outline" className="bg-[#EAB308] text-black border-transparent text-xs">Moderate</Badge>;
    case "minor":    return <Badge variant="outline" className="bg-[#3B82F6] text-white border-transparent text-xs">Minor</Badge>;
    default: return <Badge className="text-xs">{impact}</Badge>;
  }
}

function InlineScanMonitor({ scanId, onNewScan }: { scanId: number; onNewScan: () => void }) {
  const { data: scan } = useGetScan(scanId, {
    query: {
      queryKey: getGetScanQueryKey(scanId),
      refetchInterval: 3000,
    },
  });

  const isRunning = scan?.status === "running" || scan?.status === "pending";

  const { data: liveStatus } = useGetScanStatus(scanId, {
    query: {
      queryKey: getGetScanStatusQueryKey(scanId),
      enabled: isRunning,
      refetchInterval: 2000,
    },
  });

  if (!scan) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayStatus = liveStatus?.status || scan.status;
  const totalUrls = liveStatus?.totalUrls || scan.totalUrls || 1;
  const scannedUrls = liveStatus?.scannedUrls || scan.scannedUrls || 0;
  const progressPercent = totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;

  const allIssues = scan.pages?.flatMap((p) => (p.issues || []).map((i) => ({ ...i, pageUrl: p.url }))) || [];
  const byRule = allIssues.reduce<Record<string, { count: number; impact: string; description: string; wcagCriteria: string | null }>>((acc, i) => {
    if (!acc[i.ruleId]) acc[i.ruleId] = { count: 0, impact: i.impact, description: i.description, wcagCriteria: i.wcagCriteria };
    acc[i.ruleId].count++;
    return acc;
  }, {});
  const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const topIssues = Object.entries(byRule)
    .sort((a, b) => (IMPACT_ORDER[a[1].impact] ?? 9) - (IMPACT_ORDER[b[1].impact] ?? 9))
    .slice(0, 10);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">{scan.name || `Scan #${scan.id}`}</CardTitle>
            {getStatusBadge(displayStatus)}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/scans/${scanId}`}>
              <Button variant="outline" size="sm">
                <BarChart2 className="w-4 h-4 mr-2" />
                Full Details
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={onNewScan}>
              New Scan
            </Button>
          </div>
        </div>
        {liveStatus?.currentUrl && (
          <CardDescription className="font-mono text-xs truncate mt-1">
            Scanning: {liveStatus.currentUrl}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{scannedUrls} of {totalUrls} URLs</span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Live page status table while running */}
        {isRunning && liveStatus?.pages && liveStatus.pages.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">URL</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {liveStatus.pages.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-mono truncate max-w-[260px]" title={p.url}>{p.url}</td>
                      <td className="px-3 py-1.5">
                        {p.status === "scanning" ? (
                          <span className="flex items-center gap-1 text-primary"><Loader2 className="w-3 h-3 animate-spin" /> Scanning</span>
                        ) : p.status === "completed" ? (
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" /> Done</span>
                        ) : p.status === "failed" ? (
                          <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3 h-3" /> Failed</span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3" /> Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{p.issueCount > 0 ? p.issueCount : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completed results summary */}
        {!isRunning && scan.pages && scan.pages.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {scan.totalIssues} issue{scan.totalIssues !== 1 ? "s" : ""} found across {scan.pages.length} page{scan.pages.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Per-page results */}
            <Accordion type="multiple" className="space-y-2">
              {scan.pages.map((page) => (
                <AccordionItem
                  key={page.id}
                  value={`page-${page.id}`}
                  className="border rounded-md bg-muted/10 px-3"
                >
                  <AccordionTrigger className="hover:no-underline py-2.5 text-xs">
                    <div className="flex items-center justify-between w-full pr-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {page.status === "completed" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="font-mono truncate max-w-xs" title={page.url}>{page.url}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {page.issueCount > 0 && (
                          <Badge variant="secondary" className="text-xs font-mono">{page.issueCount}</Badge>
                        )}
                        {page.criticalCount > 0 && (
                          <Badge className="text-xs bg-[#E11D48] hover:bg-[#E11D48] font-mono">{page.criticalCount} crit</Badge>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    {page.issues && page.issues.length > 0 ? (
                      <div className="border rounded-md overflow-hidden mt-1">
                        <table className="w-full text-xs">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Rule</th>
                              <th className="text-left px-3 py-2 font-medium">Issue</th>
                              <th className="text-left px-3 py-2 font-medium">Severity</th>
                              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">WCAG</th>
                            </tr>
                          </thead>
                          <tbody>
                            {page.issues.slice(0, 20).map((issue) => (
                              <tr key={issue.id} className="border-t">
                                <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">{issue.ruleId}</td>
                                <td className="px-3 py-1.5 text-muted-foreground max-w-xs truncate" title={issue.description}>{issue.description}</td>
                                <td className="px-3 py-1.5"><ImpactBadgeSmall impact={issue.impact} /></td>
                                <td className="px-3 py-1.5 hidden md:table-cell font-mono text-muted-foreground">
                                  {issue.wcagCriteria ? `${issue.wcagCriteria} (${issue.wcagLevel})` : "—"}
                                </td>
                              </tr>
                            ))}
                            {page.issues.length > 20 && (
                              <tr className="border-t">
                                <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground italic">
                                  +{page.issues.length - 20} more — <Link href={`/scans/${scanId}`} className="text-primary underline">view full details</Link>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : page.status === "completed" ? (
                      <p className="text-xs text-muted-foreground px-1 py-2">No issues found on this page.</p>
                    ) : (
                      <p className="text-xs text-red-500 px-1 py-2">{page.errorMessage || "Page scan failed."}</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {topIssues.length > 0 && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-2">Top issues by rule:</p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Rule ID</th>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                        <th className="text-left px-3 py-2 font-medium">Severity</th>
                        <th className="text-right px-3 py-2 font-medium">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topIssues.map(([ruleId, data]) => (
                        <tr key={ruleId} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-primary">{ruleId}</td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-xs truncate" title={data.description}>{data.description}</td>
                          <td className="px-3 py-1.5"><ImpactBadgeSmall impact={data.impact} /></td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium">{data.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [scanName, setScanName] = useState("");
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);

  const [manualUrls, setManualUrls] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const parseSitemap = useParseSitemap();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);

  const createScan = useCreateScan();

  const handleManualUrlsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setManualUrls(e.target.value);
    const urls = e.target.value.split("\n").map((u) => u.trim()).filter(Boolean);
    setParsedUrls(urls);
  };

  const handleParseSitemap = () => {
    if (!sitemapUrl) return;
    parseSitemap.mutate(
      { data: { url: sitemapUrl } },
      {
        onSuccess: (data) => {
          setParsedUrls(data.urls);
          toast({ title: "Sitemap Parsed", description: `Found ${data.count} URLs.` });
        },
        onError: () => {
          toast({ title: "Error parsing sitemap", description: "Could not parse sitemap URL", variant: "destructive" });
        },
      }
    );
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/scans/upload-csv", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setParsedUrls(data.urls);
      toast({ title: "CSV Parsed", description: `Found ${data.count} URLs.` });
    } catch {
      toast({ title: "Error parsing CSV", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const startScan = () => {
    if (parsedUrls.length === 0) {
      toast({ title: "No URLs", description: "Please provide at least one URL to scan.", variant: "destructive" });
      return;
    }
    createScan.mutate(
      {
        data: {
          urls: parsedUrls,
          name: scanName || undefined,
          options: {
            maxConcurrency: 5,
            ...(selectedRules.length > 0 ? { rules: selectedRules } : {}),
          },
        },
      },
      {
        onSuccess: (data) => {
          setActiveScanId(data.id);
        },
        onError: () => {
          toast({ title: "Error starting scan", description: "Could not start the scan", variant: "destructive" });
        },
      }
    );
  };

  const handleNewScan = () => {
    setActiveScanId(null);
    setManualUrls("");
    setParsedUrls([]);
    setScanName("");
    setSelectedRules([]);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Accessibility Scan</h1>
        <p className="text-muted-foreground mt-2">
          Configure a new scan by providing URLs manually, uploading a CSV, or using a sitemap.xml.
        </p>
      </div>

      {activeScanId ? (
        <InlineScanMonitor scanId={activeScanId} onNewScan={handleNewScan} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Scan Configuration</CardTitle>
            <CardDescription>Set a name and provide the URLs to be audited.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="scanName">Scan Name (Optional)</Label>
              <Input
                id="scanName"
                placeholder="e.g., Marketing Site Audit Q3"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>URL Input Method</Label>
              <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="manual"><LinkIcon className="w-4 h-4 mr-2" /> Manual Entry</TabsTrigger>
                  <TabsTrigger value="sitemap"><Globe className="w-4 h-4 mr-2" /> Sitemap</TabsTrigger>
                  <TabsTrigger value="csv"><UploadCloud className="w-4 h-4 mr-2" /> CSV Upload</TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="mt-4">
                  <div className="space-y-2">
                    <Label>URLs (one per line)</Label>
                    <Textarea
                      placeholder={"https://example.com\nhttps://example.com/about"}
                      className="min-h-[160px] font-mono text-sm"
                      value={manualUrls}
                      onChange={handleManualUrlsChange}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="sitemap" className="mt-4">
                  <div className="space-y-2">
                    <Label>Sitemap URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://example.com/sitemap.xml"
                        value={sitemapUrl}
                        onChange={(e) => setSitemapUrl(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        onClick={handleParseSitemap}
                        disabled={!sitemapUrl || parseSitemap.isPending}
                      >
                        {parseSitemap.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Fetch URLs
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="csv" className="mt-4">
                  <div
                    className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                      isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileUpload(file);
                    }}
                    onClick={() => document.getElementById("csv-upload")?.click()}
                  >
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold text-lg">Drop your CSV file here</h3>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    {isUploading && (
                      <p className="text-sm text-primary mt-4 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {parsedUrls.length > 0 && (
              <Alert className="bg-muted border-muted-foreground/20">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Ready to scan {parsedUrls.length} URL{parsedUrls.length !== 1 ? "s" : ""}</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 text-xs font-mono max-h-24 overflow-y-auto space-y-1 text-muted-foreground">
                    {parsedUrls.slice(0, 8).map((url, i) => (
                      <div key={i} className="truncate">{url}</div>
                    ))}
                    {parsedUrls.length > 8 && (
                      <div className="italic text-primary">...and {parsedUrls.length - 8} more</div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Rule filter section */}
            <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Rule Filter (Optional)</Label>
                {selectedRules.length > 0 && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {selectedRules.length} rule{selectedRules.length !== 1 ? "s" : ""} selected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to run all rules, or select specific rules to test only those.
              </p>
              <RuleFilterSelector selectedRules={selectedRules} onChange={setSelectedRules} />
            </div>
          </CardContent>

          <CardFooter className="bg-muted/50 flex justify-end border-t p-6">
            <Button
              size="lg"
              onClick={startScan}
              disabled={parsedUrls.length === 0 || createScan.isPending}
              className="w-full sm:w-auto"
            >
              {createScan.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
              {selectedRules.length > 0
                ? `Scan ${selectedRules.length} Rule${selectedRules.length !== 1 ? "s" : ""}`
                : "Start Scan"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
