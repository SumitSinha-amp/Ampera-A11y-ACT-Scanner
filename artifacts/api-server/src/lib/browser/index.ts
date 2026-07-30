// ════════════════════════════════════════════════════════════════════════════
// Ampera Accessibility Scanner — Browser Bundle
//
// This file is compiled by esbuild to an IIFE (dist/browser-bundle.js) and
// injected into Puppeteer pages via page.addScriptTag().  All code here runs
// inside Chromium — NOT in Node.js.
//
// Exposes:  window.__ampera = { runAllRules }
// ════════════════════════════════════════════════════════════════════════════

export type { ScanRawResult } from "./types";
import type { PushStatFn } from "./types";
import { runDocumentLanguageRules } from "./rules/document-language";
import { runNamesRules } from "./rules/names";
import { runAriaRules } from "./rules/aria";
import { runMediaRules } from "./rules/media";
import { runHeadingsLandmarksRules } from "./rules/headings-landmarks";
import { runLinksContrastRules } from "./rules/links-contrast";
import { runTablesFormsRules } from "./rules/tables-forms";
import { runTextStyleRules } from "./rules/text-style";
import { runStructureMiscRules } from "./rules/structure-misc";
import { runKeyboardMiscRules } from "./rules/keyboard-misc";

function runAllRules(): { issues: import("./types").ScanRawResult[]; stats: { ruleId: string; totalChecked: number; scope: "element" | "page" }[] } {
  const results: import("./types").ScanRawResult[] = [];
  // Siteimprove/Alfa parity: rules Alfa classifies as "can't tell" (manual
  // review) are never auto-reported by the Siteimprove checker. Keeping the
  // detection code but gating emission lets us re-enable them as a "manual
  // review" tier later without rewriting the logic.
  const EMIT_MANUAL_ONLY_RULES = false;

  // Accumulate totalChecked per rule — some rules call pushStat multiple times
  // with the same ruleId (e.g. R14 checks two element sets); we add them up.
  const statMap = new Map<string, { totalChecked: number; scope: "element" | "page" }>();
  const pushStat: PushStatFn = (ruleId, totalChecked, scope) => {
    const existing = statMap.get(ruleId);
    if (existing) {
      existing.totalChecked += totalChecked;
    } else {
      statMap.set(ruleId, { totalChecked, scope });
    }
  };

  runDocumentLanguageRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runNamesRules(results, pushStat);
  runAriaRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runMediaRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runHeadingsLandmarksRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runLinksContrastRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runTablesFormsRules(results, pushStat);
  runTextStyleRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runStructureMiscRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);
  runKeyboardMiscRules(results, EMIT_MANUAL_ONLY_RULES, pushStat);

  const stats = Array.from(statMap.entries()).map(([ruleId, s]) => ({
    ruleId,
    totalChecked: s.totalChecked,
    scope: s.scope,
  }));

  return { issues: results, stats };
}

// ─── Expose on window for Puppeteer injection ─────────────────────────────────
(window as any).__ampera = { runAllRules };
