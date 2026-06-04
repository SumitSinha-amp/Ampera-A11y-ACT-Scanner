import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useAuth } from "@/contexts/auth";
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
} from "lucide-react";
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
import { Copy } from "lucide-react";
import { ElementViewer, type ViewerIssue } from "@/components/element-viewer";
import { isElementViewerEnabled } from "@/pages/settings";
import { FixSuggestionPanel } from "@/components/fix-suggestion-panel";

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

// ── Interactive HTML Tree (Siteimprove-style) ──────────────────────────────────

/**
 * Try progressively weaker strategies to find the DOM element that matches a
 * scanner issue.  Returns the first matching element or null.
 *
 * Strategies (in order, each only tried if the previous failed):
 *  1. Direct `querySelector(selector)`
 *  2. Selector with pseudo-classes stripped (nth-child, pseudo-elements, etc.)
 *  3. Last 1 or 2 segments of the selector chain
 *  4. getElementById / CSS.escape-safe ID lookup
 *  5. Key-attribute query from elementHtml (name, for, href, aria-label, role…)
 *  6. Class + tag query from elementHtml (most-specific class combo first)
 *  7. outerHTML normalised-text fingerprint (opening tag, then full snippet)
 */
function findTargetElement(doc: Document, selector: string, elementHtml: string): Element | null {
  // 1. Direct querySelector
  if (selector) {
    try { const el = doc.querySelector(selector); if (el) return el; } catch { /* invalid */ }
  }

  // 2. Progressively stripped selectors
  if (selector) {
    const strips = [
      selector.replace(/:nth-(?:child|of-type)\([^)]*\)/g, ""),
      selector.replace(/:[a-zA-Z-]+(\([^)]*\))?/g, ""),
      selector.split(/\s*>\s*/).pop() ?? "",
      selector.split(/\s*>\s*/).slice(-2).join(" > "),
      selector.split(/\s*>\s*/).slice(-3).join(" > "),
    ];
    for (const raw of strips) {
      const s = raw.replace(/\s{2,}/g, " ").trim();
      if (s && s !== selector) {
        try { const el = doc.querySelector(s); if (el) return el; } catch { /* ignore */ }
      }
    }
  }

  // 3. ID lookup (from selector or elementHtml)
  const idsToTry = [
    selector?.match(/#([\w-]+)/)?.[1],
    elementHtml?.match(/\sid=["']([^"']+)["']/)?.[1],
  ].filter(Boolean) as string[];
  for (const id of idsToTry) {
    const el = doc.getElementById(id);
    if (el) return el;
  }

  // 4. Key-attribute matching from elementHtml
  if (elementHtml) {
    const tagMatch = elementHtml.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/i);
    const tag = tagMatch?.[1]?.toLowerCase() ?? "*";
    const attrCandidates: [string, string][] = [
      ["name",              elementHtml.match(/\sname=["']([^"']{1,80})["']/)?.[1] ?? ""],
      ["for",               elementHtml.match(/\sfor=["']([^"']{1,80})["']/)?.[1] ?? ""],
      ["href",              elementHtml.match(/\shref=["']([^"']{1,200})["']/)?.[1] ?? ""],
      ["src",               elementHtml.match(/\ssrc=["']([^"']{1,200})["']/)?.[1] ?? ""],
      ["aria-label",        elementHtml.match(/\saria-label=["']([^"']{1,120})["']/)?.[1] ?? ""],
      ["aria-labelledby",   elementHtml.match(/\saria-labelledby=["']([^"']{1,80})["']/)?.[1] ?? ""],
      ["aria-describedby",  elementHtml.match(/\saria-describedby=["']([^"']{1,80})["']/)?.[1] ?? ""],
      ["role",              elementHtml.match(/\srole=["']([^"']{1,40})["']/)?.[1] ?? ""],
      ["type",              elementHtml.match(/\stype=["']([^"']{1,40})["']/)?.[1] ?? ""],
      ["placeholder",       elementHtml.match(/\splaceholder=["']([^"']{1,80})["']/)?.[1] ?? ""],
      ["alt",               elementHtml.match(/\salt=["']([^"']{1,120})["']/)?.[1] ?? ""],
      ["title",             elementHtml.match(/\stitle=["']([^"']{1,120})["']/)?.[1] ?? ""],
    ].filter(([, v]) => v.length > 0) as [string, string][];

    for (const [attr, val] of attrCandidates) {
      try {
        const escaped = val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const candidates = Array.from(doc.querySelectorAll(`${tag}[${attr}="${escaped}"]`));
        if (candidates.length === 1) return candidates[0];
        if (candidates.length > 1 && candidates.length <= 15) {
          // Narrow down using classes
          const cls = elementHtml.match(/\sclass=["']([^"']+)["']/)?.[1]?.trim().split(/\s+/)[0];
          if (cls) { const r = candidates.filter(e => e.classList.contains(cls)); if (r.length >= 1) return r[0]; }
          return candidates[0];
        }
      } catch { /* ignore */ }
    }
  }

  // 5. Class + tag from elementHtml
  if (elementHtml) {
    const tagMatch = elementHtml.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/i);
    const tag = tagMatch?.[1]?.toLowerCase() ?? "*";
    const classStr = elementHtml.match(/\sclass=["']([^"']+)["']/)?.[1];
    if (classStr) {
      const classes = classStr.trim().split(/\s+/).filter(c => c.length > 2 && !/^js-|^is-|^has-/.test(c));
      for (let n = Math.min(classes.length, 3); n >= 1; n--) {
        try {
          const q = `${tag}.${classes.slice(0, n).map(c => CSS.escape(c)).join(".")}`;
          const els = Array.from(doc.querySelectorAll(q));
          if (els.length === 1) return els[0];
          if (els.length > 1 && els.length <= 8) return els[0];
        } catch { /* ignore */ }
      }
    }
  }

  // 6. outerHTML fingerprint — normalised whitespace & lowercase
  if (elementHtml) {
    const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase().trim();
    const normed = norm(elementHtml.trim());
    const openTag = normed.match(/^(<[^>]+>)/)?.[1] ?? "";
    const needles = [
      openTag.slice(0, 200),
      normed.slice(0, 200),
      normed.slice(0, 100),
      normed.slice(0, 60),
    ].filter((c, i, arr) => c.length > 12 && arr.indexOf(c) === i);
    for (const needle of needles) {
      for (const el of Array.from(doc.querySelectorAll("*"))) {
        const oh = norm(el.outerHTML);
        if (oh.startsWith(needle)) return el;
        if (needle.length >= 40 && oh.includes(needle)) return el;
      }
    }
  }

  return null;
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

const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

type HtmlTreeNode = {
  id: string;
  kind: "element" | "text" | "comment";
  tag?: string;
  attrs?: Array<{ name: string; value: string }>;
  children?: HtmlTreeNode[];
  selfClose?: boolean;
  text?: string;
  domEl?: Element;
};

function buildHtmlTree(node: ChildNode, idPrefix: string): HtmlTreeNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").trim();
    if (!text) return null;
    return { id: idPrefix, kind: "text", text };
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return { id: idPrefix, kind: "comment", text: `<!--${node.textContent ?? ""}-->` };
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const attrs = Array.from(el.attributes).map(a => ({ name: a.name, value: a.value }));
    const selfClose = VOID_TAGS.has(el.tagName.toLowerCase());
    const children: HtmlTreeNode[] = [];
    if (!selfClose) {
      let ci = 0;
      for (const child of Array.from(el.childNodes)) {
        const c = buildHtmlTree(child, `${idPrefix}.${ci}`);
        if (c) { children.push(c); ci++; }
      }
    }
    return { id: idPrefix, kind: "element", tag: el.tagName.toLowerCase(), attrs, children, selfClose, domEl: el };
  }
  return null;
}

function collectAncestors(nodes: HtmlTreeNode[], targetEl: Element): { ancestorIds: Set<string>; targetId: string | null } {
  const ancestorIds = new Set<string>();
  let targetId: string | null = null;
  function walk(node: HtmlTreeNode, path: string[]): boolean {
    if (node.domEl === targetEl) {
      path.forEach(id => ancestorIds.add(id));
      ancestorIds.add(node.id);
      targetId = node.id;
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        if (walk(child, [...path, node.id])) return true;
      }
    }
    return false;
  }
  for (const root of nodes) walk(root, []);
  return { ancestorIds, targetId };
}

function HtmlTag({ tag, attrs = [], close = false }: { tag: string; attrs?: Array<{ name: string; value: string }>; close?: boolean }) {
  return (
    <span style={{ fontFamily: "monospace", fontSize: "12px" }}>
      <span style={{ color: "#444" }}>{close ? "</" : "<"}</span>
      <span style={{ color: "#000080", fontWeight: 600 }}>{tag}</span>
      {!close && attrs.map((a, i) => (
        <span key={i}>
          <span> </span>
          <span style={{ color: "#8B0000" }}>{a.name}</span>
          {a.value !== "" && <>
            <span style={{ color: "#555" }}>=</span>
            <span style={{ color: "#006400" }}>"{a.value}"</span>
          </>}
        </span>
      ))}
      <span style={{ color: "#444" }}>{">"}</span>
    </span>
  );
}

const HtmlTreeRow = memo(function HtmlTreeRow({
  node, expandedIds, onToggle, targetId, depth,
}: {
  node: HtmlTreeNode;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  targetId: string | null;
  depth: number;
}) {
  const indent = depth * 16;
  const isTarget = node.id === targetId;

  if (node.kind === "text") {
    return (
      <div data-is-target={isTarget || undefined} style={{ paddingLeft: `${indent + 20}px`, color: "#333", fontSize: "12px", fontFamily: "monospace", lineHeight: "1.8", whiteSpace: "pre-wrap", wordBreak: "break-word", background: isTarget ? "rgba(124,58,237,0.08)" : undefined, outline: isTarget ? "2px solid #7c3aed" : undefined, outlineOffset: "-2px" }}>
        {node.text}
      </div>
    );
  }
  if (node.kind === "comment") {
    return (
      <div style={{ paddingLeft: `${indent + 20}px`, color: "#999", fontStyle: "italic", fontSize: "12px", fontFamily: "monospace", lineHeight: "1.8" }}>
        {node.text}
      </div>
    );
  }

  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <div data-is-target={isTarget || undefined}>
      <div
        onClick={hasChildren ? () => onToggle(node.id) : undefined}
        style={{
          display: "flex", alignItems: "flex-start",
          paddingLeft: `${indent}px`, paddingTop: "1px", paddingBottom: "1px",
          cursor: hasChildren ? "pointer" : "default",
          background: isTarget ? "rgba(124,58,237,0.08)" : undefined,
          outline: isTarget ? "2px solid #7c3aed" : undefined,
          outlineOffset: "-2px",
        }}
      >
        <span style={{ width: "20px", flexShrink: 0, color: "#aaa", userSelect: "none", fontSize: "11px", paddingTop: "3px", textAlign: "center" }}>
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: "1.8" }}>
          {isExpanded || !hasChildren ? (
            <HtmlTag tag={node.tag!} attrs={node.attrs} />
          ) : (
            <span>
              <HtmlTag tag={node.tag!} attrs={node.attrs} />
              <span style={{ color: "#bbb", fontFamily: "monospace", fontSize: "12px" }}> … </span>
              <span style={{ color: "#444", fontFamily: "monospace", fontSize: "12px" }}>{"</"}</span>
              <span style={{ color: "#000080", fontWeight: 600, fontFamily: "monospace", fontSize: "12px" }}>{node.tag}</span>
              <span style={{ color: "#444", fontFamily: "monospace", fontSize: "12px" }}>{">"}</span>
            </span>
          )}
        </div>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map(child => (
            <HtmlTreeRow key={child.id} node={child} expandedIds={expandedIds} onToggle={onToggle} targetId={targetId} depth={depth + 1} />
          ))}
          <div style={{ paddingLeft: `${indent + 20}px`, fontFamily: "monospace", fontSize: "12px", lineHeight: "1.8", color: "#444" }}>
            {"</"}<span style={{ color: "#000080", fontWeight: 600 }}>{node.tag}</span>{">"}
          </div>
        </div>
      )}
    </div>
  );
});

function InteractiveHtmlTree({ pageHtml, elementHtml, selector }: { pageHtml: string; elementHtml: string; selector: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<HtmlTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState<string | null>(null);

  const parsedDocRef = useRef<Document | null>(null);
  const parsedHtmlRef = useRef<string>("");

  useEffect(() => {
    if (!pageHtml) {
      setTree([]);
      parsedDocRef.current = null;
      parsedHtmlRef.current = "";
      return;
    }
    if (pageHtml === parsedHtmlRef.current && parsedDocRef.current) return;
    const doc = new DOMParser().parseFromString(pageHtml, "text/html");
    parsedDocRef.current = doc;
    parsedHtmlRef.current = pageHtml;
    const rootNode = buildHtmlTree(doc.documentElement, "0");
    setTree(rootNode ? [rootNode] : []);
  }, [pageHtml]);

  useEffect(() => {
    const doc = parsedDocRef.current;
    if (!pageHtml || !doc || tree.length === 0) return;

    const targetEl = findTargetElement(doc, selector, elementHtml);

    const newExpanded = new Set<string>();
    let newTarget: string | null = null;

    if (targetEl) {
      const { ancestorIds, targetId: tid } = collectAncestors(tree, targetEl);
      for (const id of ancestorIds) newExpanded.add(id);
      newTarget = tid;
    } else {
      function expandLevels(nodes: HtmlTreeNode[], depth: number) {
        if (depth >= 2) return;
        for (const n of nodes) {
          if (n.kind === "element" && (n.children?.length ?? 0) > 0) {
            newExpanded.add(n.id);
            expandLevels(n.children!, depth + 1);
          }
        }
      }
      expandLevels(tree, 0);
    }

    setExpandedIds(newExpanded);
    setTargetId(newTarget);
  }, [tree, selector, elementHtml, pageHtml]);

  useEffect(() => {
    if (!containerRef.current || !targetId) return;
    const el = containerRef.current.querySelector("[data-is-target]");
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [targetId]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  if (!pageHtml) {
    return (
      <div className="flex-1 overflow-auto bg-white p-5">
        <p className="text-xs text-gray-400 italic mb-2">Full page HTML not stored for this page</p>
        <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: "#1a1a1a" }}>{elementHtml}</pre>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-white py-3 select-text">
      {tree.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Parsing HTML…</span>
        </div>
      ) : (
        tree.map(node => (
          <HtmlTreeRow key={node.id} node={node} expandedIds={expandedIds} onToggle={handleToggle} targetId={targetId} depth={0} />
        ))
      )}
    </div>
  );
}

// ── Types & shared issue-level helpers ────────────────────────────────────────
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
  falsePositive?: boolean;
  falsePositiveNote?: string | null;
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
  impact: string;
  wcagCriteria: string | null;
  wcagLevel: string | null;
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

function ImpactBadge({ impact }: { impact: string }) {
  switch (impact) {
    case "critical":
      return <Badge variant="outline" className="bg-[#E11D48] text-white border-transparent">Critical</Badge>;
    case "serious":
      return <Badge variant="outline" className="bg-[#EA580C] text-white border-transparent">Serious</Badge>;
    case "moderate":
      return <Badge variant="outline" className="bg-[#EAB308] text-black border-transparent">Moderate</Badge>;
    case "minor":
      return <Badge variant="outline" className="bg-[#3B82F6] text-white border-transparent">Minor</Badge>;
    default:
      return <Badge>{impact}</Badge>;
  }
}

function ImpactIcon({ impact }: { impact: string }) {
  switch (impact) {
    case "critical": return <AlertTriangle className="w-4 h-4 text-[#E11D48]" />;
    case "serious":  return <AlertTriangle className="w-4 h-4 text-[#EA580C]" />;
    case "moderate": return <AlertCircle className="w-4 h-4 text-[#EAB308]" />;
    case "minor":    return <Info className="w-4 h-4 text-[#3B82F6]" />;
    default:         return <Info className="w-4 h-4" />;
  }
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
    () => Array.from(new Set([...issues.map((i) => i.ruleId), ...(selectedRules ?? [])])).sort(),
    [issues, selectedRules],
  );
  const wcagCriteria = useMemo(() => {
    const fromIssues = issues.map((i) => i.wcagCriteria).filter(Boolean) as string[];
    const fromSelected = (selectedRules ?? []).map((id) => ruleInfoMap?.[id]?.wcagCriteria).filter(Boolean) as string[];
    return Array.from(new Set([...fromIssues, ...fromSelected])).sort();
  }, [issues, selectedRules, ruleInfoMap]);

  const hasFilters = filters.search || filters.ruleId !== "all" || filters.severity !== "all" || filters.wcag !== "all" || filters.level !== "all";

  if (singleRule) return null;

  return (
    <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Filter className="w-3.5 h-3.5" />
        <span>Filters</span>
        <Button
          variant={filters.hideFalsePositives ? "secondary" : "ghost"}
          size="sm"
          className={`ml-2 h-6 px-2 text-xs gap-1 ${filters.hideFalsePositives ? "text-foreground" : "text-muted-foreground"}`}
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
            className="ml-auto h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onChange({ search: "", ruleId: "all", severity: "all", wcag: "all", level: "all", hideFalsePositives: true })}
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-xs text-muted-foreground font-medium">Search</span>
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
          <span className="text-xs text-muted-foreground font-medium">Rule</span>
          <Select value={filters.ruleId} onValueChange={(v) => onChange({ ...filters, ruleId: v })}>
            <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Rule ID" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {ruleIds.map((id) => <SelectItem key={id} value={id} className="font-mono text-xs">{id}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">Severity</span>
          <Select value={filters.severity} onValueChange={(v) => onChange({ ...filters, severity: v })}>
            <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Severity" /></SelectTrigger>
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
            <span className="text-xs text-muted-foreground font-medium">WCAG</span>
            <Select value={filters.wcag} onValueChange={(v) => onChange({ ...filters, wcag: v })}>
              <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="WCAG" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {wcagCriteria.map((wc) => <SelectItem key={wc} value={wc} className="font-mono text-xs">{wc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">Level</span>
          <Select value={filters.level} onValueChange={(v) => onChange({ ...filters, level: v })}>
            <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue placeholder="Level" /></SelectTrigger>
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

// ── IssueGroupList ────────────────────────────────────────────────────────────
function IssueGroupList({
  issues,
  filters,
  pageUrl,
  onSelectOccurrence,
  selectedIssueId,
  selectedRules,
  ruleInfoMap,
  onFlagIssue,
}: {
  issues: Issue[];
  filters: IssueFilters;
  pageUrl: string;
  onSelectOccurrence?: (issue: Issue, group: Issue[]) => void;
  selectedIssueId?: number;
  selectedRules?: string[];
  ruleInfoMap?: Record<string, RuleInfo>;
  onFlagIssue?: (issue: Issue) => void;
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
      if (filters.hideFalsePositives && issue.falsePositive) return false;
      if (filters.search && !issue.description.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.ruleId !== "all" && issue.ruleId !== filters.ruleId) return false;
      if (filters.severity !== "all" && issue.impact !== filters.severity) return false;
      if (filters.wcag !== "all" && issue.wcagCriteria !== filters.wcag) return false;
      if (filters.level !== "all" && issue.wcagLevel !== filters.level) return false;
      return true;
    });
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

  const showZeroRows =
    (selectedRules?.length ?? 0) >= 2 &&
    filters.severity === "all" &&
    !filters.search &&
    filters.wcag === "all" &&
    filters.level === "all";

  const issueRuleIds = new Set(filteredIssues.map((i) => i.ruleId));
  const zeroRules = showZeroRows
    ? (selectedRules ?? []).filter((r) => !issueRuleIds.has(r) && (filters.ruleId === "all" || filters.ruleId === r))
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
        Showing {filteredIssues.length} issue{filteredIssues.length !== 1 ? "s" : ""} across {groups.length} rule{groups.length !== 1 ? "s" : ""}
        {zeroRules.length > 0 && ` · ${zeroRules.length} rule${zeroRules.length !== 1 ? "s" : ""} with 0 occurrences`}
      </p>
      <Accordion type="multiple" className="space-y-2">
        {groups.map((group) => {
          const first = group[0];
          const count = group.length;
          return (
            <AccordionItem key={first.ruleId} value={first.ruleId} className="border rounded-md bg-muted/20 px-4">
              <AccordionTrigger className="hover:no-underline py-3 items-start">
                <div className="flex flex-col gap-2 w-full pr-3 text-left">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0"><ImpactIcon impact={first.impact} /></span>
                    <span className="font-medium text-sm text-foreground break-words whitespace-normal leading-snug">{first.description}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {count} {count === 1 ? "occurrence" : "occurrences"}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs bg-background">{first.ruleId}</Badge>
                    <ImpactBadge impact={first.impact} />
                    {first.wcagCriteria && <Badge variant="secondary" className="text-xs font-mono">WCAG {first.wcagCriteria}</Badge>}
                    {first.wcagLevel && <Badge variant="outline" className="text-xs">Level {first.wcagLevel}</Badge>}
                    {getLegalText(first) && <Badge variant="outline" className="text-xs">Compliance: {getLegalText(first)}</Badge>}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {first.remediation && (
                  <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-md text-sm">
                    <span className="font-medium text-primary">How to fix: </span>
                    <span className="text-foreground/80">{first.remediation}</span>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">{count} element{count !== 1 ? "s" : ""} affected</p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-10">#</th>
                          <th className="text-left px-3 py-2 font-medium">Selector</th>
                          <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Element</th>
                          {group.some((i) => i.description !== first.description) && (
                            <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Note</th>
                          )}
                          <th className="w-6" />
                          {onSelectOccurrence && <th className="w-28" />}
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((issue, idx) => {
                          const isExpanded = expandedRows.has(issue.id);
                          const hasVariantDesc = issue.description !== first.description;
                          const isSelected = selectedIssueId === issue.id;
                          const isFlagged = issue.falsePositive === true;
                          return (
                            <div key={issue.id} className="contents">
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
                                <td className="px-3 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                                <td className="px-3 py-2 font-mono max-w-[200px]">
                                  {issue.selector ? (
                                    <span className="block truncate text-foreground/80" title={issue.selector}>{issue.selector}</span>
                                  ) : (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden md:table-cell max-w-[300px]">
                                  {issue.element ? (
                                    <code className="block truncate text-primary font-mono" title={issue.element}>
                                      {issue.element.length > 80 ? issue.element.substring(0, 80) + "…" : issue.element}
                                    </code>
                                  ) : (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 hidden xl:table-cell max-w-[380px]">
                                  <div className="flex items-center gap-2">
                                    {issue.element ? (
                                      <>
                                        <code className="block truncate text-foreground/80 font-mono" title={issue.element}>{issue.element}</code>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0"
                                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(issue.element || ""); }}
                                          title="Copy element HTML"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground italic">—</span>
                                    )}
                                  </div>
                                </td>
                                {group.some((i) => i.description !== first.description) && (
                                  <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground max-w-[200px]">
                                    {hasVariantDesc ? (
                                      <span className="truncate block italic" title={issue.description}>{issue.description}</span>
                                    ) : null}
                                  </td>
                                )}
                                <td className="px-3 py-2 text-muted-foreground">
                                  <div className="flex items-center gap-2">
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
                                    {onSelectOccurrence && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[11px] px-2 gap-1 whitespace-nowrap"
                                        onClick={(e) => { e.stopPropagation(); onSelectOccurrence(issue, group); }}
                                      >
                                        View Details
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${issue.id}-detail`} className="bg-primary/5 border-t border-primary/10">
                                  <td
                                    colSpan={(group.some((i) => i.description !== first.description) ? 7 : 6) + (onSelectOccurrence ? 1 : 0)}
                                    className="px-4 py-4"
                                  >
                                    <div className="space-y-3">
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
                                       <FixSuggestionPanel
                                        ruleId={issue.ruleId}
                                        description={issue.description}
                                        element={issue.element ?? null}
                                        selector={issue.selector ?? null}
                                        wcagCriteria={issue.wcagCriteria}
                                        wcagLevel={issue.wcagLevel}
                                        pageUrl={page.url}
                                      />
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

      {zeroRules.length > 0 && (
        <div className="space-y-2 mt-2">
          {zeroRules.map((ruleId) => {
            const info = ruleInfoMap?.[ruleId];
            return (
              <div key={ruleId} className="border rounded-md bg-green-50/40 dark:bg-green-950/10 border-green-200/60 dark:border-green-900/40 px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80 break-words">
                    {SIA_RULES[ruleId]?.title ?? info?.description ?? "No issues detected for this rule on this page."}
                  </p>
                  {SIA_RULES[ruleId]?.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">{SIA_RULES[ruleId].detail}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 font-mono">
                      0 occurrences
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs bg-background">{ruleId}</Badge>
                    {info?.wcagCriteria && <Badge variant="secondary" className="text-xs font-mono">WCAG {info.wcagCriteria}</Badge>}
                    {info?.wcagLevel && <Badge variant="outline" className="text-xs">Level {info.wcagLevel}</Badge>}
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
  const allRules = selectedRules.length === Object.keys(SIA_RULES).length;
  const selectedRulesLabel =
    selectedRules.length === 0
      ? "All rules"
      : allRules
        ? "All rules"
        : selectedRules.map((ruleId) => `${ruleId} — ${SIA_RULES[ruleId]?.title ?? ""}`.trim()).join("; ");
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
}: {
  scan: {
    id: number;
    name?: string | null;
  };
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
        <Button variant="outline" size="sm" disabled={!!exporting}>
          {exporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {exporting ? "Exporting…" : "Export"}
          {!exporting && <ChevronDown className="w-3.5 h-3.5 ml-2 opacity-60" />}
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
    components: SmartComponent[];
  };

  const [smartOpen, setSmartOpen] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartData, setSmartData] = useState<SmartAnalysisData | null>(null);
  const [smartSearch, setSmartSearch] = useState("");
  const [smartImpact, setSmartImpact] = useState("all");
  const [smartRule, setSmartRule] = useState("all");
  const [smartExpanded, setSmartExpanded] = useState<Set<string>>(new Set());
  const [smartUrlFilter, setSmartUrlFilter] = useState("");

  type CodeViewOccurrence = { id: number; ruleId: string; impact: string; element: string; selector: string; description: string; bboxX: number | null; bboxY: number | null; bboxWidth: number | null; bboxHeight: number | null };
  const [codeViewOpen, setCodeViewOpen] = useState(false);
  const [codeViewLoading, setCodeViewLoading] = useState(false);
  const [codeViewUrl, setCodeViewUrl] = useState("");
  const [codeViewComponentName, setCodeViewComponentName] = useState("");
  const [codeViewOccurrences, setCodeViewOccurrences] = useState<CodeViewOccurrence[]>([]);
  const [codeViewSelectedIdx, setCodeViewSelectedIdx] = useState(0);
  const [codeViewPageHtml, setCodeViewPageHtml] = useState("");
  const [codeViewPageId, setCodeViewPageId] = useState<number | null>(null);
  const codeViewHighlightRef = useRef<HTMLSpanElement>(null);
  const [codeViewMode, setCodeViewMode] = useState<"html" | "live">("html");
  const [codeViewExpandedOccs, setCodeViewExpandedOccs] = useState<Set<number>>(new Set());
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
      ["Scan Name", scanLabel],
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
    try {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${BASE}/api/scans/${scanId}/smart-analysis`, { credentials: "include" });
      if (res.ok) setSmartData(await res.json());
    } finally {
      setSmartLoading(false);
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
    setCodeViewUrl(url);
    setCodeViewSelectedIdx(0);
    setCodeViewOccurrences([]);
    setCodeViewPageHtml("");
    setCodeViewPageId(null);
    setCodeViewExpandedOccs(new Set());
    setCodeViewMode("html");
    setCodeViewOpen(true);
    setCodeViewLoading(true);
    try {
      const res = await fetch(
        `${BASE}/api/scans/${scanId}/smart-analysis/page-occurrences?componentName=${encodeURIComponent(comp.componentName)}&pageUrl=${encodeURIComponent(url)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setCodeViewOccurrences(data.occurrences ?? []);
        const pid: number | null = data.pageId ?? null;
        setCodeViewPageId(pid);
        if (pid) {
          const htmlRes = await fetch(`${BASE}/api/pages/${pid}/html`, { credentials: "include" });
          if (htmlRes.ok) {
            const htmlData = await htmlRes.json();
            setCodeViewPageHtml(htmlData.html ?? "");
          }
        }
      }
    } finally {
      setCodeViewLoading(false);
    }
  }

  useEffect(() => {
    if (codeViewOpen && codeViewHighlightRef.current) {
      codeViewHighlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [codeViewOpen, codeViewSelectedIdx, codeViewPageHtml]);

  const filteredSmartComponents = (smartData?.components ?? []).filter(c => {
    if (smartImpact !== "all" && c.worstImpact !== smartImpact) return false;
    if (smartRule !== "all" && !c.ruleIds.includes(smartRule)) return false;
    if (smartSearch && !c.componentName.toLowerCase().includes(smartSearch.toLowerCase()) && !c.hierarchy.toLowerCase().includes(smartSearch.toLowerCase())) return false;
    if (smartUrlFilter && !c.topPages.some(u => u.toLowerCase().includes(smartUrlFilter.toLowerCase()))) return false;
    return true;
  });

  const allSmartRules = [...new Set((smartData?.components ?? []).flatMap(c => c.ruleIds))].sort();

  // ── Edit Scan state ───────────────────────────────────────────────────────
  const { user: authUser } = useAuth();
  const isSuperAdmin = authUser?.role === "super_admin";
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editInitiatorName, setEditInitiatorName] = useState("");
  const [editInitiatorRole, setEditInitiatorRole] = useState("");
  const [editAllUsers, setEditAllUsers] = useState<{ id: number; fullName: string; username: string; groups: { id: number; name: string }[] }[]>([]);
  const editUsersFetched = useRef(false);
  const updateScanMutation = useUpdateScan();

  const openEditDialog = () => {
    setEditName(scan?.name ?? "");
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
      return p.status === pageStatusFilter;
    },
    [pageStatusFilter, pageUrlFilter, pageExtFilter],
  );

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
    };
  }, [scan?.pages]);

  const handleCopyAllUrls = async () => {
    if (!scan?.pages?.length) return;
    const filtered = pageStatusFilter === "all"
      ? scan.pages
      : scan.pages.filter(matchesPageFilter);
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
    <div className="space-y-8">
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
        <DialogContent className="max-w-[90vw] max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-violet-500" />
              Smart Analysis
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Component-level breakdown of accessibility issues — grouped by AEM component or element type across all scanned pages.
            </p>
          </DialogHeader>

          {smartLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">Analysing issues across all pages…</p>
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
              <div className="flex gap-2 px-6 py-3 border-b shrink-0 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={smartSearch}
                    onChange={e => setSmartSearch(e.target.value)}
                    placeholder="Filter by component name…"
                    className="pl-8 pr-3 py-1.5 text-sm w-full rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={smartUrlFilter}
                    onChange={e => setSmartUrlFilter(e.target.value)}
                    placeholder="Filter by URL…"
                    className="pl-8 pr-3 py-1.5 text-sm w-full rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <select
                  value={smartImpact}
                  onChange={e => setSmartImpact(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All impacts</option>
                  <option value="critical">Critical</option>
                  <option value="serious">Serious</option>
                  <option value="moderate">Moderate</option>
                  <option value="minor">Minor</option>
                </select>
                <select
                  value={smartRule}
                  onChange={e => setSmartRule(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All rules</option>
                  {allSmartRules.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
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
              <div className="overflow-y-auto flex-1">
                {filteredSmartComponents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                    <Filter className="w-6 h-6" />
                    No components match your filters.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-background border-b">
                      <tr>
                        <th className="text-left px-6 py-3 font-medium text-muted-foreground w-8"></th>
                        <th className="text-left px-3 py-3 font-medium text-muted-foreground">Component Hierarchy</th>
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
                          <>
                            <tr
                              key={rowKey}
                              className={`border-b hover:bg-muted/30 cursor-pointer ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                              onClick={() => toggleSmartExpanded(rowKey)}
                            >
                              <td className="px-6 py-3 text-muted-foreground">
                                <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
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
                                <td colSpan={7} className="px-10 py-4">
                                  <div className="space-y-3">
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
                          </>
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
        <DialogContent className="max-w-[88vw] h-[82vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Code className="w-4 h-4 text-violet-500" />
              Code View — {codeViewComponentName}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all">{codeViewUrl}</p>
          </DialogHeader>
          {codeViewLoading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">Loading occurrences…</p>
            </div>
          )}
          {!codeViewLoading && (
            <div className="flex flex-1 overflow-hidden">
              {/* Left pane — occurrence list */}
              <div className="w-80 shrink-0 border-r overflow-y-auto flex flex-col">
                <div className="px-4 py-2.5 border-b bg-muted/30 shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {codeViewOccurrences.length > 99 ? "99+" : codeViewOccurrences.length} occurrence{codeViewOccurrences.length !== 1 ? "s" : ""}
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
                                selector={occ.selector}
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
              <div className="flex-1 overflow-hidden flex flex-col border-l">
                {codeViewOccurrences.length > 0 && codeViewOccurrences[codeViewSelectedIdx] ? (
                  <>
                    <div className="px-3 py-1.5 border-b bg-gray-50 shrink-0 flex items-center gap-2">
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
              <Label htmlFor="detail-edit-name">Scan Name</Label>
              <Input
                id="detail-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter scan name"
              />
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
            <Button onClick={handleSaveEdit} disabled={updateScanMutation.isPending}>
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
          {!isRunning && scan.status === "completed" && !isUpdatingResults && (
            <>
              <Button variant="outline" onClick={openSmartAnalysis}>
                <Sparkles className="w-4 h-4 mr-2 text-violet-500" />
                Smart Analysis
              </Button>
              <Link href={`/scans/${scan.id}/report`}>
                <Button>
                  <BarChart2 className="w-4 h-4 mr-2" />
                  View Report
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Progress card — only shown while scan is active */}
      {isActive && (
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
      )}

      {showUpdatingResults && (
        <div className="flex items-center gap-2 text-sm text-amber-600 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Updating results, please wait...
        </div>
      )}

      {/* Completed page results */}
      {!showUpdatingResults &&
        !isActive &&
        scan.pages &&
        scan.pages.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Page Results
                </h2>
                <span className="text-base text-muted-foreground font-medium">
                  {scannedUrls.toLocaleString()} of {totalUrls.toLocaleString()} URLs scanned · {progressPercent}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyAllUrls}
                  disabled={scan.pages.length === 0}
                >
                  {pageStatusFilter === "all" ? "Copy all URLs" : "Copy filtered URLs"}
                </Button>
                <ExportButtons scan={scan} />
              </div>
            </div>

            {/* Status filter tiles */}
            {(() => {
              type TileDef = { value: string; label: string; count: number; activeClass: string; Icon: React.ElementType };
              const tiles: TileDef[] = [
                { value: "all",                    label: "All Pages",    count: pageStatusCounts.all,                    activeClass: "border-slate-400 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-500",       Icon: Globe },
                { value: "completed_with_issues",  label: "With Issues",  count: pageStatusCounts.completed_with_issues,  activeClass: "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500",        Icon: AlertCircle },
                { value: "completed_no_issues",    label: "No Issues",    count: pageStatusCounts.completed_no_issues,    activeClass: "border-green-400 bg-green-50 dark:bg-green-950/30 dark:border-green-500",        Icon: CheckCircle2 },
                { value: "failed",                 label: "Failed",       count: pageStatusCounts.failed,                 activeClass: "border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-500",               Icon: XCircle },
                { value: "not_available",          label: "Not Available",count: pageStatusCounts.not_available,          activeClass: "border-slate-400 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-500",       Icon: CircleSlash },
                { value: "pending",                label: "Pending",      count: pageStatusCounts.pending,                activeClass: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-500",    Icon: Clock },
              ].filter(t => t.value === "all" || t.count > 0);
              const iconColors: Record<string, string> = {
                all: "text-slate-500",
                completed_with_issues: "text-amber-500",
                completed_no_issues: "text-green-500",
                failed: "text-red-500",
                not_available: "text-slate-400",
                pending: "text-yellow-500",
              };
              const countColors: Record<string, string> = {
                all: "text-slate-700 dark:text-slate-200",
                completed_with_issues: "text-amber-700 dark:text-amber-300",
                completed_no_issues: "text-green-700 dark:text-green-300",
                failed: "text-red-700 dark:text-red-300",
                not_available: "text-slate-600 dark:text-slate-300",
                pending: "text-yellow-700 dark:text-yellow-300",
              };
              return (
                <div className="flex flex-wrap items-center gap-2">
                  {tiles.map(({ value, label, count, activeClass, Icon }) => {
                    const isActive = pageStatusFilter === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPageStatusFilter(value)}
                        className={`flex items-center gap-3 rounded-lg border px-5 py-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                          isActive
                            ? `${activeClass} shadow-sm`
                            : "border-border bg-card hover:bg-muted/50 hover:border-muted-foreground/30"
                        }`}
                      >
                        <Icon className={`w-5 h-5 shrink-0 ${isActive ? iconColors[value] : "text-muted-foreground"}`} />
                        <div>
                          <p className={`text-xs font-semibold uppercase tracking-wide leading-none mb-1 ${isActive ? iconColors[value] : "text-muted-foreground"}`}>{label}</p>
                          <p className={`text-2xl font-bold leading-none ${isActive ? countColors[value] : "text-foreground"}`}>{count.toLocaleString()}</p>
                        </div>
                      </button>
                    );
                  })}
                  {/* File extension filter */}
                  {pageExtensions.length > 0 && (
                    <Select value={pageExtFilter} onValueChange={setPageExtFilter}>
                      <SelectTrigger className="h-11 w-36 shrink-0 bg-white dark:bg-white dark:text-slate-900">
                        <SelectValue placeholder="Extension" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {pageExtensions.map((ext) => (
                          <SelectItem key={ext} value={ext}>{ext}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {/* URL text filter — right side of the same row */}
                  <div className="relative ml-auto w-72 shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Filter URLs…"
                      value={pageUrlFilter}
                      onChange={(e) => setPageUrlFilter(e.target.value)}
                      className="pl-9 h-11 bg-white dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400"
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

            <Accordion type="multiple" className="space-y-4">
              {scan.pages.filter(matchesPageFilter).map((page) => {
                const pageIssues = (page.issues || []).map((issue: Issue) => {
                  const override = fpOverrides[issue.id];
                  return override !== undefined ? { ...issue, ...override } : issue;
                });
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
                           {(page.loadDurationMs != null || page.scanDurationMs != null) && (
                            <div className="flex items-center gap-2 text-sm font-mono font-medium">
                              {page.loadDurationMs != null && (
                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title="Page load time (DOMContentLoaded)">
                                  <Globe className="w-3.5 h-3.5" />
                                  {page.loadDurationMs >= 1000
                                    ? `${(page.loadDurationMs / 1000).toFixed(1)}s`
                                    : `${page.loadDurationMs}ms`}
                                </span>
                              )}
                              {page.loadDurationMs != null && page.scanDurationMs != null && (
                                <span className="text-slate-400">·</span>
                              )}
                              {page.scanDurationMs != null && (
                                <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400" title="Total scan time (load + network idle + rule checks)">
                                  <Cpu className="w-3.5 h-3.5" />
                                  {page.scanDurationMs >= 1000
                                    ? `${(page.scanDurationMs / 1000).toFixed(1)}s`
                                    : `${page.scanDurationMs}ms`}
                                </span>
                              )}
                            </div>
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
                               {page.issueCount > 0 ? (
                                  <>
                                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span>
                                      Issue details unavailable — {page.issueCount} issue{page.issueCount !== 1 ? "s" : ""} were recorded at scan time but could not be loaded. Re-scan this URL to restore them.
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                    No accessibility issues found on this page.
                                  </>
                                )}
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
                            onFlagIssue={handleOpenFlagDialog}
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

      {/* Live running state view */}
      {isActive && liveStatus && (liveStatus.counts || (liveStatus.pages && liveStatus.pages.length > 0)) && (
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
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
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
