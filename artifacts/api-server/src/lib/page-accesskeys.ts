import type { Page } from "puppeteer";
import { evaluateAccesskeyTargets, type AccesskeyTarget } from "./browser/rules/list-accesskeys";
import { getFramePath, FRAME_SELECTOR_SEPARATOR, type BrowserRuleResult } from "./embedded-frame-scanner";
import { redactProvenanceUrl } from "./httpPreflight";

/**
 * Upstream R122 is page-wide, including sibling and cross-origin documents;
 * R121 likewise traverses rendered child documents for list targets.
 * Compare serialized candidates once, never DOM objects from different realms.
 * Child findings keep their document-qualified selectors for evidence.
 */
export async function scanPageListAccesskeyRules(
  page: Page,
  bundle: string,
  options: {
    maxFrames?: number; maxDepth?: number; budgetMs?: number;
    includeLists?: boolean; includeAccesskeys?: boolean;
    onSkipped?: (detail: { url: string; reason: string }) => void;
  } = {},
): Promise<BrowserRuleResult> {
  const targets: AccesskeyTarget[] = [];
  const lists: BrowserRuleResult = { issues: [], stats: [], ruleStatuses: [] };
  const includeKeys = options.includeAccesskeys !== false;
  let listChecked = 0;
  const started = Date.now();
  let complete = true, scanned = 0;
  for (const frame of page.frames()) {
    const url = redactProvenanceUrl(frame.url()).slice(0, 2048);
    const skip = (reason: string) => { complete = false; options.onSkipped?.({ url, reason }); };
    if (scanned >= (options.maxFrames ?? 17) || Date.now() - started >= (options.budgetMs ?? 10_000)) {
      skip("Page-wide access-key scan limit reached");
      break;
    }
    const main = frame === page.mainFrame();
    if (!main && !/^https?:\/\//i.test(frame.url()) && !/^about:(blank|srcdoc)$/.test(frame.url())) {
      skip("Unsupported embedded document for page-wide access-key scan");
      continue;
    }
    try {
      let depth = 0;
      for (let parent = frame.parentFrame(); parent; parent = parent.parentFrame()) depth++;
      if (depth > (options.maxDepth ?? 4)) { skip("Access-key frame depth limit reached"); continue; }
      const path = main ? [] : await getFramePath(frame, options.maxDepth ?? 4, true);
      if (!path) {
        if (frame.detached) skip("Embedded document detached during list/access-key collection");
        continue; // display:none or legacy fallback content
      }
      scanned++;
      if (!main) await frame.evaluate(bundle);
      const raw = await frame.evaluate(({ includeLists, includeKeys }) => {
        const engine = (window as any).__ampera;
        if (typeof engine?.collectAccesskeyTargets !== "function") throw new Error("Access-key collector missing from browser bundle");
        return {
          candidates: includeKeys ? engine.collectAccesskeyTargets() : [],
          lists: includeLists ? engine.runAllRules({ rules: ["ACT-R130"] }) : null,
        };
      }, { includeLists: options.includeLists === true, includeKeys }) as {
        candidates: AccesskeyTarget[]; lists: BrowserRuleResult | null;
      };
      const prefix = path.join(FRAME_SELECTOR_SEPARATOR);
      const qualify = <T extends Pick<AccesskeyTarget, "selector" | "element" | "elementContext">>(target: T): T => ({
        ...target,
        selector: prefix ? `${prefix}${FRAME_SELECTOR_SEPARATOR}${target.selector || "html"}` : target.selector,
        elementContext: prefix
          ? `Embedded document: ${url}\nFrame path: ${prefix}\n${target.elementContext || target.element || ""}`
          : target.elementContext,
      });
      targets.push(...raw.candidates.map(qualify));
      if (raw.lists) {
        lists.issues.push(...raw.lists.issues.map(qualify));
        listChecked += raw.lists.stats.find(stat => stat.ruleId === "ACT-R130")?.totalChecked || 0;
      }
    } catch (error) {
      skip(error instanceof Error ? error.message : "Access-key document became unavailable");
    }
  }
  if (options.includeLists) {
    lists.stats.push({ ruleId: "ACT-R130", totalChecked: listChecked, scope: "element" });
    lists.ruleStatuses!.push({
      ruleId: "ACT-R130", executionTier: "automatic",
      status: !complete ? "failed" : listChecked ? "executed" : "not-applicable",
    });
  }
  if (includeKeys) {
    lists.issues.push(...evaluateAccesskeyTargets(targets));
    lists.stats.push({ ruleId: "ACT-R131", totalChecked: targets.length, scope: "element" });
    lists.ruleStatuses!.push({
      ruleId: "ACT-R131", executionTier: "automatic",
      status: !complete ? "failed" : targets.length ? "executed" : "not-applicable",
    });
  }
  return lists;
}

export function replacePageListAccesskeyResults(main: BrowserRuleResult, keys: BrowserRuleResult): BrowserRuleResult {
  const replaced = new Set(keys.stats.map(stat => stat.ruleId));
  return {
    issues: [...main.issues.filter(issue => !replaced.has(issue.ruleId)), ...keys.issues],
    stats: [...main.stats.filter(stat => !replaced.has(stat.ruleId)), ...keys.stats],
    ruleStatuses: [...(main.ruleStatuses || []).filter(status => !replaced.has(status.ruleId)), ...(keys.ruleStatuses || [])],
  };
}
