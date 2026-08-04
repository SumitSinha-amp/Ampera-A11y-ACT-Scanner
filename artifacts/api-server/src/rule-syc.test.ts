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
const browserRulePaths = [
  "artifacts/api-server/src/lib/browser/rules/aria.ts",
  "artifacts/api-server/src/lib/browser/rules/document-language.ts",
  "artifacts/api-server/src/lib/browser/rules/headings-landmarks.ts",
  "artifacts/api-server/src/lib/browser/rules/keyboard-misc.ts",
  "artifacts/api-server/src/lib/browser/rules/links-contrast.ts",
  "artifacts/api-server/src/lib/browser/rules/media.ts",
  "artifacts/api-server/src/lib/browser/rules/names.ts",
  "artifacts/api-server/src/lib/browser/rules/structure-misc.ts",
  "artifacts/api-server/src/lib/browser/rules/tables-forms.ts",
  "artifacts/api-server/src/lib/browser/rules/text-style.ts",
] as const;

const browserSource = browserRulePaths.map((path) => read(path)).join("\n");
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
    expect(browserSource).not.toContain(
      'ruleId: "ACT-R68", type: "Issue", impact: "serious", description: `Element with role=',
    );
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

  it("does not emit the manual R24 video-transcript question automatically", () => {
    expect(browserSource).toContain(
      'ruleId: "ACT-R24", type: "Potential Issue"',
    );
    expect(browserSource).toContain(
      "the browser engine cannot verify completeness or equivalence",
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
    expect(browserSource).toContain('ruleId: "ACT-R111"');
    expect(browserSource).toContain("isIncludedInAccessibilityTree");
    expect(read("artifacts/api-server/src/lib/browser/contrast.ts")).toContain(
      "hasIndeterminateLayer",
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