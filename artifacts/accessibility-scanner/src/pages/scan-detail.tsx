import { useState, useMemo, useCallback, useEffect } from "react";
import { SIA_RULES } from "@/lib/siaRules";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStatusBadge } from "@/lib/status-badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";
import { ElementViewer, type ViewerIssue } from "@/components/element-viewer";
import { isElementViewerEnabled } from "@/pages/settings";

function ImpactBadge({ impact }: { impact: string }) {
  switch (impact) {
    case "critical":
      return (
        <Badge
          variant="outline"
          className="bg-[#E11D48] text-white border-transparent"
        >
          Critical
        </Badge>
      );
    case "serious":
      return (
        <Badge
          variant="outline"
          className="bg-[#EA580C] text-white border-transparent"
        >
          Serious
        </Badge>
      );
    case "moderate":
      return (
        <Badge
          variant="outline"
          className="bg-[#EAB308] text-black border-transparent"
        >
          Moderate
        </Badge>
      );
    case "minor":
      return (
        <Badge
          variant="outline"
          className="bg-[#3B82F6] text-white border-transparent"
        >
          Minor
        </Badge>
      );
    default:
      return <Badge>{impact}</Badge>;
  }
}

function ImpactIcon({ impact }: { impact: string }) {
  switch (impact) {
    case "critical":
      return <AlertTriangle className="w-4 h-4 text-[#E11D48]" />;
    case "serious":
      return <AlertTriangle className="w-4 h-4 text-[#EA580C]" />;
    case "moderate":
      return <AlertCircle className="w-4 h-4 text-[#EAB308]" />;
    case "minor":
      return <Info className="w-4 h-4 text-[#3B82F6]" />;
    default:
      return <Info className="w-4 h-4" />;
  }
}

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

interface Issue {
  id: number;
  ruleId: string;
  impact: string;
  description: string;
  element: string | null;
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
}

interface IssueFilters {
  search: string;
  ruleId: string;
  severity: string;
  wcag: string;
  level: string;
}
function getLegalText(issue: Issue) {
  if (!issue.legal) return "";

  const parts: string[] = [];

  if (issue.legal.ada?.length) {
    parts.push(`ADA ${issue.legal.ada.join(", ")}`);
  }

  if (issue.legal.eaa) {
    parts.push("EAA");
  }

  return parts.join(", ");
}
function IssueFilterBar({
  issues,
  filters,
  onChange,
  singleRule = false,
  selectedRules,
  ruleInfoMap,
}: {
  issues: Issue[];
  filters: IssueFilters;
  onChange: (f: IssueFilters) => void;
  singleRule?: boolean;
  selectedRules?: string[];
  ruleInfoMap?: Record<string, RuleInfo>;
}) {
  const ruleIds = useMemo(
    () =>
      Array.from(
        new Set([...issues.map((i) => i.ruleId), ...(selectedRules ?? [])]),
      ).sort(),
    [issues, selectedRules],
  );
  const wcagCriteria = useMemo(() => {
    const fromIssues = issues
      .map((i) => i.wcagCriteria)
      .filter(Boolean) as string[];
    const fromSelected = (selectedRules ?? [])
      .map((id) => ruleInfoMap?.[id]?.wcagCriteria)
      .filter(Boolean) as string[];
    return Array.from(new Set([...fromIssues, ...fromSelected])).sort();
  }, [issues, selectedRules, ruleInfoMap]);

  const hasFilters =
    filters.search ||
    filters.ruleId !== "all" ||
    filters.severity !== "all" ||
    filters.wcag !== "all" ||
    filters.level !== "all";

  if (singleRule) return null;

  return (
    <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Filter className="w-3.5 h-3.5" />
        <span>Filters</span>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs text-muted-foreground"
            onClick={() =>
              onChange({
                search: "",
                ruleId: "all",
                severity: "all",
                wcag: "all",
                level: "all",
              })
            }
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-xs text-muted-foreground font-medium">
            Search
          </span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search issue description..."
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">
            Rule
          </span>
          <Select
            value={filters.ruleId}
            onValueChange={(v) => onChange({ ...filters, ruleId: v })}
          >
            <SelectTrigger className="h-8 text-xs w-[130px]">
              <SelectValue placeholder="Rule ID" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {ruleIds.map((id) => (
                <SelectItem key={id} value={id} className="font-mono text-xs">
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">
            Severity
          </span>
          <Select
            value={filters.severity}
            onValueChange={(v) => onChange({ ...filters, severity: v })}
          >
            <SelectTrigger className="h-8 text-xs w-[120px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="serious">Serious</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="minor">Minor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {wcagCriteria.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium">
              WCAG
            </span>
            <Select
              value={filters.wcag}
              onValueChange={(v) => onChange({ ...filters, wcag: v })}
            >
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue placeholder="WCAG" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {wcagCriteria.map((wc) => (
                  <SelectItem key={wc} value={wc} className="font-mono text-xs">
                    {wc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">
            Level
          </span>
          <Select
            value={filters.level}
            onValueChange={(v) => onChange({ ...filters, level: v })}
          >
            <SelectTrigger className="h-8 text-xs w-[100px]">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="AA">AA</SelectItem>
              <SelectItem value="AAA">AAA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

interface RuleInfo {
  description: string;
  impact: string;
  wcagCriteria: string | null;
  wcagLevel: string | null;
}

function getSelectedRuleSummary(selectedRules: string[]) {
  if (selectedRules.length === 0) return null;
  if (selectedRules.length === Object.keys(SIA_RULES).length)
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

function IssueGroupList({
  issues,
  filters,
  pageUrl,
  onSelectOccurrence,
  selectedIssueId,
  selectedRules,
  ruleInfoMap,
}: {
  issues: Issue[];
  filters: IssueFilters;
  pageUrl: string;
  onSelectOccurrence?: (issue: Issue, group: Issue[]) => void;
  selectedIssueId?: number;
  selectedRules?: string[];
  ruleInfoMap?: Record<string, RuleInfo>;
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
    return issues.filter((issue) => {
      if (
        filters.search &&
        !issue.description.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      if (filters.ruleId !== "all" && issue.ruleId !== filters.ruleId)
        return false;
      if (filters.severity !== "all" && issue.impact !== filters.severity)
        return false;
      if (filters.wcag !== "all" && issue.wcagCriteria !== filters.wcag)
        return false;
      if (filters.level !== "all" && issue.wcagLevel !== filters.level)
        return false;
      return true;
    });
  }, [issues, filters]);

  const grouped = filteredIssues.reduce<Record<string, Issue[]>>(
    (acc, issue) => {
      if (!acc[issue.ruleId]) acc[issue.ruleId] = [];
      acc[issue.ruleId].push(issue);
      return acc;
    },
    {},
  );

  const groups = Object.values(grouped).sort((a, b) => {
    const ai = IMPACT_ORDER[a[0].impact] ?? 99;
    const bi = IMPACT_ORDER[b[0].impact] ?? 99;
    return ai - bi;
  });

  // Rules selected for the scan that have 0 occurrences on this page.
  // Only shown when at least 2 rules were selected and no narrowing filters are active.
  const showZeroRows =
    (selectedRules?.length ?? 0) >= 2 &&
    filters.severity === "all" &&
    !filters.search &&
    filters.wcag === "all" &&
    filters.level === "all";

  const issueRuleIds = new Set(filteredIssues.map((i) => i.ruleId));
  const zeroRules = showZeroRows
    ? (selectedRules ?? []).filter(
        (r) =>
          !issueRuleIds.has(r) &&
          (filters.ruleId === "all" || filters.ruleId === r),
      )
    : [];

  if (groups.length === 0 && zeroRules.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-md border-dashed bg-muted/10 mt-4">
        <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No issues match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-4 border-t pt-4">
      <p className="text-xs text-muted-foreground mb-3">
        Showing {filteredIssues.length} issue
        {filteredIssues.length !== 1 ? "s" : ""} across {groups.length} rule
        {groups.length !== 1 ? "s" : ""}
        {zeroRules.length > 0 &&
          ` · ${zeroRules.length} rule${zeroRules.length !== 1 ? "s" : ""} with 0 occurrences`}
      </p>
      <Accordion type="multiple" className="space-y-2">
        {groups.map((group) => {
          const first = group[0];
          const count = group.length;
          return (
            <AccordionItem
              key={first.ruleId}
              value={first.ruleId}
              className="border rounded-md bg-muted/20 px-4"
            >
              <AccordionTrigger className="hover:no-underline py-3 items-start">
                <div className="flex flex-col gap-2 w-full pr-3 text-left">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      <ImpactIcon impact={first.impact} />
                    </span>
                    <span className="font-medium text-sm text-foreground break-words whitespace-normal leading-snug">
                      {first.description}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <Badge
                      variant="secondary"
                      className="font-mono tabular-nums"
                    >
                      {count} {count === 1 ? "occurrence" : "occurrences"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="font-mono text-xs bg-background"
                    >
                      {first.ruleId}
                    </Badge>
                    <ImpactBadge impact={first.impact} />
                    {first.wcagCriteria && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        WCAG {first.wcagCriteria}
                      </Badge>
                    )}
                    {first.wcagLevel && (
                      <Badge variant="outline" className="text-xs">
                        Level {first.wcagLevel}
                      </Badge>
                    )}
                    {getLegalText(first) && (
                      <Badge variant="outline" className="text-xs">
                        Compliance: {getLegalText(first)}
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {first.remediation && (
                  <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-md text-sm">
                    <span className="font-medium text-primary">
                      How to fix:{" "}
                    </span>
                    <span className="text-foreground/80">
                      {first.remediation}
                    </span>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    {count} element{count !== 1 ? "s" : ""} affected
                  </p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-10">
                            #
                          </th>
                          <th className="text-left px-3 py-2 font-medium">
                            Selector
                          </th>
                          <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                            Element
                          </th>
                          {group.some(
                            (i) => i.description !== first.description,
                          ) && (
                            <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">
                              Note
                            </th>
                          )}
                          <th className="w-6" />
                          {onSelectOccurrence && <th className="w-28" />}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((issue, idx) => {
                          const isExpanded = expandedRows.has(issue.id);
                          const hasVariantDesc =
                            issue.description !== first.description;
                          const isSelected = selectedIssueId === issue.id;
                          return (
                            <div key={issue.id} className="contents">
                              <tr
                                className={`border-t cursor-pointer select-none transition-colors ${
                                  isSelected
                                    ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
                                    : isExpanded
                                      ? "bg-primary/5"
                                      : "hover:bg-muted/40"
                                }`}
                                onClick={() => toggleRow(issue.id)}
                              >
                                <td className="px-3 py-2 text-muted-foreground font-mono">
                                  {idx + 1}
                                </td>
                                <td className="px-3 py-2 font-mono max-w-[200px]">
                                  {issue.selector ? (
                                    <span
                                      className="block truncate text-foreground/80"
                                      title={issue.selector}
                                    >
                                      {issue.selector}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground italic">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden md:table-cell max-w-[300px]">
                                  {issue.element ? (
                                    <code
                                      className="block truncate text-primary font-mono"
                                      title={issue.element}
                                    >
                                      {issue.element.length > 80
                                        ? issue.element.substring(0, 80) + "…"
                                        : issue.element}
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground italic">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden xl:table-cell max-w-[380px]">
                                  <div className="flex items-center gap-2">
                                    {issue.element ? (
                                      <>
                                        <code
                                          className="block truncate text-foreground/80 font-mono"
                                          title={issue.element}
                                        >
                                          {issue.element}
                                        </code>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(
                                              issue.element || "",
                                            );
                                          }}
                                          title="Copy element HTML"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground italic">
                                        —
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {group.some(
                                  (i) => i.description !== first.description,
                                ) && (
                                  <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground max-w-[200px]">
                                    {hasVariantDesc ? (
                                      <span
                                        className="truncate block italic"
                                        title={issue.description}
                                      >
                                        {issue.description}
                                      </span>
                                    ) : null}
                                  </td>
                                )}
                                <td className="px-3 py-2 text-muted-foreground">
                                  <div className="flex items-center gap-2">
                                    <ChevronDown
                                      className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                                    />
                                    {onSelectOccurrence && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[11px] px-2 gap-1 whitespace-nowrap"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onSelectOccurrence(issue, group);
                                        }}
                                      >
                                        View Details
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr
                                  key={`${issue.id}-detail`}
                                  className="bg-primary/5 border-t border-primary/10"
                                >
                                  <td
                                    colSpan={
                                      (group.some(
                                        (i) =>
                                          i.description !== first.description,
                                      )
                                        ? 7
                                        : 6) + (onSelectOccurrence ? 1 : 0)
                                    }
                                    className="px-4 py-4"
                                  >
                                    <div className="space-y-3">
                                      {pageUrl && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                            Full URL
                                          </p>
                                          <div className="flex items-start gap-2">
                                            <code className="block bg-background border px-3 py-2 rounded text-xs font-mono text-foreground/80 break-all whitespace-pre-wrap flex-1">
                                              {pageUrl}
                                            </code>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="shrink-0"
                                              onClick={() =>
                                                navigator.clipboard.writeText(
                                                  pageUrl,
                                                )
                                              }
                                            >
                                              Copy
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                      {hasVariantDesc && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                            Description
                                          </p>
                                          <p className="text-sm text-foreground">
                                            {issue.description}
                                          </p>
                                        </div>
                                      )}
                                      {issue.selector && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                            CSS Selector
                                          </p>
                                          <code className="block bg-background border px-3 py-2 rounded text-xs font-mono text-foreground/80 break-all whitespace-pre-wrap">
                                            {issue.selector}
                                          </code>
                                        </div>
                                      )}
                                      {issue.element && (
                                        <div>
                                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                            Element HTML
                                          </p>
                                          <code className="block bg-background border px-3 py-2 rounded text-xs font-mono text-primary break-all whitespace-pre-wrap leading-relaxed">
                                            {issue.element}
                                          </code>
                                        </div>
                                      )}
                                      {(issue.wcagCriteria ||
                                        issue.wcagLevel) && (
                                        <div className="flex gap-3 flex-wrap">
                                          {issue.wcagCriteria && (
                                            <div>
                                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                                WCAG Criterion
                                              </p>
                                              <Badge
                                                variant="secondary"
                                                className="font-mono text-xs"
                                              >
                                                {issue.wcagCriteria}
                                              </Badge>
                                            </div>
                                          )}
                                          {issue.wcagLevel && (
                                            <div>
                                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                                Conformance Level
                                              </p>
                                              <Badge
                                                variant="outline"
                                                className="text-xs"
                                              >
                                                Level {issue.wcagLevel}
                                              </Badge>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </div>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Rules with 0 occurrences on this page */}
      {zeroRules.length > 0 && (
        <div className="space-y-2 mt-2">
          {zeroRules.map((ruleId) => {
            const info = ruleInfoMap?.[ruleId];
            return (
              <div
                key={ruleId}
                className="border rounded-md bg-green-50/40 dark:bg-green-950/10 border-green-200/60 dark:border-green-900/40 px-4 py-3 flex items-start gap-3"
              >
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80 break-words">
                    {SIA_RULES[ruleId]?.title ??
                      info?.description ??
                      "No issues detected for this rule on this page."}
                  </p>
                  {SIA_RULES[ruleId]?.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {SIA_RULES[ruleId].detail}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge
                      variant="secondary"
                      className="text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 font-mono"
                    >
                      0 occurrences
                    </Badge>
                    <Badge
                      variant="outline"
                      className="font-mono text-xs bg-background"
                    >
                      {ruleId}
                    </Badge>
                    {info?.wcagCriteria && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        WCAG {info.wcagCriteria}
                      </Badge>
                    )}
                    {info?.wcagLevel && (
                      <Badge variant="outline" className="text-xs">
                        Level {info.wcagLevel}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const allRules = selectedRules.length === Object.keys(SIA_RULES).length;
  const selectedRulesLabel =
    selectedRules.length === 0
      ? "All rules"
      : allRules
        ? "All rules"
        : selectedRules
            .map((ruleId) =>
              `${ruleId} — ${SIA_RULES[ruleId]?.title ?? ""}`.trim(),
            )
            .join("; ");
  const scanLabel = scan.name || `Scan #${scan.id}`;
  for (const page of scan.pages ?? []) {
    for (const issue of page.issues ?? []) {
      rows.push({
        pageUrl: page.url,
        ruleId: issue.ruleId,
        ruleLabel: SIA_RULES[issue.ruleId]?.title ?? issue.description,
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
  return rows;
}

function ExportButtons({
  scan,
}: {
  scan: {
    id: number;
    name?: string | null;
    pages?: Array<{ url: string; issues?: Issue[] }>;
  };
}) {
  const { toast } = useToast();
  const scanLabel = scan.name || `scan-${scan.id}`;
  const safeLabel = scanLabel.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  const exportCsv = useCallback(() => {
    const rows = buildExportRows(scan);
    if (rows.length === 0) {
      toast({ title: "No issues to export" });
      return;
    }
    const header = [
      "Scan Name",
      "Selected Rules",
      "Page URL",
      "Rule ID",
      "Rule Label",
      "Description",
      "Impact",
      "WCAG Criterion",
      "WCAG Level",
      "Compliance",
      "CSS Selector",
      "Element HTML",
      "Remediation",
    ];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      header.map(escape).join(","),
      ...rows.map((r) =>
        [
          r.scanLabel,
          r.selectedRules,
          r.pageUrl,
          r.ruleId,
          r.ruleLabel,
          r.description,
          r.impact,
          r.wcagCriteria,
          r.wcagLevel,
          r.legalText,
          r.selector,
          r.element,
          r.remediation,
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeLabel}-a11y-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  }, [scan, safeLabel, toast]);

  const exportExcel = useCallback(async () => {
    const rows = buildExportRows(scan);
    if (rows.length === 0) {
      toast({ title: "No issues to export" });
      return;
    }
    const XLSX = (await import("xlsx")).default;
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        "Scan Name": r.scanLabel,
        "Selected Rules": r.selectedRules,
        "Page URL": r.pageUrl,
        "Rule ID": r.ruleId,
        "Rule Label": r.ruleLabel,
        Description: r.description,
        Impact: r.impact,
        "WCAG Criterion": r.wcagCriteria,
        "WCAG Level": r.wcagLevel,
        Compliance: r.legalText,
        "CSS Selector": r.selector,
        "Element HTML": r.element,
        Remediation: r.remediation,
      })),
    );
    ws["!cols"] = [
      { wch: 60 },
      { wch: 10 },
      { wch: 60 },
      { wch: 10 },
      { wch: 14 },
      { wch: 8 },
      { wch: 50 },
      { wch: 80 },
      { wch: 60 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Issues");
    XLSX.writeFile(wb, `${safeLabel}-a11y-report.xlsx`);
    toast({ title: "Excel file exported" });
  }, [scan, safeLabel, toast]);

  const exportPdf = useCallback(async () => {
    const rows = buildExportRows(scan);
    if (rows.length === 0) {
      toast({ title: "No issues to export" });
      return;
    }
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    doc.setFontSize(16);
    doc.text(`Accessibility Report: ${scanLabel}`, 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(
      `Generated: ${new Date().toLocaleString()} — ${rows.length} issue${rows.length !== 1 ? "s" : ""} across ${scan.pages?.length ?? 0} page${(scan.pages?.length ?? 0) !== 1 ? "s" : ""}`,
      40,
      58,
    );
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 70,
      head: [
        [
          "#",
          "Scan Name",
          "Selected Rules",
          "Page URL",
          "Rule ID",
          "Rule Label",
          "Impact",
          "WCAG",
          "Description",
          "Selector",
          "Remediation",
        ],
      ],
      body: rows.map((r, i) => [
        i + 1,
        r.scanLabel,
        r.selectedRules,
        r.pageUrl,
        r.ruleId,
        r.ruleLabel,
        r.impact,
        r.wcagCriteria ? `${r.wcagCriteria} (${r.wcagLevel})` : "",
        r.description,
        r.selector,
        r.remediation,
      ]),
      styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak" },
      headStyles: {
        fillColor: [109, 40, 217],
        textColor: 255,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 70 },
        2: { cellWidth: 90 },
        3: { cellWidth: 110 },
        4: { cellWidth: 42 },
        5: { cellWidth: 62 },
        6: { cellWidth: 50 },
        7: { cellWidth: 50 },
        8: { cellWidth: 110 },
        9: { cellWidth: 100 },
        10: { cellWidth: 130 },
      },
      alternateRowStyles: { fillColor: [248, 246, 255] },
    });

    doc.save(`${safeLabel}-a11y-report.pdf`);
    toast({ title: "PDF exported" });
  }, [scan, scanLabel, safeLabel, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
          <ChevronDown className="w-3.5 h-3.5 ml-2 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCsv}>
          <FileText className="w-4 h-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPdf}>
          <FileText className="w-4 h-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RulesBadges({ selectedRules }: { selectedRules: string[] }) {
  if (selectedRules.length === 0) return null;
  const allRules = selectedRules.length === Object.keys(SIA_RULES).length;
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

function UrlCell({ url }: { url: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="min-w-0 break-all whitespace-normal">{url}</span>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast({ title: "URL copied" });
        }}
        aria-label="Copy URL"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function applyPrefix(urls: string[], prefix: string) {
  const p = prefix.trim();
  if (!p) return urls;
  return urls.map((u) =>
    u.startsWith("http://") || u.startsWith("https://") ? u : `${p}${u}`,
  );
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
  });

  const [pageStatusFilter, setPageStatusFilter] = useState<string>("all");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editInitiatorName, setEditInitiatorName] = useState("");
  const [editInitiatorRole, setEditInitiatorRole] = useState("");
  const updateScanMutation = useUpdateScan();

  const openEditDialog = () => {
    setEditName(scan?.name ?? "");
    setEditInitiatorName((scan as { initiatorName?: string | null } | undefined)?.initiatorName ?? "");
    setEditInitiatorRole((scan as { initiatorRole?: string | null } | undefined)?.initiatorRole ?? "");
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!scan) return;
    updateScanMutation.mutate(
      { id: scan.id, data: { name: editName.trim() || undefined, initiatorName: editInitiatorName.trim() || null, initiatorRole: editInitiatorRole.trim() || null } },
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

  const [viewerEnabled, setViewerEnabled] = useState<boolean>(() =>
    isElementViewerEnabled(),
  );

  useEffect(() => {
    const syncViewer = () => setViewerEnabled(isElementViewerEnabled());
    window.addEventListener("storage", syncViewer);
    window.addEventListener("focus", syncViewer);
    return () => {
      window.removeEventListener("storage", syncViewer);
      window.removeEventListener("focus", syncViewer);
    };
  }, []);
  const [viewerSel, setViewerSel] = useState<{
    issue: ViewerIssue;
    group: ViewerIssue[];
    groupIndex: number;
    pageUrl: string;
    pageId: number;
  } | null>(null);

  const handleSelectOccurrence = useCallback(
    (issue: Issue, group: Issue[], pageUrl: string, pageId: number) => {
      const idx = group.findIndex((i) => i.id === issue.id);
      setViewerSel({
        issue: issue as ViewerIssue,
        group: group as ViewerIssue[],
        groupIndex: idx >= 0 ? idx : 0,
        pageUrl,
        pageId,
      });
    },
    [],
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

  const cancelScan = useCancelScan();

  const retryClone = useMutation({
    mutationFn: async () => {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/retry`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ id: number }>;
    },
  });

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
    onError: () => {
      toast({ title: "Could not pause scan", variant: "destructive" });
    },
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
    onError: () => {
      toast({ title: "Could not resume scan", variant: "destructive" });
    },
  });

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

  const handleCopyAllUrls = async () => {
    if (!scan?.pages?.length) return;
    const filtered = pageStatusFilter === "all"
      ? scan.pages
      : scan.pages.filter((p) => p.status === pageStatusFilter);
    if (!filtered.length) {
      toast({ title: "No URLs match the current filter" });
      return;
    }
    await navigator.clipboard.writeText(filtered.map((p) => p.url).join("\n"));
    toast({
      title: `Copied ${filtered.length} URL${filtered.length !== 1 ? "s" : ""}`,
    });
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
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayStatus = isUpdatingResults
    ? "updating"
    : liveStatus?.status || scan.status;
  const totalUrls = liveStatus?.totalUrls || scan.totalUrls;
  const scannedUrls = liveStatus?.scannedUrls || scan.scannedUrls;
  const progressPercent =
    totalUrls > 0 ? Math.round((scannedUrls / totalUrls) * 100) : 0;
  const hasLoadedResults = !!scan.pages?.length;
  const showUpdatingResults =
    isUpdatingResults || (scan.status === "completed" && !hasLoadedResults);
  const initiatorText = scan.initiatorName
    ? `Initiated by ${scan.initiatorName}${scan.initiatorRole ? ` · ${scan.initiatorRole}` : ""}`
    : null;

  return (
    <div className="space-y-8">
      {/* Edit Scan Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Scan Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="detail-edit-name">Scan Name</Label>
              <Input
                id="detail-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter scan name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-edit-initiator">Scan Initiator</Label>
              <Input
                id="detail-edit-initiator"
                value={editInitiatorName}
                onChange={(e) => setEditInitiatorName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-edit-role">Initiator Role</Label>
              <Input
                id="detail-edit-role"
                value={editInitiatorRole}
                onChange={(e) => setEditInitiatorRole(e.target.value)}
                placeholder="e.g. QA Engineer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateScanMutation.isPending}>
              {updateScanMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-start">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 -ml-2"
            onClick={() => setLocation("/scans")}
          >
            &lt; Back to Scan History
          </Button>
          {(scan as { projectName?: string | null }).projectName && (
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Project
              </span>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {(scan as { projectName: string }).projectName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {scan.name || `Scan #${scan.id}`}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Edit scan details"
              onClick={openEditDialog}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            {getStatusBadge(displayStatus)}
            {elapsedText && (
              <Badge variant="outline" className="text-xs">
                {isRunning || isPaused ? "Elapsed" : "Time taken"} {elapsedText}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground font-mono text-sm">
            ID: {scan.id} | Created: {new Date(scan.createdAt).toLocaleString()}
          </p>
          {initiatorText && (
            <p className="text-muted-foreground text-sm mt-1">
              {initiatorText}
            </p>
          )}
          <RulesBadges selectedRules={selectedRules} />
          <div className="mt-2 flex flex-wrap gap-2">
            {scan.status === "running" ||
            scan.status === "pending" ||
            scan.status === "paused" ? (
              <Badge variant="secondary" className="text-xs">
                {formatEta(estimatedMinutes)}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
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
          {!isRunning && scan.status === "completed" && !isUpdatingResults && (
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
            <CardDescription className="font-mono break-all">
              Currently scanning: {liveStatus.currentUrl}
            </CardDescription>
          )}
          {showUpdatingResults && (
            <CardDescription className="text-amber-600">
              Updating results, please wait...
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm font-medium">
            <span>
              {scannedUrls} of {totalUrls} URLs scanned
            </span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-3" />
        </CardContent>
      </Card>

      {/* Completed page results */}
      {!showUpdatingResults &&
        !isActive &&
        scan.pages &&
        scan.pages.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight">
                Page Results
              </h2>
              <div className="flex items-center gap-2">
                <Select value={pageStatusFilter} onValueChange={setPageStatusFilter}>
                  <SelectTrigger className="w-40 h-9">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="completed">Done</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="not_available">Not Available</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={handleCopyAllUrls}
                  disabled={scan.pages.length === 0}
                >
                  {pageStatusFilter === "all" ? "Copy all URLs" : "Copy filtered URLs"}
                </Button>
                {allIssues.length > 0 && <ExportButtons scan={scan} />}
              </div>
            </div>

            <Accordion type="multiple" className="space-y-4">
              {scan.pages.filter((page) => pageStatusFilter === "all" || page.status === pageStatusFilter).map((page) => {
                const pageIssues = page.issues || [];
                return (
                  <AccordionItem
                    key={page.id}
                    value={`page-${page.id}`}
                    className="border bg-card rounded-lg px-4 shadow-sm"
                  >
                    <AccordionTrigger className="hover:no-underline py-4">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3 overflow-hidden">
                          {page.status === "completed" ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                          ) : page.status === "failed" ? (
                            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                          ) : page.status === "not_available" ? (
                            <Ban className="w-5 h-5 text-slate-400 shrink-0" />
                          ) : page.status === "requeued" ? (
                            <RotateCcw className="w-5 h-5 text-indigo-500 shrink-0" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-500 shrink-0" />
                          )}
                          <div className="min-w-0 max-w-full">
                            <UrlCell url={page.url} />
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          {page.status === "failed" && (
                            <Badge variant="destructive" className="ml-auto">
                              Failed
                            </Badge>
                          )}
                          {page.status === "requeued" && (
                            <Badge variant="outline" className="ml-auto bg-indigo-50 text-indigo-600 border-indigo-200">
                              Requeued
                            </Badge>
                          )}
                          {page.status === "not_available" && (
                            <Badge variant="outline" className="ml-auto bg-slate-50 text-slate-500 border-slate-200">
                              Not Available
                            </Badge>
                          )}
                          {page.issueCount > 0 && (
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono">
                                {page.issueCount} total
                              </Badge>
                              {page.criticalCount > 0 && (
                                <Badge
                                  variant="default"
                                  className="bg-[#E11D48] hover:bg-[#E11D48] font-mono"
                                >
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
                          ) : (
                            <span className="font-mono">
                              Error: {page.errorMessage}
                            </span>
                          )}
                        </div>
                      )}

                      {pageIssues.length > 0 || selectedRules.length >= 2 ? (
                        <div className="space-y-3">
                          {pageIssues.length > 0 ||
                          selectedRules.length >= 2 ? (
                            <IssueFilterBar
                              issues={pageIssues}
                              filters={filters}
                              onChange={setFilters}
                              singleRule={selectedRules.length === 1}
                              selectedRules={selectedRules}
                              ruleInfoMap={ruleInfoMap}
                            />
                          ) : null}
                          {pageIssues.length === 0 &&
                            page.status === "completed" && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                No accessibility issues found on this page.
                              </div>
                            )}
                          <IssueGroupList
                            issues={pageIssues}
                            filters={filters}
                            pageUrl={page.url}
                            selectedRules={selectedRules}
                            ruleInfoMap={ruleInfoMap}
                            selectedIssueId={
                              viewerSel?.pageUrl === page.url
                                ? viewerSel.issue.id
                                : undefined
                            }
                            onSelectOccurrence={
                              viewerEnabled
                                ? (issue, group) =>
                                    handleSelectOccurrence(
                                      issue,
                                      group,
                                      page.url,
                                      page.id,
                                    )
                                : undefined
                            }
                          />
                        </div>
                      ) : page.status === "completed" ? (
                        <div className="p-8 text-center text-muted-foreground border rounded-md mt-4 border-dashed bg-muted/10">
                          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2 opacity-50" />
                          No accessibility issues found on this page.
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
                      })
                    }
                  >
                    Clear all filters
                  </button>
                </div>
              )}
          </div>
        )}

      {/* Live running state view */}
      {isActive && liveStatus?.pages && liveStatus.pages.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Live Progress</h3>
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
            const inQueue     = liveStatus.pages.filter(p => p.status === "navigating").length;
            const scanning    = liveStatus.pages.filter(p => activeSet.has(p.status)).length;
            const done        = liveStatus.pages.filter(p => p.status === "completed").length;
            const pending     = liveStatus.pages.filter(p => p.status === "pending").length;
            const retry       = liveStatus.pages.filter(p => p.status === "requeued").length;
            const failed      = liveStatus.pages.filter(p => p.status === "failed").length;
            const notAvail    = liveStatus.pages.filter(p => p.status === "not_available").length;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
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
              </div>
            );
          })()}

          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium">URL</th>
                    <th className="text-left p-3 font-medium">Stage</th>
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
                      <td className="p-3 text-right">
                        {p.issueCount > 0 ? (
                          <span className="font-mono">{p.issueCount}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {p.status === "failed" || p.status === "pending" ? (
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

      {/* Element Viewer modal */}
      <Dialog
        open={!!viewerSel}
        onOpenChange={(open) => {
          if (!open) setViewerSel(null);
        }}
      >
        <DialogContent
          className="max-w-4xl w-full p-0 overflow-hidden flex flex-col"
          style={{ maxHeight: "90vh", height: "90vh" }}
          aria-describedby={undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Element Viewer</DialogTitle>
          </DialogHeader>
          {viewerSel && (
            <ElementViewer
              pageUrl={viewerSel.pageUrl}
              pageId={viewerSel.pageId}
              group={viewerSel.group}
              groupIndex={viewerSel.groupIndex}
              showClose={false}
              onNavigate={(idx) =>
                setViewerSel((s) =>
                  s ? { ...s, groupIndex: idx, issue: s.group[idx] } : s,
                )
              }
              onClose={() => setViewerSel(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
