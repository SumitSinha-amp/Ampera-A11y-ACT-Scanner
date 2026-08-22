import { ALL_SCAN_LEVELS } from "@/lib/scanLevels";
import { ACT_RULES } from "@/lib/actRules";

export type ScanRuleDisplayOptions = {
  rules?: unknown;
  selectedRules?: unknown;
  wcagLevels?: unknown;
};

export type ScanRuleDisplay =
  | {
      mode: "levels";
      values: string[];
      appliedRules: string[];
    }
  | {
      mode: "rules";
      values: string[];
      appliedRules: string[];
    }
  | {
      mode: "all";
      values: [];
      appliedRules: string[];
    };

function stringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)),
  );
}

function normalizeRuleId(ruleId: string): string {
  const normalized = ruleId.trim().toUpperCase();
  return normalized.startsWith("SIA-")
    ? `ACT-${normalized.slice("SIA-".length)}`
    : normalized;
}

export function getScanRuleDisplay(
  options: ScanRuleDisplayOptions | null | undefined,
): ScanRuleDisplay {
  const appliedRules = stringValues(options?.rules).map(normalizeRuleId);
  const selectedRules = stringValues(options?.selectedRules).map(normalizeRuleId);
  const requestedLevels = stringValues(options?.wcagLevels).filter((level) =>
    (ALL_SCAN_LEVELS as readonly string[]).includes(level),
  );

  if (selectedRules.length > 0) {
    return { mode: "rules", values: selectedRules, appliedRules };
  }

  if (Array.isArray(options?.wcagLevels)) {
    return {
      mode: "levels",
      values: requestedLevels.length > 0 ? requestedLevels : [...ALL_SCAN_LEVELS],
      appliedRules,
    };
  }

  if (appliedRules.length > 0) {
    // Older scans only stored the expanded list of rules, so a broad scope
    // looked identical to a huge hand-picked list. Treat a large legacy list
    // as a scope and derive its levels from the rule metadata. New scans keep
    // wcagLevels/selectedRules explicitly and never need this fallback.
    if (appliedRules.length > 12) {
      const legacyLevels = new Set<string>();
      for (const ruleId of appliedRules) {
        for (const level of ACT_RULES[ruleId]?.wcagLevel ?? []) {
          legacyLevels.add(level === "ARIA APG" ? "WAI-ARIA" : level);
        }
      }
      const values = ALL_SCAN_LEVELS.filter((level) => legacyLevels.has(level));
      if (values.length > 0) {
        return { mode: "levels", values, appliedRules };
      }
    }
    return { mode: "rules", values: appliedRules, appliedRules };
  }

  return { mode: "all", values: [], appliedRules };
}

export const SCAN_LEVEL_BADGES: Record<string, string> = {
  A: "A",
  AA: "AA",
  AAA: "AAA",
  "WAI-ARIA": "ARIA",
  "Best Practice": "BP",
};
