import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontend = "../../accessibility-scanner/src/";
const read = (file: string) => readFileSync(new URL(`${frontend}${file}`, import.meta.url), "utf8");
const version = read("lib/app-version.ts");
const updates = read("pages/app-updates.tsx");
const welcome = read("pages/welcome.tsx");

describe("app release continuity", () => {
  it("uses one current version and shared summary across the welcome and update pages", () => {
    expect(version).toContain('APP_VERSION = "1.4.9"');
    expect(version).toContain('APP_RELEASE_MONTH = "November 2026"');
    expect(version).toContain("APP_RELEASE_SUMMARY");
    expect(updates).toContain("summary: APP_RELEASE_SUMMARY");
    expect(welcome).toContain("{APP_RELEASE_SUMMARY}");
    expect(welcome).toContain("{APP_RELEASE_TITLE} in {APP_VERSION}");
    expect(updates).toContain("groups: release149ProductGroups");
  });
  it("retains every previous release, including the full data-protection update", () => {
    for (const release of ["1.4.8", "1.4.7", "1.4.6", "1.4.5", "1.4.4", "1.4.3", "1.4.2", "1.3.0"]) {
      expect(updates).toContain(`version: "${release}"`);
    }
    expect(updates).toContain("version: APP_RULE_MAPPING_RELEASE");
    expect(version).toContain('APP_RULE_MAPPING_RELEASE = "1.4.1"');
    expect(updates).toContain("groups: release146ProductGroups");
    expect(updates).toContain("groups: release147ProductGroups");
    expect(updates).toContain("groups: release148ProductGroups");
    expect(updates).toContain("This release updates guidance, not scanner detection behavior.");
    expect(updates).toContain("Data protection and Issue Management recovery");
    expect(updates).toContain("Highlight occurrences without reloading");
    expect(updates).toContain("Scan progress that reflects each stage");
  });
  it("separates justification guidance from spacing layout without claiming detector fixes", () => {
    const rules = read("lib/actRules.ts");
    const docs = read("pages/documentation.tsx");
    expect(rules).toContain('title: "Paragraph text is fully justified"');
    expect(rules).not.toContain('title: "Uneven spacing in text"');
    expect(rules).toContain("already severe clipping can conceal further deterioration");
    expect(docs).toContain("Visual presentation versus text-spacing layout");
    expect(updates).toContain("Corrected paragraph-justification guidance");
    expect(updates).toContain("does not change ACT-R113 target spacing or ACT-R129 detection behavior");
  });
  it("highlights target geometry and nested states without changing heading-rule claims", () => {
    expect(welcome).toContain("Understand target-size results");
    expect(welcome).toContain("24×24 CSS pixels or have sufficient spacing");
    expect(version).toContain("Unresolved target artwork or fonts remain Potential Issues");
    expect(updates).toContain("More accurate target size and spacing");
    expect(updates).toContain("Nested interactive-state coverage");
    expect(updates).toContain("each discovered selector is clicked at most once");
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
  it("includes the full recent rule roundup in the current release", () => {
    const currentGroups = updates.slice(updates.indexOf("const release149ProductGroups"), updates.indexOf("type ReleaseHistoryEntry"));
    for (const id of [7, 8, 16, 23, 30, 41, 44, 46, 47, 50, 60, 65, 66, 69, 71, 73, 74, 76, 77, 78, 80, 81, 83, 85, 88, 89, 97, 98, 99, 100, 101, 113, 119, 121, 129, 130, 131, 132]) {
      expect(currentGroups, `Missing current release coverage for ACT-R${id}`).toMatch(new RegExp(`ACT-R${id}(?!\\d)`));
    }
    expect(currentGroups).toContain("these wording and mapping updates do not change their detectors");
    expect(currentGroups).toContain("not PDF tagging");
    expect(currentGroups).toContain("an H1 followed by an H2 and content is not automatically an empty section");
    expect(version).toContain("Accessibility rule accuracy and coverage roundup");
  });
});
