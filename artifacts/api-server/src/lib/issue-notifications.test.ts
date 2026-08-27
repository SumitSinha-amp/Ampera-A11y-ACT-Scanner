import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filterEligibleIssueRecipients,
  getPublicAppUrl,
  splitCommentRecipientIds,
  uniqueRecipientIds,
  type IssueRecipient,
} from "./issue-notifications";

afterEach(() => {
  vi.unstubAllEnvs();
});

const users: IssueRecipient[] = [
  { id: 1, email: "actor@example.com", fullName: "Actor", role: "user", isActive: true },
  { id: 2, email: "reporter@example.com", fullName: "Reporter", role: "user", isActive: true },
  { id: 3, email: "assignee@example.com", fullName: "Assignee", role: "user", isActive: true },
  { id: 4, email: "inactive@example.com", fullName: "Inactive", role: "user", isActive: false },
  { id: 5, email: "restricted@example.com", fullName: "Restricted", role: "user", isActive: true },
];

describe("issue notification recipients", () => {
  it("deduplicates recipients and removes the actor", () => {
    expect(uniqueRecipientIds(1, [1, 2, 2, null, 3, undefined])).toEqual([2, 3]);
  });

  it("gives direct mentions precedence over general comment alerts", () => {
    expect(splitCommentRecipientIds(
      { reporterId: 2, assigneeId: 3 },
      1,
      [2, 4, 4],
    )).toEqual({
      mentioned: [2, 4],
      commented: [3],
    });
  });

  it("keeps only active recipients with issue viewing permission", async () => {
    const recipients = await filterEligibleIssueRecipients(
      [1, 2, 3, 4, 5],
      1,
      users,
      async (user) => user.id !== 5,
    );
    expect(recipients.map((user) => user.id)).toEqual([2, 3]);
  });

  it("builds email links from a configured canonical URL rather than request headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PUBLIC_URL", "https://app.example.com/scanner/");
    vi.stubEnv("BASE_PATH", "/ignored-when-explicit");
    expect(getPublicAppUrl()).toBe("https://app.example.com/scanner");
  });

  it("uses a trusted platform hostname when no canonical URL is configured", () => {
    vi.stubEnv("APP_PUBLIC_URL", "");
    vi.stubEnv("WEBSITE_HOSTNAME", "ampera.example.azurewebsites.net");
    vi.stubEnv("BASE_PATH", "/scanner/");
    expect(getPublicAppUrl()).toBe("https://ampera.example.azurewebsites.net/scanner");
  });
});