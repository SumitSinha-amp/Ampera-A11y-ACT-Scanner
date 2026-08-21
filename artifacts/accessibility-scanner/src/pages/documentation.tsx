import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronRight, Hash, Lightbulb, Search, Shield, Zap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import ACT_RULES from "@/lib/actRules";

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
  A: "border-sky-200/80 bg-sky-50/50 text-sky-700 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-300",
  AA: "border-violet-200/80 bg-violet-50/50 text-violet-700 dark:border-violet-800/80 dark:bg-violet-950/40 dark:text-violet-300",
  AAA: "border-fuchsia-200/80 bg-fuchsia-50/50 text-fuchsia-700 dark:border-fuchsia-800/80 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
} as const;

type Level = keyof typeof manualLevelStyles;

const SECTIONS = [
  { 
    id: "guide", label: "User guide", icon: <BookOpen className="h-4 w-4"/>, 
    items: [
      { id: "getting-started", label: "Getting started" },
      { id: "scanner", label: "Scanner capabilities" }
    ] 
  },
  { 
    id: "reference", label: "Reference", icon: <Shield className="h-4 w-4"/>, 
    items: [
      { id: "act-rules", label: "ACT Rules catalog" },
      { id: "manual", label: "Manual criteria" }
    ] 
  },
];

const TOC: Record<string, string[]> = {
  "getting-started": ["Add your targets", "Configure options", "Review results"],
  "scanner": ["Rules coverage", "No cap on issue counts", "Element Viewer"],
};

export default function Documentation() {
  const [activeItem, setActiveItem] = useState("getting-started");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["guide", "reference"]));
  const [search, setSearch] = useState("");

  const toggle = (id: string) => {
    setExpandedSections(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const lowerSearch = search.trim().toLowerCase();
  const isSearching = lowerSearch.length > 0;
  
  const matchedRules = isSearching ? ruleReferences.filter(r => r.id.toLowerCase().includes(lowerSearch) || r.title.toLowerCase().includes(lowerSearch) || r.detail.toLowerCase().includes(lowerSearch)) : [];
  const matchedManual = isSearching ? manualOnlyCriteria.filter(c => c[0].includes(lowerSearch) || c[1].toLowerCase().includes(lowerSearch)) : [];

  return (
    <div className="relative w-full min-h-[calc(100vh-8rem)]">
      <header className="relative mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <BookOpen className="h-5 w-5"/>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Ampera docs</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Reference library and scanner guide</p>
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <Input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Search documentation or rules…" 
            className="h-9 pl-9 text-xs bg-card/40 border-border/60 focus:bg-background shadow-sm"
          />
        </div>
      </header>

      <div className="relative flex flex-col md:flex-row gap-8 items-start">
        {/* Left Sidebar */}
        <nav className="w-full md:w-56 shrink-0 md:sticky md:top-4 space-y-2">
          {SECTIONS.map(sec => (
            <div key={sec.id}>
              <button 
                onClick={() => toggle(sec.id)} 
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${expandedSections.has(sec.id) ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                <span className={expandedSections.has(sec.id) ? "text-primary" : "text-muted-foreground/70"}>{sec.icon}</span>
                {sec.label}
                <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${expandedSections.has(sec.id) ? "rotate-90 text-foreground" : "text-muted-foreground/50"}`}/>
              </button>
              {expandedSections.has(sec.id) && (
                <div className="ml-5 mt-0.5 mb-2 space-y-0.5 border-l border-border/50 pl-3">
                  {sec.items.map(item => (
                    <button 
                      key={item.id} 
                      onClick={() => { setActiveItem(item.id); setSearch(""); }} 
                      className={`block w-full text-left rounded-lg px-2 py-1.5 text-xs transition-colors ${!isSearching && activeItem === item.id ? "text-primary font-semibold bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Main Content */}
        <article className="flex-1 min-w-0 max-w-3xl pb-16">
          {isSearching ? (
            <div className="space-y-8 animate-in fade-in duration-300">
              <h2 className="text-lg font-semibold text-foreground">Search results for "{search}"</h2>
              
              {matchedRules.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">ACT Rules ({matchedRules.length})</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                     <RuleList rules={matchedRules} />
                  </div>
                </div>
              )}

              {matchedManual.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-4 mt-6">Manual Criteria ({matchedManual.length})</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                     <ManualList criteria={matchedManual} />
                  </div>
                </div>
              )}

              {matchedRules.length === 0 && matchedManual.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                   <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                   <p>No results found for "{search}"</p>
                </div>
              )}
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              {activeItem === "getting-started" && <GettingStarted />}
              {activeItem === "scanner" && <ScannerCapabilities />}
              {activeItem === "act-rules" && <ActRules />}
              {activeItem === "manual" && <ManualCriteria />}
            </div>
          )}
        </article>

        {/* Right TOC */}
        <aside className="hidden xl:block w-48 shrink-0 md:sticky md:top-4">
          {TOC[activeItem] && !isSearching && (
            <div className="animate-in fade-in duration-300">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground/70 mb-3">On this page</p>
              <div className="space-y-2">
                {TOC[activeItem].map((t, i) => (
                  <span key={i} className="block w-full text-left text-xs text-muted-foreground">{t}</span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function GettingStarted() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Getting started</h2>
      <p className="text-sm text-muted-foreground mb-8">Create a scan by entering URLs, uploading a CSV, or using a sitemap.xml source.</p>
      
      <div className="space-y-8">
        <div className="space-y-2">
           <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary/50"/> 1. Add your targets</h3>
           <p className="text-sm leading-7 text-muted-foreground">Open New Scan and add one or more URLs. You can paste a list, upload a CSV, or provide a sitemap. The crawler will use this to analyze pages.</p>
        </div>
        <div className="space-y-2">
           <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary/50"/> 2. Configure options</h3>
           <p className="text-sm leading-7 text-muted-foreground">Select specific rules when you want focused validation. Enable proxy mode only when a PAC URL is configured in Settings.</p>
        </div>
        <div className="space-y-2">
           <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary/50"/> 3. Review results</h3>
           <p className="text-sm leading-7 text-muted-foreground">Review scan details, expand issue rows, and export results as CSV, Excel, or PDF. Use the AI fix engine for remediation guidance.</p>
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-blue-200/50 bg-blue-50/50 p-5 dark:border-blue-900/40 dark:bg-blue-950/20 shadow-sm">
        <div className="flex gap-3">
          <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">Pro tip: use Smart Analysis</p>
            <p className="mt-1 text-xs text-blue-800/80 dark:text-blue-400/80 leading-5">Smart Analysis groups issues by component hierarchy across all pages, making it easy to see which shared elements are responsible for the most issues site-wide.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScannerCapabilities() {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Scanner capabilities</h2>
      <p className="text-sm text-muted-foreground mb-8">What the scanner detects, how results are reported, and how to navigate them.</p>

      <div className="space-y-8">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary/50"/> Rules coverage</h3>
          <p className="text-sm leading-7 text-muted-foreground">The scanner implements approximately 83 of the current ACT rules (ACT-R1 – ACT-R118), covering WCAG 2.1 / 2.2 criteria at levels A, AA, and AAA. All rules are validated against industry-leading accessibility platforms for accuracy. Each issue includes a rule ID, impact level, WCAG success criterion, remediation guidance, and the offending element's HTML selector.</p>
        </div>
        
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary/50"/> No cap on issue counts</h3>
          <p className="text-sm leading-7 text-muted-foreground">Every rule reports all occurrences found on a page — there is no artificial ceiling on how many issues are returned. When a rule finds more than 99 occurrences, the count badge shows <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[11px] border border-border/50">99+</span> to keep the display concise while the full list remains available for export.</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary/50"/> Element Viewer</h3>
          <p className="text-sm leading-7 text-muted-foreground">Enable the Element Viewer in Settings to inspect any issue inline. Click an occurrence row to open the viewer, which shows the live page preview alongside the HTML source with the offending element highlighted. Use First / Prev / Next / Last to step through all occurrences of a rule without closing the panel.</p>
        </div>
      </div>
    </div>
  );
}

function ActRules() {
  return (
    <div className="space-y-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">ACT Rules catalog</h2>
          <p className="text-sm text-muted-foreground mt-1">Detailed reference descriptions for scanner rules.</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/30 px-3 py-2 text-xs text-muted-foreground shadow-sm">
          Reference library <span className="font-mono text-primary font-semibold ml-1">{ruleReferences.length} rules</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RuleList rules={ruleReferences} />
      </div>
    </div>
  );
}

function ManualCriteria() {
  return (
    <div className="space-y-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Manual Only (Cannot Be Automated)</h2>
          <p className="text-sm text-muted-foreground mt-1">Human review criteria that require context beyond automated scanning.</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/30 px-3 py-2 text-xs text-muted-foreground shadow-sm">
          <span className="font-mono text-primary font-semibold">{manualOnlyCriteria.length} criteria</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <ManualList criteria={manualOnlyCriteria} />
      </div>
    </div>
  );
}

function RuleList({ rules }: { rules: typeof ruleReferences }) {
  return (
    <TooltipProvider>
      {rules.map((rule) => (
        <div
          key={rule.id}
          className={`rounded-xl border border-border/60 bg-card/40 p-4 space-y-3 transition-colors hover:border-primary/30 hover:bg-card/60 shadow-sm ${rule.deprecated ? "opacity-60 grayscale-[0.5]" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] border-border/70 bg-muted/50 text-foreground px-1.5">
              {rule.id}
            </Badge>
            <h3 className="font-medium text-sm leading-tight">{rule.title}</h3>
            {rule.deprecated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-[10px] border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 cursor-help"
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
          <div className="flex flex-wrap items-center gap-1.5">
            {rule.wcagLevel
              ?.filter((level) => level !== "Best Practice" && level !== "WAI-ARIA")
              .map((level) => (
                <Badge
                  key={level}
                  className="h-5 rounded-md border border-violet-200/60 bg-violet-50/50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-50/50 dark:border-violet-800/60 dark:bg-violet-950/20 dark:text-violet-300"
                >
                  {level}
                </Badge>
              ))}
            {rule.wcagCriteria?.map((criterion) => (
              <Badge
                key={criterion}
                className="h-5 rounded-md border border-sky-200/60 bg-sky-50/50 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-sky-700 hover:bg-sky-50/50 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-300"
              >
                WCAG {criterion}
              </Badge>
            ))}
            {rule.ruleType && (
              <Badge className="h-5 rounded-md border border-slate-200/60 bg-slate-100/50 px-1.5 py-0 text-[10px] font-semibold tracking-wide text-slate-700 hover:bg-slate-100/50 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-300">
                {rule.ruleType}
              </Badge>
            )}
            {rule.eaa && (
              <Badge className="h-5 rounded-md border border-emerald-200/60 bg-emerald-50/50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 hover:bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                EAA
              </Badge>
            )}
            {rule.ada && (
              <Badge className="h-5 rounded-md border border-indigo-200/60 bg-indigo-50/50 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 hover:bg-indigo-50/50 dark:border-indigo-800/60 dark:bg-indigo-950/20 dark:text-indigo-300">
                ADA
              </Badge>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {rule.detail}
          </p>
        </div>
      ))}
    </TooltipProvider>
  );
}

function ManualList({ criteria }: { criteria: readonly (readonly [string, string, string])[] | [string, string, string][] }) {
  return (
    <>
      {criteria.map(([criterion, title, level]) => (
        <div
          key={criterion}
          className="group flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-card/40 px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-muted/40 shadow-sm"
        >
          <Badge
            variant="outline"
            className="h-6 shrink-0 rounded-md border-slate-200/80 bg-slate-50/50 px-1.5 font-mono text-[10px] font-semibold text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/50 dark:text-slate-300"
          >
            {criterion}
          </Badge>
          <span className="min-w-0 flex-1 text-xs font-medium leading-tight text-foreground">
            {title}
          </span>
          <Badge
            variant="outline"
            className={`h-5 shrink-0 rounded-md px-1.5 font-mono text-[10px] font-bold ${manualLevelStyles[level as Level]}`}
          >
            {level}
          </Badge>
        </div>
      ))}
    </>
  );
}
