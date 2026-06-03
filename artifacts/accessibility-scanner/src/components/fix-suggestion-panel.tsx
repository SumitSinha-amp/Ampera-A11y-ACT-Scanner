/**
 * Fix Suggestion Panel
 * Shows rule-engine "Why & Fix" guidance per accessibility issue.
 * Always offers "Ask AI" button when external AI is configured.
 */
import { useState, useEffect, useRef } from "react";
import { Lightbulb, Bot, ChevronDown, ChevronUp, Loader2, Code2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeIssue, type FixSuggestion } from "@/lib/ai-engine";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface AIConfig {
  engineEnabled: boolean;
  externalEnabled: boolean;
  provider: "gemini" | "openai";
  model: string;
}

// Module-level cache — only one fetch per page load
let _configCache: AIConfig | null = null;
let _configPromise: Promise<AIConfig> | null = null;

async function getAIConfig(): Promise<AIConfig> {
  if (_configCache) return _configCache;
  if (!_configPromise) {
    _configPromise = fetch(`${BASE}/api/ai/config`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        _configCache = data as AIConfig;
        return _configCache;
      })
      .catch(() => {
        _configPromise = null;
        return { engineEnabled: false, externalEnabled: false, provider: "gemini" as const, model: "" };
      });
  }
  return _configPromise;
}

interface Props {
  ruleId: string;
  description: string;
  element: string | null;
  selector: string | null;
}

export function FixSuggestionPanel({ ruleId, description, element, selector }: Props) {
  const [config, setConfig] = useState<AIConfig | null>(_configCache);
  const [suggestion, setSuggestion] = useState<FixSuggestion | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const [aiResult, setAiResult] = useState<{ why: string; howToFix: string; codeExample?: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
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
        body: JSON.stringify({ ruleId, description, element, selector }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      if (mounted.current) setAiResult(data);
    } catch (err) {
      if (mounted.current) setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      if (mounted.current) setAiLoading(false);
    }
  };

  // Nothing to show if both engine and external AI are off
  if (!config) return null;
  if (!config.engineEnabled && !config.externalEnabled) return null;
  // If engine produced no suggestion and external AI is off, nothing to show
  if (!suggestion && !config.externalEnabled) return null;

  const display = aiResult ?? suggestion;
  const isAIResult = !!aiResult;
  const showAskAI = !aiResult && config.externalEnabled;

  return (
    <div className="mt-3 rounded-md border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-950/20 overflow-hidden">
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Lightbulb className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 flex-1">
          {isAIResult ? "AI Analysis" : suggestion ? "Why & Fix" : "Smart Analysis"}
        </span>
        {!isAIResult && suggestion && (
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
        {isAIResult && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            AI
          </Badge>
        )}
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Why & Fix content — shown when rule engine or AI has a result */}
          {display && (
            <>
              {/* Why */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600/70 dark:text-violet-400/70 mb-1">Why this is an issue</p>
                <p
                  className="text-xs text-foreground/85 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: display.why }}
                />
              </div>

              {/* How to fix */}
              {display.howToFix && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600/70 dark:text-violet-400/70 mb-1">How to fix</p>
                  <p
                    className="text-xs text-foreground/85 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: display.howToFix }}
                  />
                </div>
              )}

              {/* Code example */}
              {display.codeExample && (
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
                      {display.codeExample}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}

          {/* Ask AI — always shown when external AI is enabled and no AI result yet */}
          {showAskAI && (
            <div className={`${display ? "pt-1 border-t border-violet-200/50 dark:border-violet-800/30" : ""} flex items-center gap-2 flex-wrap`}>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                disabled={aiLoading}
                onClick={askAI}
              >
                {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                {aiLoading ? "Analyzing…" : `Ask ${config.provider === "gemini" ? "Gemini" : "ChatGPT"} for deeper analysis`}
              </Button>
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
  );
}

// Invalidate the module cache (call after settings change)
export function invalidateAIConfigCache() {
  _configCache = null;
  _configPromise = null;
}
