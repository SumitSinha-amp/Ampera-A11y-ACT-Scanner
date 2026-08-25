import { Fragment, useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useAuth } from "@/contexts/auth";
import { ACT_RULES, getRuleTitle } from "@/lib/actRules";
import { getScanRuleDisplay, SCAN_LEVEL_BADGES } from "@/lib/scan-rule-display";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetScan,
  useGetScanStatus,
  useCancelScan,
  useUpdateScan,
  getGetScanStatusQueryKey,
  getGetScanQueryKey,
} from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  AlertCircle,
  Info,
  BarChart2,
  StopCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  X,
  RotateCcw,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  Eye,
  Pause,
  Play,
  Globe,
  Cpu,
  Save,
  Ban,
  Pencil,
  Flag,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  TrendingUp,
  CircleSlash,
  Code,
  Plus,
  ExternalLink,
  Monitor,
  Shield,
  ListFilter,
  Camera,
  Zap,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStatusBadge } from "@/lib/status-badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUrlLikeScanName, SCAN_NAME_URL_ERROR } from "@/lib/scan-name";
import { FieldMessage } from "@/components/ui/field-message";
import { Copy } from "lucide-react";
import { FixSuggestionPanel } from "@/components/fix-suggestion-panel";
import { ScanQATab } from "@/pages/scan-qa";
import { InteractiveHtmlTree } from "@/components/page-report/html-tree";

const DEPRECATED_RULES = new Set(["ACT-R3", "ACT-R6", "ACT-R34", "ACT-R36", "ACT-R83"]);

// ── Extract meaningful component name from CSS selector hierarchy ─────────────
// Walks from outermost to innermost, skipping generic structural/utility classes,
// and returns the first class that looks like a real component name.
function extractComponentName(hierarchy: string): string {
  if (!hierarchy) return "";
  // Any class whose hyphen/underscore-split word parts include these structural terms is skipped
  const SKIP_WORDS = new Set([
    "layout", "grid", "panel", "column", "columns", "wrapper", "container",
    "row", "col", "flex", "content", "inner", "outer", "holder", "block",
    "section", "header", "footer", "main", "nav", "sidebar", "rail",
    "band", "strip", "slot", "region", "zone", "area", "two", "three",
    "four", "five", "six", "expander",
  ]);
  const UTILITY_PREFIX = /^(fg|bg|text|link|btn|no|is|js|has|style|font|color|tint|align|float|clear|pull|push|active|disabled|hidden|visible|show|hide|loaded|authored|resized|selected|current|open|closed|data|dtm|aria|role|tabindex|nth)/i;
  const hasSkipWord = (cls: string) =>
    cls.toLowerCase().split(/[-_]/).some(w => SKIP_WORDS.has(w));
  const parts = hierarchy.split(" > ");
  for (const part of parts) {
    const classes = (part.match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) ?? []).map(c => c.slice(1));
    for (const cls of classes) {
      if (hasSkipWord(cls)) continue;
      if (UTILITY_PREFIX.test(cls)) continue;
      if (cls.length < 4) continue;
      if (cls.includes("-") || cls.length > 10) return cls;
    }
  }
  return "";
}

// ── CSS Selector Hierarchy (expandable breadcrumb) ────────────────────────────
function SelectorHierarchy({ selector }: { selector: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!selector) return null;
  const parts = selector.split(/\s*>\s*/);
  const showAll = expanded || parts.length <= 4;
  return (
    <div className="text-xs font-mono select-text">
      <div className="space-y-0.5">
        {showAll ? parts.map((part, i) => (
          <div key={i} style={{ paddingLeft: `${i * 10}px` }} className="flex items-start gap-1 leading-snug">
            {i > 0 && <span style={{ color: "#bbb", marginRight: "2px", flexShrink: 0 }}>▸</span>}
            <span style={{ color: i === parts.length - 1 ? "#000080" : "#555", fontWeight: i === parts.length - 1 ? 600 : 400 }}>{part}</span>
          </div>
        )) : (
          <>
            <div className="flex items-start gap-1"><span style={{ color: "#555" }}>{parts[0]}</span></div>
            <div style={{ paddingLeft: "10px" }} className="flex items-start gap-1">
              <span style={{ color: "#bbb", marginRight: "2px", flexShrink: 0 }}>▸</span>
              <span style={{ color: "#aaa", fontStyle: "italic" }}>… {parts.length - 3} more levels …</span>
            </div>
            {parts.slice(-2).map((part, j) => (
              <div key={j} style={{ paddingLeft: `${(parts.length - 2 + j) * 10}px` }} className="flex items-start gap-1">
                <span style={{ color: "#bbb", marginRight: "2px", flexShrink: 0 }}>▸</span>
                <span style={{ color: j === 1 ? "#000080" : "#555", fontWeight: j === 1 ? 600 : 400 }}>{part}</span>
              </div>
            ))}
          </>
        )}
      </div>
      {parts.length > 4 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1.5 text-violet-600 hover:underline text-xs">
          {expanded ? "Collapse hierarchy" : `Expand all ${parts.length} levels`}
        </button>
      )}
    </div>
  );
}


/** Stored page snapshot viewer — shows the JPEG captured by Puppeteer at scan time.
 *  Renders a highlight overlay at (bboxX, bboxY, bboxWidth, bboxHeight) and scrolls to it. */
function LivePreviewFrame({
  url, pageId, selector, bboxX, bboxY, bboxWidth, bboxHeight,
}: {
  url: string;
  pageId: number | null;
  selector?: string;
  bboxX?: number | null;
  bboxY?: number | null;
  bboxWidth?: number | null;
  bboxHeight?: number | null;
}) {
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const scrollRef = useRef<HTMLDivElement>(null);

  const snapshotSrc = pageId ? `${BASE}/api/pages/${pageId}/snapshot` : null;

  const hasBox = bboxX != null && bboxY != null && bboxWidth != null && bboxHeight != null
    && bboxWidth > 0 && bboxHeight > 0;

  // Scroll to the highlight box whenever bbox or image load status changes
  useEffect(() => {
    if (!hasBox || !scrollRef.current || status !== "loaded") return;
    const PADDING = 80;
    scrollRef.current.scrollTo({
      top: Math.max(0, (bboxY ?? 0) - PADDING),
      left: Math.max(0, (bboxX ?? 0) - PADDING),
      behavior: "smooth",
    });
  }, [bboxX, bboxY, status, hasBox]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-100">
      {/* Scrollable snapshot area */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        {status === "loading" && snapshotSrc && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 z-10">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <p className="text-xs text-muted-foreground">Loading snapshot…</p>
          </div>
        )}
        {snapshotSrc ? (
          <div className="relative inline-block">
            <img
              key={snapshotSrc}
              src={snapshotSrc}
              alt="Page snapshot captured at scan time"
              className="block max-w-none"
              style={{ imageRendering: "auto" }}
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
            />
            {/* Highlight box — only shown once image is loaded and bbox is valid */}
            {status === "loaded" && hasBox && (
              <div
                style={{
                  position: "absolute",
                  left: bboxX!,
                  top: bboxY!,
                  width: bboxWidth!,
                  height: bboxHeight!,
                  border: "2px solid #7c3aed",
                  borderRadius: "2px",
                  background: "rgba(124,58,237,0.15)",
                  boxShadow: "0 0 0 2px rgba(124,58,237,0.25), 0 0 12px rgba(124,58,237,0.3)",
                  pointerEvents: "none",
                  zIndex: 20,
                }}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-12">
            <Monitor className="w-8 h-8" />
            <p className="text-sm text-center">No snapshot stored for this page</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-12">
            <Monitor className="w-8 h-8" />
            <p className="text-sm text-center">Snapshot not available</p>
          </div>
        )}
      </div>
      {/* Selector bar */}
      {selector && (
        <div
          className="shrink-0 bg-gray-900 text-gray-300 text-xs px-3 py-1.5 font-mono truncate border-t border-gray-700"
          title={selector}
        >
          <span className="text-gray-500 mr-2">target:</span>{selector}
        </div>
      )}
      {/* Footer */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-white border-t text-xs text-gray-500">
        <span className="italic text-gray-400">
          Viewport snapshot · desktop resolution
          {!hasBox && status === "loaded" && <span className="ml-2 text-amber-500">· no position data for this element</span>}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-violet-600 hover:underline shrink-0"
        >
          Open in new tab <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}


// ── Types & shared issue-level helpers ────────────────────────────────────────
interface Issue {
  id: number;
  ruleId: string;
  ruleType?: string | null;
  impact: string;
  description: string;
  element: string | null;
  elementContext?: string | null;
  selector: string | null;
  wcagCriteria: string | null;
  wcagLevel: string | null;
  remediation: string | null;
  legal?: {
    ada: string[];
    eaa: boolean;
  };
  legalText?: string | null;
  bboxX?: number | null;
  bboxY?: number | null;
  bboxWidth?: number | null;
  bboxHeight?: number | null;
  falsePositive?: boolean;
  falsePositiveNote?: string | null;
  aiAssessment?: AIIssueAssessment | null;
}

interface AIIssueAssessment {
  id: number;
  issueId: number;
  status: "queued" | "analyzing" | "completed" | "failed";
  decision: "confirmed_issue" | "potential_issue" | "not_an_issue" | "needs_review" | null;
  confidence: "low" | "medium" | "high" | null;
  rationale: string | null;
  evidence: string[];
  engine: string;
  provider: string | null;
  model: string | null;
  attempts: number;
  errorMessage: string | null;
}

interface IssueFilters {
  search: string;
  ruleId: string;
  severity: string;
  wcag: string;
  level: string;
  hideFalsePositives: boolean;
}

interface RuleInfo {
  description: string;
  ruleType?: string | null;
  impact: string;
  wcagCriteria: string | null;
  wcagLevel: string | null;
}

function issueMatchesFilters(issue: Issue, filters: IssueFilters) {
  if (filters.hideFalsePositives && issue.falsePositive) return false;
  if (filters.search && !issue.description.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.ruleId !== "all" && issue.ruleId !== filters.ruleId) return false;
  if (filters.severity !== "all" && issue.impact !== filters.severity) return false;
  if (filters.wcag !== "all" && issue.wcagCriteria !== filters.wcag) return false;
  if (filters.level !== "all" && issue.wcagLevel !== filters.level) return false;
  return true;
}

function getZeroRuleIds(issues: Issue[], filters: IssueFilters, selectedRules: string[]) {
  if (
    selectedRules.length < 2 ||
    filters.severity !== "all" ||
    filters.search ||
    filters.wcag !== "all" ||
    filters.level !== "all"
  ) {
    return [];
  }

  const issueRuleIds = new Set(
    issues.filter((issue) => issueMatchesFilters(issue, filters)).map((issue) => issue.ruleId),
  );
  return selectedRules.filter(
    (ruleId) => !issueRuleIds.has(ruleId) && (filters.ruleId === "all" || filters.ruleId === ruleId),
  );
}

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function getLegalText(issue: Issue) {
  if (!issue.legal) return "";
  const parts: string[] = [];
  if (issue.legal.ada?.length) parts.push(`ADA ${issue.legal.ada.join(", ")}`);
  if (issue.legal.eaa) parts.push("EAA");
  return parts.join(", ");
}

function ImpactBadge({ impact, className = "" }: { impact: string; className?: string }) {
  const compactClass = `h-5 rounded-full border-0 px-2 py-0 text-[10px] font-bold leading-5 capitalize ${className}`;
  switch (impact) {
    case "critical":
      return <Badge variant="outline" className={`bg-[#fdecea] text-[#d32f2f] ${compactClass}`}>Critical</Badge>;
    case "serious":
      return <Badge variant="outline" className={`bg-[#fbe9e7] text-[#e64a19] ${compactClass}`}>Serious</Badge>;
    case "moderate":
      return <Badge variant="outline" className={`bg-[#fff8e1] text-[#f57f17] ${compactClass}`}>Moderate</Badge>;
    case "minor":
      return <Badge variant="outline" className={`bg-[#e3f0fb] text-[#1976d2] ${compactClass}`}>Minor</Badge>;
    default:
      return <Badge className={compactClass}>{impact}</Badge>;
  }
}

function AIContextAssessmentPanel({
  assessment,
  enabled,
  onRetry,
  retrying = false,
}: {
  assessment?: AIIssueAssessment | null;
  enabled?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  if (!enabled && !assessment) return null;
  const pending = !assessment || assessment.status === "queued" || assessment.status === "analyzing";
  const decisionLabel: Record<NonNullable<AIIssueAssessment["decision"]>, string> = {
    confirmed_issue: "Likely confirmed",
    potential_issue: "Potential issue",
    not_an_issue: "Likely not an issue",
    needs_review: "Needs review",
  };
  const decisionStyle: Record<NonNullable<AIIssueAssessment["decision"]>, string> = {
    confirmed_issue: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    potential_issue: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    not_an_issue: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    needs_review: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  };

  return (
    <section className={`rounded-lg border border-violet-200/80 bg-violet-50/50 p-3 dark:border-violet-800/60 dark:bg-violet-950/20 ${pending ? "ai-assessment-processing" : ""}`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
        <h4 className="flex-1 text-xs font-semibold text-violet-800 dark:text-violet-200">AI Assessment</h4>
        {assessment?.status === "completed" && assessment.decision && (
          <Badge className={`h-5 border-0 px-2 text-[10px] ${decisionStyle[assessment.decision]}`}>
            {decisionLabel[assessment.decision]}
          </Badge>
        )}
      </div>

      {pending && (
        <div className="mt-2 flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{assessment?.status === "analyzing" ? "Reviewing the occurrence with AI…" : "Assessment queued for background review…"}</span>
        </div>
      )}

      {assessment?.status === "failed" && (
        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground" role="status">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span className="flex-1">
            Assessment could not be completed{assessment.errorMessage ? `: ${assessment.errorMessage}` : "."} The original scanner finding is unchanged.
          </span>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[11px]" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          )}
        </div>
      )}

      {assessment?.status === "completed" && (
        <div className="mt-2 space-y-2 text-xs">
          <p className="leading-relaxed text-foreground/85">{assessment.rationale}</p>
          <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-full bg-white/70 px-2 py-0.5 dark:bg-slate-900/60">
              {assessment.engine} · {assessment.confidence ?? "unrated"} confidence
            </span>
            {assessment.provider && (
              <span className="rounded-full bg-white/70 px-2 py-0.5 dark:bg-slate-900/60">
                {assessment.provider}{assessment.model ? ` · ${assessment.model}` : ""}
              </span>
            )}
          </div>
          {assessment.evidence.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700/70 dark:text-violet-300/80">Evidence reviewed</p>
              <ul className="space-y-1">
                {assessment.evidence.map((item, index) => (
                  <li key={`${index}-${item.slice(0, 20)}`} className="flex gap-1.5 leading-relaxed text-foreground/80">
                    <span aria-hidden="true" className="text-violet-500">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function IssueFilterBar({
  issues,
  filters,
  onChange,
  singleRule = false,
  selectedRules,
  ruleInfoMap,
  trailingControl,
}: {
  issues: Issue[];
  filters: IssueFilters;
  onChange: (f: IssueFilters) => void;
  singleRule?: boolean;
  selectedRules?: string[];
  ruleInfoMap?: Record<string, RuleInfo>;
  trailingControl?: React.ReactNode;
}) {
  const ruleIds = useMemo(
    () => Array.from(new Set([...issues.map((i) => i.ruleId), ...(selectedRules ?? [])])).sort(),
    [issues, selectedRules],
  );
  const wcagCriteria = useMemo(() => {
    const fromIssues = issues.map((i) => i.wcagCriteria).filter(Boolean) as string[];
    const fromSelected = (selectedRules ?? []).map((id) => ruleInfoMap?.[id]?.wcagCriteria).filter(Boolean) as string[];
    return Array.from(new Set([...fromIssues, ...fromSelected])).sort();
  }, [issues, selectedRules, ruleInfoMap]);

  const hasFilters = filters.search || filters.ruleId !== "all" || filters.severity !== "all" || filters.wcag !== "all" || filters.level !== "all";

  if (singleRule) return trailingControl ? <>{trailingControl}</> : null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-[#f0f2f8] py-2">
      <div className="relative min-w-[160px] flex-[1_1_190px]">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9eadca]" />
        <Input
          placeholder="Search issue description..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="h-8 rounded-lg border-[#e0e4ef] bg-[#f7f8fd] pl-7 text-xs text-[#172b4d] shadow-none placeholder:text-[#9eadca] dark:border-slate-800 dark:bg-slate-950"
        />
      </div>

      <Select value={filters.ruleId} onValueChange={(v) => onChange({ ...filters, ruleId: v })}>
        <SelectTrigger className="h-8 w-[88px] rounded-lg border-[#e0e4ef] bg-[#f7f8fd] text-xs text-[#172b4d] shadow-none dark:border-slate-800 dark:bg-slate-950"><SelectValue placeholder="Rule ID" /></SelectTrigger>
        <SelectContent className="max-h-64 overflow-y-auto">
          <SelectItem value="all">Rule ID</SelectItem>
          {ruleIds.map((id) => <SelectItem key={id} value={id} className="font-mono text-xs">{id}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.severity} onValueChange={(v) => onChange({ ...filters, severity: v })}>
        <SelectTrigger className="h-8 w-[94px] rounded-lg border-[#e0e4ef] bg-[#f7f8fd] text-xs text-[#172b4d] shadow-none dark:border-slate-800 dark:bg-slate-950"><SelectValue placeholder="Severity" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Severity</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="serious">Serious</SelectItem>
          <SelectItem value="moderate">Moderate</SelectItem>
          <SelectItem value="minor">Minor</SelectItem>
        </SelectContent>
      </Select>

      {wcagCriteria.length > 0 && (
        <Select value={filters.wcag} onValueChange={(v) => onChange({ ...filters, wcag: v })}>
          <SelectTrigger className="h-8 w-[122px] rounded-lg border-[#e0e4ef] bg-[#f7f8fd] text-xs text-[#172b4d] shadow-none dark:border-slate-800 dark:bg-slate-950"><SelectValue placeholder="WCAG criterion" /></SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            <SelectItem value="all">WCAG criterion</SelectItem>
            {wcagCriteria.map((wc) => <SelectItem key={wc} value={wc} className="font-mono text-xs">{wc}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.level} onValueChange={(v) => onChange({ ...filters, level: v })}>
        <SelectTrigger className="h-8 w-[76px] rounded-lg border-[#e0e4ef] bg-[#f7f8fd] text-xs text-[#172b4d] shadow-none dark:border-slate-800 dark:bg-slate-950"><SelectValue placeholder="Level" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Level</SelectItem>
          <SelectItem value="A">A</SelectItem>
          <SelectItem value="AA">AA</SelectItem>
          <SelectItem value="AAA">AAA</SelectItem>
        </SelectContent>
      </Select>

      {trailingControl}

      <Button
        variant={filters.hideFalsePositives ? "secondary" : "ghost"}
        size="sm"
        className={`h-8 shrink-0 rounded-lg px-2.5 text-xs gap-1 ${filters.hideFalsePositives ? "border border-[#9c27b0] bg-[#f3e5f5] text-[#6a1b9a] hover:bg-[#f0dff3] dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200" : "border border-[#e0e4ef] bg-[#f7f8fd] text-[#9eadca] dark:border-slate-800"}`}
        onClick={() => onChange({ ...filters, hideFalsePositives: !filters.hideFalsePositives })}
        title={filters.hideFalsePositives ? "False positives are hidden — click to show" : "Click to hide false positives"}
      >
        <Flag className="w-3 h-3" />
        {filters.hideFalsePositives ? "FP hidden" : "Show FP"}
      </Button>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground"
          onClick={() => onChange({ search: "", ruleId: "all", severity: "all", wcag: "all", level: "all", hideFalsePositives: true })}
        >
          <X className="mr-1 h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ── IssueGroupList ────────────────────────────────────────────────────────────
function IssueGroupList({
  issues,
  filters,
  pageUrl,
  onSelectOccurrence,
  selectedIssueId,
  onFlagIssue,
  isCrawlerScan,
  onOpenUpdateResults,
  aiContextualAssessmentEnabled,
  onRetryAssessment,
  retryingAssessmentId,
}: {
  issues: Issue[];
  filters: IssueFilters;
  pageUrl: string;
  onSelectOccurrence?: (issue: Issue, group: Issue[]) => void;
  selectedIssueId?: number;
  onFlagIssue?: (issue: Issue) => void;
  isCrawlerScan?: boolean;
  onOpenUpdateResults?: (ruleId: string, desc: string) => void;
  aiContextualAssessmentEnabled?: boolean;
  onRetryAssessment?: (issueId: number) => void;
  retryingAssessmentId?: number | null;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => issueMatchesFilters(issue, filters));
  }, [issues, filters]);

  const grouped = filteredIssues.reduce<Record<string, Issue[]>>((acc, issue) => {
    if (!acc[issue.ruleId]) acc[issue.ruleId] = [];
    acc[issue.ruleId].push(issue);
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => {
    const ai = IMPACT_ORDER[a[0].impact] ?? 99;
    const bi = IMPACT_ORDER[b[0].impact] ?? 99;
    return ai - bi;
  });

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-md border-dashed bg-muted/10 mt-4">
        <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No issues match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <Accordion type="multiple" className="space-y-1.5">
        {groups.map((group) => {
          const first = group[0];
          const count = group.length;
          return (
            <AccordionItem key={first.ruleId} value={first.ruleId} className="overflow-hidden rounded-[10px] border-[1.5px] border-[#f0f2f8] bg-white dark:border-slate-800 dark:bg-slate-950">
              <AccordionTrigger className="min-w-0 items-center px-3.5 py-2.5 hover:bg-[rgba(109,72,199,0.03)] hover:no-underline data-[state=open]:bg-[rgba(109,72,199,0.03)] dark:hover:bg-slate-900 dark:data-[state=open]:bg-slate-900">
                <div className="flex min-w-0 w-full items-center gap-2.5 pr-2 text-left">
                  <ImpactBadge impact={first.impact} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#172b4d] dark:text-slate-100">{first.description}</span>
                  <div className="hidden shrink-0 items-center gap-2 text-[10px] sm:flex">
                    <span className="font-mono text-[#9eadca]">{first.ruleId}</span>
                    <span className="rounded-full bg-[#fdecea] px-2 py-0.5 font-semibold text-[#c62828]">{first.ruleType || "Issue"}</span>
                    {first.wcagCriteria && <span className="rounded-full bg-[#f3f4fb] px-2 py-0.5 font-mono text-[#667] dark:bg-slate-800">WCAG {first.wcagCriteria}</span>}
                    {first.wcagLevel && <span className="rounded-full bg-[#f3f4fb] px-2 py-0.5 text-[#667] dark:bg-slate-800">{first.wcagLevel}</span>}
                    <span className="text-xs font-extrabold text-[#e84a3d]">{count}</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="border-t border-[#f5f6fb] px-3.5 pb-3 pt-0 sm:px-3.5">
                {isCrawlerScan && onOpenUpdateResults && (
                  <div className="mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 gap-1.5"
                      onClick={() => onOpenUpdateResults(first.ruleId, first.description)}
                    >
                      <ListFilter className="w-3.5 h-3.5" />
                      Update Results across pages
                    </Button>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-white">
                        <tr>
                          <th className="w-8 px-1 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.04em] text-[#9eadca]">#</th>
                          <th className="px-1 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.04em] text-[#9eadca]">Selector</th>
                          <th className="hidden px-1 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.04em] text-[#9eadca] md:table-cell">Element</th>
                          {group.some((i) => i.description !== first.description) && (
                            <th className="hidden px-1 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.04em] text-[#9eadca] lg:table-cell">Note</th>
                          )}
                          <th className="w-8 shrink-0" />
                          {onSelectOccurrence && <th className="w-32 shrink-0" />}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((issue, idx) => {
                          const isExpanded = expandedRows.has(issue.id);
                          const hasVariantDesc = issue.description !== first.description;
                          const isSelected = selectedIssueId === issue.id;
                          const isFlagged = issue.falsePositive === true;
                          return (
                            <Fragment key={issue.id}>
                              <tr
                                className={`border-t cursor-pointer select-none transition-colors ${
                                  isFlagged
                                    ? "bg-amber-50/40 dark:bg-amber-900/10"
                                    : isSelected
                                      ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                                      : isExpanded
                                        ? "bg-primary/5"
                                        : "hover:bg-muted/40"
                                }`}
                                onClick={() => toggleRow(issue.id)}
                              >
                                <td className="px-1 py-1.5 font-mono text-[#9eadca]">{idx + 1}</td>
                                <td className="max-w-[200px] px-1 py-1.5 font-mono">
                                  {issue.selector ? (
                                    <span className="block truncate text-[#6d48c7]" title={issue.selector}>{issue.selector}</span>
                                  ) : (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                <td className="hidden max-w-[380px] px-1 py-1.5 md:table-cell">
                                  {issue.element ? (
                                    <div className="flex items-center gap-2">
                                      <code className="block truncate text-primary font-mono" title={issue.element}>{issue.element}</code>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 text-[#667]"
                                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(issue.element || ""); }}
                                        title="Copy element HTML"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                {group.some((i) => i.description !== first.description) && (
                                  <td className="hidden max-w-[200px] px-1 py-1.5 text-[#7b8aaa] lg:table-cell">
                                    {hasVariantDesc ? (
                                      <span className="truncate block italic" title={issue.description}>{issue.description}</span>
                                    ) : null}
                                  </td>
                                )}
                                <td className="w-8 px-1 py-1.5 text-[#9eadca]">
                                  <div className="flex items-center gap-1.5">
                                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`} />
                                    {onFlagIssue && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-6 w-6 shrink-0 ${isFlagged ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/40 hover:text-amber-500"}`}
                                        title={isFlagged ? "Remove false positive flag" : "Flag as false positive"}
                                        onClick={(e) => { e.stopPropagation(); onFlagIssue(issue); }}
                                      >
                                        <Flag className={`w-3.5 h-3.5 ${isFlagged ? "fill-amber-400" : ""}`} />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                {onSelectOccurrence && (
                                  <td className="w-32 shrink-0 px-1 py-1.5" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 w-full whitespace-nowrap border-[#6d48c7]/20 bg-[#6d48c7]/[0.05] px-2 text-[11px] text-[#6d48c7] hover:bg-[#6d48c7]/10"
                                      onClick={(e) => { e.stopPropagation(); onSelectOccurrence(issue, group); }}
                                    >
                                      View Details
                                    </Button>
                                  </td>
                                )}
                              </tr>
                              {isExpanded && (
                                <tr key={`${issue.id}-detail`} className="bg-primary/5 border-t border-primary/10">
                                  <td
                                    colSpan={99}
                                    className="px-1 py-2"
                                  >
                                    <div className="space-y-2">
                                      {isFlagged && (
                                        <div className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                          <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5 fill-amber-400" />
                                          <div className="text-xs">
                                            <span className="font-semibold text-amber-700 dark:text-amber-400">Marked as false positive</span>
                                            {issue.falsePositiveNote && <p className="text-amber-600 dark:text-amber-300 mt-0.5">{issue.falsePositiveNote}</p>}
                                          </div>
                                        </div>
                                      )}
                                      {pageUrl && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Full URL</p>
                                          <div className="flex items-start gap-2">
                                            <code className="block bg-background border px-3 py-2 rounded text-xs font-mono text-foreground/80 break-all whitespace-pre-wrap flex-1">{pageUrl}</code>
                                            <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigator.clipboard.writeText(pageUrl)}>Copy</Button>
                                          </div>
                                        </div>
                                      )}
                                      {hasVariantDesc && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                                          <p className="text-sm text-foreground">{issue.description}</p>
                                        </div>
                                      )}
                                      {issue.selector && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">CSS Selector</p>
                                          <code className="block bg-background border px-3 py-2 rounded text-xs font-mono text-foreground/80 break-all whitespace-pre-wrap">{issue.selector}</code>
                                        </div>
                                      )}
                                      {issue.element && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Element HTML</p>
                                          <code className="block bg-background border px-3 py-2 rounded text-xs font-mono text-primary break-all whitespace-pre-wrap leading-relaxed">{issue.element}</code>
                                        </div>
                                      )}
                                      {(issue.wcagCriteria || issue.wcagLevel) && (
                                        <div className="flex gap-3 flex-wrap">
                                          {issue.wcagCriteria && (
                                            <div>
                                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">WCAG Criterion</p>
                                              <Badge variant="secondary" className="font-mono text-xs">{issue.wcagCriteria}</Badge>
                                            </div>
                                          )}
                                          {issue.wcagLevel && (
                                            <div>
                                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Conformance Level</p>
                                              <Badge variant="outline" className="text-xs">Level {issue.wcagLevel}</Badge>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <AIContextAssessmentPanel
                                        assessment={issue.aiAssessment}
                                        enabled={aiContextualAssessmentEnabled}
                                        onRetry={onRetryAssessment ? () => onRetryAssessment(issue.id) : undefined}
                                        retrying={retryingAssessmentId === issue.id}
                                      />
                                      <FixSuggestionPanel
                                        ruleId={issue.ruleId}
                                        description={issue.description}
                                        element={issue.element ?? null}
                                        elementContext={issue.elementContext ?? null}
                                        selector={issue.selector ?? null}
                                        wcagCriteria={issue.wcagCriteria}
                                        wcagLevel={issue.wcagLevel}
                                        pageUrl={pageUrl}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {first.remediation && (
                    <div className="mt-1 rounded-lg border border-[#6d48c7]/20 bg-[#6d48c7]/[0.05] px-3 py-2 text-xs">
                      <span className="font-semibold text-[#6d48c7]">How to fix: </span>
                      <span className="text-[#334155]">{first.remediation}</span>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function ZeroOccurrenceGroup({
  issues,
  filters,
  selectedRules,
  ruleInfoMap,
}: {
  issues: Issue[];
  filters: IssueFilters;
  selectedRules: string[];
  ruleInfoMap?: Record<string, RuleInfo>;
}) {
  const zeroRules = useMemo(
    () => getZeroRuleIds(issues, filters, selectedRules),
    [issues, filters, selectedRules],
  );
  const showZeroRows =
    selectedRules.length >= 2 &&
    filters.severity === "all" &&
    !filters.search &&
    filters.wcag === "all" &&
    filters.level === "all";

  if (zeroRules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-green-200/70 bg-green-50/30 px-4 py-6 text-center text-sm text-muted-foreground dark:border-green-900/40 dark:bg-green-950/10">
        {showZeroRows
          ? "All selected rules have occurrences on this page."
          : "No zero-occurrence rules match the current filters."}
      </div>
    );
  }

  return (
    <div className="mt-1.5 overflow-hidden rounded-[10px] border-[1.5px] border-green-200/70 bg-green-50/30 dark:border-green-900/40 dark:bg-green-950/10">
      <div className="flex min-w-0 items-center gap-2.5 border-b border-green-200/60 px-3.5 py-2.5 dark:border-green-900/40">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-green-800 dark:text-green-300">
          No occurrences
        </span>
        <Badge variant="secondary" className="shrink-0 bg-green-100 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {zeroRules.length} rule{zeroRules.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="space-y-2 px-3.5 pb-3 pt-2.5">
        {zeroRules.map((ruleId) => {
          const info = ruleInfoMap?.[ruleId];
          return (
            <div key={ruleId} className="rounded-md border border-green-200/60 bg-white/70 px-4 py-3 dark:border-green-900/40 dark:bg-slate-950/40">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-foreground/80">
                    {getRuleTitle(ruleId, info?.ruleType, info?.description) ?? "No issues detected for this rule on this page."}
                  </p>
                  {ACT_RULES[ruleId]?.detail && (
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">{ACT_RULES[ruleId].detail}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 font-mono text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      0 occurrences
                    </Badge>
                    <Badge variant="outline" className="bg-background font-mono text-xs">{ruleId}</Badge>
                    {info?.wcagCriteria && <Badge variant="secondary" className="font-mono text-xs">WCAG {info.wcagCriteria}</Badge>}
                    {info?.wcagLevel && <Badge variant="outline" className="text-xs">Level {info.wcagLevel}</Badge>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────
interface ExportIssueRow {
  pageUrl: string;
  ruleId: string;
  ruleLabel: string;
  description: string;
  impact: string;
  wcagCriteria: string;
  wcagLevel: string;
  legalText: string;
  selectedRules: string;
  scanLabel: string;
  selector: string;
  element: string;
  remediation: string;
}

function buildExportRows(scan: {
  name?: string | null;
  pages?: Array<{ url: string; issues?: Issue[] }>;
  options?: { rules?: string[] };
  id: number;
}): ExportIssueRow[] {
  const rows: ExportIssueRow[] = [];
  const selectedRules = scan.options?.rules ?? [];
  const allRules = selectedRules.length === Object.keys(ACT_RULES).length;
  const selectedRulesLabel =
    selectedRules.length === 0
      ? "All rules"
      : allRules
        ? "All rules"
        : selectedRules.map((ruleId) => `${ruleId} — ${getRuleTitle(ruleId)}`.trim()).join("; ");
  const scanLabel = scan.name || `Scan #${scan.id}`;
  for (const page of scan.pages ?? []) {
    for (const issue of page.issues ?? []) {
      rows.push({
        pageUrl: page.url,
        ruleId: issue.ruleId,
        ruleLabel: getRuleTitle(issue.ruleId, issue.ruleType, issue.description),
        description: issue.description,
        impact: issue.impact,
        wcagCriteria: issue.wcagCriteria ?? "",
        wcagLevel: issue.wcagLevel ?? "",
        legalText: issue.legalText ?? getLegalText(issue),
        selectedRules: selectedRulesLabel,
        scanLabel,
        selector: issue.selector ?? "",
        element: issue.element ?? "",
        remediation: issue.remediation ?? "",
      });
    }
  }
  // When no issues were found but pages were scanned, emit one row per page so
  // the exported file shows which URLs were checked rather than being blank.
  if (rows.length === 0) {
    const rulesLabel =
      selectedRules.length === 0 || allRules
        ? "All rules"
        : selectedRules.join(", ");
    for (const page of scan.pages ?? []) {
      rows.push({
        pageUrl: page.url,
        ruleId: rulesLabel,
        ruleLabel: selectedRulesLabel,
        description: "No accessibility issues found",
        impact: "",
        wcagCriteria: "",
        wcagLevel: "",
        legalText: "",
        selectedRules: selectedRulesLabel,
        scanLabel,
        selector: "",
        element: "",
        remediation: "",
      });
    }
  }
  return rows;
}

function ExportButtons({
  scan,
  compact = false,
}: {
  scan: {
    id: number;
    name?: string | null;
  };
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<"csv" | "excel" | "pdf" | null>(null);
  const scanLabel = scan.name || `scan-${scan.id}`;
  const safeLabel = scanLabel.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  // All exports call the dedicated server-side export endpoint which uses a
  // single LEFT JOIN query — fast even for large scans with thousands of issues.
  const fetchExportData = useCallback(async (format: "csv" | "excel" | "json") => {
    const resp = await fetch(`/api/scans/${scan.id}/export?format=${format}`, { credentials: "include" });
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    return resp;
  }, [scan.id]);

  const exportCsv = useCallback(async () => {
    setExporting("csv");
    try {
      const resp = await fetchExportData("csv");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeLabel}-a11y-report.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV exported" });
    } catch {
      toast({ title: "Export failed", description: "Could not generate CSV.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }, [fetchExportData, safeLabel, toast]);

  const exportExcel = useCallback(async () => {
    setExporting("excel");
    try {
      const resp = await fetchExportData("excel");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeLabel}-a11y-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel exported" });
    } catch {
      toast({ title: "Export failed", description: "Could not generate Excel.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }, [fetchExportData, safeLabel, toast]);

  const exportPdf = useCallback(async () => {
    setExporting("pdf");
    try {
      const resp = await fetchExportData("json");
      const data = await resp.json() as {
        scanName: string;
        selectedRules: string;
        rows: Array<{
          url: string; ruleId: string; ruleLabel: string; description: string;
          impact: string; wcagCriteria: string; wcagLevel: string;
          selector: string; remediation: string;
        }>;
      };
      const { rows, scanName } = data;
      const issueCount = rows.filter(r => r.ruleId !== data.selectedRules && r.description !== "No accessibility issues found").length;
      const pageCount = new Set(rows.map(r => r.url)).size;

      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

      doc.setFontSize(16);
      doc.text(`Accessibility Report: ${scanName}`, 40, 40);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Generated: ${new Date().toLocaleString()} — ${issueCount} issue${issueCount !== 1 ? "s" : ""} across ${pageCount} page${pageCount !== 1 ? "s" : ""}`, 40, 58);
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 70,
        head: [["#", "Page URL", "Rule ID", "Description", "Impact", "WCAG", "Selector", "Remediation"]],
        body: rows.map((r, i) => [
          i + 1,
          r.url,
          r.ruleId,
          r.description,
          r.impact,
          r.wcagCriteria ? `${r.wcagCriteria} (${r.wcagLevel})` : "",
          r.selector,
          r.remediation,
        ]),
        styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 150 },
          2: { cellWidth: 48 },
          3: { cellWidth: 170 },
          4: { cellWidth: 48 },
          5: { cellWidth: 55 },
          6: { cellWidth: 120 },
          7: { cellWidth: 150 },
        },
        alternateRowStyles: { fillColor: [248, 246, 255] },
      });

      doc.save(`${safeLabel}-a11y-report.pdf`);
      toast({ title: issueCount === 0 ? "PDF exported — no issues found" : "PDF exported" });
    } catch {
      toast({ title: "Export failed", description: "Could not generate PDF.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }, [fetchExportData, safeLabel, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!!exporting}
          className={compact ? "h-7 rounded-md border-slate-200 bg-white/80 px-2.5 text-[11px] shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950" : undefined}
        >
          {exporting ? (
            <Loader2 className={`${compact ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"} animate-spin`} />
          ) : (
            <Download className={compact ? "mr-1.5 h-3.5 w-3.5" : "mr-2 h-4 w-4"} />
          )}
          {exporting ? "Exporting…" : "Export"}
          {!exporting && <ChevronDown className={compact ? "ml-1.5 h-3 w-3 opacity-60" : "ml-2 h-3.5 w-3.5 opacity-60"} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCsv} disabled={!!exporting}>
          {exporting === "csv" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel} disabled={!!exporting}>
          {exporting === "excel" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
          Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf} disabled={!!exporting}>
          {exporting === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Scan-level utility components & helpers ───────────────────────────────────
function RulesBadges({ options }: { options?: unknown }) {
  const display = getScanRuleDisplay(options as { rules?: unknown; selectedRules?: unknown; wcagLevels?: unknown });

  if (display.mode === "levels") {
    const ruleCount = new Set(display.appliedRules).size || Object.keys(ACT_RULES).length;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[#667] dark:text-slate-300">Accessibility Scope</span>
        {display.values.map((level) => (
          <Badge key={level} variant="outline" className="text-xs font-semibold">
            {SCAN_LEVEL_BADGES[level] ?? level}
          </Badge>
        ))}
        <Badge variant="secondary" className="text-xs">
          {ruleCount} rules
        </Badge>
      </div>
    );
  }

  if (display.mode === "all") return null;

  const selectedRules = display.values;
  const allRules = selectedRules.length === Object.keys(ACT_RULES).length;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <Badge variant="secondary" className="text-xs">
        {allRules ? "All rules" : `${selectedRules.length} rules`}
      </Badge>
      {allRules ? (
        <Badge variant="outline" className="text-xs">
          Scanning / scanned for all rules
        </Badge>
      ) : (
        selectedRules.slice(0, 6).map((ruleId) => (
          <Badge key={ruleId} variant="outline" className="text-xs font-mono">
            {ruleId}
          </Badge>
        ))
      )}
    </div>
  );
}

function formatElapsedTime(
  startedAt?: string | null,
  endedAt?: string | null,
): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return null;
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const minsRem = mins % 60;
  return minsRem ? `${hrs}h ${minsRem}m` : `${hrs}h`;
}

function applyPrefix(urls: string[], prefix: string) {
  const p = prefix.trim();
  if (!p) return urls;
  return urls.map((u) =>
    u.startsWith("http://") || u.startsWith("https://") ? u : `${p}${u}`,
  );
}

function getSelectedRuleSummary(selectedRules: string[]) {
  if (selectedRules.length === 0) return null;
  if (selectedRules.length === Object.keys(ACT_RULES).length)
    return "Scanning for all rules";
  if (selectedRules.length === 1) return `Rule ${selectedRules[0]}`;
  return `${selectedRules.length} selected rules`;
}

function formatEta(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "ETA unknown";
  if (minutes < 1) return "ETA < 1 min";
  if (minutes < 60) return `ETA ~${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `ETA ~${hrs}h ${mins}m`;
}

export default function ScanDetail() {
  const { id } = useParams();
  const scanId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [filters, setFilters] = useState<IssueFilters>({
    search: "",
    ruleId: "all",
    severity: "all",
    wcag: "all",
    level: "all",
    hideFalsePositives: true,
  });

  const [pageStatusFilter, setPageStatusFilter] = useState<string>("all");
  const [pageUrlFilter, setPageUrlFilter] = useState("");
  const [pageExtFilter, setPageExtFilter] = useState("all");

  const [fpOverrides, setFpOverrides] = useState<Record<number, { falsePositive: boolean; falsePositiveNote: string | null }>>({});
  const [fpDialogIssue, setFpDialogIssue] = useState<Issue | null>(null);
  const [fpNote, setFpNote] = useState("");

  const flagMutation = useMutation({
    mutationFn: async ({ id, falsePositive, note }: { id: number; falsePositive: boolean; note: string | null }) => {
      const resp = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ falsePositive, note }),
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to update issue");
      return resp.json() as Promise<{ id: number; falsePositive: boolean; falsePositiveNote: string | null }>;
    },
    onSuccess: (data) => {
      setFpOverrides((prev) => ({
        ...prev,
        [data.id]: { falsePositive: data.falsePositive, falsePositiveNote: data.falsePositiveNote },
      }));
    },
    onError: () => {
      toast({ title: "Failed to update false positive flag", variant: "destructive" });
    },
  });

  const handleOpenFlagDialog = (issue: Issue) => {
    const override = fpOverrides[issue.id];
    const currentNote = override !== undefined ? override.falsePositiveNote : (issue.falsePositiveNote ?? null);
    setFpNote(currentNote ?? "");
    setFpDialogIssue(issue);
  };

  const handleFlagConfirm = () => {
    if (!fpDialogIssue) return;
    const newNote = fpNote.trim() ? fpNote.trim() : null;
    setFpOverrides((prev) => ({
      ...prev,
      [fpDialogIssue.id]: { falsePositive: true, falsePositiveNote: newNote },
    }));
    flagMutation.mutate({ id: fpDialogIssue.id, falsePositive: true, note: newNote });
    setFpDialogIssue(null);
  };

  const handleRemoveFlagConfirm = () => {
    if (!fpDialogIssue) return;
    setFpOverrides((prev) => ({
      ...prev,
      [fpDialogIssue.id]: { falsePositive: false, falsePositiveNote: null },
    }));
    flagMutation.mutate({ id: fpDialogIssue.id, falsePositive: false, note: null });
    setFpDialogIssue(null);
  };

  // ── Smart Analysis state ──────────────────────────────────────────────────
  type SmartIssueVariant = {
    description: string;
    occurrences: number;
    pages: string[];
  };
  type SmartComponent = {
    componentName: string;
    tag: string;
    hierarchy: string;
    ruleIds: string[];
    worstImpact: string;
    totalOccurrences: number;
    affectedPageCount: number;
    topPages: string[];
    sampleDescriptions?: string[];
    issueVariants: SmartIssueVariant[];
    sampleElement?: string | null;
    sampleSelector?: string | null;
    sampleRuleId?: string;
    sampleDescription?: string;
  };
  type SmartAnalysisData = {
    scanId: number;
    totalIssues: number;
    totalComponents: number;
    /** Scan-wide occurrence totals per rule (excludes false positives) */
    ruleTotals?: Record<string, number>;
    components: SmartComponent[];
  };

  const [smartOpen, setSmartOpen] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartData, setSmartData] = useState<SmartAnalysisData | null>(null);
  const [smartSearch, setSmartSearch] = useState("");
  const [smartImpact, setSmartImpact] = useState("all");
  const [smartRule, setSmartRule] = useState("all");
  const [smartSort, setSmartSort] = useState<"severity" | "occurrences" | "pages" | "component">("severity");
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartExpanded, setSmartExpanded] = useState<Set<string>>(new Set());
  const [smartUrlFilter, setSmartUrlFilter] = useState("");
  const [smartAnalysisAiEnabled, setSmartAnalysisAiEnabled] = useState(false);
  type AiInsight = { componentType: string; issueSummary: string; rootCause: string; fixStrategy: string; priority: "high" | "medium" | "low"; priorityReason: string };
  const [aiInsights, setAiInsights] = useState<Map<string, AiInsight>>(new Map());
  const [aiInsightsLoading, setAiInsightsLoading] = useState<Set<string>>(new Set());
  const [aiInsightsError, setAiInsightsError] = useState<Map<string, string>>(new Map());

  type CodeViewOccurrence = { id: number; ruleId: string; impact: string; element: string; elementContext?: string | null; selector: string; description: string; bboxX: number | null; bboxY: number | null; bboxWidth: number | null; bboxHeight: number | null };
  const [codeViewOpen, setCodeViewOpen] = useState(false);
  const [codeViewLoading, setCodeViewLoading] = useState(false);
  const [codeViewError, setCodeViewError] = useState<string | null>(null);
  const [codeViewComponent, setCodeViewComponent] = useState<SmartComponent | null>(null);
  const [codeViewUrl, setCodeViewUrl] = useState("");
  const [codeViewComponentName, setCodeViewComponentName] = useState("");
  const [codeViewOccurrences, setCodeViewOccurrences] = useState<CodeViewOccurrence[]>([]);
  const [codeViewSelectedIdx, setCodeViewSelectedIdx] = useState(0);
  const [codeViewPageHtml, setCodeViewPageHtml] = useState("");
  const [codeViewPageId, setCodeViewPageId] = useState<number | null>(null);
  const codeViewHighlightRef = useRef<HTMLSpanElement>(null);
  const [codeViewMode, setCodeViewMode] = useState<"html" | "live">("html");
  const [codeViewExpandedOccs, setCodeViewExpandedOccs] = useState<Set<number>>(new Set());
  const [mainView, setMainView] = useState<"accessibility" | "qa">("accessibility");
  function toggleOccExpanded(i: number) {
    setCodeViewExpandedOccs(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  async function exportSmartPDF() {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const freshRes = await fetch(`${BASE}/api/scans/${scanId}/smart-analysis`, { credentials: "include" });
    if (!freshRes.ok) return;
    const freshData: SmartAnalysisData = await freshRes.json();

    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    const scanLabel = scan?.name || `scan-${scanId}`;
    const now = new Date().toLocaleString();

    const exportComponents = freshData.components;

    doc.setFontSize(18);
    doc.setTextColor(109, 40, 217);
    doc.text("Smart Analysis Report", 14, 18);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Scan: ${scanLabel}`, 14, 26);
    doc.text(`Generated: ${now}`, 14, 31);
    doc.text(
      `Total Issues: ${freshData.totalIssues.toLocaleString()}   ·   Unique Components / Elements: ${freshData.totalComponents}`,
      14, 36
    );

    // ── Sheet 1: Component summary table ──
    autoTable(doc, {
      startY: 42,
      head: [["#", "Component Hierarchy", "Rules", "Worst Impact", "Occurrences", "Pages Affected"]],
      body: exportComponents.map((c, i) => [
        i + 1,
        c.hierarchy,
        c.ruleIds.join(", "),
        c.worstImpact.charAt(0).toUpperCase() + c.worstImpact.slice(1),
        c.totalOccurrences.toLocaleString(),
        c.affectedPageCount.toLocaleString(),
      ]),
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 75 },
        2: { cellWidth: 55 },
        3: { cellWidth: 22 },
        4: { cellWidth: 22, halign: "right" },
        5: { cellWidth: 22, halign: "right" },
      },
      alternateRowStyles: { fillColor: [248, 245, 255] },
      didDrawPage: (_data) => {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("Ampera A11y ACT Tool  ·  Smart Analysis Report", 14, doc.internal.pageSize.height - 8);
      },
    });

    // ── Sheet 2: Detailed breakdown — one row per issue-description × URL ──
    const detailRows: (string | number)[][] = [];
    for (let ci = 0; ci < exportComponents.length; ci++) {
      const c = exportComponents[ci];
      const variants = c.issueVariants ?? [];
      for (const variant of variants) {
        for (const url of variant.pages) {
          detailRows.push([
            ci + 1,
            c.hierarchy,
            variant.description ?? "",
            variant.occurrences,
            url,
          ]);
        }
      }
    }

    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(109, 40, 217);
    doc.text("Issues & Affected URLs", 14, 14);
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.text(
      `${detailRows.length.toLocaleString()} rows — one per issue description × affected page`,
      14, 20
    );

    autoTable(doc, {
      startY: 25,
      head: [["#", "Component Hierarchy", "Issue Description", "Pages", "Affected Page URL"]],
      body: detailRows,
      styles: { fontSize: 6.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 55 },
        2: { cellWidth: 90 },
        3: { cellWidth: 12, halign: "right" },
        4: { cellWidth: 90 },
      },
      alternateRowStyles: { fillColor: [248, 245, 255] },
      didDrawPage: (_data) => {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("Ampera A11y ACT Tool  ·  Issues & Affected URLs", 14, doc.internal.pageSize.height - 8);
      },
    });

    // ── Page numbers ──
    const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align: "right" });
    }

    doc.save(`smart-analysis-${scanLabel.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function exportSmartExcel() {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const freshRes = await fetch(`${BASE}/api/scans/${scanId}/smart-analysis`, { credentials: "include" });
    if (!freshRes.ok) return;
    const freshData: SmartAnalysisData = await freshRes.json();
    const exportComponents = freshData.components;

    const XLSX = await import("xlsx");
    const scanLabel = scan?.name || `scan-${scanId}`;
    const now = new Date().toLocaleString();
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["Smart Analysis Report"],
      [],
              ["Scan Title", scanLabel],
      ["Generated", now],
      ["Total Issues", freshData.totalIssues],
      ["Unique Components / Elements", freshData.totalComponents],
    ]);
    summarySheet["A1"].s = { font: { bold: true, sz: 14 } };
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Sheet 2 — Components summary
    const compHeaders = [
      "Rank", "Component Hierarchy", "Component Name", "Element Tag",
      "Rules", "Worst Impact", "Occurrences", "Pages Affected",
    ];
    const compRows = exportComponents.map((c, i) => [
      i + 1,
      c.hierarchy,
      c.componentName,
      c.tag !== "unknown" ? `<${c.tag}>` : "",
      c.ruleIds.join(", "),
      c.worstImpact.charAt(0).toUpperCase() + c.worstImpact.slice(1),
      c.totalOccurrences,
      c.affectedPageCount,
    ]);
    const compSheet = XLSX.utils.aoa_to_sheet([compHeaders, ...compRows]);
    compSheet["!cols"] = [
      { wch: 6 }, { wch: 55 }, { wch: 28 }, { wch: 14 },
      { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, compSheet, "Components");

    // Sheet 3 — Issues & Affected Pages (one row per variant × page URL)
    const issueHeaders = [
      "Rank", "Component Hierarchy", "Worst Impact", "Rules",
      "Issue Description", "Pages for This Issue", "Affected Page URL",
    ];
    const issueRows = exportComponents.flatMap((c, ci) =>
      (c.issueVariants ?? []).flatMap(v =>
        v.pages.map(url => [
          ci + 1,
          c.hierarchy,
          c.worstImpact.charAt(0).toUpperCase() + c.worstImpact.slice(1),
          c.ruleIds.join(", "),
          v.description,
          v.occurrences,
          url,
        ])
      )
    );
    const issueSheet = XLSX.utils.aoa_to_sheet([issueHeaders, ...issueRows]);
    issueSheet["!cols"] = [
      { wch: 6 }, { wch: 50 }, { wch: 12 }, { wch: 30 },
      { wch: 70 }, { wch: 16 }, { wch: 90 },
    ];
    XLSX.utils.book_append_sheet(wb, issueSheet, "Issues & Affected Pages");

    XLSX.writeFile(wb, `smart-analysis-${scanLabel.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function openSmartAnalysis() {
    setSmartOpen(true);
    if (smartData?.scanId === scanId) return;
    setSmartLoading(true);
    setSmartData(null);
    setSmartError(null);
    try {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const [res, cfgRes] = await Promise.all([
        fetch(`${BASE}/api/scans/${scanId}/smart-analysis`, { credentials: "include" }),
        fetch(`${BASE}/api/ai/config`, { credentials: "include" }),
      ]);
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Smart Analysis could not be loaded.");
      }
      setSmartData(await res.json());
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setSmartAnalysisAiEnabled(cfg.smartAnalysisAiEnabled === true);
      }
    } catch (error) {
      setSmartError(
        error instanceof Error
          ? error.message
          : "Smart Analysis could not be loaded.",
      );
    } finally {
      setSmartLoading(false);
    }
  }

  async function getAiInsights(comp: SmartComponent, rowKey: string) {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setAiInsightsLoading(prev => { const n = new Set(prev); n.add(rowKey); return n; });
    setAiInsightsError(prev => { const n = new Map(prev); n.delete(rowKey); return n; });
    try {
      const firstOcc = comp.sampleDescriptions?.[0] ?? "";
      const r = await fetch(`${BASE}/api/scans/${scanId}/smart-analysis/ai-insights`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentName: comp.componentName,
          hierarchy: comp.hierarchy ?? comp.componentName,
          ruleIds: comp.ruleIds,
          worstImpact: comp.worstImpact,
          totalOccurrences: comp.totalOccurrences,
          affectedPageCount: comp.affectedPageCount,
          sampleDescription: firstOcc,
          sampleSelector: comp.componentName,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "AI request failed");
      setAiInsights(prev => { const n = new Map(prev); n.set(rowKey, data as AiInsight); return n; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiInsightsError(prev => { const n = new Map(prev); n.set(rowKey, msg); return n; });
    } finally {
      setAiInsightsLoading(prev => { const n = new Set(prev); n.delete(rowKey); return n; });
    }
  }

  function toggleSmartExpanded(name: string) {
    setSmartExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function openCodeView(comp: SmartComponent, url: string) {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    setCodeViewComponentName(comp.componentName);
    setCodeViewComponent(comp);
    setCodeViewUrl(url);
    setCodeViewSelectedIdx(0);
    setCodeViewOccurrences([]);
    setCodeViewPageHtml("");
    setCodeViewPageId(null);
    setCodeViewExpandedOccs(new Set());
    setCodeViewMode("html");
    setCodeViewError(null);
    setCodeViewOpen(true);
    setCodeViewLoading(true);
    try {
      const res = await fetch(
        `${BASE}/api/scans/${scanId}/smart-analysis/page-occurrences?componentName=${encodeURIComponent(comp.componentName)}&pageUrl=${encodeURIComponent(url)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Code View occurrences could not be loaded.");
      }
      const data = await res.json();
      setCodeViewOccurrences(data.occurrences ?? []);
      const pid: number | null = data.pageId ?? null;
      setCodeViewPageId(pid);
      if (pid) {
        const htmlRes = await fetch(`${BASE}/api/pages/${pid}/html`, { credentials: "include" });
        if (htmlRes.ok) {
          const htmlData = await htmlRes.json();
          setCodeViewPageHtml(htmlData.html ?? "");
        } else if (htmlRes.status !== 404) {
          const body = await htmlRes.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || "Stored page HTML could not be loaded.");
        }
      }
    } catch (error) {
      setCodeViewError(
        error instanceof Error
          ? error.message
          : "Code View could not be loaded.",
      );
    } finally {
      setCodeViewLoading(false);
    }
  }

  useEffect(() => {
    if (codeViewOpen && codeViewHighlightRef.current) {
      codeViewHighlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [codeViewOpen, codeViewSelectedIdx, codeViewPageHtml]);

  const filteredSmartComponents = (smartData?.components ?? [])
    .map(c => ({ ...c, ruleIds: c.ruleIds.filter(r => !DEPRECATED_RULES.has(r)) }))
    .filter(c => {
      if (c.ruleIds.length === 0) return false;
      if (smartImpact !== "all" && c.worstImpact !== smartImpact) return false;
      if (smartRule !== "all" && !c.ruleIds.includes(smartRule)) return false;
      if (smartSearch && !c.componentName.toLowerCase().includes(smartSearch.toLowerCase()) && !c.hierarchy.toLowerCase().includes(smartSearch.toLowerCase())) return false;
      if (smartUrlFilter && !c.topPages.some(u => u.toLowerCase().includes(smartUrlFilter.toLowerCase()))) return false;
      return true;
    })
    .sort((a, b) => {
      if (smartSort === "occurrences") {
        return (b.totalOccurrences ?? 0) - (a.totalOccurrences ?? 0);
      }
      if (smartSort === "pages") {
        return (b.affectedPageCount ?? 0) - (a.affectedPageCount ?? 0);
      }
      if (smartSort === "component") {
        return (a.componentName || a.hierarchy).localeCompare(
          b.componentName || b.hierarchy,
        );
      }
      const aImpact = IMPACT_ORDER[a.worstImpact] ?? 99;
      const bImpact = IMPACT_ORDER[b.worstImpact] ?? 99;
      if (aImpact !== bImpact) return aImpact - bImpact;
      return (b.totalOccurrences ?? 0) - (a.totalOccurrences ?? 0);
    });

  const allSmartRules = [...new Set((smartData?.components ?? []).flatMap(c => c.ruleIds))].sort();

  // ── Edit Scan state ───────────────────────────────────────────────────────
  const { user: authUser } = useAuth();
  const isSuperAdmin = authUser?.role === "super_admin";
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [editInitiatorName, setEditInitiatorName] = useState("");
  const [editInitiatorRole, setEditInitiatorRole] = useState("");
  const [editAllUsers, setEditAllUsers] = useState<{ id: number; fullName: string; username: string; groups: { id: number; name: string }[] }[]>([]);
  const editUsersFetched = useRef(false);
  const updateScanMutation = useUpdateScan();

  const openEditDialog = () => {
    setEditName(scan?.name ?? "");
    setEditNameError(null);
    setEditInitiatorName((scan as { initiatorName?: string | null } | undefined)?.initiatorName ?? "");
    setEditInitiatorRole((scan as { initiatorRole?: string | null } | undefined)?.initiatorRole ?? "");
    setEditOpen(true);
  };

  // Fetch all users once for superadmin initiator dropdown
  useEffect(() => {
    if (!isSuperAdmin || !editOpen || editUsersFetched.current) return;
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${BASE}/api/admin/users`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: number; fullName: string; username: string; groups: { id: number; name: string }[] }[]) => {
        setEditAllUsers(data);
        editUsersFetched.current = true;
      })
      .catch(() => {});
  }, [isSuperAdmin, editOpen]);

  const handleSaveEdit = () => {
    if (!scan) return;
    if (isUrlLikeScanName(editName)) {
      setEditNameError(SCAN_NAME_URL_ERROR);
      return;
    }
    setEditNameError(null);
    const data: Parameters<typeof updateScanMutation.mutate>[0]["data"] = {
      name: editName.trim() || undefined,
      ...(isSuperAdmin ? {
        initiatorName: editInitiatorName.trim() || null,
        initiatorRole: editInitiatorRole.trim() || null,
      } : {}),
    };
    updateScanMutation.mutate(
      { id: scan.id, data },
      {
        onSuccess: () => {
          toast({ title: "Scan updated" });
          queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scan.id) });
          setEditOpen(false);
        },
        onError: () => {
          toast({ title: "Failed to update scan", variant: "destructive" });
        },
      }
    );
  };

  const handleSelectOccurrence = useCallback(
    (issue: Issue, _group: Issue[], _pageUrl: string, pageId: number) => {
      // Open the full-screen page report for this page,
      // pre-selecting the clicked occurrence.
      setLocation(`/scans/${scanId}/pages/${pageId}/report?issue=${issue.id}`);
    },
    [scanId, setLocation],
  );

  const { data: scan, isLoading: scanLoading } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
    },
  });

  const isRunning = scan?.status === "running" || scan?.status === "pending";
  const isPaused = scan?.status === "paused";
  const isActive = isRunning || isPaused;
  const isUpdatingResults =
    scan?.status === "completed" && (!scan.pages || scan.pages.length === 0);
  const canRetry =
    scan?.status === "failed" ||
    scan?.status === "cancelled" ||
    (scan?.pages ?? []).some(
      (p) => p.status === "failed" || p.status === "pending",
    );
  const isAutoRetrying =
    isRunning &&
    (scan?.pages ?? []).some(
      (p) => p.status === "failed" || p.status === "pending",
    );
  const elapsedText = formatElapsedTime(scan?.createdAt, scan?.completedAt);

  const { data: liveStatus } = useGetScanStatus(scanId, {
    query: {
      enabled: !!scanId && (isActive || isUpdatingResults),
      queryKey: getGetScanStatusQueryKey(scanId),
      refetchInterval: 2000,
    },
  });

  const hasPendingAIAssessments = (scan?.pages ?? []).some((page) =>
    (page.issues ?? []).some((issue) =>
      issue.aiAssessment?.status === "queued" || issue.aiAssessment?.status === "analyzing",
    ),
  );

  useEffect(() => {
    if (!scanId || !hasPendingAIAssessments) return;
    const timer = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [hasPendingAIAssessments, queryClient, scanId]);

  // useGetScan has no refetchInterval — it fetches once and stops.
  // When the scan finishes, liveStatus transitions to "completed" but scan.pages
  // is never populated because nothing re-triggers useGetScan.
  // This effect fires on two paths:
  //   (a) liveStatus.status → "completed" (user was watching a running scan)
  //   (b) isUpdatingResults is true on mount (user navigated to an already-finished
  //       scan whose pages hadn't been loaded into the React Query cache yet)
  // In both cases we force one refetch of the full scan so page results appear.
  useEffect(() => {
    if (!scanId) return;
    if (liveStatus?.status === "completed" || isUpdatingResults) {
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus?.status, isUpdatingResults]);

  const cancelScan = useCancelScan();
  const [retryingAssessmentId, setRetryingAssessmentId] = useState<number | null>(null);
  const retryAssessment = useCallback(async (issueId: number) => {
    setRetryingAssessmentId(issueId);
    try {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const response = await fetch(`${BASE}/api/scans/${scanId}/issues/${issueId}/ai-assessment/retry`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to retry this assessment");
      await queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
    } catch {
      toast({ title: "Assessment retry failed", description: "The assessment could not be queued again.", variant: "destructive" });
    } finally {
      setRetryingAssessmentId(null);
    }
  }, [queryClient, scanId, toast]);

  const retryClone = useMutation({
    mutationFn: async () => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      let lastError: Error = new Error("Unknown error");
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
        try {
          const res = await fetch(`${BASE}/api/scans/${scanId}/retry`, {
            method: "POST",
            credentials: "include",
          });
          if (!res.ok) {
            const text = await res.text();
            // Don't retry on definitive errors (auth, not found, bad request)
            if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 400) {
              throw new Error(text);
            }
            lastError = new Error(text);
            continue;
          }
          return res.json() as Promise<{ id: number }>;
        } catch (err) {
          if (err instanceof Error && (err.message.includes("401") || err.message.includes("403") || err.message.includes("404") || err.message.includes("400"))) {
            throw err;
          }
          lastError = err as Error;
        }
      }
      throw lastError;
    },
  });

  const pauseScanMutation = useMutation({
    mutationFn: async () => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/pause`, {
        method: "POST",
        credentials: "include",
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
    onError: () => {
      toast({ title: "Could not pause scan", variant: "destructive" });
    },
  });

  const resumeScanMutation = useMutation({
    mutationFn: async () => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/resume`, {
        method: "POST",
        credentials: "include",
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
    onError: () => {
      toast({ title: "Could not resume scan", variant: "destructive" });
    },
  });

  // ── Add URLs to running scan ───────────────────────────────────────────────
  const [addUrlsOpen, setAddUrlsOpen] = useState(false);
  const [addUrlsText, setAddUrlsText] = useState("");

  const addUrlsMutation = useMutation({
    mutationFn: async (urls: string[]) => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/add-urls`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to add URLs");
      }
      return res.json() as Promise<{ added: number; skipped: number; total: number }>;
    },
    onSuccess: (data) => {
      const msg = data.skipped > 0
        ? `Added ${data.added} URL${data.added !== 1 ? "s" : ""} (${data.skipped} already in scan)`
        : `Added ${data.added} URL${data.added !== 1 ? "s" : ""} to scan`;
      toast({ title: msg });
      setAddUrlsOpen(false);
      setAddUrlsText("");
      queryClient.invalidateQueries({ queryKey: getGetScanStatusQueryKey(scanId) });
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const removeQueuedUrlMutation = useMutation({
    mutationFn: async (page: { id: number; url: string }) => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/pages/${page.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to remove URL" }));
        throw new Error(err.error ?? "Failed to remove URL");
      }
      return res.json() as Promise<{ removed: boolean; pageId: number; url: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "URL removed from queue", description: data.url });
      queryClient.invalidateQueries({ queryKey: getGetScanStatusQueryKey(scanId) });
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: getGetScanStatusQueryKey(scanId) });
    },
  });

  function handleAddUrlsSubmit() {
    const urls = addUrlsText
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) return;
    addUrlsMutation.mutate(urls);
  }

  const handleCancel = () => {
    cancelScan.mutate(
      { id: scanId },
      {
        onSuccess: () => {
          toast({ title: "Scan cancelled" });
          queryClient.invalidateQueries({
            queryKey: getGetScanQueryKey(scanId),
          });
        },
        onError: () => {
          toast({ title: "Error cancelling scan", variant: "destructive" });
        },
      },
    );
  };

  const handleRetry = () => {
    if (!scan) return;
    const pages = scan.pages ?? [];
    if (pages.length === 0) {
      toast({
        title: "Nothing to retry",
        description: "No URLs found in this scan.",
        variant: "destructive",
      });
      return;
    }
    retryClone.mutate(undefined, {
      onSuccess: (data: { id: number }) => {
        const failedCount = pages.filter(
          (p: { status: string }) =>
            p.status === "failed" || p.status === "pending",
        ).length;
        const copiedCount = pages.length - failedCount;
        toast({
          title: "Retry scan started",
          description:
            copiedCount > 0
              ? `${copiedCount} completed page${copiedCount !== 1 ? "s" : ""} carried over · ${failedCount} page${failedCount !== 1 ? "s" : ""} queued for re-scan`
              : `${failedCount} page${failedCount !== 1 ? "s" : ""} queued for re-scan`,
        });
        setLocation(`/scans/${data.id}`);
      },
      onError: () => {
        toast({
          title: "Failed to start retry scan",
          variant: "destructive",
        });
      },
    });
  };

  const pageExtensions = useMemo(() => {
    const exts = new Set<string>();
    for (const page of scan?.pages ?? []) {
      try {
        const pathname = new URL(page.url).pathname;
        const last = pathname.split("/").pop() ?? "";
        const dot = last.lastIndexOf(".");
        if (dot > 0) exts.add(last.slice(dot).toLowerCase());
      } catch { /* ignore malformed URLs */ }
    }
    return Array.from(exts).sort();
  }, [scan?.pages]);

  const pageExtensionCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scan?.pages?.length ?? 0 };
    for (const page of scan?.pages ?? []) {
      try {
        const pathname = new URL(page.url).pathname;
        const last = pathname.split("/").pop() ?? "";
        const dot = last.lastIndexOf(".");
        if (dot > 0) {
          const ext = last.slice(dot).toLowerCase();
          counts[ext] = (counts[ext] ?? 0) + 1;
        }
      } catch {
        // Ignore malformed URLs, matching the extension option logic above.
      }
    }
    return counts;
  }, [scan?.pages]);

  const matchesPageFilter = useCallback(
    (p: { url: string; status: string; issueCount: number }) => {
      if (pageUrlFilter && !p.url.toLowerCase().includes(pageUrlFilter.toLowerCase())) return false;
      if (pageExtFilter !== "all") {
        try {
          const pathname = new URL(p.url).pathname;
          const last = pathname.split("/").pop() ?? "";
          const dot = last.lastIndexOf(".");
          const ext = dot > 0 ? last.slice(dot).toLowerCase() : "";
          if (ext !== pageExtFilter) return false;
        } catch { return false; }
      }
      if (pageStatusFilter === "all") return true;
      if (pageStatusFilter === "completed_with_issues") return p.status === "completed" && p.issueCount > 0;
      if (pageStatusFilter === "completed_no_issues") return p.status === "completed" && p.issueCount === 0;
      if (pageStatusFilter === "not_scanned") return !TERMINAL_PAGE_STATUSES.has(p.status) && p.status !== "completed";
      return p.status === pageStatusFilter;
    },
    [pageStatusFilter, pageUrlFilter, pageExtFilter],
  );

  const TERMINAL_PAGE_STATUSES = new Set(["completed", "failed", "not_available", "pending", "requeued"]);

  const pageStatusCounts = useMemo(() => {
    const pages = scan?.pages ?? [];
    return {
      all: pages.length,
      completed_with_issues: pages.filter(p => p.status === "completed" && (p.issueCount ?? 0) > 0).length,
      completed_no_issues: pages.filter(p => p.status === "completed" && (p.issueCount ?? 0) === 0).length,
      completed: pages.filter(p => p.status === "completed").length,
      failed: pages.filter(p => p.status === "failed").length,
      not_available: pages.filter(p => p.status === "not_available").length,
      pending: pages.filter(p => p.status === "pending").length,
      // Catch any pages stuck in a mid-flight status (running, navigating, scanning, etc.)
      // that survived a container restart and were never cleaned up by the backend.
      not_scanned: pages.filter(p => !TERMINAL_PAGE_STATUSES.has(p.status) && p.status !== "completed").length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan?.pages]);

  const copyUrls = async (pages: Array<{ url: string }>, emptyMessage: string) => {
    if (!pages.length) {
      toast({ title: emptyMessage });
      return;
    }
    await navigator.clipboard.writeText(pages.map((p) => p.url).join("\n"));
    toast({
      title: `Copied ${pages.length} URL${pages.length !== 1 ? "s" : ""}`,
    });
  };

  const handleCopyAllUrls = async () => {
    await copyUrls(scan?.pages ?? [], "No URLs are available to copy");
  };

  const handleCopyFilteredUrls = async () => {
    await copyUrls((scan?.pages ?? []).filter(matchesPageFilter), "No URLs match the current filters");
  };

  // Must be before any early return to satisfy Rules of Hooks.
  // Uses scan?.pages so it's safe when scan is still loading.
  const allIssues = useMemo(
    () =>
      scan?.pages?.flatMap((p: { issues?: Issue[] }) => p.issues || []) ?? [],
    [scan],
  );

  const ruleInfoMap = useMemo<Record<string, RuleInfo>>(() => {
    const map: Record<string, RuleInfo> = {};
    for (const issue of allIssues) {
      if (!map[issue.ruleId]) {
        map[issue.ruleId] = {
          description: issue.description,
          impact: issue.impact,
          wcagCriteria: issue.wcagCriteria ?? null,
          wcagLevel: issue.wcagLevel ?? null,
        };
      }
    }
    return map;
  }, [allIssues]);

  const selectedRules = useMemo<string[]>(() => {
    const opts = (scan?.options ?? {}) as Record<string, unknown>;
    return Array.isArray(opts.rules) ? (opts.rules as string[]) : [];
  }, [scan?.options]);

  const isCrawlerScan = useMemo(
    () => (scan?.options as Record<string, unknown>)?.source === "crawler",
    [scan?.options],
  );

  const isCrawlBoost = useMemo(
    () => !!(scan?.options as Record<string, unknown>)?.crawlBoost,
    [scan?.options],
  );

  // ── Update Results dialog state ──────────────────────────────────────────────
  const [urOpen, setUrOpen] = useState(false);
  const [urRuleId, setUrRuleId] = useState<string | null>(null);
  const [urRuleDesc, setUrRuleDesc] = useState<string>("");
  const [urSelectedPages, setUrSelectedPages] = useState<Set<number>>(new Set());
  const [urReason, setUrReason] = useState("");
  const [urSubmitting, setUrSubmitting] = useState(false);

  const handleOpenUpdateResults = useCallback(
    (ruleId: string, desc: string) => {
      if (!scan) return;
      const pagesWithRule = (scan.pages ?? []).filter((p: { issues?: Issue[]; id: number }) =>
        (p.issues ?? []).some((i: Issue) => i.ruleId === ruleId),
      );
      setUrRuleId(ruleId);
      setUrRuleDesc(desc);
      setUrSelectedPages(new Set(pagesWithRule.map((p: { id: number }) => p.id)));
      setUrReason("");
      setUrOpen(true);
    },
    [scan],
  );

  const handleUpdateResults = async () => {
    if (!urRuleId || urSelectedPages.size === 0) return;
    setUrSubmitting(true);
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    let successCount = 0;
    try {
      for (const pageId of urSelectedPages) {
        const page = (scan?.pages ?? []).find((p: { id: number }) => p.id === pageId);
        if (!page) continue;
        const firstIssue = ((page as { issues?: Issue[] }).issues ?? []).find(
          (i: Issue) => i.ruleId === urRuleId,
        );
        if (!firstIssue) continue;
        const res = await fetch(`${BASE}/api/decisions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issueId: firstIssue.id,
            scanId: scanId,
            scope: "page",
            reason: urReason.trim() || "Flagged via Update Results",
            decisionType: "false_positive",
          }),
        });
        if (res.ok) successCount++;
      }
      toast({
        title: "False positives applied",
        description: `Flagged ${urRuleId} as FP on ${successCount} page${successCount !== 1 ? "s" : ""}`,
      });
      setUrOpen(false);
      queryClient.invalidateQueries({ queryKey: getGetScanQueryKey(scanId) });
    } catch {
      toast({ title: "Error applying decisions", variant: "destructive" });
    } finally {
      setUrSubmitting(false);
    }
  };

  const estimatedMinutes = useMemo(() => {
    if (!scan) return 0;
    const remaining = Math.max(
      (scan.totalUrls ?? 0) - (scan.scannedUrls ?? 0),
      0,
    );
    return remaining * 1.5;
  }, [scan]);

  if (scanLoading || !scan) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white/85 px-8 py-7 text-center shadow-[0_5px_20px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/80">
          <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-foreground">Loading scan results</p>
            <p className="mt-1 text-xs text-muted-foreground">Fetching pages, issues, and scan details…</p>
          </div>
        </div>
      </div>
    );
  }

  const displayStatus = isUpdatingResults
    ? "updating"
    : liveStatus?.status || scan.status;
  const totalUrls = liveStatus?.totalUrls || scan.totalUrls;
  // Prefer counting completed pages directly from the live page list — it is
  // always in sync with the DONE counter shown in Live Progress.  Fall back to
  // the session-level scannedUrls counter only when page data isn't loaded yet.
  const scannedUrls = Math.min(
    liveStatus?.counts?.["completed"]
      ?? (liveStatus?.pages?.length
        ? liveStatus.pages.filter(p => p.status === "completed").length
        : (liveStatus?.scannedUrls || scan.scannedUrls || 0)),
    totalUrls || 0,
  );
  const progressPercent =
    totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;
  const hasLoadedResults = !!scan.pages?.length;
  const showUpdatingResults =
    isUpdatingResults || (scan.status === "completed" && !hasLoadedResults);
  const initiatorText = scan.initiatorName
    ? `Initiated by ${scan.initiatorName}${scan.initiatorRole ? ` · ${scan.initiatorRole}` : ""}`
    : null;

  return (
    <div className="min-h-full space-y-4 pb-4">
      {/* Loading Results Overlay — shown briefly after scan completes while page data loads */}
      {showUpdatingResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-10 py-8 shadow-xl">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Loading Results</p>
              <p className="text-sm text-muted-foreground mt-1">Fetching scan results, please wait…</p>
            </div>
          </div>
        </div>
      )}

      {/* Smart Analysis Dialog */}
      <Dialog open={smartOpen} onOpenChange={setSmartOpen}>
        <DialogContent className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 rounded-2xl p-0">
          <DialogHeader className="shrink-0 border-b bg-gradient-to-r from-primary/8 via-background/80 to-teal-500/8 px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pt-6">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 text-white shadow-lg shadow-violet-500/20">
                <Sparkles className="h-4 w-4" />
              </span>
              <span>Smart Analysis</span>
            </DialogTitle>
            <DialogDescription className="mt-1 max-w-3xl">
              Component-level breakdown of accessibility issues — grouped by AEM component or element type across all scanned pages.
            </DialogDescription>
          </DialogHeader>

          {smartLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">Analysing issues across all pages…</p>
            </div>
          )}

          {!smartLoading && smartError && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </span>
              <div>
                <p className="font-semibold">Smart Analysis is unavailable</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{smartError}</p>
              </div>
              <Button variant="outline" onClick={openSmartAnalysis}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </div>
          )}

          {!smartLoading && smartData && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Stats bar */}
              <div className="flex items-center gap-3 px-6 py-3 bg-muted/40 border-b shrink-0 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-violet-500" />
                  <span className="font-semibold">{smartData.totalIssues.toLocaleString()}</span>
                  <span className="text-muted-foreground">total issues</span>
                </div>
                <div className="text-muted-foreground">·</div>
                <div className="flex items-center gap-2 text-sm">
                  <Cpu className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">{smartData.totalComponents}</span>
                  <span className="text-muted-foreground">unique components / elements</span>
                </div>
                {filteredSmartComponents.length !== smartData.components.length && (
                  <>
                    <div className="text-muted-foreground">·</div>
                    <div className="text-sm text-muted-foreground">
                      Showing <span className="font-semibold text-foreground">{filteredSmartComponents.length}</span> filtered
                    </div>
                  </>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={exportSmartExcel}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/50 transition-colors"
                    title="Export to Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </button>
                  <button
                    onClick={exportSmartPDF}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/50 transition-colors"
                    title="Export to PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex shrink-0 flex-wrap gap-2 border-b bg-background/70 px-4 py-3 sm:px-6">
                <div className="relative min-w-full flex-1 sm:min-w-48">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={smartSearch}
                    onChange={e => setSmartSearch(e.target.value)}
                    placeholder="Filter by component name…"
                    className="pl-8 pr-3 py-1.5 text-sm w-full rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="relative min-w-full flex-1 sm:min-w-48">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={smartUrlFilter}
                    onChange={e => setSmartUrlFilter(e.target.value)}
                    placeholder="Filter by URL…"
                    className="pl-8 pr-3 py-1.5 text-sm w-full rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <Select value={smartImpact} onValueChange={setSmartImpact}>
                  <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter by impact">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All impacts</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="serious">Serious</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="minor">Minor</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={smartRule} onValueChange={setSmartRule}>
                  <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter by rule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rules</SelectItem>
                    {allSmartRules.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select
                  value={smartSort}
                  onValueChange={(value) =>
                    setSmartSort(value as typeof smartSort)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[170px]" aria-label="Sort Smart Analysis results">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="severity">Sort: Severity</SelectItem>
                    <SelectItem value="occurrences">Sort: Occurrences</SelectItem>
                    <SelectItem value="pages">Sort: Pages affected</SelectItem>
                    <SelectItem value="component">Sort: Component</SelectItem>
                  </SelectContent>
                </Select>
                {(smartSearch || smartUrlFilter || smartImpact !== "all" || smartRule !== "all") && (
                  <button
                    onClick={() => { setSmartSearch(""); setSmartUrlFilter(""); setSmartImpact("all"); setSmartRule("all"); }}
                    className="text-sm px-3 py-1.5 rounded-md border border-input hover:bg-muted flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {filteredSmartComponents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                    <Filter className="w-6 h-6" />
                    No components match your filters.
                  </div>
                ) : (
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="sticky top-0 z-10 bg-background border-b">
                      <tr>
                        <th className="text-left px-6 py-3 font-medium text-muted-foreground w-8"></th>
                        <th className="text-left px-3 py-3 font-medium text-muted-foreground">Component</th>
                        <th className="text-left px-3 py-3 font-medium text-muted-foreground">HTML Hierarchy</th>
                        <th className="text-left px-3 py-3 font-medium text-muted-foreground">Rules</th>
                        <th className="text-left px-3 py-3 font-medium text-muted-foreground">Worst Impact</th>
                        <th className="text-right px-3 py-3 font-medium text-muted-foreground">Occurrences</th>
                        <th className="text-right px-6 py-3 font-medium text-muted-foreground">Pages Affected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSmartComponents.map((comp, idx) => {
                        const rowKey = `${comp.componentName}::${comp.tag}`;
                        const isExpanded = smartExpanded.has(rowKey);
                        const impactColors: Record<string, string> = {
                          critical: "bg-[#E11D48] text-white",
                          serious: "bg-[#EA580C] text-white",
                          moderate: "bg-[#EAB308] text-black",
                          minor: "bg-[#3B82F6] text-white",
                        };
                        const barWidth = smartData.components[0]?.totalOccurrences
                          ? Math.round((comp.totalOccurrences / smartData.components[0].totalOccurrences) * 100)
                          : 0;

                        // Render hierarchy as breadcrumb chips
                        const hierParts = (comp.hierarchy ?? comp.componentName).split(" > ");

                        return (
                          <Fragment key={rowKey}>
                            <tr
                              key={rowKey}
                              className={`border-b hover:bg-muted/30 cursor-pointer ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                              onClick={() => toggleSmartExpanded(rowKey)}
                            >
                              <td className="px-6 py-3 text-muted-foreground">
                                <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              </td>
                              <td className="px-3 py-3 max-w-[180px]">
                                {(() => {
                                  const cname = extractComponentName(comp.hierarchy ?? comp.componentName);
                                  return cname ? (
                                    <span className="inline-block px-2 py-0.5 rounded text-xs font-mono border bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-300 truncate max-w-full" title={cname}>
                                      {cname}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-3 max-w-sm">
                                <div className="flex items-center flex-wrap gap-0.5">
                                  {hierParts.map((part, i) => (
                                    <span key={i} className="flex items-center gap-0.5">
                                      {i > 0 && <span className="text-muted-foreground/50 text-xs mx-0.5">›</span>}
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono border ${
                                        i === hierParts.length - 1
                                          ? "bg-violet-50 border-violet-200 text-violet-800 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-300 font-semibold"
                                          : "bg-muted border-border text-muted-foreground"
                                      }`}>
                                        {part}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {comp.ruleIds.slice(0, 3).map(r => (
                                    <span key={r} className="inline-block px-1.5 py-0.5 rounded text-xs bg-muted font-mono border">{r}</span>
                                  ))}
                                  {comp.ruleIds.length > 3 && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-muted font-mono border text-muted-foreground">+{comp.ruleIds.length - 3}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${impactColors[comp.worstImpact] ?? "bg-muted"}`}>
                                  {comp.worstImpact.charAt(0).toUpperCase() + comp.worstImpact.slice(1)}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 bg-muted rounded-full h-1.5 hidden sm:block">
                                    <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${barWidth}%` }} />
                                  </div>
                                  <span className="font-semibold tabular-nums">{comp.totalOccurrences.toLocaleString()}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">
                                {comp.affectedPageCount.toLocaleString()}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${comp.componentName}-expanded`} className="border-b bg-muted/20">
                                <td colSpan={8} className="px-10 py-4">
                                  <div className="space-y-3">
                                    {/* AI Insights */}
                                    {smartAnalysisAiEnabled && authUser?.permissions?.canSmartAnalysis && (() => {
                                      const rk = `${comp.componentName}::${comp.tag}`;
                                      const insight = aiInsights.get(rk);
                                      const loading = aiInsightsLoading.has(rk);
                                      const error = aiInsightsError.get(rk);
                                      const priorityColor: Record<string, string> = { high: "text-red-600 dark:text-red-400", medium: "text-amber-600 dark:text-amber-500", low: "text-green-600 dark:text-green-500" };
                                      return (
                                        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 p-3">
                                          <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                                              <Sparkles className="w-3.5 h-3.5" />
                                              AI Insights
                                            </p>
                                            {!insight && (
                                              <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() => getAiInsights(comp, rk)}
                                                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
                                              >
                                                {loading ? (
                                                  <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Analyzing…</>
                                                ) : (
                                                  <><Sparkles className="w-3 h-3" />Get AI Insights</>
                                                )}
                                              </button>
                                            )}
                                            {insight && (
                                              <button
                                                type="button"
                                                onClick={() => getAiInsights(comp, rk)}
                                                disabled={loading}
                                                className="text-xs text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
                                              >
                                                {loading ? "Refreshing…" : "Refresh"}
                                              </button>
                                            )}
                                          </div>
                                          {error && !loading && (
                                            <p className="text-xs text-destructive">{error}</p>
                                          )}
                                          {!insight && !loading && !error && (
                                            <p className="text-xs text-muted-foreground">Click &ldquo;Get AI Insights&rdquo; to analyze this component&apos;s accessibility pattern.</p>
                                          )}
                                          {insight && (
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-1">
                                              <div>
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Component Type</p>
                                                <p className="text-xs text-foreground mt-0.5">{insight.componentType}</p>
                                              </div>
                                              <div>
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Priority</p>
                                                <p className={`text-xs font-semibold mt-0.5 ${priorityColor[insight.priority] ?? ""}`}>
                                                  {insight.priority.charAt(0).toUpperCase() + insight.priority.slice(1)}
                                                  {" · "}
                                                  <span className="text-muted-foreground font-normal">{insight.priorityReason}</span>
                                                </p>
                                              </div>
                                              <div className="col-span-2">
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Issue Summary</p>
                                                <p className="text-xs text-foreground mt-0.5">{insight.issueSummary}</p>
                                              </div>
                                              <div>
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Root Cause</p>
                                                <p className="text-xs text-foreground mt-0.5">{insight.rootCause}</p>
                                              </div>
                                              <div>
                                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fix Strategy</p>
                                                <p className="text-xs text-foreground mt-0.5">{insight.fixStrategy}</p>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    {smartData?.ruleTotals && comp.ruleIds.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Count Scope</p>
                                        <p className="text-xs text-muted-foreground mb-1.5">
                                          This component accounts for {comp.totalOccurrences.toLocaleString()} of the occurrences below. Scan-wide totals per rule (all components, excluding false positives):
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {comp.ruleIds.map(r => (
                                            <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-background border font-mono">
                                              {r}
                                              <span className="text-muted-foreground font-sans">· {smartData.ruleTotals?.[r]?.toLocaleString() ?? "?"} total in scan</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {(comp.sampleDescriptions?.length ?? 0) > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Sample Issue Descriptions</p>
                                        <ul className="space-y-1">
                                          {comp.sampleDescriptions!.map((d, i) => (
                                            <li key={i} className="text-xs text-foreground bg-background rounded px-3 py-2 border">
                                              {d}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                                        Top Affected Pages ({comp.topPages.length}{comp.affectedPageCount > comp.topPages.length ? ` of ${comp.affectedPageCount}` : ""})
                                      </p>
                                      <ul className="space-y-1">
                                        {comp.topPages.map((url, i) => (
                                          <li key={i} className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => openCodeView(comp, url)}
                                              className="text-xs font-mono break-all text-left text-violet-600 dark:text-violet-400 hover:underline flex-1"
                                            >
                                              {url}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openCodeView(comp, url)}
                                              title="View code"
                                              className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                              <Code className="w-3.5 h-3.5" />
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add URLs to running scan dialog */}
      <Dialog open={addUrlsOpen} onOpenChange={(o) => { setAddUrlsOpen(o); if (!o) setAddUrlsText(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-600" />
              Add URLs to Scan
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter one URL per line (or comma-separated). Duplicate URLs already in the scan will be skipped automatically.
            </p>
            <Textarea
              className="font-mono text-xs min-h-[180px] resize-y"
              placeholder={"https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/page-3"}
              value={addUrlsText}
              onChange={(e) => setAddUrlsText(e.target.value)}
              disabled={addUrlsMutation.isPending}
            />
            {addUrlsText.trim() && (() => {
              const count = addUrlsText.split(/[\n,]+/).map(u => u.trim()).filter(Boolean).length;
              return (
                <p className="text-xs text-muted-foreground">{count} URL{count !== 1 ? "s" : ""} entered</p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUrlsOpen(false)} disabled={addUrlsMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUrlsSubmit}
              disabled={!addUrlsText.trim() || addUrlsMutation.isPending}
            >
              {addUrlsMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding…</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" />Add to Scan</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Code View Dialog */}
      <Dialog open={codeViewOpen} onOpenChange={setCodeViewOpen}>
        <DialogContent className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 p-0 sm:h-[88dvh] sm:w-[94vw]">
          <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 pr-14 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Code className="w-4 h-4 text-violet-500" />
              Code View — {codeViewComponentName}
            </DialogTitle>
            <DialogDescription className="mt-0.5 break-all font-mono text-xs">{codeViewUrl}</DialogDescription>
          </DialogHeader>
          {codeViewLoading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">Loading occurrences…</p>
            </div>
          )}
          {!codeViewLoading && codeViewError && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </span>
              <div>
                <p className="font-semibold">Code View is unavailable</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{codeViewError}</p>
              </div>
              {codeViewComponent && (
                <Button
                  variant="outline"
                  onClick={() => openCodeView(codeViewComponent, codeViewUrl)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try again
                </Button>
              )}
            </div>
          )}
          {!codeViewLoading && !codeViewError && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
              {/* Left pane — occurrence list */}
              <div className="flex h-[42%] w-full shrink-0 flex-col overflow-y-auto border-b md:h-auto md:w-80 md:border-b-0 md:border-r">
                <div className="px-4 py-2.5 border-b bg-muted/30 shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {codeViewOccurrences.length > 99 ? "99+" : codeViewOccurrences.length} occurrence{codeViewOccurrences.length !== 1 ? "s" : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 normal-case tracking-normal">
                    For this component on this page only — scan-wide rule totals are shown in Smart Analysis
                  </p>
                </div>
                {codeViewOccurrences.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 py-10 text-muted-foreground text-xs gap-2">
                    <Info className="w-4 h-4" />
                    No occurrences found on this page
                  </div>
                ) : (
                  <ul className="divide-y flex-1 overflow-y-auto">
                    {codeViewOccurrences.map((occ, i) => {
                      const isSelected = i === codeViewSelectedIdx;
                      const isExpOcc = codeViewExpandedOccs.has(i);
                      return (
                        <li key={occ.id} className={`transition-colors ${isSelected ? "bg-violet-50 dark:bg-violet-950/20 border-l-2 border-l-violet-500" : "border-l-2 border-l-transparent"}`}>
                          <div
                            onClick={() => setCodeViewSelectedIdx(i)}
                            className="px-4 pt-3 pb-2 cursor-pointer hover:bg-muted/40"
                          >
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded border">{occ.ruleId}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                occ.impact === "critical" ? "bg-[#E11D48] text-white" :
                                occ.impact === "serious" ? "bg-[#EA580C] text-white" :
                                occ.impact === "moderate" ? "bg-[#EAB308] text-black" :
                                "bg-[#3B82F6] text-white"
                              }`}>{occ.impact}</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-3">{occ.description || occ.selector}</p>
                          </div>
                          {occ.selector && (
                            <div className="px-4 pb-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleOccExpanded(i); }}
                                className="flex items-center gap-1 text-xs text-violet-600 hover:underline"
                              >
                                <ChevronRight className={`w-3 h-3 transition-transform ${isExpOcc ? "rotate-90" : ""}`} />
                                Hierarchy
                              </button>
                              {isExpOcc && (
                                <div className="mt-2 pl-2 border-l-2 border-violet-200">
                                  <SelectorHierarchy selector={occ.selector} />
                                </div>
                              )}
                            </div>
                          )}
                          {isSelected && (
                            <div className="px-3 pb-3">
                              <FixSuggestionPanel
                                ruleId={occ.ruleId}
                                description={occ.description}
                                element={occ.element}
                                elementContext={occ.elementContext ?? null}
                                selector={occ.selector}
                                pageUrl={codeViewUrl}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {/* Right pane — HTML tree or Live Preview */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {codeViewOccurrences.length > 0 && codeViewOccurrences[codeViewSelectedIdx] ? (
                  <>
                    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b bg-gray-50 px-3 py-1.5">
                      {/* Prev/First nav */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setCodeViewSelectedIdx(0)}
                          disabled={codeViewSelectedIdx === 0}
                          title="First occurrence"
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        <button
                          onClick={() => setCodeViewSelectedIdx(i => Math.max(0, i - 1))}
                          disabled={codeViewSelectedIdx === 0}
                          className="h-6 px-1.5 flex items-center gap-1 text-xs rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                        >
                          <ChevronLeft className="w-3 h-3" /> Prev
                        </button>
                      </div>
                      {/* Counter */}
                      <span className="text-xs text-gray-500 font-mono tabular-nums flex-1 truncate">
                        {codeViewSelectedIdx + 1} / {codeViewOccurrences.length > 99 ? "99+" : codeViewOccurrences.length}
                        {" · "}{codeViewOccurrences[codeViewSelectedIdx].ruleId}
                        {codeViewMode === "html" && !codeViewPageHtml && <span className="text-gray-400 italic ml-2">· no stored HTML</span>}
                      </span>
                      {/* View mode toggle */}
                      <div className="flex shrink-0 rounded overflow-hidden border border-gray-200 text-xs">
                        <button
                          onClick={() => setCodeViewMode("html")}
                          title="HTML tree view"
                          className={`flex items-center gap-1 px-2 py-0.5 transition-colors ${codeViewMode === "html" ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                        >
                          <Code className="w-3 h-3" /> HTML
                        </button>
                        <button
                          onClick={() => setCodeViewMode("live")}
                          title="Live page preview"
                          className={`flex items-center gap-1 px-2 py-0.5 border-l border-gray-200 transition-colors ${codeViewMode === "live" ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                        >
                          <Monitor className="w-3 h-3" /> Live
                        </button>
                      </div>
                      {/* Next/Last nav */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setCodeViewSelectedIdx(i => Math.min(codeViewOccurrences.length - 1, i + 1))}
                          disabled={codeViewSelectedIdx >= codeViewOccurrences.length - 1}
                          className="h-6 px-1.5 flex items-center gap-1 text-xs rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                        >
                          Next <ChevronRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setCodeViewSelectedIdx(codeViewOccurrences.length - 1)}
                          disabled={codeViewSelectedIdx >= codeViewOccurrences.length - 1}
                          title="Last occurrence"
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronsRight className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                      </div>
                    </div>
                    {codeViewMode === "live" ? (
                      <LivePreviewFrame
                        url={codeViewUrl}
                        pageId={codeViewPageId}
                        selector={codeViewOccurrences[codeViewSelectedIdx].selector}
                        bboxX={codeViewOccurrences[codeViewSelectedIdx].bboxX}
                        bboxY={codeViewOccurrences[codeViewSelectedIdx].bboxY}
                        bboxWidth={codeViewOccurrences[codeViewSelectedIdx].bboxWidth}
                        bboxHeight={codeViewOccurrences[codeViewSelectedIdx].bboxHeight}
                      />
                    ) : (
                      <InteractiveHtmlTree
                        pageHtml={codeViewPageHtml}
                        elementHtml={codeViewOccurrences[codeViewSelectedIdx].element}
                        elementContext={codeViewOccurrences[codeViewSelectedIdx].elementContext}
                        selector={codeViewOccurrences[codeViewSelectedIdx].selector}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-gray-400 text-sm gap-2 bg-white">
                    <Code className="w-6 h-6" />
                    <p>Select an occurrence to view its HTML</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Scan Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Scan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="detail-edit-name">Scan Title</Label>
              <Input
                id="detail-edit-name"
                value={editName}
                onChange={(e) => {
                  const value = e.target.value;
                  setEditName(value);
                  setEditNameError(isUrlLikeScanName(value) ? SCAN_NAME_URL_ERROR : null);
                }}
                placeholder="Enter scan title"
                aria-invalid={Boolean(editNameError)}
                aria-describedby={
                  editNameError ? "detail-edit-name-error" : undefined
                }
              />
              {editNameError && (
                <FieldMessage id="detail-edit-name-error" tone="error">
                  {editNameError}
                </FieldMessage>
              )}
            </div>

            {isSuperAdmin ? (
              <>
                <div className="space-y-1.5">
                  <Label>Scan Initiator</Label>
                  {editAllUsers.length > 0 ? (
                    <Select value={editInitiatorName} onValueChange={(fullName) => {
                      setEditInitiatorName(fullName);
                      const selected = editAllUsers.find(u => u.fullName === fullName);
                      if (selected && selected.groups.length > 0) {
                        setEditInitiatorRole(selected.groups[0].name);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select user…" />
                      </SelectTrigger>
                      <SelectContent>
                        {editAllUsers.map(u => (
                          <SelectItem key={u.id} value={u.fullName}>
                            {u.fullName}{" "}
                            <span className="text-muted-foreground text-xs">({u.username})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={editInitiatorName}
                      onChange={(e) => setEditInitiatorName(e.target.value)}
                      placeholder="e.g. Jane Smith"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Initiator Role</Label>
                  <Input
                    value={editInitiatorRole}
                    readOnly
                    className="bg-muted cursor-not-allowed"
                    placeholder="Auto-filled from user's group"
                  />
                </div>
              </>
            ) : (
              (scan?.initiatorName || scan?.initiatorRole) && (
                <div className="rounded-md bg-muted/50 border px-3 py-2.5 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Scan metadata (read-only)</p>
                  {scan?.initiatorName && (
                    <p className="text-sm">Initiator: <span className="font-medium">{scan.initiatorName}</span></p>
                  )}
                  {scan?.initiatorRole && (
                    <p className="text-sm">Role: <span className="font-medium">{scan.initiatorRole}</span></p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Only a super administrator can change these fields.</p>
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateScanMutation.isPending || isUrlLikeScanName(editName)}
            >
              {updateScanMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* False positive dialog */}
      {fpDialogIssue && (() => {
        const override = fpOverrides[fpDialogIssue.id];
        const isFlagged = override !== undefined ? override.falsePositive : (fpDialogIssue.falsePositive ?? false);
        return (
          <Dialog open={true} onOpenChange={(v) => { if (!v) setFpDialogIssue(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Flag className={`w-4 h-4 ${isFlagged ? "text-amber-500 fill-amber-400" : "text-muted-foreground"}`} />
                  {isFlagged ? "Manage false positive flag" : "Flag as false positive"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <p className="text-sm text-muted-foreground">
                  {isFlagged
                    ? "This occurrence is flagged as a false positive and hidden from default view."
                    : "Mark this occurrence as a false positive to exclude it from issue counts and hide it by default."}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="fp-note" className="text-xs font-medium">
                    Note <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Textarea
                    id="fp-note"
                    placeholder="Why is this a false positive?"
                    value={fpNote}
                    onChange={(e) => setFpNote(e.target.value)}
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setFpDialogIssue(null)}>Cancel</Button>
                {isFlagged && (
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleRemoveFlagConfirm}>
                    Remove flag
                  </Button>
                )}
                <Button
                  variant={isFlagged ? "default" : "default"}
                  className={isFlagged ? "" : "bg-amber-500 hover:bg-amber-600 text-white border-transparent"}
                  onClick={handleFlagConfirm}
                >
                  <Flag className="w-3.5 h-3.5 mr-1.5" />
                  {isFlagged ? "Update note" : "Flag as false positive"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <section className="px-0 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-lg border-[#e0e4ef] bg-white/80 px-3 text-xs font-medium text-[#667] shadow-none hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              onClick={() => setLocation(isCrawlerScan ? "/crawler" : "/scans")}
            >
              <ChevronLeft className="mr-1 h-3 w-3" />
              Back to {isCrawlerScan ? "Crawler History" : "Scan History"}
            </Button>
            <h1
              className="min-w-0 max-w-[min(52vw,760px)] flex-1 truncate whitespace-nowrap text-[19px] font-bold tracking-[-0.02em] text-[#172b4d] dark:text-slate-100"
              title={scan.name || `Scan #${scan.id}`}
            >
              {scan.name || `Scan #${scan.id}`}
            </h1>
            <span className="shrink-0 [&>span]:rounded-full [&>span]:bg-[#e3f0fb] [&>span]:px-3 [&>span]:py-1 [&>span]:text-xs [&>span]:font-bold [&>span]:text-[#1565c0]">
              {getStatusBadge(displayStatus)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-[#7b8aaa] hover:bg-white hover:text-[#172b4d] dark:hover:bg-slate-800"
              title="Edit scan details"
              onClick={openEditDialog}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {isCrawlBoost && (
              <Badge variant="outline" className="gap-1.5 text-xs border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Zap className="w-3 h-3" />
                Crawl Boost
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-normal text-[#7b8aaa] dark:text-slate-400">
            {(scan as { projectName?: string | null }).projectName && (
              <span>Project <span className="font-semibold text-violet-700 dark:text-violet-300">{(scan as { projectName: string }).projectName}</span></span>
            )}
            <span className="font-mono">Scan #{scan.id}</span>
            <span>Created {new Date(scan.createdAt).toLocaleString()}</span>
            {initiatorText && <span>{initiatorText}</span>}
            {elapsedText && <span>{isRunning || isPaused ? "Elapsed" : "Time taken"} {elapsedText}</span>}
          </div>
          <RulesBadges options={scan.options} />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {scan.status === "running" ||
            scan.status === "pending" ||
            scan.status === "paused" ? (
              <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                {formatEta(estimatedMinutes)}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 [&_button]:h-9 [&_button]:rounded-[9px] [&_button]:px-3.5 [&_button]:text-[13px] [&_button_svg]:h-3.5 [&_button_svg]:w-3.5">
          {isActive && (
            <Button
              variant="outline"
              onClick={() => setAddUrlsOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add URLs
            </Button>
          )}
          {isRunning && (
            <Button
              variant="outline"
              onClick={() => pauseScanMutation.mutate()}
              disabled={pauseScanMutation.isPending}
            >
              {pauseScanMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Pause className="w-4 h-4 mr-2" />
              )}
              Pause
            </Button>
          )}
          {isPaused && (
            <Button
              variant="outline"
              onClick={() => resumeScanMutation.mutate()}
              disabled={resumeScanMutation.isPending}
            >
              {resumeScanMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Resume
            </Button>
          )}
          {isActive && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleCancel}
              disabled={cancelScan.isPending}
            >
              {cancelScan.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <StopCircle className="w-4 h-4 mr-2" />
              )}
              Cancel
            </Button>
          )}
          {canRetry && (
            <div className="relative">
              {isAutoRetrying && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 z-10">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
              )}
              <Button
                variant="outline"
                onClick={handleRetry}
                disabled={retryClone.isPending}
              >
                {retryClone.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw
                    className={`w-4 h-4 mr-2 ${isAutoRetrying ? "text-amber-500" : ""}`}
                  />
                )}
                Retry Scan
              </Button>
            </div>
          )}
          {!isActive && !isUpdatingResults && (
            <>
              {scan.status === "completed" && authUser?.permissions?.canSmartAnalysis && (
                  <Button variant="outline" className="border-[#6d48c7] bg-[#6d48c7]/[0.06] font-semibold text-[#6d48c7] hover:bg-[#6d48c7]/[0.12]" onClick={openSmartAnalysis} data-testid="smart-analysis-btn">
                    <Sparkles className="w-4 h-4 mr-2 text-violet-500" />
                    Smart Analysis
                  </Button>
              )}
              <ExportButtons scan={scan} compact />
              {scan.status === "completed" && (
                <Link href={`/scans/${scan.id}/report`}>
                  <Button>
                    <BarChart2 className="w-4 h-4 mr-2" />
                    View Report
                  </Button>
                </Link>
              )}
            </>
          )}
        </div>
        </div>
      </section>

      {/* Progress card — only shown while scan is active */}
      {isActive && (
        <Card className="overflow-hidden rounded-2xl border-violet-200/80 bg-white/85 shadow-[0_5px_20px_rgba(15,23,42,0.05)] dark:border-violet-900/60 dark:bg-slate-950/80">
          <CardHeader className="border-b border-violet-100 bg-violet-50/45 pb-4 dark:border-violet-950 dark:bg-violet-950/20">
            <CardTitle className="text-base">Scan Progress</CardTitle>
            {liveStatus?.currentUrl && (
              <CardDescription
                className="min-w-0 max-w-full font-mono break-words [overflow-wrap:anywhere]"
                title={liveStatus.currentUrl}
              >
                Currently scanning: {liveStatus.currentUrl}
              </CardDescription>
            )}
            {showUpdatingResults && (
              <CardDescription className="text-amber-600">
                Updating results, please wait...
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex justify-between text-sm font-medium">
              <span>
                {scannedUrls} of {totalUrls} URLs scanned
              </span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </CardContent>
        </Card>
      )}

      {showUpdatingResults && (
        <div className="flex items-center gap-2 text-sm text-amber-600 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Updating results, please wait...
        </div>
      )}

      {/* Main view tab bar — shown for completed/cancelled/failed scans */}
      {!showUpdatingResults && !isActive && (
        <div className="flex items-center gap-0 border-b-2 border-[#e8edf5] dark:border-slate-800">
          <button
            onClick={() => setMainView("accessibility")}
            className={`flex items-center gap-2 border-b-[2.5px] px-5 py-2.5 text-[13px] font-semibold transition-colors ${
              mainView === "accessibility"
                ? "border-[#6d48c7] text-[#6d48c7] dark:text-violet-300"
                : "border-transparent text-[#7b8aaa] hover:text-[#172b4d]"
            }`}
          >
            <Globe className="w-4 h-4" />
            Accessibility Results
          </button>
          <button
            onClick={() => setMainView("qa")}
            className={`flex items-center gap-2 border-b-[2.5px] px-5 py-2.5 text-[13px] font-medium transition-colors ${
              mainView === "qa"
                ? "border-[#6d48c7] text-[#6d48c7] dark:text-violet-300"
                : "border-transparent text-[#7b8aaa] hover:text-[#172b4d]"
            }`}
          >
            <Shield className="w-4 h-4" />
            Quality Assurance
          </button>
        </div>
      )}

      {/* QA tab — shown when mainView is "qa" */}
      {!showUpdatingResults && !isActive && mainView === "qa" && (
        <ScanQATab scanId={scan.id} />
      )}

      {/* Completed page results */}
      {!showUpdatingResults &&
        !isActive &&
        mainView === "accessibility" &&
        scan.pages &&
        scan.pages.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-[#172b4d]">
                  Page Results
                </h2>
                <span className="text-[13px] text-[#7b8aaa]">
                  {scannedUrls.toLocaleString()}/{totalUrls.toLocaleString()} URLs scanned · {progressPercent}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-[#e0e4ef] bg-white/85 px-3 text-xs font-medium text-[#667] shadow-none hover:bg-white dark:border-slate-800 dark:bg-slate-950"
                  onClick={handleCopyAllUrls}
                  disabled={scan.pages.length === 0}
                >
                  Copy all URLs
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-[#e0e4ef] bg-white/85 px-3 text-xs font-medium text-[#667] shadow-none hover:bg-white dark:border-slate-800 dark:bg-slate-950"
                  onClick={handleCopyFilteredUrls}
                  disabled={scan.pages.filter(matchesPageFilter).length === 0}
                >
                  Copy filtered URLs
                </Button>
              </div>
            </div>

            {/* Compact status filters */}
            {(() => {
              type TileDef = { value: string; label: string; count: number };
              const tiles: TileDef[] = [
                { value: "all",                    label: "All Pages",    count: pageStatusCounts.all },
                { value: "completed_with_issues",  label: "With Issues",  count: pageStatusCounts.completed_with_issues },
                { value: "completed_no_issues",    label: "No Issues",    count: pageStatusCounts.completed_no_issues },
                { value: "failed",                 label: "Failed",       count: pageStatusCounts.failed },
                { value: "not_available",          label: "Not Available",count: pageStatusCounts.not_available },
                { value: "pending",                label: "Pending",      count: pageStatusCounts.pending },
                { value: "not_scanned",            label: "Not Scanned",  count: pageStatusCounts.not_scanned },
              ].filter(t => t.value === "all" || t.count > 0);
              return (
                <div className="flex flex-wrap items-center gap-2">
                  {tiles.map(({ value, label, count }) => {
                    const isActive = pageStatusFilter === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPageStatusFilter(value)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border-[1.5px] px-3 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d48c7] ${
                          isActive
                            ? "border-[#6d48c7] bg-[#6d48c7] text-white"
                            : "border-[#e0e4ef] bg-white/85 text-[#667] hover:border-[#6d48c7]/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                        }`}
                      >
                        <span>{label}</span>
                        <span className={`inline-flex min-w-4 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
                          isActive ? "bg-white/25 text-white" : "bg-[#f0f2f8] text-[#9eadca] dark:bg-slate-800 dark:text-slate-300"
                        }`}>{count.toLocaleString()}</span>
                      </button>
                    );
                  })}
                  {/* File extension filter */}
                  {pageExtensions.length > 0 && (
                    <div className="shrink-0">
                      <Select value={pageExtFilter} onValueChange={setPageExtFilter}>
                        <SelectTrigger className="h-8 w-[92px] rounded-lg border-[#e0e4ef] bg-white/85 text-xs text-[#172b4d] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
                          <SelectValue placeholder="Extension" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          {pageExtensions.map((ext) => (
                            <SelectItem key={ext} value={ext}>{ext}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* URL text filter — right side of the same row */}
                    <div className="relative ml-auto w-full min-w-[180px] shrink-0 sm:w-52">
                      <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9eadca]" />
                    <Input
                      placeholder="Filter URLs…"
                      value={pageUrlFilter}
                      onChange={(e) => setPageUrlFilter(e.target.value)}
                      className="h-9 rounded-[9px] border-[#e0e4ef] bg-white/85 pl-7 text-xs text-[#172b4d] shadow-none placeholder:text-[#9eadca] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                    {pageUrlFilter && (
                      <button
                        type="button"
                        onClick={() => setPageUrlFilter("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            <Accordion type="multiple" className="space-y-2">
              {scan.pages.filter(matchesPageFilter).map((page) => {
                const pageIssues = (page.issues || []).map((issue: Issue) => {
                  const override = fpOverrides[issue.id];
                  return override !== undefined ? { ...issue, ...override } : issue;
                });
                const filteredPageIssues = pageIssues.filter((issue) => issueMatchesFilters(issue, filters));
                const zeroOccurrenceRuleCount = getZeroRuleIds(pageIssues, filters, selectedRules).length;
                const categoryIssues = {
                  issues: pageIssues.filter((issue) => !issue.ruleType || issue.ruleType === "Issue"),
                  potentialIssues: pageIssues.filter((issue) => issue.ruleType === "Potential Issue"),
                  bestPractices: pageIssues.filter((issue) => issue.ruleType === "Best Practice"),
                  waiAria: pageIssues.filter((issue) => issue.ruleType === "WAI-ARIA"),
                };
                const categoryTabs = [
                  { value: "issues", label: "Issues", issues: categoryIssues.issues },
                  { value: "potential-issues", label: "Potential Issues", issues: categoryIssues.potentialIssues },
                  { value: "best-practices", label: "Best Practices", issues: categoryIssues.bestPractices },
                  { value: "wai-aria", label: "WAI-ARIA", issues: categoryIssues.waiAria },
                ]
                  .filter((category) => category.issues.length > 0)
                  .map((category) => ({
                    ...category,
                    ruleCount: new Set(category.issues.filter((issue) => issueMatchesFilters(issue, filters)).map((issue) => issue.ruleId)).size,
                  }));
                const firstTabValue = categoryTabs[0]?.value ?? (selectedRules.length >= 2 ? "no-occurrences" : "issues");
                return (
                  <AccordionItem
                    key={page.id}
                    value={`page-${page.id}`}
                    className="overflow-hidden rounded-[14px] border-[1.5px] border-transparent bg-white/80 shadow-[0_2px_8px_rgba(15,23,42,0.05)] data-[state=open]:border-[#6d48c7]/20 dark:border-slate-800 dark:bg-slate-950 dark:data-[state=open]:border-violet-900"
                  >
                    <div className="flex items-center [&>h3]:min-w-0 [&>h3]:flex-1 [&>h3]:overflow-hidden">
                    <AccordionTrigger className="min-w-0 flex-1 overflow-hidden px-4 py-2.5 hover:bg-[rgba(109,72,199,0.025)] hover:no-underline data-[state=open]:bg-[rgba(109,72,199,0.025)] dark:hover:bg-violet-950/20 dark:data-[state=open]:bg-violet-950/20">
                      <div className="flex w-full min-w-0 flex-col items-start gap-2 pr-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex w-full min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                          {page.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          ) : page.status === "failed" ? (
                            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                          ) : page.status === "not_available" ? (
                            <Ban className="h-4 w-4 shrink-0 text-slate-400" />
                          ) : page.status === "requeued" ? (
                            <RotateCcw className="h-4 w-4 shrink-0 text-indigo-500" />
                          ) : page.status === "pending" ? (
                            <Clock className="h-4 w-4 shrink-0 text-yellow-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
                          )}
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <span className="block min-w-0 line-clamp-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-[#172b4d] dark:text-slate-200" title={page.url}>
                              {page.url}
                            </span>
                          </div>
                        </div>
                        <div className="flex max-w-full flex-wrap items-center gap-2 shrink-0 text-[11px] sm:flex-nowrap sm:gap-3">
                          {page.status === "failed" && (
                            <Badge variant="destructive" className="h-5 rounded-full px-2 text-[10px]">
                              Failed
                            </Badge>
                          )}
                          {page.status === "requeued" && (
                            <Badge variant="outline" className="h-5 rounded-full border-indigo-200 bg-indigo-50 px-2 text-[10px] text-indigo-600">
                              Requeued
                            </Badge>
                          )}
                          {page.status === "not_available" && !page.wafToken && (
                            <Badge variant="outline" className="h-5 rounded-full border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-500">
                              Not Available
                            </Badge>
                          )}
                          {page.status === "not_available" && page.wafToken && (
                            <Badge variant="outline" className="h-5 rounded-full border-amber-200 bg-amber-50 px-2 text-[10px] text-amber-700">
                              Browser scan available
                            </Badge>
                          )}
                          {!["completed","failed","not_available","pending","requeued"].includes(page.status) && (
                            <Badge variant="outline" className="h-5 rounded-full border-orange-200 bg-orange-50 px-2 text-[10px] text-orange-600" title={`Interrupted mid-scan (status: ${page.status})`}>
                              Not Scanned
                            </Badge>
                          )}
                          {(page.loadDurationMs != null || page.scanDurationMs != null) && (
                            <div className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-[#9eadca] dark:text-slate-500">
                              {page.loadDurationMs != null && (
                                <span title="Page load time (DOMContentLoaded)">
                                  Load {page.loadDurationMs >= 1000
                                    ? `${(page.loadDurationMs / 1000).toFixed(1)}s`
                                    : `${page.loadDurationMs}ms`}
                                </span>
                              )}
                              {page.loadDurationMs != null && page.scanDurationMs != null && (
                                <span className="text-slate-300">·</span>
                              )}
                              {page.scanDurationMs != null && (
                                <span title="Total scan time (load + scan delay + rule checks)">
                                  Scan {page.scanDurationMs >= 1000
                                    ? `${(page.scanDurationMs / 1000).toFixed(1)}s`
                                    : `${page.scanDurationMs}ms`}
                                </span>
                              )}
                            </div>
                          )}
                          {page.issueCount > 0 && (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-[13px] font-extrabold text-[#e84a3d]">
                                {page.issueCount} issue{page.issueCount !== 1 ? "s" : ""}
                              </span>
                              {page.criticalCount > 0 && (
                                <Badge
                                  variant="default"
                                  className="h-5 rounded-full bg-[#fdecea] px-2 text-[11px] font-bold text-[#d32f2f] hover:bg-[#fdecea]"
                                >
                                  {page.criticalCount} critical
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <div className="flex shrink-0 self-stretch items-center gap-1 border-l border-[#f0f2f8] px-1.5 sm:px-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                         className="h-8 w-8 rounded-md text-muted-foreground hover:bg-slate-100 hover:text-violet-700 dark:hover:bg-slate-800 dark:hover:text-violet-300"
                        onClick={async () => {
                          await navigator.clipboard.writeText(page.url);
                          toast({ title: "URL copied" });
                        }}
                        aria-label={`Copy URL ${page.url}`}
                        title="Copy URL"
                      >
                          <Copy className="h-3 w-3" />
                      </Button>
                      {page.status === "not_available" && page.wafToken && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-md border-amber-300 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                          onClick={() => {
                            const hash = [
                              `_ampera_sid=${scan.id}`,
                              `_ampera_pid=${page.id}`,
                              `_ampera_srv=${encodeURIComponent(window.location.origin)}`,
                              `_ampera_tok=${page.wafToken}`,
                            ].join("&");
                            window.open(`${page.url}#${hash}`, "_blank", "noopener");
                          }}
                        >
                          <Monitor className="mr-1 h-3 w-3" />
                          Scan from browser
                        </Button>
                      )}
                    </div>
                    </div>
                    <AccordionContent className="border-t border-slate-100 px-3 pb-3 pt-2.5 dark:border-slate-800">
                      {!["completed","failed","not_available","pending","requeued"].includes(page.status) && (
                        <div className="p-4 bg-orange-50 text-orange-800 text-sm rounded-md mb-4 border border-orange-200 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
                          <div>
                            <p className="font-semibold mb-1">This page was not scanned</p>
                            <p className="text-xs opacity-80">The scanner was interrupted (e.g. a server restart) while processing this URL. Use the <strong>Retry</strong> button to re-scan it.</p>
                            <p className="text-xs opacity-60 mt-1 font-mono">Status at interruption: {page.status}</p>
                          </div>
                        </div>
                      )}
                      {page.errorMessage && (
                        <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-md mb-4 border border-destructive/20">
                          {page.errorMessage.includes("Cloudflare") ||
                          page.errorMessage.includes("Bot Protection") ? (
                            <div className="flex items-start gap-2">
                              <span className="text-lg shrink-0">🛡️</span>
                              <div>
                                <p className="font-semibold mb-1">
                                  Cloudflare Bot Protection blocked this page
                                </p>
                                <p className="text-xs opacity-80">
                                  This website uses Cloudflare's bot detection
                                  and did not allow the scanner through.
                                </p>
                              </div>
                            </div>
                          ) : page.errorMessage.includes("403") ||
                            page.errorMessage.includes("WAF") ||
                            page.errorMessage.includes("Access Denied") ? (
                            <div className="flex items-start gap-2">
                              <span className="text-lg shrink-0">🔒</span>
                              <div className="flex-1">
                                <p className="font-semibold mb-1">
                                  Site firewall blocked the scanner
                                </p>
                                <p className="text-xs opacity-80 mb-2">
                                  The target site returned <strong>HTTP 403 Forbidden</strong> to our scanner's server IP.
                                  This typically happens on financial, government, and enterprise sites that run
                                  Akamai Bot Manager, Imperva Incapsula, or a custom WAF that blocks cloud/datacenter IP ranges.
                                </p>
                                {page.wafToken ? (
                                  <div className="mt-2">
                                    <button
                                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                                      onClick={() => {
                                        const hash = [
                                          `_ampera_sid=${scan.id}`,
                                          `_ampera_pid=${page.id}`,
                                          `_ampera_srv=${encodeURIComponent(window.location.origin)}`,
                                          `_ampera_tok=${page.wafToken}`,
                                        ].join("&");
                                        window.open(`${page.url}#${hash}`, "_blank", "noopener");
                                      }}
                                    >
                                      🔍 Open &amp; Scan from Browser
                                    </button>
                                    <p className="text-xs opacity-60 mt-1">
                                      Requires the <strong>Ampera WAF Scanner</strong> Chrome Extension. The page will open in your browser and scan results will be reported back automatically.
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-xs opacity-70">
                                    <strong>Options:</strong> (1) Use the <strong>Ampera WAF Scanner</strong> Chrome Extension to scan from your own browser.
                                    (2) Ask the site owner to whitelist the scanner's IP.
                                    (3) If the site is internal or staging, make sure it is publicly reachable.
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono">
                              Error: {page.errorMessage}
                            </span>
                          )}
                        </div>
                      )}

                      {pageIssues.length > 0 || selectedRules.length >= 2 ? (
                        <div className="space-y-3">
                          {/* Issue filters */}
                          {(pageIssues.length > 0 || selectedRules.length >= 2) && (
                            <div className="min-w-0 flex-1">
                              <IssueFilterBar
                                issues={pageIssues}
                                filters={filters}
                                onChange={setFilters}
                                singleRule={selectedRules.length === 1}
                                selectedRules={selectedRules}
                                ruleInfoMap={ruleInfoMap}
                              />
                            </div>
                          )}
                          {pageIssues.length === 0 && page.status === "completed" && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              {page.issueCount > 0 ? (
                                <>
                                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                  <span>Issue details unavailable — {page.issueCount} issue{page.issueCount !== 1 ? "s" : ""} were recorded at scan time but could not be loaded. Re-scan this URL to restore them.</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                  No accessibility issues found on this page.
                                </>
                              )}
                            </div>
                          )}
                          <Tabs defaultValue={firstTabValue} className="w-full">
                            <TabsList className="flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 rounded-lg bg-[#f1f3f9] p-1 dark:bg-slate-900">
                              {categoryTabs.map((category) => (
                                <TabsTrigger
                                  key={category.value}
                                  value={category.value}
                                  className="h-7 gap-1.5 px-3 text-xs data-[state=active]:bg-white data-[state=active]:text-[#172b4d] data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-slate-100"
                                >
                                  {category.label} ({category.ruleCount})
                                </TabsTrigger>
                              ))}
                              {selectedRules.length >= 2 && (
                                <TabsTrigger value="no-occurrences" className="h-7 gap-1.5 px-3 text-xs data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-green-400">
                                  No occurrences ({zeroOccurrenceRuleCount} rule{zeroOccurrenceRuleCount !== 1 ? "s" : ""})
                                </TabsTrigger>
                              )}
                            </TabsList>
                            {categoryTabs.map((category) => (
                              <TabsContent key={category.value} value={category.value} className="mt-2">
                                <IssueGroupList
                                  issues={category.issues}
                                  filters={filters}
                                  pageUrl={page.url}
                                  selectedIssueId={undefined}
                                  onFlagIssue={handleOpenFlagDialog}
                                  onSelectOccurrence={(issue, group) => handleSelectOccurrence(issue, group, page.url, page.id)}
                                  isCrawlerScan={isCrawlerScan}
                                  onOpenUpdateResults={handleOpenUpdateResults}
                                  aiContextualAssessmentEnabled={
                                    (scan.options as { aiContextualAssessment?: boolean } | null | undefined)?.aiContextualAssessment === true
                                  }
                                  onRetryAssessment={(issueId) => void retryAssessment(issueId)}
                                  retryingAssessmentId={retryingAssessmentId}
                                />
                              </TabsContent>
                            ))}
                            {selectedRules.length >= 2 && (
                              <TabsContent value="no-occurrences" className="mt-2">
                                <ZeroOccurrenceGroup
                                  issues={pageIssues}
                                  filters={filters}
                                  selectedRules={selectedRules}
                                  ruleInfoMap={ruleInfoMap}
                                />
                              </TabsContent>
                            )}
                          </Tabs>
                        </div>
                      ) : page.status === "completed" ? (
                        <div className="p-8 text-center text-muted-foreground border rounded-md mt-4 border-dashed bg-muted/10">
                          {page.issueCount > 0 ? (
                            <>
                              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-70" />
                              <p className="text-sm font-medium">Issue details unavailable</p>
                              <p className="text-xs mt-1">{page.issueCount} issue{page.issueCount !== 1 ? "s" : ""} were recorded at scan time but could not be loaded. Re-scan this URL to restore them.</p>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                              No accessibility issues found on this page.
                            </>
                          )}
                        </div>
                      ) : null}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

            {/* Cross-page filter summary when filters are active */}
            {(filters.search ||
              filters.ruleId !== "all" ||
              filters.severity !== "all" ||
              filters.wcag !== "all") &&
              allIssues.length > 0 && (
                <div className="text-sm text-muted-foreground text-center">
                  Filters applied across all pages. &nbsp;
                  <button
                    className="text-primary underline underline-offset-2"
                    onClick={() =>
                      setFilters({
                        search: "",
                        ruleId: "all",
                        severity: "all",
                        wcag: "all",
                        level: "all",
                        hideFalsePositives: false,
                      })
                    }
                  >
                    Clear all filters
                  </button>
                </div>
              )}
          </div>
        )}

      {!showUpdatingResults &&
        !isActive &&
        mainView === "accessibility" &&
        (!scan.pages || scan.pages.length === 0) && (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center shadow-[0_2px_8px_rgba(15,23,42,0.03)] dark:border-slate-700 dark:bg-slate-950/60">
            {scan.status === "failed" ? (
              <AlertTriangle className="h-9 w-9 text-amber-500" />
            ) : (
              <Info className="h-9 w-9 text-violet-500" />
            )}
            <h2 className="mt-3 text-base font-semibold text-foreground">
              {scan.status === "failed" ? "This scan did not produce page results" : "No page results are available yet"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {scan.status === "failed"
                ? "Review the scan status above, then retry the scan after addressing the reported issue."
                : "Results will appear here once this scan has collected a page to review."}
            </p>
            {canRetry && (
              <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={handleRetry} disabled={retryClone.isPending}>
                {retryClone.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
                Retry scan
              </Button>
            )}
          </div>
        )}

      {/* Live running state view */}
      {isActive && liveStatus && (liveStatus.counts || (liveStatus.pages && liveStatus.pages.length > 0)) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Live Progress</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Page activity updates as each URL moves through the scanner.</p>
            </div>
            {isPaused && (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-300"
              >
                <Pause className="w-3 h-3 mr-1" />
                Paused — waiting for next batch
              </Badge>
            )}
          </div>

          {/* Real-time stats counter row */}
          {(() => {
            const activeSet = new Set(["rendering","analyzing","saving","scanning"]);
            const c = liveStatus!.counts;
            const pages = liveStatus!.pages ?? [];
            const inQueue        = c?.["navigating"]   ?? pages.filter(p => p.status === "navigating").length;
            const scanning       = c
              ? (["rendering","analyzing","saving","scanning"] as const).reduce((s, k) => s + (c[k] ?? 0), 0)
              : pages.filter(p => activeSet.has(p.status)).length;
            const done           = c?.["completed"]    ?? pages.filter(p => p.status === "completed").length;
            const pending        = c?.["pending"]      ?? pages.filter(p => p.status === "pending").length;
            const retry          = c?.["requeued"]     ?? pages.filter(p => p.status === "requeued").length;
            const failed         = c?.["failed"]       ?? pages.filter(p => p.status === "failed").length;
            const notAvail       = c?.["not_available"]?? pages.filter(p => p.status === "not_available").length;
            const pagesWithIssues = liveStatus!.pagesWithIssues
              ?? (pages.filter(p => p.status === "completed" && (p.issueCount ?? 0) > 0).length);
            const pagesWithSnapshot = (liveStatus as { pagesWithSnapshot?: number })?.pagesWithSnapshot ?? 0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2">
                <div className="flex items-center gap-2.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
                  <Globe className="w-4 h-4 text-violet-500 shrink-0 animate-pulse" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-violet-600">In Queue</p>
                    <p className="text-xl font-bold text-violet-700 leading-none mt-0.5">{inQueue}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                  <div className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-blue-600">Scanning</p>
                    <p className="text-xl font-bold text-blue-700 leading-none mt-0.5">{scanning}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-green-600">Done</p>
                    <p className="text-xl font-bold text-green-700 leading-none mt-0.5">{done}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Pending</p>
                    <p className="text-xl font-bold text-slate-600 leading-none mt-0.5">{pending}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                  <RotateCcw className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-500">Retry</p>
                    <p className="text-xl font-bold text-indigo-600 leading-none mt-0.5">{retry}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-red-500">Failed</p>
                    <p className="text-xl font-bold text-red-600 leading-none mt-0.5">{failed}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5">
                  <Ban className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Not Available</p>
                    <p className="text-xl font-bold text-slate-500 leading-none mt-0.5">{notAvail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-orange-600">Pages w/ Issues</p>
                    <p className="text-xl font-bold text-orange-700 leading-none mt-0.5">{pagesWithIssues}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
                  <Camera className="w-4 h-4 text-teal-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-teal-600">HTML + Snapshot</p>
                    <p className="text-xl font-bold text-teal-700 leading-none mt-0.5">{pagesWithSnapshot}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/85 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/80">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">URL</th>
                    <th className="text-left p-3 font-medium">Stage</th>
                    <th className="text-right p-3 font-medium">Load</th>
                    <th className="text-right p-3 font-medium">Scan</th>
                    <th className="text-right p-3 font-medium">Issues</th>
                    <th className="text-right p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...liveStatus.pages].sort((a, b) => {
                    const rank = (s: string) =>
                      s === "navigating" ? 0
                      : s === "rendering" || s === "analyzing" || s === "saving" || s === "scanning" ? 1
                      : 2;
                    return rank(a.status) - rank(b.status);
                  }).map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 font-mono text-xs break-all">
                        {p.url}
                      </td>
                      <td className="p-3">
                        {p.status === "navigating" ? (
                          <span className="flex items-center text-blue-600">
                            <Globe className="w-3 h-3 mr-2 animate-pulse" />
                            Navigating
                          </span>
                        ) : p.status === "rendering" ? (
                          <span className="flex items-center text-violet-600">
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Rendering
                          </span>
                        ) : p.status === "analyzing" ? (
                          <span className="flex items-center text-primary">
                            <Cpu className="w-3 h-3 mr-2 animate-pulse" />
                            Analyzing
                          </span>
                        ) : p.status === "saving" ? (
                          <span className="flex items-center text-orange-500">
                            <Save className="w-3 h-3 mr-2 animate-pulse" />
                            Saving
                          </span>
                        ) : p.status === "scanning" ? (
                          <span className="flex items-center text-primary">
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Scanning
                          </span>
                        ) : p.status === "completed" ? (
                          <span className="flex items-center text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-2" />
                            Done
                          </span>
                        ) : p.status === "failed" ? (
                          <span className="flex items-center text-red-600">
                            <XCircle className="w-3 h-3 mr-2" />
                            Failed
                          </span>
                        ) : p.status === "requeued" ? (
                          <span className="flex items-center text-indigo-500">
                            <span className="relative flex h-2 w-2 mr-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                            </span>
                            Requeued
                          </span>
                        ) : p.status === "not_available" ? (
                          <span className="flex items-center text-slate-500">
                            <Ban className="w-3 h-3 mr-2" />
                            Not Available
                          </span>
                        ) : (
                          <span className="flex items-center text-muted-foreground">
                            <Clock className="w-3 h-3 mr-2" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right text-sm font-mono font-medium">
                        {p.loadDurationMs != null
                          ? <span className="text-blue-600 dark:text-blue-400">{p.loadDurationMs >= 1000
                            ? `${(p.loadDurationMs / 1000).toFixed(1)}s`
                            : `${p.loadDurationMs}ms`}</span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="p-3 text-right text-sm font-mono font-medium">
                        {p.scanDurationMs != null
                          ? <span className="text-violet-600 dark:text-violet-400">{p.scanDurationMs >= 1000
                            ? `${(p.scanDurationMs / 1000).toFixed(1)}s`
                            : `${p.scanDurationMs}ms`}</span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {p.issueCount > 0 ? (
                          <span className="font-mono">{p.issueCount}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {p.status === "pending" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            title="Remove URL from queue"
                            aria-label={`Remove ${p.url} from queue`}
                            disabled={removeQueuedUrlMutation.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeQueuedUrlMutation.mutate({ id: p.id, url: p.url });
                            }}
                          >
                            {removeQueuedUrlMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        ) : p.status === "failed" ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-amber-500"
                            title="Auto retrying"
                          >
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                            </span>
                            <RotateCcw className="w-3 h-3" />
                          </span>
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

      {/* Update Results Dialog */}
      {isCrawlerScan && (
        <Dialog open={urOpen} onOpenChange={setUrOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ListFilter className="w-4 h-4 text-violet-600" />
                Update Results
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{urRuleId}</p>
              <p className="text-sm text-foreground/80 leading-snug">{urRuleDesc}</p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              {(() => {
                const pagesWithRule = (scan?.pages ?? []).filter((p: { id: number; url: string; issues?: Issue[] }) =>
                  (p.issues ?? []).some((i: Issue) => i.ruleId === urRuleId),
                );
                return (
                  <>
                    <div className="flex items-center justify-between pb-1 border-b">
                      <p className="text-xs text-muted-foreground">
                        {pagesWithRule.length} page{pagesWithRule.length !== 1 ? "s" : ""} affected · {urSelectedPages.size} selected
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="text-xs text-primary underline underline-offset-2"
                          onClick={() => setUrSelectedPages(new Set(pagesWithRule.map(p => p.id)))}
                        >
                          Select all
                        </button>
                        <button
                          className="text-xs text-muted-foreground underline underline-offset-2"
                          onClick={() => setUrSelectedPages(new Set())}
                        >
                          Deselect all
                        </button>
                      </div>
                    </div>
                    {pagesWithRule.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No pages found with this rule.</p>
                    ) : (
                      <div className="space-y-1">
                        {pagesWithRule.map((p: { id: number; url: string; issues?: Issue[] }) => {
                          const count = (p.issues ?? []).filter((i: Issue) => i.ruleId === urRuleId).length;
                          const checked = urSelectedPages.has(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${checked ? "bg-violet-50 border border-violet-200" : "hover:bg-muted/50 border border-transparent"}`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setUrSelectedPages(prev => {
                                    const next = new Set(prev);
                                    if (v) next.add(p.id); else next.delete(p.id);
                                    return next;
                                  });
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-mono truncate text-foreground/80" title={p.url}>{p.url}</p>
                              </div>
                              <Badge variant="secondary" className="text-xs shrink-0">{count} occ.</Badge>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="space-y-1 pt-2 border-t">
                <Label className="text-xs font-medium">Reason <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  placeholder="Why is this a false positive on the selected pages?"
                  value={urReason}
                  onChange={e => setUrReason(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t gap-2">
              <Button variant="outline" size="sm" onClick={() => setUrOpen(false)} disabled={urSubmitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                onClick={handleUpdateResults}
                disabled={urSubmitting || urSelectedPages.size === 0}
              >
                {urSubmitting ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Applying…</>
                ) : (
                  <>
                    <Flag className="w-3.5 h-3.5 mr-1.5" />
                    Flag as FP on {urSelectedPages.size} page{urSelectedPages.size !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
