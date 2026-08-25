import { describe, expect, it } from "vitest";
import { canTransitionIssue, getAllowedIssueTransitions, terminalIssueStatus } from "./issue-workflow";

describe("issue workflow transitions", () => {
  it("uses the requested task and story lifecycle with deployment before review", () => {
    expect(getAllowedIssueTransitions("task", "todo")).toEqual(["in_progress"]);
    expect(getAllowedIssueTransitions("task", "in_progress")).toEqual(["deployed"]);
    expect(getAllowedIssueTransitions("story", "deployed")).toEqual(["review"]);
    expect(getAllowedIssueTransitions("story", "release_to_retest")).toEqual(["reopen", "verified"]);
    expect(getAllowedIssueTransitions("task", "verified")).toEqual(["complete"]);
    expect(terminalIssueStatus("story")).toBe("complete");
  });

  it("uses Closed as the bug terminal status", () => {
    expect(getAllowedIssueTransitions("bug", "release_to_retest")).toEqual(["reopen", "verified"]);
    expect(getAllowedIssueTransitions("bug", "verified")).toEqual(["closed"]);
    expect(terminalIssueStatus("bug")).toBe("closed");
  });

  it("only allows the forward path and reopen loop", () => {
    expect(canTransitionIssue("bug", "review", "release_to_retest")).toBe(true);
    expect(canTransitionIssue("bug", "release_to_retest", "reopen")).toBe(true);
    expect(canTransitionIssue("bug", "reopen", "in_progress")).toBe(true);
    expect(canTransitionIssue("bug", "todo", "verified")).toBe(false);
    expect(canTransitionIssue("task", "complete", "in_progress")).toBe(false);
  });

  it("uses the complete lifecycle for the Jira-style planning types", () => {
    expect(getAllowedIssueTransitions("epic", "in_progress")).toEqual(["deployed"]);
    expect(getAllowedIssueTransitions("content", "verified")).toEqual(["complete"]);
    expect(getAllowedIssueTransitions("request", "release_to_retest")).toEqual(["reopen", "verified"]);
    expect(terminalIssueStatus("test")).toBe("complete");
  });
});