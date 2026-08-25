export const ISSUE_LINK_TYPES = [
  "parent",
  "child",
  "blocks",
  "blocked_by",
  "relates_to",
  "duplicates",
  "duplicated_by",
] as const;

export type IssueLinkType = (typeof ISSUE_LINK_TYPES)[number];

export interface IssueLinkRecord {
  sourceIssueId: number;
  targetIssueId: number;
  linkType: IssueLinkType;
}

export function isIssueLinkType(value: unknown): value is IssueLinkType {
  return typeof value === "string" && ISSUE_LINK_TYPES.includes(value as IssueLinkType);
}

/**
 * Stores each semantic relationship exactly once. The UI can still accept and
 * display inverse terms (child of, blocked by, duplicated by), but persistence
 * only uses parent, blocks, relates_to, and duplicates.
 */
export function canonicalizeIssueLink(link: IssueLinkRecord): IssueLinkRecord {
  if (link.linkType === "child") {
    return { sourceIssueId: link.targetIssueId, targetIssueId: link.sourceIssueId, linkType: "parent" };
  }
  if (link.linkType === "blocked_by") {
    return { sourceIssueId: link.targetIssueId, targetIssueId: link.sourceIssueId, linkType: "blocks" };
  }
  if (link.linkType === "duplicated_by") {
    return { sourceIssueId: link.targetIssueId, targetIssueId: link.sourceIssueId, linkType: "duplicates" };
  }
  if (link.linkType === "relates_to" && link.sourceIssueId > link.targetIssueId) {
    return { sourceIssueId: link.targetIssueId, targetIssueId: link.sourceIssueId, linkType: "relates_to" };
  }
  return link;
}

export function relationshipIdentity(linkType: IssueLinkType, sourceIssueId: number, targetIssueId: number): string {
  const canonical = canonicalizeIssueLink({ sourceIssueId, targetIssueId, linkType });
  return `${canonical.linkType}:${canonical.sourceIssueId}:${canonical.targetIssueId}`;
}

export function hierarchyEdge(link: IssueLinkRecord): { parentId: number; childId: number } | null {
  if (link.linkType === "parent") return { parentId: link.sourceIssueId, childId: link.targetIssueId };
  if (link.linkType === "child") return { parentId: link.targetIssueId, childId: link.sourceIssueId };
  return null;
}

export function wouldCreateParentCycle(existingLinks: IssueLinkRecord[], nextLink: IssueLinkRecord): boolean {
  const nextEdge = hierarchyEdge(nextLink);
  if (!nextEdge) return false;

  const parentsByChild = new Map<number, Set<number>>();
  for (const link of existingLinks) {
    const edge = hierarchyEdge(link);
    if (!edge) continue;
    const parents = parentsByChild.get(edge.childId) ?? new Set<number>();
    parents.add(edge.parentId);
    parentsByChild.set(edge.childId, parents);
  }

  const toVisit = [nextEdge.parentId];
  const visited = new Set<number>();
  while (toVisit.length) {
    const current = toVisit.pop()!;
    if (current === nextEdge.childId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const parentId of parentsByChild.get(current) ?? []) toVisit.push(parentId);
  }

  return false;
}