import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontend = "../../accessibility-scanner/src/";
const read = (file: string) => readFileSync(new URL(`${frontend}${file}`, import.meta.url), "utf8");
const version = read("lib/app-version.ts");
const updates = read("pages/app-updates.tsx");
const welcome = read("pages/welcome.tsx");

describe("app release continuity", () => {
  it("uses one current version and shared summary across the welcome and update pages", () => {
    expect(version).toContain('APP_VERSION = "1.4.7"');
    expect(version).toContain("APP_RELEASE_SUMMARY");
    expect(updates).toContain("summary: APP_RELEASE_SUMMARY");
    expect(welcome).toContain("{APP_RELEASE_SUMMARY}");
    expect(welcome).toContain("{APP_RELEASE_TITLE} in {APP_VERSION}");
    expect(updates).toContain("groups: release147ProductGroups");
  });
  it("retains every previous release, including the full data-protection update", () => {
    for (const release of ["1.4.6", "1.4.5", "1.4.4", "1.4.3", "1.4.2", "1.3.0"]) {
      expect(updates).toContain(`version: "${release}"`);
    }
    expect(updates).toContain("version: APP_RULE_MAPPING_RELEASE");
    expect(version).toContain('APP_RULE_MAPPING_RELEASE = "1.4.1"');
    expect(updates).toContain("groups: release146ProductGroups");
    expect(updates).toContain("Data protection and Issue Management recovery");
    expect(updates).toContain("Highlight occurrences without reloading");
    expect(updates).toContain("Scan progress that reflects each stage");
  });
  it("describes actual review boundaries without claiming automatic submission", () => {
    expect(updates).toContain("Existing automatic ACT-R82 Issues remain unchanged");
    expect(updates).toContain("Normal scans do not fill fields");
    expect(updates).toContain("Negative tabindex alone is not treated as a failure");
    expect(updates).toContain("already-loaded visible frames");
    expect(updates).toContain("Best Practice guidance rather than proof of a WCAG failure");
  });
  it("opens the latest release groups and preserves earlier interface showcases", () => {
    expect(updates).toContain("new Set(releaseHistory[0].groups.slice(0, 2)");
    expect(updates).toContain("selectedRelease.showcase !== false");
  });
});
