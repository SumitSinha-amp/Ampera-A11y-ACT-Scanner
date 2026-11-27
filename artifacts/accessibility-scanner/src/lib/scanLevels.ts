/** All five UI-level identifiers for the accessibility scope selector. */
export const ALL_SCAN_LEVELS = ["A", "AA", "AAA", "WAI-ARIA", "Best Practice"] as const;
export type ScanLevel = (typeof ALL_SCAN_LEVELS)[number];

type RuleLevelMetadata = Record<string, { wcagLevel?: readonly string[] }>;

/** Exact union of category memberships, not cumulative WCAG conformance. */
export function getSelectedRuleLevels(
  ruleIds: readonly string[],
  metadata: RuleLevelMetadata,
): ScanLevel[] {
  const levels = new Set(ruleIds.flatMap(id =>
    (metadata[id]?.wcagLevel ?? []).map(level => level === "ARIA APG" ? "WAI-ARIA" : level),
  ));
  return ALL_SCAN_LEVELS.filter(level => levels.has(level));
}

export function ruleMatchesScanLevels(
  ruleId: string,
  levels: readonly string[],
  metadata: RuleLevelMetadata,
): boolean {
  const membership = getSelectedRuleLevels([ruleId], metadata);
  return membership.length === 0 || membership.some(level => levels.includes(level));
}
