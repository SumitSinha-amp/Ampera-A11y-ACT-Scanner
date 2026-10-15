import type { ScanIssue } from "./scanner";

const CONTRAST_RULE_IDS = new Set(["ACT-R66", "ACT-R69", "ACT-R88", "ACT-R89"]);

function occurrenceKey(issue: ScanIssue): string | null {
  if (!CONTRAST_RULE_IDS.has(issue.ruleId) || !issue.selector?.trim()) return null;
  return JSON.stringify([
    issue.ruleId,
    issue.selector,
    issue.interactionStateKey ?? null,
  ]);
}

/**
 * Pixel evidence replaces CSS evidence for the same rule, element and state.
 * Keep the DOM context, but use the pixel result's ratio and classification.
 * Distinct AA/AAA rules and findings from revealed UI states remain separate.
 */
export function mergeContrastFindings(
  existing: ScanIssue[],
  pixelFindings: ScanIssue[],
): ScanIssue[] {
  const replacements = new Map<string, ScanIssue>();
  for (const finding of pixelFindings) {
    const key = occurrenceKey(finding);
    if (key !== null) replacements.set(key, finding);
  }

  const priorEvidence = new Map<string, ScanIssue>();
  const merged = existing.filter((finding) => {
    const key = occurrenceKey(finding);
    if (key === null || !replacements.has(key)) return true;
    if (!priorEvidence.has(key)) priorEvidence.set(key, finding);
    return false;
  });

  for (const [key, finding] of replacements) {
    const previous = priorEvidence.get(key);
    merged.push({
      ...previous,
      ...finding,
      element: finding.element ?? previous?.element ?? null,
      elementContext: finding.elementContext ?? previous?.elementContext ?? null,
    });
  }
  // Missing selectors cannot safely identify an occurrence; never collapse them.
  merged.push(...pixelFindings.filter((finding) => occurrenceKey(finding) === null));
  return merged;
}
