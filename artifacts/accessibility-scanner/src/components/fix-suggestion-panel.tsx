/**
 * Fix Suggestion Panel
 * - Rule engine: inline "Why & Fix" guidance
 * - External AI: opens a full modal with code-aware before/after fix
 */
import { useState, useEffect, useRef } from "react";
import { Lightbulb, Bot, ChevronDown, ChevronUp, Loader2, Code2, AlertCircle, X, CheckCircle2, ArrowRight } from "lucide-react";
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
  why: string;
  impact: string;
  howToFix: string[];
  beforeCode: string;
  afterCode: string;
  notes: string;
}

interface Props {
  ruleId: string;
  description: string;
  element: string | null;
  selector: string | null;
  wcagCriteria?: string | null;
  wcagLevel?: string | null;
  pageUrl?: string | null;
}

export function FixSuggestionPanel({ ruleId, description, element, selector, wcagCriteria, wcagLevel, pageUrl }: Props) {
  const [config, setConfig] = useState<AIConfig | null>(peekAIConfigCache);
  const [suggestion, setSuggestion] = useState<FixSuggestion | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
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
        body: JSON.stringify({ ruleId, description, element, selector, wcagCriteria, wcagLevel, pageUrl }),
      });
      const data = await res.json() as AIAnalysisResult & { error?: string };
      if (!res.ok) throw new Error(data.error || "AI request failed");
      if (mounted.current) {
        setAiResult(data);
        setModalOpen(true);
      }
    } catch (err) {
      if (mounted.current) setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      if (mounted.current) setAiLoading(false);
    }
  };

  const openExistingResult = () => {
    if (aiResult) setModalOpen(true);
  };

  if (!config) return null;
  if (!config.engineEnabled && !config.externalEnabled) return null;
  if (!suggestion && !config.externalEnabled) return null;

  const showAskAI = config.externalEnabled;
  const providerLabel = config.provider === "gemini" ? "Gemini" : "ChatGPT";

  return (
    <>
      <div className="mt-3 rounded-md border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20 overflow-hidden">
        {/* Header */}
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          <Lightbulb className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 flex-1">
            {suggestion ? "Why & Fix" : "Smart Analysis"}
          </span>
          {suggestion && (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-4 border-0 ${
                suggestion.confidence === "high"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : suggestion.confidence === "medium"
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {suggestion.confidence} confidence
            </Badge>
          )}
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2.5">
            {/* Rule-engine suggestion — inline */}
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

            {/* Ask AI button row */}
            {showAskAI && (
              <div className={`${suggestion ? "pt-1 border-t border-violet-200/50 dark:border-violet-800/30" : ""} flex items-center gap-2 flex-wrap`}>
                {aiResult ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={openExistingResult}
                  >
                    <Bot className="w-3 h-3" />
                    View AI Analysis
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    disabled={aiLoading}
                    onClick={askAI}
                  >
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

      {/* AI Result Modal */}
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

            <div className="space-y-5 mt-1">
              {/* Rule / WCAG context bar */}
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="font-mono">{ruleId}</Badge>
                {wcagCriteria && <Badge variant="outline" className="font-mono">WCAG {wcagCriteria}{wcagLevel ? ` Level ${wcagLevel}` : ""}</Badge>}
                {pageUrl && (
                  <span className="text-muted-foreground truncate max-w-xs" title={pageUrl}>{pageUrl}</span>
                )}
              </div>

              {/* Violation summary */}
              <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-md text-sm text-foreground/80">
                {description}
              </div>

              {/* Why it fails */}
              {aiResult.why && (
                <Section icon={<AlertCircle className="w-4 h-4 text-amber-500" />} title="Why it fails">
                  <p className="text-sm text-foreground/85 leading-relaxed">{aiResult.why}</p>
                  {aiResult.impact && (
                    <p className="text-sm text-muted-foreground leading-relaxed mt-1.5 italic">{aiResult.impact}</p>
                  )}
                </Section>
              )}

              {/* How to fix — numbered steps */}
              {aiResult.howToFix.length > 0 && (
                <Section icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} title="How to fix">
                  <ol className="space-y-2">
                    {aiResult.howToFix.map((step, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span>{step.replace(/^Step \d+:\s*/i, "")}</span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Before / After code blocks */}
              {(aiResult.beforeCode || aiResult.afterCode) && (
                <Section icon={<Code2 className="w-4 h-4 text-violet-500" />} title="Code Fix">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {aiResult.beforeCode && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive/70 mb-1.5 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-destructive/60 inline-block" />
                          Before (failing)
                        </p>
                        <pre className="text-[11px] font-mono bg-destructive/5 border border-destructive/20 rounded-md p-3 overflow-x-auto leading-relaxed text-foreground/80 whitespace-pre-wrap break-words min-h-[3rem]">
                          {aiResult.beforeCode}
                        </pre>
                      </div>
                    )}
                    {aiResult.afterCode && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-green-600/80 dark:text-green-400/80 mb-1.5 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500/60 inline-block" />
                          After (fixed)
                        </p>
                        <pre className="text-[11px] font-mono bg-green-50/60 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50 rounded-md p-3 overflow-x-auto leading-relaxed text-foreground/80 whitespace-pre-wrap break-words min-h-[3rem]">
                          {aiResult.afterCode}
                        </pre>
                      </div>
                    )}
                  </div>
                  {/* Arrow between — visible only when both exist and layout is single-col on small screens */}
                  {aiResult.beforeCode && aiResult.afterCode && (
                    <div className="flex sm:hidden justify-center -mt-1">
                      <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                    </div>
                  )}
                </Section>
              )}

              {/* Notes / WCAG techniques */}
              {aiResult.notes && (
                <Section icon={<Lightbulb className="w-4 h-4 text-blue-400" />} title="Additional Notes">
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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
