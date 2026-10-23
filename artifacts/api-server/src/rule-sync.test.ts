import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(workspaceRoot, relativePath), "utf8");
}

function numericRuleIds(source: string, pattern: RegExp): Set<string> {
  return new Set(
    Array.from(source.matchAll(pattern), (match) => `ACT-R${match[1]}`),
  );
}

function missing(expected: Set<string>, actual: Set<string>): string[] {
  return [...expected].filter((id) => !actual.has(id)).sort();
}

describe("scan rule surfaces stay synchronized", () => {
  it("keeps vendor references out of user-facing rule guidance and release notes", () => {
    for (const path of [
      "artifacts/accessibility-scanner/src/lib/actRules.ts",
      "artifacts/accessibility-scanner/src/pages/documentation.tsx",
      "artifacts/accessibility-scanner/src/pages/app-updates.tsx",
    ]) {
      expect(read(path)).not.toMatch(/site[\s-]?improve/i);
    }
    for (const path of [
      "artifacts/accessibility-scanner/src/pages/page-report.tsx",
      "artifacts/accessibility-scanner/src/pages/site-rule-page-report.tsx",
    ]) {
      expect(read(path)).not.toContain("Equivalent:");
      expect(read(path)).toContain("<CustomRuleBadge");
    }
    expect(read("artifacts/accessibility-scanner/src/pages/documentation.tsx")).toContain("<CustomRuleBadge");
  });
  it("keeps the Issues overview free of a separate vertical scroll region", () => {
    const source = read("artifacts/accessibility-scanner/src/pages/issues.tsx");
    expect(source).not.toContain('data-testid="issues-overview-scroll"');
    expect(source).toContain('data-testid="issues-overview"');
    expect(source).toContain('className="issues-overview shrink-0 space-y-3"');
  });
  it("keeps the custom text-spacing rule selectable and mapped to WCAG AA", () => {
    expect(read("artifacts/api-server/src/lib/scanner.ts")).toContain('"ACT-R129": { sc: ["1.4.12"], level: ["AA"] }');
    expect(read("artifacts/accessibility-scanner/src/lib/actRules.ts")).toContain('"ACT-R129": { sc: ["1.4.12"], level: ["AA"] }');
    expect(read("artifacts/accessibility-scanner/src/pages/home.tsx")).toContain('id: "ACT-R129"');
    expect(read("artifacts/api-server/src/lib/browser/registry.ts")).toContain('"text-spacing": ["ACT-R129"]');
    expect(read("artifacts/api-server/src/lib/browser/index.ts")).toContain('runFamily("text-spacing", () => runTextSpacingLayoutRule(results, pushStat))');
    expect(read("artifacts/accessibility-scanner/src/lib/actRules.ts")).toContain("custom: true");
  });
const browserRulePaths = [
  "artifacts/api-server/src/lib/browser/rules/aria.ts",
  "artifacts/api-server/src/lib/browser/rules/document-language.ts",
  "artifacts/api-server/src/lib/browser/rules/headings-landmarks.ts",
  "artifacts/api-server/src/lib/browser/rules/keyboard-misc.ts",
  "artifacts/api-server/src/lib/browser/rules/empty-containers.ts",
  "artifacts/api-server/src/lib/browser/rules/control-group-names.ts",
  "artifacts/api-server/src/lib/browser/rules/text-spacing-layout.ts",
  "artifacts/api-server/src/lib/browser/rules/links-contrast.ts",
  "artifacts/api-server/src/lib/browser/rules/media.ts",
  "artifacts/api-server/src/lib/browser/rules/names.ts",
  "artifacts/api-server/src/lib/browser/rules/structure-misc.ts",
  "artifacts/api-server/src/lib/browser/rules/tables-forms.ts",
  "artifacts/api-server/src/lib/browser/rules/text-style.ts",
] as const;

const browserSource = browserRulePaths.map((path) => read(path)).join("\n");
const browserEntrySource = read("artifacts/api-server/src/lib/browser/index.ts");
  const documentationSource = read(
    "artifacts/accessibility-scanner/src/pages/documentation.tsx",
  );

  it("keeps every emitted numeric rule represented everywhere", () => {
    const browserIds = numericRuleIds(
      browserSource,
      /ruleId:\s*"ACT-R(\d+)"/g,
    );
    const apiSource = read("artifacts/api-server/src/lib/scanner.ts");
    const frontendSource = read(
      "artifacts/accessibility-scanner/src/lib/actRules.ts",
    );
    const homeSource = read("artifacts/accessibility-scanner/src/pages/home.tsx");
    const ariaRulesSource = read(
      "artifacts/api-server/src/lib/browser/rules/aria.ts",
    );

    const apiIds = numericRuleIds(apiSource, /"ACT-R(\d+)":\s*\{/g);
    const frontendIds = numericRuleIds(frontendSource, /"ACT-R(\d+)":\s*\{/g);
    const homeIds = numericRuleIds(homeSource, /id:\s*"ACT-R(\d+)"/g);
    expect(missing(browserIds, apiIds)).toEqual([]);
    expect(missing(browserIds, frontendIds)).toEqual([]);
    expect(missing(browserIds, homeIds)).toEqual([]);
    expect(documentationSource).toContain(
      'Object.entries(ACT_RULES).map(([id, rule])',
    );
    expect(documentationSource).toContain('import ACT_RULES from "@/lib/actRules"');
  });

  it("does not leave the reassigned SIA rules on legacy meanings", () => {
    const browserIds = numericRuleIds(
      browserSource,
      /ruleId:\s*"ACT-R(\d+)"/g,
    );
    expect(browserIds.has("ACT-R27")).toBe(true);
    expect(browserIds.has("ACT-R35")).toBe(true);
    expect(browserIds.has("ACT-R68")).toBe(true);
    expect(browserSource).toContain('isLinkText ? "ACT-R88" : "ACT-R69"');
    expect(browserSource).toContain('isLinkText ? "ACT-R89" : "ACT-R66"');
    expect(browserSource).toContain("const REQUIRED_CHILDREN:");
  });

  it("keeps the SIA media-alternative metadata and R31 mapping aligned", () => {
    const apiSource = read("artifacts/api-server/src/lib/scanner.ts");
    const frontendSource = read(
      "artifacts/accessibility-scanner/src/lib/actRules.ts",
    );
    const homeSource = read("artifacts/accessibility-scanner/src/pages/home.tsx");
    const ariaRulesSource = read(
      "artifacts/api-server/src/lib/browser/rules/aria.ts",
    );

    expect(apiSource).toContain('"ACT-R31": { sc: ["1.2.3"], level: ["A"] }');
    expect(frontendSource).toContain('"ACT-R31": { sc: ["1.2.3"], level: ["A"] }');
    expect(frontendSource).not.toContain('"ACT-R31": { sc: ["1.4.8"]');
    expect(frontendSource).toContain(
      'title: "<audio> element content is media alternative for text"',
    );
    expect(frontendSource).toContain(
      'title: "<video> element content is media alternative for text"',
    );
    expect(frontendSource).toContain(
      'title: "<video> element visual-only content has accessible alternative"',
    );
    expect(homeSource).toContain(
      "<video> element content is media alternative for text (WCAG 1.2.3)",
    );
    expect(browserSource).toContain("captureStream.call(video)");
    expect(browserSource).toContain(
      "absence is unknown",
    );
    expect(browserSource).toContain(
      "const negativeClaim =",
    );
    expect(browserSource).toContain('ruleId: "ACT-R33"');
    expect(browserSource).toContain("hasDeclaredMediaAlternative(media)");
    expect(browserSource).toContain('track[kind="captions"]');
    expect(browserSource).toContain('ruleId: "ACT-R25"');
    expect(browserSource).toContain("if (audioState !== false) return;");
    expect(browserSource).toContain('ruleId: "ACT-R37"');
    expect(browserSource).toContain("passesMediaAlternativeForText");
    expect(apiSource).toContain(
      "Does this video have a strict accessible alternative?",
    );
    expect(frontendSource).toContain(
      "The video's visual content must pass at least one path",
    );
    expect(homeSource).toContain('id: "ACT-R37"');
    expect(apiSource).toContain('relatedRules: ["ACT-R37"]');
    expect(apiSource).toContain('relatedRules: ["ACT-R38"]');
    expect(frontendSource).toContain('relatedRules: ["ACT-R37"]');
    expect(frontendSource).toContain('relatedRules: ["ACT-R38"]');
    expect(ariaRulesSource).toContain('unsupported or prohibited on role="${role}"');
    expect(apiSource).not.toContain(
      '"ACT-R36": {\n    type: "Issue",\n    description: "ARIA attribute is prohibited on this role",\n    remediation:\n      "Remove ARIA attributes that are prohibited for the element\'s role per the ARIA specification",\n    deprecated: true',
    );
  });

  it("reports headerless data tables under ACT-R46", () => {
    expect(browserSource).toContain(
      'const hasHeaders = table.querySelector("th, [role=\'columnheader\'], [role=\'rowheader\']")',
    );
    expect(browserSource).toContain(
      "Table data cells cannot be associated with headers because the table has no <th>",
    );
    expect(browserSource).toContain('ruleId: "ACT-R46"');
  });

  it("does not emit unresolved contrast questions as automatic R66/R69 findings", () => {
    expect(browserSource).toContain(
      'if (bgResolution.kind === "indeterminate")',
    );
    expect(browserSource).toContain(
      "if (!EMIT_MANUAL_ONLY_RULES) continue;",
    );
    expect(browserSource).toContain(
      'isLinkText ? "ACT-R88" : "ACT-R69"',
    );
    expect(browserSource).toContain(
      'isLinkText ? "ACT-R89" : "ACT-R66"',
    );
  });

  it("keeps ACT-R19 on the shared complete ARIA value schema", () => {
    expect(browserSource).toContain("ARIA_VALUE_DESCRIPTORS");
    expect(browserSource).toContain("ariaValueError(name, value)");
  });

  it("keeps ACT-R99 as a page-level missing-main-landmark issue", () => {
    expect(browserSource).toContain('ruleId: "ACT-R99"');
    expect(browserSource).toContain(
      "document.querySelectorAll(\"main, [role='main']\")",
    );
    expect(browserSource).not.toContain('preferredIds = ["content", "main", "appForm"]');
    expect(browserSource).toContain(
      'Document has no main landmark — add a <main> element or role="main" around the primary content',
    );
    expect(browserSource).toContain("runMissingMainLandmarkRule(results)");
    expect(read("artifacts/api-server/src/lib/scanner.ts")).toContain(
      'description: "Document has no main landmark"',
    );
    expect(
      read("artifacts/accessibility-scanner/src/lib/actRules.ts"),
    ).toContain('title: "Document has no main landmark"');
  });

  it("keeps ACT-R68 aligned with Siteimprove required-owned-role semantics", () => {
    const source = read("artifacts/api-server/src/lib/browser/rules/empty-containers.ts");
    expect(source).toContain('type: "Issue"');
    expect(source).toContain('list: [["listitem"]]');
    expect(source).toContain('getAttribute("aria-owns")');
    expect(source).toContain('getAttribute("aria-busy") === "true"');
    expect(source).not.toContain("SCAFFOLD");
    expect(read("artifacts/accessibility-scanner/src/lib/ai-engine.ts")).toContain(
      "The element does not own the children required by its semantic role.",
    );
  });

  it("runs Siteimprove-aligned ACT-R60 in the selected tables-forms family", () => {
    expect(read("artifacts/api-server/src/lib/browser/rules/tables-forms.ts"))
      .toContain("runControlGroupNameRule(results, pushStat)");
    expect(read("artifacts/api-server/src/lib/browser/rules/structure-misc.ts"))
      .not.toContain('ruleId: "ACT-R60"');
    expect(read("artifacts/api-server/src/lib/browser/rules/control-group-names.ts"))
      .toContain('ruleId: "ACT-R60", type: "Best Practice"');
  });

  it("keeps ACT-R55 a group-level content-equivalence review, not an autocomplete fix", () => {
    const source = read("artifacts/api-server/src/lib/browser/rules/headings-landmarks.ts");
    expect(source).toContain("for (const duplicateGroup of findDuplicateLandmarkNames(landmarks))");
    expect(source).toContain('ruleId: "ACT-R55"');
    expect(source).toContain('type: "Potential Issue"');
    expect(source).toContain("have the same or equivalent content?");
    expect(source).not.toContain("landmarkFingerprint");
    expect(source).not.toContain("isCarouselPattern");
    const aiSource = read("artifacts/accessibility-scanner/src/lib/ai-engine.ts");
    const guidance = aiSource.slice(aiSource.indexOf('"ACT-R55":'), aiSource.indexOf('"ACT-R74":'));
    expect(guidance).toContain("Review every landmark in the reported group");
    expect(guidance).not.toContain("autocomplete");
  });

  it("does not emit the manual R24 video-transcript question automatically", () => {
    expect(browserSource).toContain(
      'ruleId: "ACT-R24", type: "Potential Issue"',
    );
    expect(browserSource).toContain(
      "Its completeness cannot be",
    );
    expect(browserSource).toContain(
      "if (!EMIT_MANUAL_ONLY_RULES) return;",
    );
  });

  it("keeps the image-of-text rule manual-only", () => {
    expect(browserSource).toContain('ruleId: "ACT-R118"');
    expect(browserSource).toContain("purely decorative");
    expect(browserSource).toContain(
      "Does the image contain visible text that expresses something in a human language?",
    );
    expect(browserSource).toContain('getEffectiveAriaRole(el) === "img"');
    expect(browserSource).toContain("if (EMIT_MANUAL_ONLY_RULES)");
    expect(read("artifacts/api-server/src/lib/scanner.ts")).toContain(
      '"ACT-R118": { sc: ["1.4.5", "1.4.9"], level: ["AA", "AAA"] }',
    );
    expect(
      read("artifacts/accessibility-scanner/src/lib/actRules.ts"),
    ).toContain('"ACT-R118"');
  });

  it("keeps ACT-R128 aligned as the potential abbreviation rule", () => {
    expect(browserSource).toContain('ruleId: "ACT-R128"');
    expect(browserSource).toContain('type: "Potential Issue"');
    expect(read("artifacts/api-server/src/lib/scanner.ts")).toContain(
      '"ACT-R128": { sc: ["3.1.4"], level: ["AAA"] }',
    );
    expect(read("artifacts/api-server/src/lib/scanner.ts")).toContain(
      '"ACT-R128": {',
    );
    expect(
      read("artifacts/accessibility-scanner/src/lib/actRules.ts"),
    ).toContain('"ACT-R128"');
    expect(
      read("artifacts/accessibility-scanner/src/pages/home.tsx"),
    ).toContain('id: "ACT-R128"');
  });

  it("enables manual-only emission when an API scan explicitly selects a manual review rule", () => {
    const scannerSource = read("artifacts/api-server/src/lib/scanner.ts");
    expect(browserEntrySource).toContain(
      "options: { emitManualOnlyRules?: boolean } = {}",
    );
    expect(scannerSource).toContain('["ACT-R24", "ACT-R118"].includes');
    expect(scannerSource).toContain('selectedRuleSet.has("ACT-R24")');
    expect(scannerSource).toContain('selectedRuleSet.has("ACT-R118")');
    expect(scannerSource).toContain(
      "runAllRules(options)",
    );
  });

  it("does not scan a Cloudflare challenge page as a clean document", () => {
    const scannerSource = read("artifacts/api-server/src/lib/scanner.ts");
    expect(scannerSource).toContain('title.includes("just a moment")');
    expect(scannerSource).toContain(
      "bodyText.includes(\"performing security verification\")",
    );
    expect(scannerSource).toContain(
      "Cloudflare Bot Protection blocked the scan",
    );
  });

  it("hydrates blocked visual images only for issue-page snapshots", () => {
    const scannerSource = read("artifacts/api-server/src/lib/scanner.ts");
    expect(scannerSource).toContain("let allowVisualImages = false");
    expect(scannerSource).toContain("allowVisualImages = true");
    expect(scannerSource).toContain("hydrateVisualImages(page)");
    expect(scannerSource).toContain("img.naturalWidth === 0");
    expect(scannerSource).toContain('el.getAttribute("data-original")');
    expect(scannerSource).toContain("explicitly preload each visual URL");
    expect(scannerSource).toContain("let allowMediaMetadata = false");
    expect(scannerSource).toContain(
      '(type === "media" && !allowMediaMetadata)',
    );
    expect(scannerSource).toContain('video.preload = "metadata"');
    expect(scannerSource).toContain(
      'type === "image" && !allowVisualImages',
    );
  });

  it("discovers same-page anchor dropdowns and class-named popup triggers", () => {
    const scannerSource = read("artifacts/api-server/src/lib/scanner.ts");
    expect(scannerSource).toContain(
      "[data-toggle='collapse'],a[href]",
    );
    expect(scannerSource).toContain(
      "\\b(open|modal|dialog|popup|overlay|dropdown|toggle|accordion|collapse|menu|railcard|country|currency|language|filter)\\b",
    );
    expect(scannerSource).toContain(
      '!controlled.matches("input,select,textarea,output")',
    );
  });

  it("excludes initialized Video.js fallback text from R74", () => {
    expect(browserSource).toContain(
      'el.classList.contains("vjs-no-js") || /(^|_)no_?player/i.test(el.id) || el.closest(".video-js")',
    );
  });

  it("keeps the recent image, contrast, font-size, and enhanced target guards", () => {
    expect(browserSource).toContain('img.closest("noscript")');
    expect(browserSource).toContain('explicitRole === "none" || explicitRole === "presentation"');
    expect(browserSource).toContain('img.hasAttribute("alt")');
    expect(browserSource).toContain('hasAbsoluteFontSizeDeclaration');
    expect(browserSource).toContain("rootAbsoluteFontSize");
    expect(browserSource).toContain("hasVisibleParagraphText");
    expect(browserSource).toContain(
      "Report that shared declaration once instead of repeating the same root",
    );
    expect(browserSource).toContain("language-detector-franc-min-v1");
    expect(browserEntrySource).toContain("verifyLanguageDetectorBundle");
    expect(browserSource).toContain('ruleId: "ACT-R111"');
    expect(browserSource).toContain("isIncludedInAccessibilityTree");
    expect(read("artifacts/api-server/src/lib/browser/contrast.ts")).toContain(
      "hasIndeterminateLayer",
    );
    expect(read("artifacts/api-server/src/lib/browser/alfa-helpers.ts")).toContain(
      "rectangleDistanceSquared(targetBounds, otherBounds) < size * size",
    );
    expect(read("artifacts/api-server/src/lib/browser/alfa-helpers.ts")).toContain(
      "visible descendants that are not",
    );
    expect(read("artifacts/api-server/src/lib/browser/alfa-helpers.ts")).toContain(
      "getAlfaTargetRects(candidate).length > 0",
    );
  });

  it("does not emit the ACT-R23 visual-alternative question automatically", () => {
    expect(browserSource).toContain("if (EMIT_MANUAL_ONLY_RULES) {");
    expect(browserSource).toContain('ruleId: "ACT-R23"');
    expect(documentationSource).toContain("Manual Only (Cannot Be Automated)");
    for (const criterion of [
      "1.2.4", "1.3.2", "1.3.3", "1.4.5", "1.4.10", "1.4.11",
      "1.4.13", "2.1.2", "2.1.4", "2.2.2", "2.3.1", "2.4.3",
      "2.4.5", "2.4.12", "2.5.1", "2.5.2", "2.5.4", "2.5.7",
      "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.6", "3.3.2",
      "3.3.3", "3.3.4", "3.3.7", "3.3.8", "3.3.9",
    ]) {
      expect(documentationSource).toContain(`"${criterion}"`);
    }
  });
});