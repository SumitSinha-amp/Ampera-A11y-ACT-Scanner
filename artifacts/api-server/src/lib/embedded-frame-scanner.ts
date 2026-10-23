import type { Frame, Page } from "puppeteer";
import type { ScanRawResult, RuleExecutionStatus } from "./browser/types";
import { redactProvenanceUrl } from "./httpPreflight";

export const FRAME_SELECTOR_SEPARATOR = " >>> ";
export interface BrowserRuleResult {
  issues: ScanRawResult[];
  stats: { ruleId: string; totalChecked: number; scope: "element" | "page" }[];
  ruleStatuses?: RuleExecutionStatus[];
}
type RuleOptions = { emitManualOnlyRules: boolean; rules?: string[] };
type FrameScanOptions = {
  maxFrames?: number;
  maxDepth?: number;
  budgetMs?: number;
  onSkipped?: (detail: { url: string; reason: string }) => void;
};

/** Frame paths are displayable selectors; >>> explicitly crosses documents. */
async function getFramePath(frame: Frame, maxDepth: number): Promise<string[] | null> {
  const chain: Frame[] = [];
  let current: Frame | null = frame;
  while (current.parentFrame()) {
    chain.unshift(current);
    if (chain.length > maxDepth) return null;
    current = current.parentFrame();
    if (!current) return null;
  }
  const path: string[] = [];
  for (const child of chain) {
    const host = await child.frameElement();
    if (!host) return null;
    try {
      const selector = await host.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden" ||
            style.visibility === "collapse" || Number(style.opacity) === 0 ||
            node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return null;
        }
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 1 || bounds.height <= 1) return null;
        const parts: string[] = [];
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (node.id && node.ownerDocument.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
            parts.unshift(`${node.localName}#${CSS.escape(node.id)}`);
            break;
          }
          const siblings = node.parentElement
            ? Array.from(node.parentElement.children).filter((sibling) => sibling.localName === node!.localName)
            : [node];
          parts.unshift(`${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`);
        }
        return parts.join(" > ");
      });
      if (!selector) return null;
      path.push(selector);
    } finally { await host.dispose(); }
  }
  return path;
}

/**
 * Scan already-loaded, rendered frames without navigating, submitting, playing
 * media, or fetching their URLs separately. DevTools evaluation works across
 * origins and does not insert a script element rejected by Trusted Types.
 */
export async function scanEmbeddedFrames(
  page: Page,
  bundle: string,
  options: RuleOptions,
  limits: FrameScanOptions = {},
): Promise<BrowserRuleResult> {
  const result: BrowserRuleResult = { issues: [], stats: [], ruleStatuses: [] };
  const deadline = Date.now() + (limits.budgetMs ?? 15_000);
  let scanned = 0;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const url = redactProvenanceUrl(frame.url()).slice(0, 2048);
    const skip = (reason: string) => limits.onSkipped?.({ url, reason });
    if (scanned >= (limits.maxFrames ?? 16) || Date.now() >= deadline) {
      skip("Embedded-frame scan limit reached");
      break;
    }
    // Do not persist data: documents or execute in browser/internal documents.
    if (!/^https?:\/\//i.test(frame.url()) && !/^about:(blank|srcdoc)$/.test(frame.url())) continue;
    try {
      const framePath = await getFramePath(frame, limits.maxDepth ?? 4);
      if (!framePath) continue; // hidden, tracking-sized, detached, or too deeply nested
      scanned++;
      await frame.evaluate(bundle);
      const raw = await frame.evaluate((ruleOptions) => {
        const engine = (window as any).__ampera;
        if (!engine?.buildMarkers?.includes("language-detector-franc-min-v1") ||
          typeof engine.runAllRules !== "function" ||
          typeof engine.verifyLanguageDetectorBundle !== "function" ||
          engine.verifyLanguageDetectorBundle() !== true) {
          throw new Error("Invalid embedded-frame browser-rule bundle");
        }
        return engine.runAllRules(ruleOptions);
      }, options) as BrowserRuleResult;
      const prefix = framePath.join(FRAME_SELECTOR_SEPARATOR);
      for (const issue of raw.issues) {
        result.issues.push({
          ...issue,
          // A frame-scoped page finding uses the document root, never null,
          // so it cannot be confused with a main-document page-level finding.
          selector: `${prefix}${FRAME_SELECTOR_SEPARATOR}${issue.selector || "html"}`,
          description: `[Embedded frame: ${prefix}] ${issue.description}`,
          elementContext: `Embedded document: ${url}\nFrame path: ${prefix}\n${issue.elementContext || issue.element || ""}`,
        });
      }
      result.stats.push(...raw.stats);
      result.ruleStatuses!.push(...(raw.ruleStatuses || []));
    } catch (error) {
      skip(error instanceof Error ? error.message : "Embedded frame became unavailable");
    }
  }
  return result;
}

/** Sum checks across documents, while retaining one execution status per rule. */
export function mergeEmbeddedResults(main: BrowserRuleResult, embedded: BrowserRuleResult): BrowserRuleResult {
  const stats = new Map<string, BrowserRuleResult["stats"][number]>();
  for (const stat of [...main.stats, ...embedded.stats]) {
    const previous = stats.get(stat.ruleId);
    stats.set(stat.ruleId, {
      ...stat,
      totalChecked: (previous?.totalChecked ?? 0) + stat.totalChecked,
    });
  }
  const statuses = new Map((main.ruleStatuses || []).map((status) => [status.ruleId, status]));
  for (const status of embedded.ruleStatuses || []) {
    const previous = statuses.get(status.ruleId);
    // Explicit exclusions remain authoritative even when a frame has matches.
    if (previous?.status === "not-selected") continue;
    if (!previous || status.status === "executed") statuses.set(status.ruleId, status);
  }
  return {
    issues: [...main.issues, ...embedded.issues],
    stats: [...stats.values()],
    ruleStatuses: [...statuses.values()],
  };
}

/**
 * Resolve nested selectors through Puppeteer, not document.querySelector().
 * ElementHandle.boundingBox() uses main-frame viewport coordinates even for
 * cross-origin children. Clip to each host so off-frame text is not highlighted.
 */
export async function getEmbeddedFrameBoxes(page: Page, selectors: (string | null)[]) {
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const boxes = new Map<number, { x: number; y: number; width: number; height: number }>();
  for (const [index, selector] of selectors.entries()) {
    if (!selector?.includes(FRAME_SELECTOR_SEPARATOR)) continue;
    const parts = selector.split(FRAME_SELECTOR_SEPARATOR);
    if (parts.length > 5) continue;
    try {
      let frame = page.mainFrame();
      const boundaries: { x: number; y: number; width: number; height: number }[] = [];
      for (const hostSelector of parts.slice(0, -1)) {
        const host = await frame.$(hostSelector);
        if (!host) throw new Error("Frame host no longer exists");
        try {
          const visible = await host.evaluate((element) => {
            for (let node: Element | null = element; node; node = node.parentElement) {
              const style = getComputedStyle(node);
              if (style.display === "none" || style.visibility !== "visible" ||
                Number(style.opacity) === 0) return false;
            }
            return true;
          });
          const boundary = visible ? await host.boundingBox() : null;
          const child = await host.contentFrame();
          if (!boundary || !child) throw new Error("Frame is hidden or unavailable");
          boundaries.push(boundary);
          frame = child;
        } finally { await host.dispose(); }
      }
      const target = await frame.$(parts[parts.length - 1]);
      if (!target) continue;
      try {
        const visible = await target.evaluate((element) => {
          for (let node: Element | null = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === "none" || style.visibility !== "visible" ||
              Number(style.opacity) === 0) return false;
          }
          return true;
        });
        const box = visible ? await target.boundingBox() : null;
        if (!box) continue;
        let { x, y, width, height } = box;
        for (const boundary of boundaries) {
          const right = Math.min(x + width, boundary.x + boundary.width);
          const bottom = Math.min(y + height, boundary.y + boundary.height);
          x = Math.max(x, boundary.x);
          y = Math.max(y, boundary.y);
          width = Math.max(0, right - x);
          height = Math.max(0, bottom - y);
        }
        if (width > 0 && height > 0) boxes.set(index, {
          x: Math.round(x + scroll.x), y: Math.round(y + scroll.y),
          width: Math.round(width), height: Math.round(height),
        });
      } finally { await target.dispose(); }
    } catch { /* Never fall back to a same-named main-document element. */ }
  }
  return boxes;
}
