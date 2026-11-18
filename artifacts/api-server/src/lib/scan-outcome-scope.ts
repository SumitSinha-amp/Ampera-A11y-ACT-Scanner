/** Scope controls advisory outcomes as well as the rules selected for execution.
 * Missing/empty scope is the legacy "all levels" default, not an exclusion.
 */
export function excludesBestPracticeOutcomes(options: unknown): boolean {
  if (!options || typeof options !== "object") return false;
  const levels = (options as { wcagLevels?: unknown }).wcagLevels;
  return Array.isArray(levels) &&
    levels.some((level) => ["A", "AA", "AAA", "WAI-ARIA"].includes(level)) &&
    !levels.includes("Best Practice");
}

export function filterScanOutcomes<T extends { type?: string | null; ruleType?: string | null }>(
  issues: readonly T[],
  options: unknown,
): T[] {
  return excludesBestPracticeOutcomes(options)
    ? issues.filter((issue) => (issue.type ?? issue.ruleType) !== "Best Practice")
    : [...issues];
}

/** Only pass trusted SQL column expressions here, never request values. */
export function bestPracticeExcludedSql(optionsColumn: string): string {
  const levels = `(${optionsColumn})::jsonb->'wcagLevels'`;
  return `COALESCE((jsonb_typeof(${levels}) = 'array'
    AND (${levels}) ?| ARRAY['A', 'AA', 'AAA', 'WAI-ARIA']
    AND NOT ((${levels}) ? 'Best Practice')), FALSE)`;
}

/** Keeps historical rows stored, but applies their saved scope when reading. */
export function scanOutcomeVisibilitySql(typeColumn: string, optionsColumn: string): string {
  return `(COALESCE(${typeColumn}, 'Issue') <> 'Best Practice'
    OR NOT (${bestPracticeExcludedSql(optionsColumn)}))`;
}
