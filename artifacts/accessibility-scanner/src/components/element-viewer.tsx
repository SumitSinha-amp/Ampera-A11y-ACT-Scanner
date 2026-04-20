import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Code2,
  Monitor,
  Search,
} from "lucide-react";

export interface ViewerIssue {
  id: number;
  ruleId: string;
  impact: string;
  description: string;
  element: string | null;
  selector: string | null;
  wcagCriteria: string | null;
  wcagLevel: string | null;
  legalText?: string | null;
  remediation: string | null;
  bboxX?: number | null;
  bboxY?: number | null;
  bboxWidth?: number | null;
  bboxHeight?: number | null;
}

interface ElementViewerProps {
  pageUrl: string;
  pageId: number;
  group: ViewerIssue[];
  groupIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  showClose?: boolean;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchPageSource(
  url: string,
  pageId?: number
): Promise<{ html: string; statusCode: number }> {
  // Prefer stored Puppeteer-rendered HTML (bypasses WAF / bot protection)
  if (pageId != null) {
    const stored = await fetch(`${BASE_URL}/api/pages/${pageId}/html`);
    if (stored.ok) return stored.json();
  }
  // Fallback: live HTTP fetch (may be blocked by some sites)
  const resp = await fetch(
    `${BASE_URL}/api/page-source?url=${encodeURIComponent(url)}`
  );
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Single-pass HTML tokenizer — correctly handles nested quotes so the spans
// injected for one token can never be re-matched by a subsequent pattern.
function colorizeHtml(raw: string): string {
  let out = "";
  let i = 0;
  const len = raw.length;

  function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function span(color: string, content: string) {
    return `<span style="color:${color}">${content}</span>`;
  }

  function colorAttrs(s: string): string {
    let r = "";
    let j = 0;
    while (j < s.length) {
      if (/\s/.test(s[j])) { r += s[j++]; continue; }
      // attribute name
      const nameEnd = s.slice(j).search(/[\s=>/]/);
      const name = nameEnd === -1 ? s.slice(j) : s.slice(j, j + nameEnd);
      if (!name) { r += esc(s[j++]); continue; }
      r += span("#9cdcfe", esc(name));
      j += name.length;
      if (j >= s.length || s[j] !== "=") continue;
      r += span("#569cd6", "=");
      j++;
      if (j >= s.length) break;
      const q = s[j];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, j + 1);
        const val = close === -1 ? s.slice(j) : s.slice(j, close + 1);
        r += span("#ce9178", esc(val));
        j += val.length;
      } else {
        const unq = s.slice(j).search(/[\s>]/);
        const val = unq === -1 ? s.slice(j) : s.slice(j, j + unq);
        r += span("#ce9178", esc(val));
        j += val.length;
      }
    }
    return r;
  }

  while (i < len) {
    if (raw.startsWith("<!--", i)) {
      const end = raw.indexOf("-->", i + 4);
      const token = end === -1 ? raw.slice(i) : raw.slice(i, end + 3);
      out += span("#6a9955", esc(token));
      i += token.length;
    } else if (raw.startsWith("<!", i)) {
      const end = raw.indexOf(">", i);
      const token = end === -1 ? raw.slice(i) : raw.slice(i, end + 1);
      out += span("#569cd6", esc(token));
      i += token.length;
    } else if (raw.startsWith("</", i)) {
      const end = raw.indexOf(">", i);
      if (end === -1) { out += esc(raw.slice(i)); break; }
      const tag = raw.slice(i + 2, end).trim();
      out += span("#569cd6", "&lt;/") + span("#4ec9b0", esc(tag)) + span("#569cd6", "&gt;");
      i = end + 1;
    } else if (raw[i] === "<") {
      // Opening / self-closing tag — find end respecting quoted attrs
      let end = -1;
      let inQ: string | null = null;
      for (let j = i + 1; j < len; j++) {
        if (inQ) { if (raw[j] === inQ) inQ = null; }
        else if (raw[j] === '"' || raw[j] === "'") { inQ = raw[j]; }
        else if (raw[j] === ">") { end = j; break; }
      }
      if (end === -1) { out += esc(raw.slice(i)); break; }
      const inner = raw.slice(i + 1, end); // e.g. `div class="foo"` or `div class="foo"/`
      const selfClose = inner.endsWith("/");
      const body = selfClose ? inner.slice(0, -1) : inner;
      const nameMatch = body.match(/^([\w:.-]+)([\s\S]*)/);
      if (!nameMatch) { out += esc(raw.slice(i, end + 1)); i = end + 1; continue; }
      const [, tagName, attrPart] = nameMatch;
      out += span("#569cd6", "&lt;") +
             span("#4ec9b0", esc(tagName)) +
             colorAttrs(attrPart) +
             (selfClose ? span("#569cd6", "/") : "") +
             span("#569cd6", "&gt;");
      i = end + 1;
    } else {
      // Text — collect until next <
      const next = raw.indexOf("<", i);
      const text = next === -1 ? raw.slice(i) : raw.slice(i, next);
      out += esc(text);
      i += text.length;
    }
  }
  return out;
}

function findMatchLines(
  lines: string[],
  issue: ViewerIssue
): Set<number> {
  const matches = new Set<number>();

  if (issue.element) {
    const snippet = issue.element
      .trim()
      .split("\n")[0]
      .trim()
      .substring(0, 60);
    if (snippet.length > 4) {
      lines.forEach((line, idx) => {
        if (line.includes(snippet)) matches.add(idx);
      });
    }
  }

  if (matches.size === 0 && issue.selector) {
    const classes = Array.from(
      issue.selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)
    ).map((m) => m[1]);
    if (classes.length > 0) {
      lines.forEach((line, idx) => {
        if (classes.every((cls) => line.includes(cls))) matches.add(idx);
      });
    }
  }

  return matches;
}

// ── Snapshot view with element highlight overlay ──────────────────────────
function SnapshotView({
  pageId,
  bboxX,
  bboxY,
  bboxWidth,
  bboxHeight,
  onError,
}: {
  pageId: number;
  bboxX: number | null;
  bboxY: number | null;
  bboxWidth: number | null;
  bboxHeight: number | null;
  onError: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displayWidth, setDisplayWidth] = useState<number>(0);
  const snapshotUrl = `${BASE_URL}/api/pages/${pageId}/snapshot`;

  const hasBbox =
    bboxX != null && bboxY != null && bboxWidth != null && bboxHeight != null && bboxWidth > 0 && bboxHeight > 0;

  // Track the rendered image width to calculate scale
  useEffect(() => {
    if (!imgRef.current || !naturalSize) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDisplayWidth(e.contentRect.width);
      }
    });
    obs.observe(imgRef.current);
    return () => obs.disconnect();
  }, [naturalSize]);

  // Auto-scroll to the element after image loads
  useEffect(() => {
    if (!containerRef.current || !naturalSize || !hasBbox || displayWidth === 0) return;
    const scale = displayWidth / naturalSize.w;
    const elementY = (bboxY as number) * scale;
    const elementH = (bboxHeight as number) * scale;
    const scrollTarget = Math.max(0, elementY - 120);
    containerRef.current.scrollTo({ top: scrollTarget, behavior: "smooth" });
  }, [naturalSize, displayWidth, bboxY, bboxHeight, hasBbox]);

  const scale = naturalSize && displayWidth > 0 ? displayWidth / naturalSize.w : 1;

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto">
      <div className="relative inline-block w-full">
        <img
          ref={imgRef}
          src={snapshotUrl}
          alt="Page snapshot"
          className="w-full block"
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          onError={onError}
          draggable={false}
        />
        {hasBbox && naturalSize && displayWidth > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${(bboxX as number) * scale}px`,
              top: `${(bboxY as number) * scale}px`,
              width: `${(bboxWidth as number) * scale}px`,
              height: `${(bboxHeight as number) * scale}px`,
              outline: "3px solid #f59e0b",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
              borderRadius: "2px",
            }}
          >
            {/* pulsing corner pip */}
            <span
              className="absolute -top-2 -left-2 h-3.5 w-3.5 rounded-full bg-amber-400 animate-ping opacity-75"
            />
            <span
              className="absolute -top-2 -left-2 h-3.5 w-3.5 rounded-full bg-amber-400"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ElementViewer({
  pageUrl,
  pageId,
  group,
  groupIndex,
  onNavigate,
  onClose,
  showClose = true,
}: ElementViewerProps) {
  const [tab, setTab] = useState<"html" | "live">("html");
  const [htmlSource, setHtmlSource] = useState<string | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState(false);

  const currentIssue = group[groupIndex] ?? group[0];

  useEffect(() => {
    setHtmlSource(null);
    setHtmlError(null);
    setHtmlLoading(false);
    setSnapshotError(false);
  }, [pageUrl]);

  useEffect(() => {
    if (tab !== "html" || htmlSource !== null || htmlLoading) return;
    setHtmlLoading(true);
    setHtmlError(null);
    fetchPageSource(pageUrl, pageId)
      .then(({ html }) => {
        setHtmlSource(html);
        setHtmlLoading(false);
      })
      .catch((e) => {
        setHtmlError(String(e));
        setHtmlLoading(false);
      });
  }, [tab, pageUrl, htmlSource, htmlLoading]);

  const { lines, matchLines } = useMemo(() => {
    if (!htmlSource) return { lines: [] as string[], matchLines: new Set<number>() };
    const ls = htmlSource.split("\n");
    return { lines: ls, matchLines: findMatchLines(ls, currentIssue) };
  }, [htmlSource, currentIssue]);

  const scrollToMatch = useCallback(() => {
    const el = document.getElementById("elv-match-0");
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (htmlSource && matchLines.size > 0) {
      setTimeout(scrollToMatch, 80);
    }
  }, [htmlSource, matchLines, scrollToMatch]);

  const impactColor: Record<string, string> = {
    critical: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
    serious: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
    moderate: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
    minor: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-card shadow-md overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-start gap-2 px-3 py-2.5 border-b bg-muted/20 shrink-0">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={`font-mono text-[11px] shrink-0 ${impactColor[currentIssue.impact] ?? ""}`}
            >
              {currentIssue.ruleId}
            </Badge>
            {currentIssue.wcagCriteria && (
              <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                WCAG {currentIssue.wcagCriteria}
              </Badge>
            )}
            {currentIssue.wcagLevel && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                Level {currentIssue.wcagLevel}
              </Badge>
            )}
            {currentIssue.legalText && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {currentIssue.legalText}
              </Badge>
            )}
          </div>
          <p className="text-xs font-medium text-foreground/80 leading-snug line-clamp-2">
            {currentIssue.description}
          </p>
          {currentIssue.selector && (
            <code className="block text-[10px] text-primary/70 font-mono truncate">
              {currentIssue.selector}
            </code>
          )}
        </div>
        {showClose && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-1 shrink-0 mt-0.5"
            onClick={onClose}
            title="Close viewer"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* ── Navigation ── */}
      {group.length > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-background/50 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => onNavigate(groupIndex - 1)}
            disabled={groupIndex === 0}
          >
            <ChevronLeft className="w-3 h-3" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {groupIndex + 1} / {group.length} occurrences
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => onNavigate(groupIndex + 1)}
            disabled={groupIndex >= group.length - 1}
          >
            Next
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "html" | "live")}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-3 pt-2 shrink-0">
          <TabsList className="h-7 p-0.5 gap-0.5">
            <TabsTrigger value="html" className="h-6 text-xs px-2.5 gap-1">
              <Code2 className="w-3 h-3" />
              HTML Source
            </TabsTrigger>
            <TabsTrigger value="live" className="h-6 text-xs px-2.5 gap-1">
              <Monitor className="w-3 h-3" />
              Live Preview
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── HTML Source ── */}
        <TabsContent
          value="html"
          className="flex-1 flex flex-col overflow-hidden px-3 pb-3 pt-2 mt-0"
        >
          {htmlLoading && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Fetching HTML source…</span>
            </div>
          )}
          {htmlError && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-4">
              <AlertTriangle className="w-8 h-8 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium">Could not load HTML source</p>
                <p className="text-xs text-muted-foreground mt-1 break-all">{htmlError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHtmlError(null);
                  setHtmlLoading(false);
                  setHtmlSource(null);
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {!htmlLoading && !htmlError && htmlSource && (
            <div className="flex-1 flex flex-col overflow-hidden gap-2">
              <div className="flex items-center justify-between shrink-0">
                <p className="text-xs text-muted-foreground">
                  {lines.length.toLocaleString()} lines
                  {matchLines.size > 0 && (
                    <span className="text-yellow-600 dark:text-yellow-400 ml-2 font-medium">
                      · {matchLines.size} element match{matchLines.size !== 1 ? "es" : ""} highlighted
                    </span>
                  )}
                  {matchLines.size === 0 && (
                    <span className="text-muted-foreground/60 ml-2">· no exact match found</span>
                  )}
                </p>
                {matchLines.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2 gap-1 shrink-0"
                    onClick={scrollToMatch}
                  >
                    <Search className="w-3 h-3" />
                    Jump to element
                  </Button>
                )}
              </div>

              <div
                className="flex-1 overflow-auto rounded-md border font-mono text-[11px] leading-relaxed"
                style={{ background: "#0d1117", color: "#c9d1d9" }}
              >
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, idx) => {
                      const isMatch = matchLines.has(idx);
                      const matchIdx = isMatch
                        ? Array.from(matchLines).indexOf(idx)
                        : -1;
                      return (
                        <tr
                          key={idx}
                          id={matchIdx === 0 ? "elv-match-0" : undefined}
                          style={
                            isMatch
                              ? { background: "rgba(210,153,34,0.18)" }
                              : undefined
                          }
                        >
                          <td
                            className="select-none text-right pr-3 pl-2 py-0 w-10 sticky left-0"
                            style={{
                              color: "#484f58",
                              borderRight: "1px solid #21262d",
                              background: "#0d1117",
                              minWidth: "2.5rem",
                            }}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className="px-3 py-0 whitespace-pre-wrap break-all"
                            style={
                              isMatch
                                ? { borderLeft: "2px solid #d29522" }
                                : undefined
                            }
                          >
                            <span
                              dangerouslySetInnerHTML={{
                                __html: colorizeHtml(line) || " ",
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Snapshot Preview ── */}
        <TabsContent
          value="live"
          className="flex-1 flex flex-col overflow-hidden px-3 pb-3 pt-2 mt-0"
        >
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            {/* URL bar + open link */}
            <div className="flex items-center justify-between shrink-0 gap-2">
              <p className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
                {pageUrl}
              </p>
              <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1">
                  <ExternalLink className="w-3 h-3" />
                  Open
                </Button>
              </a>
            </div>

            {/* Snapshot + highlight */}
            <div className="flex-1 border rounded-md overflow-auto relative bg-muted/10">
              {snapshotError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
                  <Monitor className="w-10 h-10 text-muted-foreground/20" />
                  <p className="text-sm font-medium text-muted-foreground">
                    No snapshot available
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Snapshots are captured during scanning. Re-run the scan to generate one.
                  </p>
                </div>
              ) : (
                <SnapshotView
                  pageId={pageId}
                  bboxX={currentIssue.bboxX ?? null}
                  bboxY={currentIssue.bboxY ?? null}
                  bboxWidth={currentIssue.bboxWidth ?? null}
                  bboxHeight={currentIssue.bboxHeight ?? null}
                  onError={() => setSnapshotError(true)}
                />
              )}
            </div>

            {/* Selector chip */}
            {currentIssue.selector && (
              <div className="shrink-0 flex items-center gap-2 p-2 rounded-md border bg-primary/5 border-primary/20">
                <Search className="w-3.5 h-3.5 text-primary shrink-0" />
                <code className="text-[11px] text-primary font-mono truncate">
                  {currentIssue.selector}
                </code>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
