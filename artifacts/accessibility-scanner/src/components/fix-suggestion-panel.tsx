/**
 * Fix Suggestion Panel
 * - Rule engine: inline "Why & Fix" guidance
 * - External AI: structured remediation modal with copy-enabled code blocks
 */
import { useState, useEffect, useRef } from "react";
import {
  Lightbulb, Bot, ChevronDown, ChevronUp, Loader2, Code2,
  AlertCircle, X, CheckCircle2, HelpCircle, Wrench, FileCode2, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { analyzeIssue, type FixSuggestion } from "@/lib/ai-engine";
import { getAIConfig, peekAIConfigCache, type AIConfig } from "@/components/ai-config-cache";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface AIAnalysisResult {
  whatIsTheIssue: string;
  whyIsItAnIssue: string;
  impact: string;
  whatIsTheFix: string;
  howToFix: string[];
  htmlFix: string;
  htlFix: string;
  jsFix: string;
  cssFix: string;
  beforeCode: string;
  afterCode: string;
  notes: string;
  /** @deprecated */
  why?: string;
}

interface Props {
  ruleId: string;
  description: string;
  element: string | null;
  elementContext?: string | null;
  selector: string | null;
  wcagCriteria?: string | null;
  wcagLevel?: string | null;
  pageUrl?: string | null;
  /** Hide the "Ask AI" button — used in Smart Analysis inline rows */
  hideAI?: boolean;
}

type CodeTab = "html" | "htl" | "js" | "css";

export function FixSuggestionPanel({ ruleId, description, element, elementContext, selector, wcagCriteria, wcagLevel, pageUrl, hideAI = false }: Props) {
  const [config, setConfig] = useState<AIConfig | null>(peekAIConfigCache);
  const [suggestion, setSuggestion] = useState<FixSuggestion | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>("html");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    getAIConfig().then((cfg) => {
      if (!mounted.current) return;
      setConfig(cfg);
      if (cfg.engineEnabled) {
        setSuggestion(analyzeIssue({ ruleId, description, element, selector }));
      }
    });
    return () => { mounted.current = false; };
  }, [ruleId, description, element, selector]);

  const askAI = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`${BASE}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ruleId, description, element, elementContext: elementContext ?? null, selector, wcagCriteria, wcagLevel, pageUrl }),
      });
      const data = await res.json() as AIAnalysisResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "AI request failed");
      if (mounted.current) {
        const firstTab: CodeTab = data.htmlFix ? "html" : data.htlFix ? "htl" : data.jsFix ? "js" : data.cssFix ? "css" : "html";
        setActiveCodeTab(firstTab);
        setAiResult(data);
        setModalOpen(true);
      }
    } catch (err) {
      if (mounted.current) setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      if (mounted.current) setAiLoading(false);
    }
  };

  if (!config) return null;
  if (!config.engineEnabled && !config.externalEnabled) return null;
  if (!suggestion && !config.externalEnabled) return null;

  const showAskAI = config.externalEnabled;
  const providerLabel = config.provider === "gemini" ? "Gemini" : "ChatGPT";

  return (
    <>
      <div className="mt-3 rounded-md border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20 overflow-hidden">
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <Lightbulb className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 flex-1">
            {suggestion ? "Why & Fix" : "Smart Analysis"}
          </span>
          {suggestion && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border-0 ${
              suggestion.confidence === "high" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : suggestion.confidence === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              : "bg-muted text-muted-foreground"
            }`}>
              {suggestion.confidence} confidence
            </Badge>
          )}
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2.5">
            {suggestion && (
              <>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600/70 dark:text-violet-400/70 mb-1">Why this is an issue</p>
                  <p className="text-xs text-foreground/85 leading-relaxed" dangerouslySetInnerHTML={{ __html: suggestion.why }} />
                </div>
                {suggestion.howToFix && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600/70 dark:text-violet-400/70 mb-1">How to fix</p>
                    <p className="text-xs text-foreground/85 leading-relaxed" dangerouslySetInnerHTML={{ __html: suggestion.howToFix }} />
                  </div>
                )}
                {suggestion.codeExample && (
                  <div>
                    <button
                      className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600/70 dark:text-violet-400/70 hover:text-violet-700 dark:hover:text-violet-300 transition-colors mb-1"
                      onClick={() => setShowCode((v) => !v)}
                    >
                      <Code2 className="w-3 h-3" />
                      Code Example
                      {showCode ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {showCode && (
                      <pre className="text-[11px] font-mono bg-background dark:bg-background/80 border border-border/50 rounded p-2.5 overflow-x-auto leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                        {suggestion.codeExample}
                      </pre>
                    )}
                  </div>
                )}
              </>
            )}

            {showAskAI && !hideAI && (
              <div className={`${suggestion ? "pt-1 border-t border-violet-200/50 dark:border-violet-800/30" : ""} flex items-center gap-2 flex-wrap`}>
                {aiResult ? (
                  <Button size="sm" variant="outline"
                    className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={() => setModalOpen(true)}>
                    <Bot className="w-3 h-3" />
                    View AI Analysis
                  </Button>
                ) : (
                  <Button size="sm" variant="outline"
                    className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    disabled={aiLoading} onClick={askAI}>
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                    {aiLoading ? "Analyzing…" : `Ask ${providerLabel} for code-level fix`}
                  </Button>
                )}
                {aiError && (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {aiError}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AI Result Modal ── */}
      {aiResult && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Bot className="w-4 h-4 text-blue-500 shrink-0" />
                AI Accessibility Analysis
                <Badge variant="outline" className="text-[10px] font-normal border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 ml-1">
                  {providerLabel}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-1">

              {/* 1. Rule + WCAG badges */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-sm px-2 py-0.5">{ruleId}</Badge>
                {wcagCriteria && (
                  <Badge variant="outline" className="font-mono text-xs border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                    WCAG {wcagCriteria}{wcagLevel ? ` · Level ${wcagLevel}` : ""}
                  </Badge>
                )}
                {pageUrl && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[280px]" title={pageUrl}>{pageUrl}</span>
                )}
              </div>

              {/* 2. Issue description */}
              <InfoBlock label="Issue Description" icon={<AlertCircle className="w-3.5 h-3.5 text-destructive" />} className="bg-destructive/5 border-destructive/20">
                <p className="text-sm text-foreground/90 leading-relaxed">{description}</p>
              </InfoBlock>

              {/* 3. Affected HTML — show full element with children (elementContext) when available */}
              {(elementContext || element) && (
                <Section icon={<FileCode2 className="w-4 h-4 text-slate-500" />} title="Affected HTML">
                  <CopyableCode code={elementContext || element!} accent="slate" />
                  {selector && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 font-mono break-all">
                      Selector: <span className="text-foreground/70">{selector}</span>
                    </p>
                  )}
                </Section>
              )}

              {/* 4. What is the issue */}
              {aiResult.whatIsTheIssue && (
                <InfoBlock label="What is the issue" icon={<HelpCircle className="w-3.5 h-3.5 text-amber-500" />} className="bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/50">
                  <p className="text-sm text-foreground/90 leading-relaxed font-medium">{aiResult.whatIsTheIssue}</p>
                </InfoBlock>
              )}

              {/* 5. Why it's an issue + impact */}
              {(aiResult.whyIsItAnIssue || aiResult.why) && (
                <Section icon={<AlertCircle className="w-4 h-4 text-amber-500" />} title="Why it's an issue">
                  <p className="text-sm text-foreground/85 leading-relaxed">{aiResult.whyIsItAnIssue || aiResult.why}</p>
                  {aiResult.impact && (
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 italic border-l-2 border-amber-300 dark:border-amber-700 pl-2">
                      {aiResult.impact}
                    </p>
                  )}
                </Section>
              )}

              {/* 6. What is the fix */}
              {aiResult.whatIsTheFix && (
                <InfoBlock label="What is the fix" icon={<Wrench className="w-3.5 h-3.5 text-green-600" />} className="bg-green-50/60 border-green-200 dark:bg-green-950/20 dark:border-green-800/50">
                  <p className="text-sm text-foreground/90 leading-relaxed font-medium">{aiResult.whatIsTheFix}</p>
                </InfoBlock>
              )}

              {/* 7. How to fix — steps */}
              {aiResult.howToFix.length > 0 && (
                <Section icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} title="How to fix">
                  <ol className="space-y-1.5">
                    {aiResult.howToFix.map((step, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span>{step.replace(/^Step \d+[:.]\s*/i, "")}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* 8. Code fixes — tabbed */}
              {/* Use original captured element as "Before" — more complete than AI reconstruction */}
              {(aiResult.htmlFix || aiResult.htlFix || aiResult.jsFix || aiResult.cssFix || element || aiResult.afterCode) && (
                <Section icon={<Code2 className="w-4 h-4 text-violet-500" />} title="Code fix">
                  {/* Tabs — only show tabs that have content */}
                  {(aiResult.htmlFix || aiResult.htlFix || aiResult.jsFix || aiResult.cssFix) && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {aiResult.htmlFix && (
                        <TabBtn active={activeCodeTab === "html"} onClick={() => setActiveCodeTab("html")} label="HTML" color="orange" />
                      )}
                      {aiResult.htlFix && (
                        <TabBtn active={activeCodeTab === "htl"} onClick={() => setActiveCodeTab("htl")} label="HTL (AEM)" color="red" />
                      )}
                      {aiResult.jsFix && (
                        <TabBtn active={activeCodeTab === "js"} onClick={() => setActiveCodeTab("js")} label="JavaScript" color="yellow" />
                      )}
                      {aiResult.cssFix && (
                        <TabBtn active={activeCodeTab === "css"} onClick={() => setActiveCodeTab("css")} label="CSS" color="blue" />
                      )}
                    </div>
                  )}

                  {activeCodeTab === "html" && aiResult.htmlFix && (
                    <CopyableCode code={aiResult.htmlFix} accent="orange" label="HTML fix" />
                  )}
                  {activeCodeTab === "htl" && aiResult.htlFix && (
                    <CopyableCode code={aiResult.htlFix} accent="red" label="HTL (AEM Sightly) fix" />
                  )}
                  {activeCodeTab === "js" && aiResult.jsFix && (
                    <CopyableCode code={aiResult.jsFix} accent="yellow" label="JavaScript fix" />
                  )}
                  {activeCodeTab === "css" && aiResult.cssFix && (
                    <CopyableCode code={aiResult.cssFix} accent="blue" label="CSS fix" />
                  )}

                  {/* Before / After — use elementContext (full element + children) as "Before" */}
                  {(elementContext || element || aiResult.afterCode) && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-3 pt-3 border-t border-border/40">
                      {(elementContext || element || aiResult.beforeCode) && (
                        <CopyableCode
                          code={elementContext ?? element ?? aiResult.beforeCode}
                          accent="red-light"
                          label="Before (failing — original HTML)"
                        />
                      )}
                      {aiResult.afterCode && (
                        <CopyableCode code={aiResult.afterCode} accent="green" label="After (fixed)" />
                      )}
                    </div>
                  )}
                </Section>
              )}

              {/* 9. Notes */}
              {aiResult.notes && (
                <Section icon={<Lightbulb className="w-4 h-4 text-blue-400" />} title="WCAG References">
                  <p className="text-sm text-foreground/75 leading-relaxed">{aiResult.notes}</p>
                </Section>
              )}

              <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-2">{icon}{title}</h3>
      {children}
    </div>
  );
}

function InfoBlock({ label, icon, children, className }: {
  label: string; icon: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-md border p-3 ${className ?? ""}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/60 mb-1.5">{icon}{label}</p>
      {children}
    </div>
  );
}

type Accent = "orange" | "red" | "red-light" | "yellow" | "blue" | "green" | "slate";

const ACCENT_STYLES: Record<Accent, { bg: string; border: string; label: string }> = {
  orange:    { bg: "bg-orange-50/60 dark:bg-orange-950/20",    border: "border-orange-200 dark:border-orange-800/50",    label: "text-orange-700/80 dark:text-orange-400/80" },
  red:       { bg: "bg-red-50/60 dark:bg-red-950/20",          border: "border-red-200 dark:border-red-800/50",          label: "text-red-700/80 dark:text-red-400/80" },
  "red-light": { bg: "bg-destructive/5",                       border: "border-destructive/20",                          label: "text-destructive/70" },
  yellow:    { bg: "bg-yellow-50/60 dark:bg-yellow-950/20",    border: "border-yellow-200 dark:border-yellow-800/50",    label: "text-yellow-700/80 dark:text-yellow-400/80" },
  blue:      { bg: "bg-blue-50/60 dark:bg-blue-950/20",        border: "border-blue-200 dark:border-blue-800/50",        label: "text-blue-700/80 dark:text-blue-400/80" },
  green:     { bg: "bg-green-50/60 dark:bg-green-950/20",      border: "border-green-200 dark:border-green-800/50",      label: "text-green-600/80 dark:text-green-400/80" },
  slate:     { bg: "bg-slate-50 dark:bg-slate-900/60",         border: "border-slate-200 dark:border-slate-700/50",      label: "text-slate-600 dark:text-slate-400" },
};

function CopyableCode({ code, accent, label }: { code: string; accent: Accent; label?: string }) {
  const [copied, setCopied] = useState(false);
  const styles = ACCENT_STYLES[accent];

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      {label && (
        <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${styles.label}`}>{label}</p>
      )}
      <div className="relative group">
        <pre className={`text-[11px] font-mono border rounded-md p-3 pr-10 overflow-x-auto leading-relaxed text-foreground/80 whitespace-pre-wrap break-words ${styles.bg} ${styles.border}`}>
          {code}
        </pre>
        <button
          onClick={copy}
          className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 border border-border/50 hover:bg-muted"
          title="Copy to clipboard"
        >
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-500" />
            : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>
      </div>
    </div>
  );
}

const TAB_ACTIVE: Record<string, string> = {
  orange: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-700",
  red:    "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-700",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-700",
  blue:   "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-700",
};

function TabBtn({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: keyof typeof TAB_ACTIVE }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${
        active ? TAB_ACTIVE[color] : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
      }`}
    >
      {label}
    </button>
  );
}
