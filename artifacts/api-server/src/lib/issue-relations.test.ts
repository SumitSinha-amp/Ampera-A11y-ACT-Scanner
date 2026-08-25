import { describe, expect, it } from "vitest";
import {
  canonicalizeIssueLink,
  isIssueLinkType,
  relationshipIdentity,
  wouldCreateParentCycle,
  type IssueLinkRecord,
} from "./issue-relations";

describe("issue relationships", () => {
  it("accepts only supported link types", () => {
    expect(isIssueLinkType("parent")).toBe(true);
    expect(isIssueLinkType("blocked_by")).toBe(true);
    expect(isIssueLinkType("anything_else")).toBe(false);
  });

  it("normalizes inverse and symmetric relationship identities", () => {
    expect(relationshipIdentity("parent", 1, 2)).toBe(relationshipIdentity("child", 2, 1));
    expect(relationshipIdentity("blocks", 1, 2)).toBe(relationshipIdentity("blocked_by", 2, 1));
    expect(relationshipIdentity("relates_to", 1, 2)).toBe(relationshipIdentity("relates_to", 2, 1));
    expect(relationshipIdentity("duplicates", 1, 2)).toBe(relationshipIdentity("duplicated_by", 2, 1));
  });

  it("converts inverse UI phrases to the one persisted relationship form", () => {
    expect(canonicalizeIssueLink({ sourceIssueId: 2, targetIssueId: 1, linkType: "child" }))
      .toEqual({ sourceIssueId: 1, targetIssueId: 2, linkType: "parent" });
    expect(canonicalizeIssueLink({ sourceIssueId: 2, targetIssueId: 1, linkType: "blocked_by" }))
      .toEqual({ sourceIssueId: 1, targetIssueId: 2, linkType: "blocks" });
    expect(canonicalizeIssueLink({ sourceIssueId: 2, targetIssueId: 1, linkType: "relates_to" }))
      .toEqual({ sourceIssueId: 1, targetIssueId: 2, linkType: "relates_to" });
  });

  it("rejects parent-child cycles but allows an acyclic hierarchy", () => {
    const existing: IssueLinkRecord[] = [
      { sourceIssueId: 1, targetIssueId: 2, linkType: "parent" },
      { sourceIssueId: 2, targetIssueId: 3, linkType: "parent" },
    ];

    expect(wouldCreateParentCycle(existing, { sourceIssueId: 3, targetIssueId: 1, linkType: "parent" })).toBe(true);
    expect(wouldCreateParentCycle(existing, { sourceIssueId: 1, targetIssueId: 4, linkType: "parent" })).toBe(false);
    expect(wouldCreateParentCycle(existing, { sourceIssueId: 3, targetIssueId: 4, linkType: "blocks" })).toBe(false);
  });
});