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
import { UploadCloud, Globe, Link as LinkIcon, Loader2, AlertCircle, X, Plus, Filter, CheckCircle2, XCircle, Clock, BarChart2, ChevronDown, Shield, ShieldCheck, ExternalLink, HelpCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getActiveProxy, ACTIVE_PROXY_KEY } from "@/pages/settings";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getStatusBadge } from "@/lib/status-badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ALL_RULES: { id: string; label: string }[] = [
  { id: "SIA-R1",   label: "Page title missing (WCAG 2.4.2)" },
  { id: "SIA-R2",   label: "Image missing alt text (WCAG 1.1.1)" },
  { id: "SIA-R3",   label: "Duplicate ID found (WCAG 4.1.1)" },
  { id: "SIA-R4",   label: "Page language not set (WCAG 3.1.1)" },
  { id: "SIA-R5",   label: "Language of parts not set (WCAG 3.1.2)" },
  { id: "SIA-R6",   label: "Sensory characteristics used (WCAG 1.3.3)" },
  { id: "SIA-R7",   label: "Audio control missing (WCAG 1.4.2)" },
  { id: "SIA-R8",   label: "Form field has no accessible name (WCAG 1.3.1)" },
  { id: "SIA-R9",   label: "Empty heading element found (WCAG 2.4.6)" },
  { id: "SIA-R10",  label: "Color used as only visual means (WCAG 1.4.1)" },
  { id: "SIA-R11",  label: "Link has no accessible name (WCAG 2.4.4)" },
  { id: "SIA-R12",  label: "Button has no accessible name (WCAG 4.1.2)" },
  { id: "SIA-R13",  label: "Link opens new window without warning (WCAG 3.2.2)" },
  { id: "SIA-R14",  label: "Visible label and accessible name do not match (WCAG 2.5.3)" },
  { id: "SIA-R15",  label: "Complex image missing long description (WCAG 1.1.1)" },
  { id: "SIA-R16",  label: "Required ARIA attribute is missing (WCAG 4.1.2)" },
  { id: "SIA-R17",  label: "Audio/video missing transcript (WCAG 1.2.1)" },
  { id: "SIA-R18",  label: "Flashing content may trigger seizures (WCAG 2.3.1)" },
  { id: "SIA-R19",  label: "Focus causes unexpected context change (WCAG 3.2.1)" },
  { id: "SIA-R20",  label: "Input causes unexpected context change (WCAG 3.2.2)" },
  { id: "SIA-R21",  label: "Invalid ARIA role used (WCAG 4.1.2)" },
  { id: "SIA-R22",  label: "Video element may be missing captions (WCAG 1.2.2)" },
  { id: "SIA-R23",  label: "Video missing audio description (WCAG 1.2.3 / 1.2.5)" },
  { id: "SIA-R24",  label: "Timing not adjustable (WCAG 2.2.1)" },
  { id: "SIA-R25",  label: "Label in name — accessible name does not match visible (WCAG 2.5.3)" },
  { id: "SIA-R26",  label: "Abbreviation has no expansion (WCAG 3.1.4)" },
  { id: "SIA-R27",  label: "Reading level too complex (WCAG 3.1.5)" },
  { id: "SIA-R28",  label: "Pronunciation not provided (WCAG 3.1.6)" },
  { id: "SIA-R29",  label: "Error prevention for legal/financial transactions (WCAG 3.3.4)" },
  { id: "SIA-R30",  label: "Text contrast ratio below AAA enhanced minimum 7:1 (WCAG 1.4.6)" },
  { id: "SIA-R31",  label: "Line height below minimum value (WCAG 1.4.8 / 1.4.12)" },
  { id: "SIA-R32",  label: "Interactive element does not meet enhanced target size (WCAG 2.5.5)" },
  { id: "SIA-R33",  label: "Accessible authentication requires cognitive test (WCAG 3.3.7)" },
  { id: "SIA-R34",  label: "Content missing after heading (WCAG 2.4.6)" },
  { id: "SIA-R35",  label: "Text content not inside an ARIA landmark region (WCAG 1.3.6)" },
  { id: "SIA-R36",  label: "ARIA attribute unsupported or prohibited on element (WCAG 4.1.2)" },
  { id: "SIA-R37",  label: "Dragging movement has no single-pointer alternative (WCAG 2.5.7)" },
  { id: "SIA-R38",  label: "Redundant user input not auto-populated (WCAG 3.3.7)" },
  { id: "SIA-R39",  label: "Focused component obscured by sticky content (WCAG 2.4.11)" },
  { id: "SIA-R40",  label: "Data table missing header cells (WCAG 1.3.1)" },
  { id: "SIA-R41",  label: "Table missing caption or summary (WCAG 1.3.1)" },
  { id: "SIA-R42",  label: "List item not inside a list element (WCAG 1.3.1)" },
  { id: "SIA-R43",  label: "Keyboard trap exists — cannot navigate away (WCAG 2.1.2)" },
  { id: "SIA-R44",  label: "Content orientation is restricted (WCAG 1.3.4)" },
  { id: "SIA-R45",  label: "Input purpose not identified (WCAG 1.3.5)" },
  { id: "SIA-R46",  label: "Touch target does not meet minimum size 24×24px (WCAG 2.5.8)" },
  { id: "SIA-R47",  label: "Viewport zoom disabled via meta tag (WCAG 1.4.4)" },
  { id: "SIA-R48",  label: "Media element autoplaying with audio (WCAG 1.4.2)" },
  { id: "SIA-R49",  label: "Functionality requires multi-point or path-based gesture (WCAG 2.5.1)" },
  { id: "SIA-R50",  label: "Functionality triggered by device motion (WCAG 2.5.4)" },
  { id: "SIA-R51",  label: "Navigation repeated in different order (WCAG 3.2.3)" },
  { id: "SIA-R52",  label: "Components with same function identified inconsistently (WCAG 3.2.4)" },
  { id: "SIA-R53",  label: "Error prevention — reversible or confirmable (WCAG 3.3.4)" },
  { id: "SIA-R54",  label: "Status messages not programmatically determinable (WCAG 4.1.3)" },
  { id: "SIA-R55",  label: "Parsing errors in HTML markup (WCAG 4.1.1)" },
  { id: "SIA-R56",  label: "Focus order does not preserve meaning (WCAG 2.4.3)" },
  { id: "SIA-R57",  label: "Non-text UI component contrast below 3:1 (WCAG 1.4.11)" },
  { id: "SIA-R58",  label: "Page missing skip navigation / bypass link (WCAG 2.4.1)" },
  { id: "SIA-R59",  label: "Link purpose ambiguous in context (WCAG 2.4.4)" },
  { id: "SIA-R60",  label: "No multiple ways provided to locate content (WCAG 2.4.5)" },
  { id: "SIA-R61",  label: "Headings and labels not descriptive (WCAG 2.4.6)" },
  { id: "SIA-R62",  label: "Section missing heading (WCAG 2.4.10)" },
  { id: "SIA-R63",  label: "Focus indicator does not meet enhanced appearance (WCAG 2.4.13)" },
  { id: "SIA-R64",  label: "Heading level skipped — hierarchy broken (WCAG 1.3.1)" },
  { id: "SIA-R65",  label: "CSS removing or suppressing focus indicators (WCAG 2.4.7)" },
  { id: "SIA-R66",  label: "Error not identified in text (WCAG 3.3.1)" },
  { id: "SIA-R67",  label: "Form field missing label or instruction (WCAG 3.3.2)" },
  { id: "SIA-R68",  label: "Text may be clipped when resized to 200% (WCAG 1.4.4)" },
  { id: "SIA-R69",  label: "Text contrast ratio below AA minimum 4.5:1 (WCAG 1.4.3)" },
  { id: "SIA-R70",  label: "Live audio/video missing real-time captions (WCAG 1.2.4)" },
  { id: "SIA-R71",  label: "Pre-recorded video missing sign language (WCAG 1.2.6)" },
  { id: "SIA-R72",  label: "Pre-recorded video missing extended audio description (WCAG 1.2.7)" },
  { id: "SIA-R73",  label: "Pre-recorded media missing text alternative (WCAG 1.2.8)" },
  { id: "SIA-R74",  label: "Audio-only live content missing text alternative (WCAG 1.2.9)" },
  { id: "SIA-R75",  label: "Images of text used instead of real text (WCAG 1.4.5)" },
  { id: "SIA-R76",  label: "Images of text used — no exception (WCAG 1.4.9)" },
  { id: "SIA-R77",  label: "Visual presentation restrictions violated (WCAG 1.4.8)" },
  { id: "SIA-R78",  label: "Context change on user request only (WCAG 3.2.5)" },
  { id: "SIA-R79",  label: "Error suggestion not provided (WCAG 3.3.3)" },
  { id: "SIA-R80",  label: "Error prevention not provided for all inputs (WCAG 3.3.6)" },
  { id: "SIA-R81",  label: "Context-sensitive help not available (WCAG 3.3.5)" },
  { id: "SIA-R82",  label: "Keyboard operation not available without exception (WCAG 2.1.3)" },
  { id: "SIA-R83",  label: "Time limits exist — no exception (WCAG 2.2.3)" },
  { id: "SIA-R84",  label: "Scrollable elements are keyboard accessible (WCAG 2.1.1)" },
  { id: "SIA-R85",  label: "Re-authentication causes data loss (WCAG 2.2.5)" },
  { id: "SIA-R86",  label: "Three flashes in one second (WCAG 2.3.2)" },
  { id: "SIA-R87",  label: "Page missing main landmark region (WCAG 2.4.1)" },
  { id: "SIA-R88",  label: "Word spacing below minimum (WCAG 1.4.12)" },
  { id: "SIA-R89",  label: "Focus indicator area too small (WCAG 2.4.13)" },
  { id: "SIA-R90",  label: "Focused component fully obscured (WCAG 2.4.12)" },
  { id: "SIA-R91",  label: "Line height too low — text spacing (WCAG 1.4.12)" },
  { id: "SIA-R92",  label: "Letter spacing too low — text spacing (WCAG 1.4.12)" },
  { id: "SIA-R93",  label: "Word spacing too low — text spacing (WCAG 1.4.12)" },
  { id: "SIA-R94",  label: "Paragraph spacing too low (WCAG 1.4.12)" },
  { id: "SIA-R95",  label: "Animation triggered by interaction (WCAG 2.3.3)" },
  { id: "SIA-R96",  label: "Table missing scope on header cells (WCAG 1.3.1)" },
  { id: "SIA-R97",  label: "Fieldset missing legend element (WCAG 1.3.1)" },
  { id: "SIA-R98",  label: "ARIA expanded state not set correctly (WCAG 4.1.2)" },
  { id: "SIA-R99",  label: "ARIA hidden used on focusable element (WCAG 4.1.2)" },
  { id: "SIA-R100", label: "PDF document missing accessibility tags (WCAG 4.1.2)" },
  { id: "SIA-R101", label: "Document structure elements misused (WCAG 1.3.1)" },
  { id: "SIA-R102", label: "Decorative image not hidden from assistive technology (WCAG 1.1.1)" },
  { id: "SIA-R103", label: "Background image conveys information (WCAG 1.1.1)" },
  { id: "SIA-R104", label: "Page auto-refreshes without user control (WCAG 2.2.1)" },
  { id: "SIA-R105", label: "Multiple links with identical text go to different destinations (WCAG 2.4.4)" },
  { id: "SIA-R106", label: "Form error not associated with field (WCAG 3.3.1)" },
  { id: "SIA-R107", label: "Custom interactive control missing keyboard support (WCAG 2.1.1)" },
  { id: "SIA-R108", label: "Touch target size below minimum (WCAG 2.5.5)" },
  { id: "SIA-R109", label: "Input field missing expected data format hint (WCAG 3.3.2)" },
  { id: "SIA-R110", label: "Image of text used where text could be used (WCAG 1.4.5)" },
  { id: "SIA-R111", label: "Complex image missing detailed long description (WCAG 1.1.1)" },
  { id: "SIA-R112", label: "Figure element missing figcaption (WCAG 1.3.1)" },
  { id: "SIA-R113", label: "Details/summary element missing accessible name (WCAG 4.1.2)" },
  { id: "SIA-R114", label: "Iframe missing title attribute (WCAG 2.4.1)" },
  { id: "SIA-R115", label: "Object element missing accessible name (WCAG 1.1.1)" },
  { id: "SIA-R116", label: "Select element has no accessible name (WCAG 1.3.1)" },
  { id: "SIA-R117", label: "SVG image missing accessible name (WCAG 1.1.1)" },
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

  // Proxy PAC state — PAC URL is managed in Settings; here we just toggle it on/off
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [activeProxyPac, setActiveProxyPac] = useState<string>("");

  useEffect(() => {
    setActiveProxyPac(getActiveProxy());
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_PROXY_KEY) setActiveProxyPac(e.newValue || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    if (proxyEnabled && !activeProxyPac) {
      toast({
        title: "No proxy PAC configured",
        description: "Go to Settings to add a PAC file URL before enabling proxy mode.",
        variant: "destructive",
      });
      return;
    }

    const effectiveProxy = proxyEnabled && activeProxyPac ? activeProxyPac : undefined;

    createScan.mutate(
      {
        data: {
          urls: parsedUrls,
          name: scanName || undefined,
          options: {
            maxConcurrency: 5,
            ...(selectedRules.length > 0 ? { rules: selectedRules } : {}),
            ...(effectiveProxy ? { proxyPacUrl: effectiveProxy } : {}),
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
    // Proxy settings intentionally kept so user can re-scan the same environment
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/documentation" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                      <HelpCircle className="w-4 h-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    Open documentation for all SI rule references.
                  </TooltipContent>
                </Tooltip>
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

            {/* Proxy PAC section — PAC URL managed in Settings */}
            <div className={`border rounded-lg p-4 transition-colors ${proxyEnabled ? "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" : "bg-muted/20"}`}>
              <div className="flex items-center gap-3">
                {proxyEnabled
                  ? <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  : <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Proxy PAC (Optional)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Route scanning through a PAC file for internal or staging environments.
                  </p>
                </div>
                <Switch
                  checked={proxyEnabled}
                  onCheckedChange={setProxyEnabled}
                  aria-label="Enable proxy PAC"
                />
              </div>

              {proxyEnabled && (
                <div className="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-800/50">
                  {activeProxyPac ? (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <code className="text-xs font-mono text-blue-700 dark:text-blue-400 truncate flex-1">
                        {activeProxyPac}
                      </code>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>No PAC URL configured. </span>
                      <Link href="/settings" className="underline underline-offset-2 inline-flex items-center gap-0.5 hover:opacity-80">
                        Go to Settings <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
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
              {proxyEnabled && activeProxyPac
                ? `Scan via Proxy${selectedRules.length > 0 ? ` (${selectedRules.length} rules)` : ""}`
                : selectedRules.length > 0
                  ? `Scan ${selectedRules.length} Rule${selectedRules.length !== 1 ? "s" : ""}`
                  : "Start Scan"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
