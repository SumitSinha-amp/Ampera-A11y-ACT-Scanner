import { describe, expect, it } from "vitest";
import { freezePausedScanProgress, getScanProgress } from "./scan-progress";

describe("scan stage progress", () => {
  it.each([
    ["pending", 0], ["requeued", 5], ["navigating", 10],
    ["rendering", 35], ["analyzing", 65], ["scanning", 65], ["saving", 90],
  ])("includes the %s stage for a single URL", (status, percent) => {
    expect(getScanProgress({ totalUrls: 1, status: "running", counts: { [status]: 1 } }).percent)
      .toBe(percent);
  });

  it("counts every terminal outcome and active work across all URLs", () => {
    expect(getScanProgress({
      totalUrls: 5, status: "running",
      counts: { completed: 1, failed: 1, not_available: 1, analyzing: 1, pending: 1 },
    })).toEqual({ percent: 73, processed: 3 });
  });

  it("uses aggregate counts rather than a truncated live page sample", () => {
    expect(getScanProgress({
      totalUrls: 1000, status: "running", counts: { completed: 900, pending: 100 },
      pages: [{ status: "pending" }],
    })).toEqual({ percent: 90, processed: 900 });
  });

  it("falls back to pages and session counters when aggregates are absent", () => {
    expect(getScanProgress({
      totalUrls: 2, status: "running", pages: [{ status: "saving" }, { status: "failed" }],
    })).toEqual({ percent: 95, processed: 1 });
    expect(getScanProgress({
      totalUrls: 4, status: "running", scannedUrls: 1, failedUrls: 1,
    })).toEqual({ percent: 50, processed: 2 });
  });

  it("reserves 100% for finalization and handles zero URLs", () => {
    expect(getScanProgress({ totalUrls: 1, status: "running", counts: { failed: 1 } }).percent).toBe(99);
    expect(getScanProgress({ totalUrls: 1, status: "completed", counts: { failed: 1 } }).percent).toBe(100);
    expect(getScanProgress({ totalUrls: 0, status: "pending" }).percent).toBe(0);
  });

  it("freezes on pause, resumes from real stages, and does not freeze a different scan", () => {
    const previous = { scanId: 1, status: "running", percent: 35, authoritative: true };
    const paused = { ...previous, status: "paused", percent: 65 };
    expect(freezePausedScanProgress(previous, paused).percent).toBe(35);
    expect(freezePausedScanProgress(previous, { ...paused, status: "running" }).percent).toBe(65);
    expect(freezePausedScanProgress(previous, { ...paused, scanId: 2 }).percent).toBe(65);
  });
});
