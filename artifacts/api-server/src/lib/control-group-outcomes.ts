type GroupFinding = {
  ruleId: string;
  type: string;
  occurrenceKey?: string;
};

export function controlGroupStateKey(
  issue: GroupFinding & { selector?: string | null; description: string },
): string {
  return issue.ruleId === "ACT-R60" && issue.occurrenceKey
    ? `${issue.ruleId}|${issue.occurrenceKey}|${issue.type}`
    : `${issue.ruleId}|${issue.selector ?? ""}|${issue.description}`;
}

/**
 * R60's dormant review and exposed-group check describe the same defect.
 * Keep verified exposed evidence over dormant review, even when opening a
 * popup changes the description or adds siblings that change CSS selectors.
 * Never deduplicate different DOM nodes or findings from unrelated rules.
 */
export function resolveControlGroupOutcomes<T extends GroupFinding>(issues: T[]): T[] {
  const result: T[] = [];
  const indices = new Map<string, number>();
  for (const issue of issues) {
    if (issue.ruleId !== "ACT-R60" || !issue.occurrenceKey) {
      result.push(issue);
      continue;
    }
    const index = indices.get(issue.occurrenceKey);
    if (index === undefined) {
      indices.set(issue.occurrenceKey, result.length);
      result.push(issue);
      continue;
    }
    const previous = result[index]!;
    if (previous.type !== "Best Practice" || issue.type === "Best Practice") {
      result[index] = issue;
    }
  }
  return result;
}
