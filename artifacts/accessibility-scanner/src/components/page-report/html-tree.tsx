import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { Loader2 } from "lucide-react";

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
export function findTargetElement(doc: Document, selector: string, elementHtml: string): Element | null {
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

const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

export type HtmlTreeNode = {
  id: string;
  kind: "element" | "text" | "comment";
  tag?: string;
  attrs?: Array<{ name: string; value: string }>;
  children?: HtmlTreeNode[];
  selfClose?: boolean;
  text?: string;
  domEl?: Element;
};

export function buildHtmlTree(node: ChildNode, idPrefix: string): HtmlTreeNode | null {
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

export function collectAncestors(nodes: HtmlTreeNode[], targetEl: Element): { ancestorIds: Set<string>; targetId: string | null } {
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

// ── Flat-row virtualized rendering ─────────────────────────────────────────────
// The tree is flattened into a list of visible rows (opening tags, text,
// comments, closing tags). Each row uses CSS `content-visibility: auto` so the
// browser skips layout/paint for off-screen rows — large pages (tens of
// thousands of nodes) stay responsive and memory-stable during long sessions.

type FlatRow = {
  key: string;
  nodeId: string;       // id of the element this row belongs to
  kind: "open" | "text" | "comment" | "close";
  node: HtmlTreeNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  inTarget: boolean;    // row is part of the highlighted target block
  isTargetHead: boolean; // first row of the target block (scroll anchor)
};

export function flattenTree(
  nodes: HtmlTreeNode[],
  expandedIds: Set<string>,
  targetId: string | null,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const inBlock = (id: string) =>
    targetId !== null && (id === targetId || id.startsWith(`${targetId}.`));

  function walk(node: HtmlTreeNode, depth: number) {
    const inTarget = inBlock(node.id);
    const isTargetHead = node.id === targetId;
    if (node.kind === "text") {
      rows.push({ key: node.id, nodeId: node.id, kind: "text", node, depth, hasChildren: false, isExpanded: false, inTarget, isTargetHead });
      return;
    }
    if (node.kind === "comment") {
      rows.push({ key: node.id, nodeId: node.id, kind: "comment", node, depth, hasChildren: false, isExpanded: false, inTarget, isTargetHead });
      return;
    }
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedIds.has(node.id);
    rows.push({ key: node.id, nodeId: node.id, kind: "open", node, depth, hasChildren, isExpanded, inTarget, isTargetHead });
    if (hasChildren && isExpanded) {
      for (const child of node.children!) walk(child, depth + 1);
      rows.push({ key: `${node.id}:close`, nodeId: node.id, kind: "close", node, depth, hasChildren, isExpanded, inTarget, isTargetHead: false });
    }
  }
  for (const root of nodes) walk(root, 0);
  return rows;
}

const ROW_VIRTUAL_STYLE: React.CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "auto 22px",
} as React.CSSProperties;

const FlatTreeRow = memo(function FlatTreeRow({
  row, onToggle,
}: {
  row: FlatRow;
  onToggle: (id: string) => void;
}) {
  const indent = row.depth * 16;
  const highlight: React.CSSProperties = row.inTarget
    ? { background: "rgba(124,58,237,0.08)", boxShadow: "inset 2px 0 0 #7c3aed" }
    : {};

  if (row.kind === "text") {
    return (
      <div data-is-target={row.isTargetHead || undefined} style={{ ...ROW_VIRTUAL_STYLE, ...highlight, paddingLeft: `${indent + 20}px`, color: "#333", fontSize: "12px", fontFamily: "monospace", lineHeight: "1.8", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {row.node.text}
      </div>
    );
  }
  if (row.kind === "comment") {
    return (
      <div style={{ ...ROW_VIRTUAL_STYLE, ...highlight, paddingLeft: `${indent + 20}px`, color: "#999", fontStyle: "italic", fontSize: "12px", fontFamily: "monospace", lineHeight: "1.8" }}>
        {row.node.text}
      </div>
    );
  }
  if (row.kind === "close") {
    return (
      <div style={{ ...ROW_VIRTUAL_STYLE, ...highlight, paddingLeft: `${indent + 20}px`, fontFamily: "monospace", fontSize: "12px", lineHeight: "1.8", color: "#444" }}>
        {"</"}<span style={{ color: "#000080", fontWeight: 600 }}>{row.node.tag}</span>{">"}
      </div>
    );
  }

  // Only toggle collapse when the user clicked (not when they finished a text selection drag)
  const handleRowClick = row.hasChildren
    ? () => { if (window.getSelection()?.toString()) return; onToggle(row.nodeId); }
    : undefined;

  return (
    <div
      data-is-target={row.isTargetHead || undefined}
      onClick={handleRowClick}
      style={{
        ...ROW_VIRTUAL_STYLE, ...highlight,
        display: "flex", alignItems: "flex-start",
        paddingLeft: `${indent}px`, paddingTop: "1px", paddingBottom: "1px",
        cursor: row.hasChildren ? "pointer" : "default",
        userSelect: "text",
      }}
    >
      <span style={{ width: "20px", flexShrink: 0, color: "#aaa", userSelect: "none", fontSize: "11px", paddingTop: "3px", textAlign: "center" }}>
        {row.hasChildren ? (row.isExpanded ? "▾" : "▸") : ""}
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: "1.8" }}>
        {row.isExpanded || !row.hasChildren ? (
          <HtmlTag tag={row.node.tag!} attrs={row.node.attrs} />
        ) : (
          <span>
            <HtmlTag tag={row.node.tag!} attrs={row.node.attrs} />
            <span style={{ color: "#bbb", fontFamily: "monospace", fontSize: "12px" }}> … </span>
            <span style={{ color: "#444", fontFamily: "monospace", fontSize: "12px" }}>{"</"}</span>
            <span style={{ color: "#000080", fontWeight: 600, fontFamily: "monospace", fontSize: "12px" }}>{row.node.tag}</span>
            <span style={{ color: "#444", fontFamily: "monospace", fontSize: "12px" }}>{">"}</span>
          </span>
        )}
      </div>
    </div>
  );
});

export function InteractiveHtmlTree({ pageHtml, elementHtml, elementContext, selector }: { pageHtml: string; elementHtml: string; elementContext?: string | null; selector: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<HtmlTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState<string | null>(null);

  const parsedDocRef = useRef<Document | null>(null);
  const parsedHtmlRef = useRef<string>("");

  // Use elementContext (full element with children) as fallback when full page HTML is absent
  const effectiveHtml = pageHtml || (elementContext ?? elementHtml);
  // When using the element as the source, wrap it so DOMParser produces a valid document
  const isElementFallback = !pageHtml && !!effectiveHtml;

  useEffect(() => {
    if (!effectiveHtml) {
      setTree([]);
      parsedDocRef.current = null;
      parsedHtmlRef.current = "";
      return;
    }
    if (effectiveHtml === parsedHtmlRef.current && parsedDocRef.current) return;
    const doc = new DOMParser().parseFromString(
      isElementFallback ? `<!doctype html><html><body>${effectiveHtml}</body></html>` : effectiveHtml,
      "text/html"
    );
    parsedDocRef.current = doc;
    parsedHtmlRef.current = effectiveHtml;
    // For element fallback, build tree from body children; for full page, from documentElement
    if (isElementFallback) {
      const children: HtmlTreeNode[] = [];
      let ci = 0;
      for (const child of Array.from(doc.body.childNodes)) {
        const n = buildHtmlTree(child, `0.${ci}`);
        if (n) { children.push(n); ci++; }
      }
      setTree(children);
    } else {
      const rootNode = buildHtmlTree(doc.documentElement, "0");
      setTree(rootNode ? [rootNode] : []);
    }
  }, [effectiveHtml, isElementFallback]);

  useEffect(() => {
    const doc = parsedDocRef.current;
    if (!effectiveHtml || !doc || tree.length === 0) return;

    const targetEl = findTargetElement(doc, selector, elementHtml);

    const newExpanded = new Set<string>();
    let newTarget: string | null = null;

    if (targetEl) {
      const { ancestorIds, targetId: tid } = collectAncestors(tree, targetEl);
      for (const id of ancestorIds) newExpanded.add(id);
      newTarget = tid;
    } else {
      // Expand all nodes when no target found (or using element fallback — expand everything)
      function expandAll(nodes: HtmlTreeNode[], depth: number) {
        if (depth >= (isElementFallback ? 10 : 2)) return;
        for (const n of nodes) {
          if (n.kind === "element" && (n.children?.length ?? 0) > 0) {
            newExpanded.add(n.id);
            expandAll(n.children!, depth + 1);
          }
        }
      }
      expandAll(tree, 0);
      // For element fallback, highlight the root element node
      if (isElementFallback && tree.length > 0 && tree[0].kind === "element") {
        newTarget = tree[0].id;
      }
    }

    setExpandedIds(newExpanded);
    setTargetId(newTarget);
  }, [tree, selector, elementHtml, effectiveHtml, isElementFallback]);

  useEffect(() => {
    if (!containerRef.current || !targetId) return;
    const el = containerRef.current.querySelector("[data-is-target]");
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }, [targetId]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const flatRows = useMemo(
    () => flattenTree(tree, expandedIds, targetId),
    [tree, expandedIds, targetId],
  );

  if (!effectiveHtml) {
    return (
      <div className="flex-1 overflow-auto bg-white p-5">
        <p className="text-xs text-gray-400 italic">No element HTML available.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto bg-white py-3 select-text">
      {isElementFallback && (
        <p className="text-[10px] text-amber-600 italic px-4 pb-1.5">Full page HTML not stored — showing element context only</p>
      )}
      {tree.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Parsing HTML…</span>
        </div>
      ) : (
        flatRows.map(row => (
          <FlatTreeRow key={row.key} row={row} onToggle={handleToggle} />
        ))
      )}
    </div>
  );
}
