import { describe, expect, it } from "vitest";
import { canRunDiscoveryWorker, getDiscoveryProfileDir } from "./crawler";

describe("crawler pipeline state guards", () => {
  it("keeps normal discovery workers in Phase 1 only", () => {
    expect(canRunDiscoveryWorker("discovering", false)).toBe(true);
    expect(canRunDiscoveryWorker("scanning", false)).toBe(false);
    expect(canRunDiscoveryWorker("paused", false)).toBe(false);
    expect(canRunDiscoveryWorker("completed", false)).toBe(false);
  });

  it("keeps Crawl Boost discovery workers alive while Phase 2 is scanning", () => {
    expect(canRunDiscoveryWorker("discovering", true)).toBe(true);
    expect(canRunDiscoveryWorker("scanning", true)).toBe(true);
    expect(canRunDiscoveryWorker("paused", true)).toBe(false);
    expect(canRunDiscoveryWorker("completed", true)).toBe(false);
  });
});

describe("discovery profile storage", () => {
  it("uses a distinct persistent sibling of the scanner profile by default", () => {
    expect(
      getDiscoveryProfileDir({
        HOME: "/root",
        CHROME_PROFILE_DIR: "/home/a11y-chrome-profile",
      }),
    ).toBe("/home/a11y-chrome-profile-discovery");
  });

  it("honors an explicit discovery-profile override", () => {
    expect(
      getDiscoveryProfileDir({
        HOME: "/root",
        CHROME_PROFILE_DIR: "/home/a11y-chrome-profile",
        CRAWLER_PROFILE_DIR: "/mnt/crawler-profile",
      }),
    ).toBe("/mnt/crawler-profile");
  });
});