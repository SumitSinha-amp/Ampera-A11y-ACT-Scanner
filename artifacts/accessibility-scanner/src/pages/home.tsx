import { useState, useRef, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth";
import { Link } from "wouter";
import { OPEN_SETTINGS_EVENT } from "@/components/layout";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCreateScan,
  useParseSitemap,
  useGetScan,
  useGetScanStatus,
  getGetScanStatusQueryKey,
  getGetScanQueryKey,
} from "@workspace/api-client-react";
import { ACT_RULES } from "@/lib/actRules";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  UploadCloud,
  Globe,
  Link as LinkIcon,
  Loader2,
  AlertCircle,
  X,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart2,
  ChevronDown,
  Shield,
  ShieldCheck,
  ExternalLink,
  Settings,
  HelpCircle,
  Pause,
  Play,
  Timer,
  CopyCheck,
  RefreshCw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getActiveProxy,
  ACTIVE_PROXY_KEY,
  ACTIVE_PROXY_CHANGED_EVENT,
  isUrlLimitEnabled,
  getUrlLimitValue,
} from "@/pages/settings";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getStatusBadge } from "@/lib/status-badge";
import { isUrlLikeScanName, SCAN_NAME_URL_ERROR } from "@/lib/scan-name";
import { FieldMessage } from "@/components/ui/field-message";
import { useSite } from "@/contexts/site";
import { ProjectSelector } from "@/components/project-selector";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const ALL_RULES: { id: string; label: string }[] = [
  { id: "ACT-R1", label: "Page has no title (WCAG 2.4.2)" },
  { id: "ACT-R2", label: "Image without a text alternative (WCAG 1.1.1)" },
  { id: "ACT-R3", label: "Element IDs are not unique (WCAG 4.1.1)" },
  { id: "ACT-R4", label: "Page language has not been identified (WCAG 3.1.1)" },
  { id: "ACT-R5", label: "Page language not recognized (WCAG 3.1.1)" },
  { id: "ACT-R6", label: "Language declarations inconsistent (WCAG 3.1.1)" },
  { id: "ACT-R7", label: "Content language not identified (WCAG 3.1.2)" },
  { id: "ACT-R8", label: "Form field is not labeled (WCAG 1.3.1)" },
  {
    id: "ACT-R9",
    label: "Page refreshes or redirects without warning (WCAG 2.2.1)",
  },
  {
    id: "ACT-R10",
    label: "Autocomplete does not work as intended (WCAG 1.3.5)",
  },
  { id: "ACT-R11", label: "Link missing a text alternative (WCAG 2.4.4)" },
  { id: "ACT-R12", label: "Button missing a text alternative (WCAG 4.1.2)" },
  {
    id: "ACT-R13",
    label: "Inline frame without a text alternative (WCAG 4.1.2)",
  },
  {
    id: "ACT-R14",
    label: "Visible label and accessible name do not match (WCAG 2.5.3)",
  },
  {
    id: "ACT-R15",
    label: "Multiple iframes with same accessible name (WCAG 4.1.2)",
  },
  { id: "ACT-R16", label: "Required ARIA attribute is missing (WCAG 4.1.2)" },
  { id: "ACT-R17", label: "Hidden element has focusable content (WCAG 4.1.2)" },
  { id: "ACT-R18", label: "Unsupported ARIA attribute used (WCAG 4.1.2)" },
  { id: "ACT-R19", label: "Invalid state or property (WCAG 4.1.2)" },
  { id: "ACT-R20", label: "ARIA attribute does not exist (WCAG 4.1.2)" },
  { id: "ACT-R21", label: "Invalid ARIA role used (WCAG 4.1.2)" },
  { id: "ACT-R22", label: "Does this video have captions? (WCAG 1.2.2)" },
  { id: "ACT-R23", label: "Audio/video without transcript (WCAG 1.2.1)" },
  {
    id: "ACT-R24",
    label: "Video element visual content has no transcript (WCAG 1.2.3)",
  },
  {
    id: "ACT-R25",
    label: "Video element visual content has no audio description (WCAG 1.2.5)",
  },
  {
    id: "ACT-R26",
    label: "Video without audio is a media alternative for text (WCAG 1.2.1)",
  },
  {
    id: "ACT-R27",
    label: "Does this video have captions? (WCAG 1.2.2)",
  },
  {
    id: "ACT-R28",
    label: "Image button without a text alternative (WCAG 1.1.1)",
  },
  {
    id: "ACT-R29",
    label: "Audio content is a media alternative for text (WCAG 1.2.1)",
  },
  { id: "ACT-R30", label: "Audio content has a text alternative (WCAG 1.2.1)" },
  {
    id: "ACT-R31",
    label: "Video with audio is a media alternative for text (WCAG 1.2.1)",
  },
  { id: "ACT-R32", label: "Target size insufficient (WCAG 2.5.8)" },
  {
    id: "ACT-R33",
    label: "Media alternative may be insufficient (WCAG 1.2.x)",
  },
  { id: "ACT-R34", label: "Content missing after heading (WCAG 2.4.6)" },
  {
    id: "ACT-R35",
    label:
      "Does video without audio have an accessible alternative? (WCAG 1.2.1)",
  },
  { id: "ACT-R36", label: "Unsupported ARIA usage (WCAG 4.1.2)" },
  { id: "ACT-R37", label: "Is this video audio-described? (WCAG 1.2.5)" },
  {
    id: "ACT-R38",
    label:
      "Is there an alternative to the visual content in this video? (WCAG 1.2.x)",
  },
  { id: "ACT-R39", label: "Image filename used as alt text (WCAG 1.1.1)" },
  {
    id: "ACT-R40",
    label: "Page region without an accessible name (WCAG 1.3.1)",
  },
  {
    id: "ACT-R41",
    label: "Links with same text different purpose (WCAG 2.4.4)",
  },
  { id: "ACT-R42", label: "Role not inside the required context (WCAG 4.1.2)" },
  {
    id: "ACT-R43",
    label: "Vector image without a text alternative (WCAG 1.1.1)",
  },
  { id: "ACT-R44", label: "Page orientation is locked (WCAG 1.3.4)" },
  {
    id: "ACT-R45",
    label: "Table headers aren't referenced correctly (WCAG 1.3.1)",
  },
  {
    id: "ACT-R46",
    label: "No data cells assigned to table header (WCAG 1.3.1)",
  },
  { id: "ACT-R47", label: "Page zoom is restricted (WCAG 1.4.4)" },
  {
    id: "ACT-R48",
    label:
      "<audio> or <video> that plays automatically has no audio that lasts more than 3 seconds (WCAG 1.4.2)",
  },
  {
    id: "ACT-R49",
    label:
      "<audio> or <video> that plays automatically has a control mechanism (WCAG 1.4.2)",
  },
  { id: "ACT-R50", label: "Audio cannot be stopped (WCAG 1.4.2)" },
  { id: "ACT-R51", label: "Audio control missing (WCAG 1.4.2)" },
  { id: "ACT-R52", label: "Video autoplay without controls (WCAG 1.4.2)" },
  { id: "ACT-R53", label: "Headings are structured (WCAG 1.3.1)" },
  {
    id: "ACT-R54",
    label: "Field input error is not announced in full (WCAG 4.1.3)",
  },
  {
    id: "ACT-R55",
    label: "Sections with same name different purpose (WCAG 1.3.1)",
  },
  {
    id: "ACT-R56",
    label: "Landmarks of same type have a unique accessible name (WCAG 1.3.1)",
  },
  { id: "ACT-R57", label: "Non-text contrast insufficient (WCAG 1.4.11)" },
  { id: "ACT-R59", label: "Documents have headings (WCAG 2.4.6)" },
  { id: "ACT-R60", label: "Groups have an accessible name (WCAG 1.3.1)" },
  {
    id: "ACT-R61",
    label: "Documents start with a level 1 heading (WCAG 2.4.6)",
  },
  { id: "ACT-R62", label: "Links are not clearly identifiable (WCAG 1.4.1)" },
  { id: "ACT-R63", label: "Object without a text alternative (WCAG 1.1.1)" },
  { id: "ACT-R64", label: "Empty headings (WCAG 1.3.1)" },
  { id: "ACT-R65", label: "Focus indicator missing (WCAG 2.4.7)" },
  { id: "ACT-R66", label: "Enhanced contrast insufficient (WCAG 1.4.6)" },
  { id: "ACT-R67", label: "Decorative image exposed (WCAG 1.1.1)" },
  { id: "ACT-R68", label: "Empty container element (WCAG 1.3.1)" },
  { id: "ACT-R69", label: "Text contrast insufficient (WCAG 1.4.3)" },
  {
    id: "ACT-R70",
    label: "No obsolete or deprecated elements are used (Best Practice)",
  },
  { id: "ACT-R71", label: "Uneven spacing in text (Best Practice)" },
  {
    id: "ACT-R72",
    label: "Paragraphs of text are not all uppercase (Best Practice)",
  },
  { id: "ACT-R73", label: "Line height too small (WCAG 1.4.12)" },
  { id: "ACT-R74", label: "Font size fixed (WCAG 1.4.4)" },
  { id: "ACT-R75", label: "Font size too small (WCAG 1.4.4)" },
  {
    id: "ACT-R76",
    label: "Table header cell is missing a header role (WCAG 1.3.1)",
  },
  { id: "ACT-R77", label: "Table data missing context (WCAG 1.3.1)" },
  {
    id: "ACT-R78",
    label: "Headings of same level have text content between them (WCAG 2.4.6)",
  },
  {
    id: "ACT-R79",
    label:
      "Preformatted text represents either code or a figure (Best Practice)",
  },
  { id: "ACT-R80", label: "Line height fixed (Best Practice)" },
  {
    id: "ACT-R81",
    label: "Links identical different destinations (WCAG 2.4.4)",
  },
  {
    id: "ACT-R82",
    label: "Error message describes invalid form field value (WCAG 1.3.1)",
  },
  {
    id: "ACT-R83",
    label: "Text is clipped when resized (DEPRECATED) (WCAG 1.4.4)",
  },
  {
    id: "ACT-R84",
    label: "Scrollable element not keyboard accessible (WCAG 2.1.1)",
  },
  {
    id: "ACT-R85",
    label: "Paragraphs of text are not all italics (Best Practice)",
  },
  {
    id: "ACT-R86",
    label:
      "Elements that are marked as decorative are not exposed to assistive technologies (Best Practice)",
  },
  { id: "ACT-R87", label: "Skip to main content link is missing (WCAG 2.4.1)" },
  { id: "ACT-R88", label: "Text in link has minimum contrast (WCAG 1.4.3)" },
  { id: "ACT-R89", label: "Text in link has enhanced contrast (WCAG 1.4.6)" },
  {
    id: "ACT-R90",
    label: "Role with implied hidden content has keyboard focus (WCAG 4.1.2)",
  },
  { id: "ACT-R91", label: "Letter spacing is not wide enough (WCAG 1.4.12)" },
  { id: "ACT-R92", label: "Word spacing is not wide enough (WCAG 1.4.12)" },
  { id: "ACT-R93", label: "Line height is too narrow (WCAG 1.4.12)" },
  { id: "ACT-R94", label: "Menu item missing a text alternative (WCAG 4.1.2)" },
  {
    id: "ACT-R95",
    label:
      "<iframe> element with interactive elements does not have a negative tabindex (WCAG 2.1.1)",
  },
  {
    id: "ACT-R96",
    label:
      "Refreshes implemented using the <meta> element have no delay, without exception (WCAG 2.2.1)",
  },
  {
    id: "ACT-R97",
    label: "Document has collapsible blocks of content (WCAG 4.1.2)",
  },
  {
    id: "ACT-R98",
    label: "Document has heading at the start of its main content (WCAG 2.4.6)",
  },
  {
    id: "ACT-R99",
    label: "Document has its main content inside a landmark (WCAG 1.3.1)",
  },
  {
    id: "ACT-R100",
    label: "PDF without accessible alternative (Best Practice)",
  },
  {
    id: "ACT-R101",
    label: "Repeated content before main content can be bypassed (WCAG 2.4.1)",
  },
  {
    id: "ACT-R102",
    label:
      "Document either has no repeated content, or a skip link as its first focusable element (WCAG 2.4.1)",
  },
  { id: "ACT-R103", label: "Text in widget has minimum contrast (WCAG 1.4.3)" },
  {
    id: "ACT-R104",
    label: "Text in widget has enhanced contrast (WCAG 1.4.6)",
  },
  {
    id: "ACT-R105",
    label: "Duplicate link text different destination (WCAG 2.4.4)",
  },
  { id: "ACT-R106", label: "Invalid ARIA usage (WCAG 4.1.2)" },
  { id: "ACT-R107", label: "Keyboard access issue (WCAG 2.1.1)" },
  { id: "ACT-R108", label: "ARIA misuse (WCAG 4.1.2)" },
  { id: "ACT-R109", label: "Page language mismatch (WCAG 3.1.1)" },
  {
    id: "ACT-R110",
    label: "Role attribute has at least one valid value (WCAG 4.1.2)",
  },
  { id: "ACT-R111", label: "Target size too small enhanced (WCAG 2.5.5)" },
  { id: "ACT-R112", label: "Missing semantic structure (WCAG 1.3.1)" },
  { id: "ACT-R113", label: "Target size too small (WCAG 2.5.8)" },
  { id: "ACT-R114", label: "Page title not descriptive (WCAG 2.4.2)" },
  { id: "ACT-R115", label: "Heading not descriptive (WCAG 2.4.6)" },
  {
    id: "ACT-R116",
    label: "Summary element missing accessible name (WCAG 4.1.2)",
  },
  { id: "ACT-R117", label: "Image missing accessible name (WCAG 1.1.1)" },
  {
    id: "ACT-R118",
    label: "Image of text requires manual review (WCAG 1.4.5 / 1.4.9)",
  },
  {
    id: "ACT-R119",
    label: "Fixed or sticky element may obscure keyboard focus (WCAG 2.4.11)",
  },
  {
    id: "ACT-R121",
    label:
      "Focus indicator suppressed without visible replacement (WCAG 2.4.13)",
  },
  {
    id: "ACT-R126",
    label: "Accessible authentication alternative required (WCAG 3.3.8)",
  },
  { id: "ACT-R120", label: "Focus not fully visible (WCAG 2.4.12)" },
  {
    id: "ACT-R122",
    label: "Dragging interaction has no pointer alternative (WCAG 2.5.7)",
  },
  {
    id: "ACT-R124",
    label: "Help mechanism not consistently located (WCAG 3.2.6)",
  },
  {
    id: "ACT-R125",
    label: "User required to re-enter information (WCAG 3.3.7)",
  },
  {
    id: "ACT-R127",
    label: "Authentication has no cognitive function test (WCAG 3.3.9)",
  },
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
        r.label.toLowerCase().includes(query.toLowerCase())),
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
            placeholder="Search rule ID or name (e.g. ACT-R14, contrast)..."
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
    case "critical":
      return (
        <Badge
          variant="outline"
          className="bg-[#E11D48] text-white border-transparent text-xs"
        >
          Critical
        </Badge>
      );
    case "serious":
      return (
        <Badge
          variant="outline"
          className="bg-[#EA580C] text-white border-transparent text-xs"
        >
          Serious
        </Badge>
      );
    case "moderate":
      return (
        <Badge
          variant="outline"
          className="bg-[#EAB308] text-black border-transparent text-xs"
        >
          Moderate
        </Badge>
      );
    case "minor":
      return (
        <Badge
          variant="outline"
          className="bg-[#3B82F6] text-white border-transparent text-xs"
        >
          Minor
        </Badge>
      );
    default:
      return <Badge className="text-xs">{impact}</Badge>;
  }
}

function InlineScanMonitor({
  scanId,
  onNewScan,
}: {
  scanId: number;
  onNewScan: () => void;
}) {
  const { data: scan } = useGetScan(scanId, {
    query: {
      queryKey: getGetScanQueryKey(scanId),
      refetchInterval: 3000,
    },
  });

  const isRunning = scan?.status === "running" || scan?.status === "pending";
  const initiatorText = (
    scan as
      | { initiatorName?: string | null; initiatorRole?: string | null }
      | undefined
  )?.initiatorName
    ? `Initiated by ${(scan as { initiatorName?: string | null; initiatorRole?: string | null }).initiatorName}${(scan as { initiatorName?: string | null; initiatorRole?: string | null }).initiatorRole ? ` · ${(scan as { initiatorName?: string | null; initiatorRole?: string | null }).initiatorRole}` : ""}`
    : null;

  const { data: liveStatus } = useGetScanStatus(scanId, {
    query: {
      queryKey: getGetScanStatusQueryKey(scanId),
      enabled: isRunning,
      refetchInterval: 2000,
    },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const pauseScanMutation = useMutation({
    mutationFn: async () => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/pause`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Scan paused" });
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
      queryClient.invalidateQueries({
        queryKey: getGetScanStatusQueryKey(scanId),
      });
    },
    onError: () =>
      toast({ title: "Could not pause scan", variant: "destructive" }),
  });

  const resumeScanMutation = useMutation({
    mutationFn: async () => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/resume`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Scan resumed" });
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
      queryClient.invalidateQueries({
        queryKey: getGetScanStatusQueryKey(scanId),
      });
    },
    onError: () =>
      toast({ title: "Could not resume scan", variant: "destructive" }),
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
  // Prefer counting completed pages directly from the live page list so this
  // stays in sync with the DONE counter.  Fall back to the session counter when
  // page data isn't loaded yet.
  const scannedUrls = Math.min(
    liveStatus?.pages?.length
      ? liveStatus.pages.filter(
          (p: { status: string }) => p.status === "completed",
        ).length
      : liveStatus?.scannedUrls || scan.scannedUrls || 0,
    totalUrls,
  );
  const progressPercent =
    totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;
  const isPaused = scan.status === "paused";

  const etaText = (() => {
    if (!isRunning || scannedUrls === 0 || !scan.createdAt) return null;
    const elapsed = Date.now() - new Date(scan.createdAt).getTime();
    const avgMs = elapsed / scannedUrls;
    const remaining = (totalUrls - scannedUrls) * avgMs;
    if (remaining <= 0) return null;
    const secs = Math.round(remaining / 1000);
    if (secs < 60) return `~${secs}s remaining`;
    return `~${Math.ceil(secs / 60)}m remaining`;
  })();

  const selectedRulesForScan: string[] = (() => {
    const opts = scan.options as { rules?: string[] } | null;
    return Array.isArray(opts?.rules) ? (opts!.rules as string[]) : [];
  })();

  const allIssues =
    scan.pages?.flatMap((p) =>
      (p.issues || []).map((i) => ({ ...i, pageUrl: p.url })),
    ) || [];
  const byRule = allIssues.reduce<
    Record<
      string,
      {
        count: number;
        impact: string;
        description: string;
        wcagCriteria: string | null;
      }
    >
  >((acc, i) => {
    if (!acc[i.ruleId])
      acc[i.ruleId] = {
        count: 0,
        impact: i.impact,
        description: i.description,
        wcagCriteria: i.wcagCriteria,
      };
    acc[i.ruleId].count++;
    return acc;
  }, {});
  const IMPACT_ORDER: Record<string, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  };
  const topIssues = Object.entries(byRule)
    .sort(
      (a, b) =>
        (IMPACT_ORDER[a[1].impact] ?? 9) - (IMPACT_ORDER[b[1].impact] ?? 9),
    )
    .slice(0, 10);

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">
              {scan.name || `Scan #${scan.id}`}
            </CardTitle>
            {getStatusBadge(displayStatus)}
          </div>
          <div className="flex items-center gap-2">
            {(isRunning || isPaused) &&
              (isPaused ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resumeScanMutation.mutate()}
                  disabled={resumeScanMutation.isPending}
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  Resume
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pauseScanMutation.mutate()}
                  disabled={pauseScanMutation.isPending}
                >
                  <Pause className="w-4 h-4 mr-1.5" />
                  Pause
                </Button>
              ))}
            <Link href={`/scans/${scanId}`}>
              <Button variant="outline" size="sm">
                <BarChart2 className="w-4 h-4 mr-2" />
                Full Details
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={onNewScan}>
              Manual Page Check
            </Button>
          </div>
        </div>
        {liveStatus?.currentUrl && (
          <CardDescription className="font-mono text-xs truncate mt-1">
            Scanning: {liveStatus.currentUrl}
          </CardDescription>
        )}
        {initiatorText && (
          <CardDescription className="text-xs mt-1">
            {initiatorText}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>
              {scannedUrls} of {totalUrls} URLs
              {isPaused && (
                <span className="ml-2 text-amber-500 font-medium">
                  — Paused
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {etaText && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Timer className="w-3 h-3" />
                  {etaText}
                </span>
              )}
              {progressPercent}%
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Live page status table while running */}
        {isRunning && liveStatus?.pages && liveStatus.pages.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-visible h-auto">
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
                      <td
                        className="px-3 py-1.5 font-mono truncate max-w-[260px]"
                        title={p.url}
                      >
                        {p.url}
                      </td>
                      <td className="px-3 py-1.5">
                        {p.status === "scanning" ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Loader2 className="w-3 h-3 animate-spin" />{" "}
                            Scanning
                          </span>
                        ) : p.status === "completed" ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        ) : p.status === "failed" ? (
                          <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="w-3 h-3" /> Failed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {p.issueCount > 0 ? p.issueCount : "—"}
                      </td>
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
                {scan.totalIssues} issue{scan.totalIssues !== 1 ? "s" : ""}{" "}
                found across {scan.pages.length} page
                {scan.pages.length !== 1 ? "s" : ""}
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
                        <span
                          className="font-mono truncate max-w-xs"
                          title={page.url}
                        >
                          {page.url}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {page.issueCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-xs font-mono"
                          >
                            {page.issueCount}
                          </Badge>
                        )}
                        {page.criticalCount > 0 && (
                          <Badge className="text-xs bg-[#E11D48] hover:bg-[#E11D48] font-mono">
                            {page.criticalCount} crit
                          </Badge>
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
                              <th className="text-left px-3 py-2 font-medium">
                                Rule
                              </th>
                              <th className="text-left px-3 py-2 font-medium">
                                Issue
                              </th>
                              <th className="text-left px-3 py-2 font-medium">
                                Severity
                              </th>
                              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                                WCAG
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {page.issues.slice(0, 20).map((issue) => (
                              <tr key={issue.id} className="border-t">
                                <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">
                                  {issue.ruleId}
                                </td>
                                <td
                                  className="px-3 py-1.5 text-muted-foreground max-w-xs truncate"
                                  title={issue.description}
                                >
                                  {issue.description}
                                </td>
                                <td className="px-3 py-1.5">
                                  <ImpactBadgeSmall impact={issue.impact} />
                                </td>
                                <td className="px-3 py-1.5 hidden md:table-cell font-mono text-muted-foreground">
                                  {issue.wcagCriteria
                                    ? `${issue.wcagCriteria} (${issue.wcagLevel})`
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                            {page.issues.length > 20 && (
                              <tr className="border-t">
                                <td
                                  colSpan={4}
                                  className="px-3 py-2 text-center text-muted-foreground italic"
                                >
                                  +{page.issues.length - 20} more —{" "}
                                  <Link
                                    href={`/scans/${scanId}`}
                                    className="text-primary underline"
                                  >
                                    view full details
                                  </Link>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : page.status === "completed" ? (
                      <p className="text-xs text-muted-foreground px-1 py-2">
                        No issues found on this page.
                      </p>
                    ) : (
                      <p className="text-xs text-red-500 px-1 py-2">
                        {page.errorMessage || "Page scan failed."}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {topIssues.length > 0 && (
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-2">
                  Top issues by rule:
                </p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">
                          Rule ID
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Description
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Severity
                        </th>
                        <th className="text-right px-3 py-2 font-medium">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topIssues.map(([ruleId, data]) => (
                        <tr key={ruleId} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-primary">
                            {ruleId}
                          </td>
                          <td
                            className="px-3 py-1.5 text-muted-foreground max-w-xs truncate"
                            title={data.description}
                          >
                            {data.description}
                          </td>
                          <td className="px-3 py-1.5">
                            <ImpactBadgeSmall impact={data.impact} />
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-medium">
                            {data.count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rules with 0 occurrences across all pages (multi-rule scans) */}
            {selectedRulesForScan.length >= 2 &&
              (() => {
                const zeroRules = selectedRulesForScan.filter(
                  (r) => !byRule[r],
                );
                if (zeroRules.length === 0) return null;
                return (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground mb-2">
                      Rules with 0 occurrences across all pages:
                    </p>
                    <div className="space-y-1.5">
                      {zeroRules.map((ruleId) => (
                        <div
                          key={ruleId}
                          className="border rounded-md bg-green-50/40 dark:bg-green-950/10 border-green-200/60 dark:border-green-900/40 px-3 py-2 flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          <span className="font-mono text-xs text-primary">
                            {ruleId}
                          </span>
                          <span className="text-xs text-foreground/70 truncate flex-1">
                            {ACT_RULES[ruleId]?.title ?? "No issues detected"}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 font-mono text-xs shrink-0"
                          >
                            0 occurrences
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeSite } = useSite();
  const [scanName, setScanName] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [initiatorName] = useState(() => user?.fullName ?? "");
  const [initiatorRole, setInitiatorRole] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [myGroups, setMyGroups] = useState<
    { id: number; name: string; roleLabel: string | null }[]
  >([]);

  useEffect(() => {
    setProjectId(null);
    setProjectError(null);
  }, [activeSite?.id]);

  useEffect(() => {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${BASE}/api/auth/my-groups`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (groups: { id: number; name: string; roleLabel: string | null }[]) => {
          setMyGroups(groups);
          // Auto-select if the user belongs to exactly one group
          if (groups.length === 1) {
            setGroupId(groups[0].id);
            setInitiatorRole(groups[0].name);
          }
        },
      )
      .catch(() => {});
  }, []);

  const [scanNameError, setScanNameError] = useState<string | null>(null);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);

  const [manualUrls, setManualUrls] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [urlPrefix, setUrlPrefix] = useState("");
  const [urlFixCount, setUrlFixCount] = useState(0);
  const parseSitemap = useParseSitemap();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedUrls, setParsedUrls] = useState<string[]>([]);
  const [startingScan, setStartingScan] = useState(false);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);

  // Compute duplicate URLs: a map of url -> count, filtered to count > 1
  const duplicateMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const url of parsedUrls) counts.set(url, (counts.get(url) ?? 0) + 1);
    const dupes = new Map<string, number>();
    for (const [url, count] of counts) if (count > 1) dupes.set(url, count);
    return dupes;
  }, [parsedUrls]);

  const totalDuplicateRows = useMemo(() => {
    let extra = 0;
    for (const count of duplicateMap.values()) extra += count - 1;
    return extra;
  }, [duplicateMap]);

  const handleRemoveDuplicates = () => {
    const seen = new Set<string>();
    const deduped = parsedUrls.filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    setParsedUrls(deduped);
    setManualUrls(deduped.join("\n"));
    setDupDialogOpen(false);
    toast({
      title: `Removed ${totalDuplicateRows} duplicate URL${totalDuplicateRows !== 1 ? "s" : ""}`,
      description: `${deduped.length} unique URL${deduped.length !== 1 ? "s" : ""} remaining.`,
    });
  };

  // Proxy PAC state — PAC URL is managed in Settings; here we just toggle it on/off
  const PROXY_ENABLED_KEY = "a11y-scanner-proxy-enabled";
  const [proxyEnabled, setProxyEnabled] = useState<boolean>(
    () => localStorage.getItem(PROXY_ENABLED_KEY) === "true",
  );
  const setProxyEnabledPersisted = (val: boolean) => {
    localStorage.setItem(PROXY_ENABLED_KEY, String(val));
    setProxyEnabled(val);
  };
  const [activeProxyPac, setActiveProxyPac] = useState<string>("");
  const [disableJavascript, setDisableJavascript] = useState(false);
  const [incremental, setIncremental] = useState(false);

  // URL limit state — toggled/configured in Settings
  const [urlLimitOn, setUrlLimitOn] = useState(false);
  const [urlLimit, setUrlLimit] = useState(100);

  useEffect(() => {
    setActiveProxyPac(getActiveProxy());
    setUrlLimitOn(isUrlLimitEnabled());
    setUrlLimit(getUrlLimitValue());

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_PROXY_KEY) setActiveProxyPac(e.newValue || "");
    };
    const onActiveProxyChanged = () => {
      setActiveProxyPac(getActiveProxy());
    };
    const onLimitChanged = () => {
      setUrlLimitOn(isUrlLimitEnabled());
      setUrlLimit(getUrlLimitValue());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_PROXY_CHANGED_EVENT, onActiveProxyChanged);
    window.addEventListener("a11y-url-limit-changed", onLimitChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_PROXY_CHANGED_EVENT, onActiveProxyChanged);
      window.removeEventListener("a11y-url-limit-changed", onLimitChanged);
    };
  }, []);

  const createScan = useCreateScan();

  /** Fix common URL mistakes automatically. Returns the corrected URL. */
  const sanitizeUrl = (raw: string): string => {
    let u = raw.trim();
    if (!u) return u;

    // Fix garbled/truncated protocol prefix: "rhttps://", "htps://", "hhttps://", etc.
    // Strip any non-protocol leading chars before a recognisable http(s)://
    u = u.replace(/^[^h]*?(https?:\/\/)/i, "$1");

    // Fix missing protocol: bare "www." → "https://www."
    if (/^www\./i.test(u)) u = "https://" + u;

    // Fix repeated file extensions anywhere in path or before query/hash
    // e.g. .html.html.html.html → .html  (handles .html, .htm, .asp, .aspx, .php, .jsp, .cfm, .shtml)
    u = u.replace(/(\.(html?|aspx?|php|jsp|cfm|shtml))(\1)+/gi, "$1");

    // Fix double (or more) slashes in the path portion, but NOT in "://"
    u = u.replace(/([^:])\/\/+/g, "$1/");

    return u;
  };

  const transformUrlWithPrefix = (value: string, prefix: string) => {
    const input = value.trim();
    const cleanPrefix = prefix.trim();
    if (!input || !cleanPrefix) return input;
    try {
      const url = new URL(input);
      if (url.protocol !== "https:") return input;
      if (
        cleanPrefix.includes("/") ||
        cleanPrefix.includes("?") ||
        cleanPrefix.includes("#")
      )
        return input;
      const host = url.hostname;
      const parts = host.split(".");
      if (parts.length < 2) return input;
      const domainIndex = parts.length - 2;
      const baseHost = parts.slice(domainIndex).join(".");
      const nextHost = `${cleanPrefix}${baseHost}`;
      if (!nextHost || nextHost.length > 253) return input;
      url.hostname = nextHost;
      return url.toString();
    } catch {
      return input;
    }
  };

  const handleManualUrlsChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const raw = e.target.value;
    // Sanitize each non-empty line and track how many changed
    const lines = raw.split("\n");
    const sanitized = lines.map((line) => {
      const t = line.trim();
      if (!t) return line; // preserve blank lines as-is
      const fixed = sanitizeUrl(t);
      return fixed;
    });
    const fixCount = lines.filter(
      (l, i) => l.trim() && sanitized[i] !== l,
    ).length;
    const sanitizedText = sanitized.join("\n");
    setManualUrls(sanitizedText);
    if (fixCount > 0) setUrlFixCount(fixCount);
    else setUrlFixCount(0);

    const urls = sanitizedText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    const transformed = urls.map((u) => transformUrlWithPrefix(u, urlPrefix));

    if (urlLimitOn && transformed.length > urlLimit) {
      const trimmed = transformed.slice(0, urlLimit);
      setParsedUrls(trimmed);
      toast({
        title: `URL limit reached (${urlLimit})`,
        description: `Only the first ${urlLimit} URLs will be scanned. Adjust the limit in Settings.`,
        variant: "destructive",
      });
    } else {
      setParsedUrls(transformed);
    }
  };

  const handleUrlPrefixChange = (value: string) => {
    setUrlPrefix(value);
    const urls = manualUrls
      .split("\n")
      .map((u) => sanitizeUrl(u.trim()))
      .filter(Boolean)
      .map((u) => transformUrlWithPrefix(u, value));
    setParsedUrls(urls);
  };

  const handleParseSitemap = () => {
    if (!sitemapUrl) return;
    parseSitemap.mutate(
      { data: { url: sitemapUrl } },
      {
        onSuccess: (data) => {
          const cleaned = data.urls.map((u: string) => sanitizeUrl(u));
          if (urlLimitOn && cleaned.length > urlLimit) {
            setParsedUrls(cleaned.slice(0, urlLimit));
            toast({
              title: `URL limit reached (${urlLimit})`,
              description: `Sitemap has ${cleaned.length} URLs but only the first ${urlLimit} will be scanned. Adjust the limit in Settings.`,
              variant: "destructive",
            });
          } else {
            setParsedUrls(cleaned);
            toast({
              title: "Sitemap Parsed",
              description: `Found ${data.count} URLs.`,
            });
          }
        },
        onError: () => {
          toast({
            title: "Error parsing sitemap",
            description: "Could not parse sitemap URL",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/scans/upload-csv", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const cleaned = data.urls.map((u: string) => sanitizeUrl(u));
      if (urlLimitOn && cleaned.length > urlLimit) {
        setParsedUrls(cleaned.slice(0, urlLimit));
        toast({
          title: `URL limit reached (${urlLimit})`,
          description: `CSV has ${cleaned.length} URLs but only the first ${urlLimit} will be scanned. Adjust the limit in Settings.`,
          variant: "destructive",
        });
      } else {
        setParsedUrls(cleaned);
        toast({
          title: "CSV Parsed",
          description: `Found ${data.count} URLs.`,
        });
      }
    } catch {
      toast({ title: "Error parsing CSV", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const startScan = () => {
    let valid = true;

    if (projectId == null) {
      setProjectError("Project is required.");
      valid = false;
    }

    if (!scanName.trim()) {
      setScanNameError("Scan title is required.");
      valid = false;
    } else if (isUrlLikeScanName(scanName)) {
      setScanNameError(SCAN_NAME_URL_ERROR);
      valid = false;
    }

    if (!valid) {
      toast({
        title: "Required fields missing",
        description:
          projectId == null
            ? "Please select a project before starting the scan."
            : scanNameError ?? "Please enter a scan title.",
        variant: "destructive",
      });
      return;
    }

    if (parsedUrls.length === 0) {
      toast({
        title: "No URLs",
        description: "Please provide at least one URL to scan.",
        variant: "destructive",
      });
      return;
    }
    const selectedProjectId = projectId;
    if (selectedProjectId == null) {
      return;
    }
    if (proxyEnabled && !activeProxyPac) {
      toast({
        title: "No proxy configured",
        description:
          "Go to Settings → Proxy & Tools to add a proxy URL before enabling proxy mode.",
        variant: "destructive",
      });
      return;
    }

    let resolvedProxy: string | undefined =
      proxyEnabled && activeProxyPac ? activeProxyPac : undefined;

    // Block internal/non-prod URLs when proxy is not active.
    // Split hostname into parts and check if any part starts with a known non-prod prefix.
    // This catches variants like stgwww, stg2, stg2www, prewww, preprod-, qa2, etc.
    const ENV_PREFIXES = [
      "stg",
      "stage",
      "staging", // stg, stg2, stgwww, stg2www, stage, staging
      "dev", // dev, dev2, devwww
      "preprod",
      "pre-prod",
      "prewww", // preprod, preprod-, preprodwww, prewww
      "uat", // uat, uat2, uatwww
      "qa", // qa, qa2, qawww
      "test", // test, test2, testwww
      "sit", // system integration testing
      "sandbox", // sandbox envs
      "nonprod",
      "non-prod", // nonprod, non-prod
      "beta", // beta environments
      "alpha", // alpha environments
      "rc", // release candidates
      "hotfix", // hotfix branches
      "perf", // performance testing
      "load", // load testing
    ];
    const internalUrls = parsedUrls.filter((u) => {
      try {
        const { hostname } = new URL(u);
        const parts = hostname.split(".");
        return parts.some((part) =>
          ENV_PREFIXES.some((prefix) => part.toLowerCase().startsWith(prefix)),
        );
      } catch {
        return ENV_PREFIXES.some((prefix) => u.toLowerCase().includes(prefix));
      }
    });
    if (internalUrls.length > 0 && !resolvedProxy) {
      if (activeProxyPac) {
        // Proxy is configured in Settings but toggle was off — auto-enable and proceed
        resolvedProxy = activeProxyPac;
        setProxyEnabledPersisted(true);
        toast({
          title: "Proxy auto-enabled",
          description:
            "Staging/internal URLs detected — scanning via your configured proxy automatically.",
        });
      } else {
        toast({
          title: "Proxy required for internal URLs",
          description: `${internalUrls.length} URL${internalUrls.length > 1 ? "s appear" : " appears"} to be a stage/dev/preprod environment. Enable the proxy toggle and add a proxy URL in Settings → Proxy & Tools to scan internal addresses.`,
          variant: "destructive",
        });
        return;
      }
    }

    setStartingScan(true);
    createScan.mutate(
      {
        data: {
          urls: parsedUrls,
          name: scanName.trim(),
           siteId: activeSite?.id ?? undefined,
            projectId: selectedProjectId,
          groupId: groupId ?? undefined,
          options: {
            maxConcurrency: 5,
            ...(selectedRules.length > 0 ? { rules: selectedRules } : {}),
            ...(resolvedProxy ? { proxyPacUrl: resolvedProxy } : {}),
            ...(disableJavascript ? { disableJavascript: true } : {}),
            ...(incremental ? { incremental: true } : {}),
          },
          initiatorName: initiatorName.trim() || undefined,
          initiatorRole: initiatorRole || undefined,
        },
      },
      {
        onSuccess: (data) => {
          setActiveScanId(data.id);
          setStartingScan(false);
        },
        onError: () => {
          setStartingScan(false);
          toast({
            title: "Scan could not be started",
            description: "Please try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleNewScan = () => {
    setActiveScanId(null);
    setManualUrls("");
    setParsedUrls([]);
    setScanName("");
    setScanNameError(null);
    setProjectId(null);
    setProjectError(null);
    setSelectedRules([]);
    // Re-apply auto-select if user is in exactly one group
    if (myGroups.length === 1) {
      setGroupId(myGroups[0].id);
      setInitiatorRole(myGroups[0].name);
    } else {
      setInitiatorRole("");
      setGroupId(null);
    }
    // Proxy settings intentionally kept so user can re-scan the same environment
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          New Accessibility Scan
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure a new scan by providing URLs manually, uploading a CSV, or
          using a sitemap.xml.
        </p>
      </div>

      {activeScanId ? (
        <InlineScanMonitor scanId={activeScanId} onNewScan={handleNewScan} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Scan Configuration</CardTitle>
            <CardDescription>
              Set a title and provide the URLs to be audited.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
              <div className="space-y-2">
                <Label>
                  Project <span className="text-destructive">*</span>
                </Label>
                <ProjectSelector
                  value={projectId}
                  onChange={(nextProjectId) => {
                    setProjectId(nextProjectId);
                    setProjectError(nextProjectId == null ? "Project is required." : null);
                  }}
                  siteId={activeSite?.id ?? null}
                  required
                  error={Boolean(projectError)}
                />
                {projectError && (
                  <FieldMessage tone="error">{projectError}</FieldMessage>
                )}
                <FieldMessage tone="info">
                  {activeSite
                    ? "Select an existing project or add a new one under this site."
                    : "Select a site first, then select or add a project under it."}
                </FieldMessage>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scanName">
                  Scan Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="scanName"
                  placeholder="e.g., Marketing Site Audit Q3"
                  value={scanName}
                  onChange={(e) => {
                    setScanName(e.target.value);
                    if (e.target.value.trim() && !isUrlLikeScanName(e.target.value)) {
                      setScanNameError(null);
                    } else if (isUrlLikeScanName(e.target.value)) {
                      setScanNameError(SCAN_NAME_URL_ERROR);
                    }
                  }}
                  className={
                    scanNameError
                      ? "border-destructive ring-1 ring-destructive"
                      : ""
                  }
                  aria-invalid={Boolean(scanNameError)}
                  aria-describedby={scanNameError ? "manual-scan-name-error" : undefined}
                />
                {scanNameError && (
                  <FieldMessage id="manual-scan-name-error" tone="error">
                    {scanNameError}
                  </FieldMessage>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="initiatorName">Scan Initiator</Label>
                <Input
                  id="initiatorName"
                  value={initiatorName}
                  readOnly
                  disabled
                  className="bg-muted cursor-not-allowed"
                  title="Automatically set to your account"
                />
                <FieldMessage tone="info">
                  Locked to your account
                </FieldMessage>
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupId">Group</Label>
                <select
                  id="groupId"
                  value={groupId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setGroupId(id);
                    const g = myGroups.find((g) => g.id === id);
                    setInitiatorRole(g ? g.name : "");
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">No group</option>
                  {myGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Group is used as the scan role
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>URL Input Method</Label>
              <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="manual">
                    <LinkIcon className="w-4 h-4 mr-2" /> Manual Entry
                  </TabsTrigger>
                  <TabsTrigger value="sitemap">
                    <Globe className="w-4 h-4 mr-2" /> Sitemap
                  </TabsTrigger>
                  <TabsTrigger value="csv">
                    <UploadCloud className="w-4 h-4 mr-2" /> CSV Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="mt-4">
                  <div className="space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-2">
                        <Label>URL Rewrite</Label>
                        <Input
                          placeholder="stg.example.com"
                          value={urlPrefix}
                          onChange={(e) =>
                            handleUrlPrefixChange(e.target.value)
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Replace the host before the domain. Example:{" "}
                          <span className="font-mono">
                            https://www.example.com/path
                          </span>{" "}
                          →{" "}
                          <span className="font-mono">
                            https://stg.example.com/path
                          </span>
                          .
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label>URLs (one per line)</Label>
                        {urlFixCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700">
                            ✓ {urlFixCount} URL{urlFixCount !== 1 ? "s" : ""}{" "}
                            auto-corrected
                          </span>
                        )}
                      </div>
                      {urlLimitOn && (
                        <span
                          className={`text-xs font-medium tabular-nums ${parsedUrls.length >= urlLimit ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {parsedUrls.length} / {urlLimit} URLs
                        </span>
                      )}
                    </div>
                    <Textarea
                      placeholder={
                        "https://example.com\nhttps://example.com/about"
                      }
                      className={`min-h-[160px] font-mono text-sm ${urlLimitOn && parsedUrls.length >= urlLimit ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      value={manualUrls}
                      onChange={handleManualUrlsChange}
                    />
                    {urlLimitOn && parsedUrls.length >= urlLimit && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        URL limit of {urlLimit} reached. Go to Settings to
                        increase it.
                      </p>
                    )}
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
                        {parseSitemap.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Fetch URLs
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="csv" className="mt-4">
                  <div
                    className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleFileUpload(file);
                    }}
                    onClick={() =>
                      document.getElementById("csv-upload")?.click()
                    }
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
                    <h3 className="font-semibold text-lg">
                      Drop your CSV file here
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse
                    </p>
                    {isUploading && (
                      <p className="text-sm text-primary mt-4 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Uploading...
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Duplicate URL review dialog */}
            <Dialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
              <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CopyCheck className="w-5 h-5 text-amber-500" />
                    Duplicate URLs Found
                  </DialogTitle>
                  <DialogDescription>
                    {duplicateMap.size} URL
                    {duplicateMap.size !== 1 ? "s appear" : " appears"} more
                    than once ({totalDuplicateRows} extra entr
                    {totalDuplicateRows !== 1 ? "ies" : "y"}). Removing
                    duplicates will keep only the first occurrence of each URL.
                  </DialogDescription>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          #
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          URL
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(duplicateMap.entries()).map(
                        ([url, count], i) => (
                          <tr
                            key={url}
                            className={
                              i % 2 === 0 ? "bg-background" : "bg-muted/30"
                            }
                          >
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">
                              {i + 1}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs break-all">
                              {url}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-bold text-xs px-2 py-0.5 min-w-[2rem]">
                                ×{count}
                              </span>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <DialogFooter className="mt-4 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDupDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRemoveDuplicates}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove {totalDuplicateRows} Duplicate
                    {totalDuplicateRows !== 1 ? "s" : ""}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {parsedUrls.length > 0 && (
              <Alert className="bg-muted border-muted-foreground/20">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  Ready to scan {parsedUrls.length} URL
                  {parsedUrls.length !== 1 ? "s" : ""}
                  <span className="ml-1 text-xs font-mono px-1.5 py-0.5 rounded bg-muted-foreground/15 text-muted-foreground">
                    {parsedUrls.length}
                  </span>
                  {duplicateMap.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 px-2 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                      onClick={() => setDupDialogOpen(true)}
                    >
                      <CopyCheck className="w-3.5 h-3.5 mr-1.5" />
                      {duplicateMap.size} duplicate
                      {duplicateMap.size !== 1 ? "s" : ""} found
                    </Button>
                  )}
                </AlertTitle>
                <AlertDescription>
                  <div className="mt-2 text-xs font-mono max-h-24 overflow-y-auto space-y-1 text-muted-foreground">
                    {parsedUrls.slice(0, 8).map((url, i) => (
                      <div key={i} className="truncate">
                        {url}
                      </div>
                    ))}
                    {parsedUrls.length > 8 && (
                      <div className="italic text-primary">
                        ...and {parsedUrls.length - 8} more
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Rule filter section */}
            <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">
                  Rule Filter (Optional)
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/documentation"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    Open documentation for all SI rule references.
                  </TooltipContent>
                </Tooltip>
                {selectedRules.length > 0 && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {selectedRules.length} rule
                    {selectedRules.length !== 1 ? "s" : ""} selected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to run all rules, or select specific rules to test
                only those.
              </p>
              <RuleFilterSelector
                selectedRules={selectedRules}
                onChange={setSelectedRules}
              />
            </div>

            {/* JS-disable toggle — shown only when user has canDisableJs permission */}
            {user?.permissions?.canDisableJs && (
              <div
                className={`border rounded-lg p-4 transition-colors ${disableJavascript ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-muted/20"}`}
              >
                <div className="flex items-center gap-3">
                  <Shield
                    className={`w-4 h-4 shrink-0 ${disableJavascript ? "text-amber-600" : "text-muted-foreground"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium">
                      Disable JavaScript
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scan pages with JS turned off — useful for static content
                      audits and catching server-rendered issues.
                    </p>
                  </div>
                  <Switch
                    checked={disableJavascript}
                    onCheckedChange={setDisableJavascript}
                    aria-label="Disable JavaScript for scan"
                  />
                </div>
                {disableJavascript && (
                  <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/50 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      JS disabled — dynamic content, SPAs and client-rendered
                      pages may appear as empty or incomplete.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Incremental scan toggle */}
            <div
              className={`border rounded-lg p-4 transition-colors ${incremental ? "bg-teal-50/50 border-teal-200 dark:bg-teal-950/20 dark:border-teal-800" : "bg-muted/20"}`}
            >
              <div className="flex items-center gap-3">
                <RefreshCw
                  className={`w-4 h-4 shrink-0 ${incremental ? "text-teal-600" : "text-muted-foreground"}`}
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">
                    Incremental scan
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Skip pages whose content hasn't changed since the last
                    completed scan — previous results are carried forward,
                    making repeat scans much faster.
                  </p>
                </div>
                <Switch
                  checked={incremental}
                  onCheckedChange={setIncremental}
                  aria-label="Enable incremental scan"
                />
              </div>
            </div>

            {/* Proxy section — proxy URL managed in Settings → Proxy & Tools */}
            <div
              className={`border rounded-lg p-4 transition-colors ${proxyEnabled ? "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" : "bg-muted/20"}`}
            >
              <div className="flex items-center gap-3">
                {proxyEnabled ? (
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">
                    Proxy (Optional)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Route scanning through a proxy for internal or staging
                    environments. Supports PAC, HTTP, and SOCKS4/5.
                  </p>
                </div>
                <Switch
                  checked={proxyEnabled}
                  onCheckedChange={setProxyEnabledPersisted}
                  aria-label="Enable proxy"
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
                      <span>No proxy configured. </span>
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))
                        }
                        className="underline underline-offset-2 inline-flex items-center gap-0.5 hover:opacity-80"
                      >
                        Go to Settings <Settings className="w-3 h-3" />
                      </button>
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
              disabled={
                parsedUrls.length === 0 || createScan.isPending || startingScan
              }
              className="w-full sm:w-auto"
            >
              {createScan.isPending || startingScan ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : null}
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
