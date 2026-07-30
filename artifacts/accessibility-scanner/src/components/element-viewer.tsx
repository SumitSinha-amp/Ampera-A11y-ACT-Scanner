import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Code2,
  Monitor,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Eye,
  EyeOff,
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
  if (pageId != null) {
    const stored = await fetch(`${BASE_URL}/api/pages/${pageId}/html`);
    if (stored.ok) return stored.json();
  }
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
      let end = -1;
      let inQ: string | null = null;
      for (let j = i + 1; j < len; j++) {
        if (inQ) { if (raw[j] === inQ) inQ = null; }
        else if (raw[j] === '"' || raw[j] === "'") { inQ = raw[j]; }
        else if (raw[j] === ">") { end = j; break; }
      }
      if (end === -1) { out += esc(raw.slice(i)); break; }
      const inner = raw.slice(i + 1, end);
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

// ── Snapshot handle exposed to parent ─────────────────────────────────────
export interface SnapshotHandle {
  scrollToElement: () => void;
  zoomToElement: (containerW: number, containerH: number) => number | null;
}

// ── Snapshot view with element highlight overlay ───────────────────────────
export const SnapshotView = forwardRef<
  SnapshotHandle,
  {
    pageId: number;
    bboxX: number | null;
    bboxY: number | null;
    bboxWidth: number | null;
    bboxHeight: number | null;
    zoom: number;
    showHighlight: boolean;
    scrollTrigger: number;
    onError: () => void;
    onNaturalSize: (w: number, h: number) => void;
  }
>(function SnapshotView(
  { pageId, bboxX, bboxY, bboxWidth, bboxHeight, zoom, showHighlight, scrollTrigger, onError, onNaturalSize },
  ref
) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const snapshotUrl = `${BASE_URL}/api/pages/${pageId}/snapshot`;

  const hasBbox =
    bboxX != null &&
    bboxY != null &&
    bboxWidth != null &&
    bboxHeight != null &&
    bboxWidth > 0 &&
    bboxHeight > 0;

  // Track container width for zoom calculations
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Derived: the rendered image pixel width = containerWidth * zoom
  const imgPixelWidth = containerWidth > 0 ? containerWidth * zoom : 0;
  const scale = naturalSize && imgPixelWidth > 0 ? imgPixelWidth / naturalSize.w : 1;

  const doScrollToElement = useCallback(() => {
    if (!containerRef.current || !naturalSize || !hasBbox || imgPixelWidth === 0) return;
    const ey = (bboxY as number) * scale;
    const eh = (bboxHeight as number) * scale;
    const ex = (bboxX as number) * scale;
    const ew = (bboxWidth as number) * scale;
    const vH = containerRef.current.clientHeight;
    const vW = containerRef.current.clientWidth;
    const scrollY = Math.max(0, ey + eh / 2 - vH / 2);
    const scrollX = Math.max(0, ex + ew / 2 - vW / 2);
    containerRef.current.scrollTo({ top: scrollY, left: scrollX, behavior: "smooth" });
  }, [naturalSize, hasBbox, imgPixelWidth, scale, bboxY, bboxHeight, bboxX, bboxWidth]);

  useImperativeHandle(ref, () => ({
    scrollToElement: doScrollToElement,
    zoomToElement: (containerW: number, containerH: number) => {
      if (!naturalSize || !hasBbox) return null;
      const targetZoom = Math.min(
        (containerW * 0.65) / ((bboxWidth as number) * (naturalSize ? containerW / naturalSize.w : 1)),
        (containerH * 0.55) / ((bboxHeight as number) * (naturalSize ? containerW / naturalSize.w : 1)),
        6
      );
      return Math.max(1, +targetZoom.toFixed(1));
    },
  }), [doScrollToElement, naturalSize, hasBbox, bboxWidth, bboxHeight]);

  // Auto-scroll when image first loads
  useEffect(() => {
    if (naturalSize && hasBbox && imgPixelWidth > 0) {
      setTimeout(doScrollToElement, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize, imgPixelWidth]);

  // Manual scroll trigger (Jump to element button)
  useEffect(() => {
    if (scrollTrigger > 0) doScrollToElement();
  }, [scrollTrigger, doScrollToElement]);

  const bboxScaled = hasBbox && naturalSize && imgPixelWidth > 0 ? {
    ex: (bboxX as number) * scale,
    ey: (bboxY as number) * scale,
    ew: (bboxWidth as number) * scale,
    eh: (bboxHeight as number) * scale,
    imgW: imgPixelWidth,
    imgH: naturalSize.h * scale,
  } : null;

  const OVERLAY = "rgba(0,0,0,0.45)";

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto">
      <div
        className="relative"
        style={{ width: zoom !== 1 ? `${zoom * 100}%` : "100%", minWidth: "100%" }}
      >
        <img
          ref={imgRef}
          src={snapshotUrl}
          alt="Page snapshot"
          className="block"
          style={{ width: "100%", display: "block" }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            onNaturalSize(img.naturalWidth, img.naturalHeight);
          }}
          onError={onError}
          draggable={false}
        />
        {showHighlight && bboxScaled && (() => {
          const { ex, ey, ew, eh, imgW, imgH } = bboxScaled;
          return (
            <>
              {/* Spotlight dim panels */}
              <div className="absolute pointer-events-none" style={{ left: 0, top: 0, width: imgW, height: ey, background: OVERLAY }} />
              <div className="absolute pointer-events-none" style={{ left: 0, top: ey + eh, width: imgW, height: Math.max(0, imgH - ey - eh), background: OVERLAY }} />
              <div className="absolute pointer-events-none" style={{ left: 0, top: ey, width: Math.max(0, ex), height: eh, background: OVERLAY }} />
              <div className="absolute pointer-events-none" style={{ left: ex + ew, top: ey, width: Math.max(0, imgW - ex - ew), height: eh, background: OVERLAY }} />
              {/* Element highlight border */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${ex}px`,
                  top: `${ey}px`,
                  width: `${ew}px`,
                  height: `${eh}px`,
                  outline: "3px solid #f59e0b",
                  outlineOffset: "1px",
                  borderRadius: "2px",
                  boxShadow: "0 0 0 1px rgba(245,158,11,0.3), 0 0 16px 2px rgba(245,158,11,0.25)",
                }}
              >
                {/* Pulsing beacon */}
                <span className="absolute -top-2 -left-2 h-3.5 w-3.5 rounded-full bg-amber-400 animate-ping opacity-75" />
                <span className="absolute -top-2 -left-2 h-3.5 w-3.5 rounded-full bg-amber-400" />
                {/* Size badge */}
                {ew > 40 && eh > 14 && (
                  <span
                    className="absolute -bottom-5 left-0 text-[9px] font-mono bg-amber-400 text-black px-1 rounded whitespace-nowrap"
                    style={{ lineHeight: "16px" }}
                  >
                    {Math.round(bboxWidth as number)} × {Math.round(bboxHeight as number)} px
                  </span>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
});

// ── Zoom helpers ───────────────────────────────────────────────────────────
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

function clampZoom(z: number) {
  return Math.min(Math.max(z, 0.5), 4);
}

function nearestZoomStep(z: number) {
  return ZOOM_STEPS.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a);
}

// ── Main ElementViewer ─────────────────────────────────────────────────────
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

  // Live preview state
  const [zoom, setZoom] = useState(1);
  const [showHighlight, setShowHighlight] = useState(true);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [snapshotNaturalW, setSnapshotNaturalW] = useState<number | null>(null);
  const snapshotRef = useRef<SnapshotHandle>(null);
  const liveContainerRef = useRef<HTMLDivElement>(null);

  const currentIssue = group[groupIndex] ?? group[0];

  const hasBbox =
    (currentIssue.bboxX ?? null) != null &&
    (currentIssue.bboxY ?? null) != null &&
    (currentIssue.bboxWidth ?? null) != null &&
    (currentIssue.bboxHeight ?? null) != null &&
    (currentIssue.bboxWidth ?? 0) > 0 &&
    (currentIssue.bboxHeight ?? 0) > 0;

  // Reset per page
  useEffect(() => {
    setHtmlSource(null);
    setHtmlError(null);
    setHtmlLoading(false);
    setSnapshotError(false);
    setZoom(1);
    setShowHighlight(true);
    setScrollTrigger(0);
    setSnapshotNaturalW(null);
  }, [pageUrl]);

  // Reset zoom/scroll when issue changes within same page
  useEffect(() => {
    setZoom(1);
    setScrollTrigger((t) => t + 1);
  }, [groupIndex]);

  // Load HTML source
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
  }, [tab, pageUrl, htmlSource, htmlLoading, pageId]);

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

  // Zoom to element: compute optimal zoom so element fills ~55% of viewport
  const handleZoomToElement = useCallback(() => {
    if (!snapshotRef.current || !liveContainerRef.current) return;
    const containerW = liveContainerRef.current.clientWidth;
    const containerH = liveContainerRef.current.clientHeight;
    const optimal = snapshotRef.current.zoomToElement(containerW, containerH);
    if (optimal != null) {
      setZoom(clampZoom(optimal));
      setTimeout(() => snapshotRef.current?.scrollToElement(), 80);
    }
  }, []);

  const impactColor: Record<string, string> = {
    critical: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
    serious: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
    moderate: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-400",
    minor: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
  };

  // Percentage label for zoom — show actual viewport scale when snapshot natural width is known
  const zoomLabel = useMemo(() => {
    if (snapshotNaturalW && liveContainerRef.current) {
      const containerW = liveContainerRef.current.clientWidth;
      const viewportScalePct = Math.round((containerW * zoom / snapshotNaturalW) * 100);
      return `${Math.round(zoom * 100)}% (${viewportScalePct}% real)`;
    }
    return `${Math.round(zoom * 100)}%`;
  }, [zoom, snapshotNaturalW]);

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
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => onNavigate(0)}
              disabled={groupIndex === 0}
              title="First occurrence"
            >
              <ChevronsLeft className="w-3 h-3" />
            </Button>
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
          </div>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {groupIndex + 1} / {group.length > 99 ? "99+" : group.length} occurrences
          </span>
          <div className="flex items-center gap-0.5">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => onNavigate(group.length - 1)}
              disabled={groupIndex >= group.length - 1}
              title="Last occurrence"
            >
              <ChevronsRight className="w-3 h-3" />
            </Button>
          </div>
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

        {/* ── Snapshot / Live Preview ── */}
        <TabsContent
          value="live"
          className="flex-1 flex flex-col overflow-hidden px-3 pb-3 pt-2 mt-0"
        >
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            {/* URL bar */}
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

            {/* ── Snapshot toolbar ── */}
            {!snapshotError && (
              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                {/* Highlight toggle */}
                <Button
                  variant={showHighlight ? "secondary" : "outline"}
                  size="sm"
                  className="h-6 text-xs px-2 gap-1"
                  onClick={() => setShowHighlight((v) => !v)}
                  title={showHighlight ? "Hide element highlight" : "Show element highlight"}
                  disabled={!hasBbox}
                >
                  {showHighlight ? (
                    <Eye className="w-3 h-3 text-amber-500" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  Highlight
                </Button>

                <div className="w-px h-4 bg-border mx-0.5" />

                {/* Zoom controls */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    const cur = nearestZoomStep(zoom);
                    const idx = ZOOM_STEPS.indexOf(cur);
                    setZoom(ZOOM_STEPS[Math.max(0, idx - 1)]);
                  }}
                  disabled={zoom <= ZOOM_STEPS[0]}
                  title="Zoom out"
                >
                  <ZoomOut className="w-3 h-3" />
                </Button>
                <span
                  className="text-[10px] font-mono text-muted-foreground tabular-nums min-w-[2.5rem] text-center cursor-default select-none"
                  title={zoomLabel}
                >
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    const cur = nearestZoomStep(zoom);
                    const idx = ZOOM_STEPS.indexOf(cur);
                    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx + 1)]);
                  }}
                  disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  title="Zoom in"
                >
                  <ZoomIn className="w-3 h-3" />
                </Button>

                {/* Fit to width */}
                <Button
                  variant={zoom === 1 ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setZoom(1)}
                  title="Fit to width (1×)"
                >
                  Fit
                </Button>

                <div className="w-px h-4 bg-border mx-0.5" />

                {/* Jump to element (re-scroll) */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 gap-1"
                  onClick={() => setScrollTrigger((t) => t + 1)}
                  disabled={!hasBbox}
                  title="Scroll snapshot back to highlighted element"
                >
                  <Crosshair className="w-3 h-3" />
                  Jump
                </Button>

                {/* Zoom to element */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700"
                  onClick={handleZoomToElement}
                  disabled={!hasBbox}
                  title="Zoom in to show element at full size"
                >
                  <Maximize2 className="w-3 h-3" />
                  Zoom to element
                </Button>
              </div>
            )}

            {/* Snapshot area */}
            <div ref={liveContainerRef} className="flex-1 border rounded-md overflow-hidden relative bg-muted/10">
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
                  ref={snapshotRef}
                  pageId={pageId}
                  bboxX={currentIssue.bboxX ?? null}
                  bboxY={currentIssue.bboxY ?? null}
                  bboxWidth={currentIssue.bboxWidth ?? null}
                  bboxHeight={currentIssue.bboxHeight ?? null}
                  zoom={zoom}
                  showHighlight={showHighlight}
                  scrollTrigger={scrollTrigger}
                  onError={() => setSnapshotError(true)}
                  onNaturalSize={(w) => setSnapshotNaturalW(w)}
                />
              )}
            </div>

            {/* Selector chip */}
            {currentIssue.selector && (
              <div className="shrink-0 flex items-center gap-2 p-2 rounded-md border bg-primary/5 border-primary/20">
                <Search className="w-3.5 h-3.5 text-primary shrink-0" />
                <code className="text-[11px] text-primary font-mono truncate flex-1">
                  {currentIssue.selector}
                </code>
                {hasBbox && (
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 tabular-nums">
                    {Math.round(currentIssue.bboxX ?? 0)},{Math.round(currentIssue.bboxY ?? 0)}
                    {" "}·{" "}
                    {Math.round(currentIssue.bboxWidth ?? 0)}×{Math.round(currentIssue.bboxHeight ?? 0)}
                  </span>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
