/**
 * Occurrence-level mappings must survive both initial enrichment and
 * interactive-state re-enrichment. Do not remap every outcome of a rule.
 */
export function outcomeWcag<T>(ruleId: string, type: string, fallback: T): T | { sc: string[]; level: string[] } {
  return ruleId === "ACT-R8" && type === "Potential Issue"
    ? { sc: ["3.3.2"], level: ["A"] }
    : fallback;
}
