import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ACT_RULES from "@/lib/actRules";

// ACT_RULES is the authoritative catalog: a Record keyed by rule ID.
// Documentation must not maintain a second copy of titles or descriptions.
const ruleReferences = Object.entries(ACT_RULES).map(([id, rule]) => ({
  id,
  title: rule.title,
  detail: rule.detail,
  deprecated: rule.deprecated,
  deprecatedReason: rule.deprecatedReason,
  wcagCriteria: rule.wcagCriteria,
  wcagLevel: rule.wcagLevel,
  eaa: rule.eaa,
  ada: rule.ada,
  ruleType: rule.ruleType,
}));

const manualOnlyCriteria = [
  ["1.2.4", "Captions (Live)", "AA"],
  ["1.3.2", "Meaningful Sequence", "A"],
  ["1.3.3", "Sensory Characteristics", "A"],
  ["1.4.5", "Images of Text", "AA"],
  ["1.4.10", "Reflow", "AA"],
  ["1.4.11", "Non-text Contrast", "AA"],
  ["1.4.13", "Content on Hover or Focus", "AA"],
  ["2.1.2", "No Keyboard Trap", "A"],
  ["2.1.4", "Character Key Shortcuts", "A"],
  ["2.2.2", "Pause, Stop, Hide", "A"],
  ["2.3.1", "Three Flashes or Below Threshold", "A"],
  ["2.4.3", "Focus Order", "A"],
  ["2.4.5", "Multiple Ways", "AA"],
  ["2.5.1", "Pointer Gestures", "A"],
  ["2.5.2", "Pointer Cancellation", "A"],
  ["2.5.4", "Motion Actuation", "A"],
  ["3.2.1", "On Focus", "A"],
  ["3.2.2", "On Input", "A"],
  ["3.2.3", "Consistent Navigation", "AA"],
  ["3.2.4", "Consistent Identification", "AA"],
  ["3.3.2", "Labels or Instructions", "A"],
  ["3.3.3", "Error Suggestion", "AA"],
  ["3.3.4", "Error Prevention (Legal, Financial, Data)", "AA"],
  ["2.4.12", "Focus Not Obscured (Enhanced)", "AAA"],
  ["2.5.7", "Dragging Movements", "AA"],
  ["3.2.6", "Consistent Help", "A"],
  ["3.3.7", "Redundant Entry", "A"],
  ["3.3.8", "Accessible Authentication (Minimum)", "AA"],
  ["3.3.9", "Accessible Authentication (Enhanced)", "AAA"],
] as const;

const manualLevelStyles = {
  A: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  AA: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  AAA: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
} as const;

export default function Documentation() {
  return (
    <div className="space-y-6 max-w-8xl">
      <div>
        <Badge variant="secondary" className="mb-3">
          A11y ACT Tool
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-1">
          Help guide for scanning, reviewing results, and using reference
          standards responsibly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Getting started</CardTitle>
          </div>
          <CardDescription>
            Create a scan by entering URLs, uploading a CSV, or using a
            sitemap.xml source.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">1.</span> Open{" "}
            <span className="font-medium">New Scan</span> and add one or more
            URLs.
          </p>
          <p>
            <span className="font-medium text-foreground">2.</span> Select
            specific rules when you want focused validation.
          </p>
          <p>
            <span className="font-medium text-foreground">3.</span> Enable proxy
            mode only when a PAC URL is configured in{" "}
            <span className="font-medium">Settings</span>.
          </p>
          <p>
            <span className="font-medium text-foreground">4.</span> Review scan
            details, expand issue rows, and export results as CSV, Excel, or
            PDF.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Scanner capabilities</CardTitle>
          </div>
          <CardDescription>
            What the scanner detects, how results are reported, and how to
            navigate them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-1">Rules coverage</p>
            <p>
              The scanner implements approximately 83 of the 117 ACT rules
              (ACT-R1 – ACT-R117), covering WCAG 2.1 / 2.2 criteria at levels A,
              AA, and AAA. All rules are validated against industry-leading
              accessibility platforms for accuracy. Each issue includes a rule
              ID, impact level, WCAG success criterion, remediation guidance,
              and the offending element's HTML selector.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">
              No cap on issue counts
            </p>
            <p>
              Every rule reports all occurrences found on a page — there is no
              artificial ceiling on how many issues are returned. When a rule
              finds more than 99 occurrences, the count badge shows{" "}
              <span className="font-mono bg-muted px-1 rounded">99+</span> to
              keep the display concise while the full list remains available for
              export.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Element Viewer</p>
            <p>
              Enable the Element Viewer in{" "}
              <span className="font-medium">Settings</span> to inspect any issue
              inline. Click an occurrence row to open the viewer, which shows
              the live page preview alongside the HTML source with the offending
              element highlighted. Use{" "}
              <span className="font-medium">First</span> /{" "}
              <span className="font-medium">Prev</span> /{" "}
              <span className="font-medium">Next</span> /{" "}
              <span className="font-medium">Last</span> to step through all
              occurrences of a rule without closing the panel.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Smart Analysis</p>
            <p>
              Smart Analysis groups issues by component hierarchy across all
              pages, making it easy to see which shared elements — navigation
              bars, cards, footers — are responsible for the most issues
              site-wide. Click <span className="font-medium">Code View</span> on
              any component to open an interactive HTML tree of the page, with
              the exact offending element highlighted and expanded
              automatically. First / Last navigation buttons allow you to step
              quickly between all occurrences within the Code View panel.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Exports</p>
            <p>
              Completed scans can be exported as CSV, Excel (.xlsx), or PDF.
              Smart Analysis reports can also be exported as a multi-sheet PDF
              summarising components, issue variants, and affected page counts.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Detailed rule descriptions</CardTitle>
          </div>
          <CardDescription>
            Quick reference descriptions for common scanner rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <TooltipProvider>
            {ruleReferences.map((rule) => (
              <div
                key={rule.id}
                className={`rounded-lg border p-4 space-y-2 ${rule.deprecated ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {rule.id}
                  </Badge>
                  <h3 className="font-medium text-sm">{rule.title}</h3>
                  {rule.deprecated && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-xs border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 cursor-help"
                        >
                          Deprecated
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        {rule.deprecatedReason}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {rule.wcagLevel
                    ?.filter(
                      (level) =>
                        level !== "Best Practice" && level !== "WAI-ARIA",
                    )
                    .map((level) => (
                      <Badge
                        key={level}
                        className="h-5 rounded-sm border border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                      >
                        {level}
                      </Badge>
                    ))}
                  {rule.wcagCriteria?.map((criterion) => (
                    <Badge
                      key={criterion}
                      className="h-5 rounded-sm border border-sky-200 bg-sky-50 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                    >
                      WCAG {criterion}
                    </Badge>
                  ))}
                  {rule.ruleType && (
                    <Badge className="h-5 rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {rule.ruleType}
                    </Badge>
                  )}
                  {rule.eaa && (
                    <Badge className="h-5 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      EAA
                    </Badge>
                  )}
                  {rule.ada && (
                    <Badge className="h-5 rounded-sm border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                      ADA
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-6">
                  {rule.detail}
                </p>
              </div>
            ))}
          </TooltipProvider>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Manual Only (Cannot Be Automated)</CardTitle>
              <CardDescription className="mt-1">
                Human review criteria that require context beyond automated scanning.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {manualOnlyCriteria.length} criteria
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Conformance level</span>
            {(["A", "AA", "AAA"] as const).map((level) => (
              <span key={level} className="inline-flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`h-5 rounded-md px-1.5 font-mono text-[10px] font-bold ${manualLevelStyles[level]}`}
                >
                  {level}
                </Badge>
                {level === "A" ? "essential" : level === "AA" ? "standard" : "enhanced"}
              </span>
            ))}
          </div>
          <div
            role="list"
            aria-label="Manual-only WCAG criteria"
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {manualOnlyCriteria.map(([criterion, title, level]) => (
              <div
                key={criterion}
                role="listitem"
                className="group flex min-h-11 items-center gap-2 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <Badge
                  variant="outline"
                  className="h-6 shrink-0 rounded-md border-slate-200 bg-slate-50 px-1.5 font-mono text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  {criterion}
                </Badge>
                <span className="min-w-0 flex-1 text-xs font-medium leading-4 text-foreground">
                  {title}
                </span>
                <Badge
                  variant="outline"
                  className={`h-5 shrink-0 rounded-md px-1.5 font-mono text-[10px] font-bold ${manualLevelStyles[level]}`}
                >
                  {level}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
