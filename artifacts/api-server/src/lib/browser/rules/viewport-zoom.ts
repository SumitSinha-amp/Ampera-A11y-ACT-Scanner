import { elementContextForAI, getSelector, outerHtmlSnippet } from "../dom-helpers";
import type { PushStatFn, ScanRawResult } from "../types";

/**
 * SIA-R47 / W3C b4f0c3. Use Alfa's CSS Device Adaptation parsing semantics,
 * not substring matching or the current browser's willingness to zoom.
 * Reference: packages/alfa-rules/src/sia-r47/rule.ts in Siteimprove/alfa.
 */
function parseProperties(content: string): Map<string, string> {
  const source = content.toLowerCase();
  const whitespace = new Set([" ", "\xa0", "\t", "\n", "\f", "\r", "\v"]);
  const separator = (c: string) => c === "," || c === ";";
  const special = (c: string) => whitespace.has(c) || separator(c) || c === "=";
  const properties = new Map<string, string>();
  let i = 0;
  while (i < source.length) {
    while (i < source.length && special(source[i])) i++;
    const nameStart = i;
    while (i < source.length && !special(source[i])) i++;
    const name = source.slice(nameStart, i);
    // Ignore text between the property name and the next equals/separator.
    while (i < source.length && !separator(source[i]) && source[i] !== "=") i++;
    while (i < source.length && (whitespace.has(source[i]) || source[i] === "=")) i++;
    if (!separator(source[i])) {
      const valueStart = i;
      while (i < source.length && !special(source[i])) i++;
      const value = source.slice(valueStart, i);
      // Last non-empty occurrence wins, as in Alfa's property map.
      if (value.length > 0) properties.set(name, value);
    }
  }
  return properties;
}

export interface ViewportZoomEvaluation {
  maximumScale?: number;
  userScalable?: "zoom" | "fixed";
  applicable: boolean;
  fails: boolean;
}

export function evaluateViewportZoom(content: string): ViewportZoomEvaluation {
  const properties = parseProperties(content);
  const maximum = properties.get("maximum-scale");
  const scalable = properties.get("user-scalable");
  let maximumScale: number | undefined;
  let userScalable: "zoom" | "fixed" | undefined;
  if (maximum !== undefined) {
    if (maximum === "yes") maximumScale = 1;
    else if (maximum === "device-width" || maximum === "device-height") maximumScale = 10;
    else if (maximum === "no") maximumScale = 0.1;
    else {
      const value = Number(maximum);
      // Negative maximum-scale values are discarded, not failures.
      if (!(value < 0)) maximumScale = Number.isNaN(value) ? 0.1 : Math.max(0.1, Math.min(10, value));
    }
  }
  if (scalable !== undefined) {
    if (["yes", "device-width", "device-height"].includes(scalable)) userScalable = "zoom";
    else if (scalable === "no") userScalable = "fixed";
    else {
      const value = Number(scalable);
      userScalable = value <= -1 || value >= 1 ? "zoom" : "fixed";
    }
  }
  return {
    maximumScale, userScalable,
    applicable: maximumScale !== undefined || userScalable !== undefined,
    fails: (maximumScale !== undefined && maximumScale < 2) || userScalable === "fixed",
  };
}

export function runViewportZoomRule(results: ScanRawResult[], pushStat: PushStatFn): void {
  let applicable = 0;
  for (const meta of document.querySelectorAll("meta[name][content]")) {
    if (meta.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      meta.getAttribute("name")?.replace(/[A-Z]/g, c => c.toLowerCase()) !== "viewport") continue;
    const evaluation = evaluateViewportZoom(meta.getAttribute("content")!);
    if (!evaluation.applicable) continue;
    applicable++;
    if (!evaluation.fails) continue;
    const restrictions: string[] = [];
    if (evaluation.maximumScale !== undefined && evaluation.maximumScale < 2) {
      restrictions.push(`maximum-scale resolves to ${evaluation.maximumScale}, below the required 2 (200%)`);
    }
    if (evaluation.userScalable === "fixed") restrictions.push("user-scalable resolves to fixed (zoom disabled)");
    results.push({
      ruleId: "ACT-R47", type: "Issue", impact: "serious",
      description: `Viewport declares a zoom restriction: ${restrictions.join("; ")}. Browsers that honor this setting may restrict zoom. Desktop browsers and many modern mobile browsers ignore or override these settings; successful zoom in those browsers does not change this markup-level result. Review alternative text-resizing mechanisms before concluding a WCAG failure.`,
      element: outerHtmlSnippet(meta), elementContext: elementContextForAI(meta),
      selector: getSelector(meta),
    });
  }
  pushStat("ACT-R47", applicable, "element");
}
