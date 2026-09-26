import { describe, expect, it } from "vitest";
import {
  calculateScanResourceAllocation,
  clampScanConcurrency,
  isBrowserInfrastructureError,
  isLikelyNonHtmlDocumentUrl,
  isSuccessfulNonHtmlPreflight,
  isUserRequestedScanAbort,
  isTransientDatabaseError,
} from "./scanQueue";

describe("manual scan database recovery", () => {
  it("recognizes wrapped PostgreSQL connection timeouts as transient", () => {
    const error = new Error("Failed query: update page_results");
    (error as Error & { cause?: unknown }).cause = new Error(
      "Connection terminated due to connection timeout: Connection terminated unexpectedly",
    );

    expect(isTransientDatabaseError(error)).toBe(true);
  });

  it("does not treat read-only or query-shape failures as transient connectivity errors", () => {
    expect(
      isTransientDatabaseError(
        new Error("cannot execute UPDATE in a read-only transaction"),
      ),
    ).toBe(false);
    expect(isTransientDatabaseError(new Error("column does not exist"))).toBe(
      false,
    );
  });

  it("recognizes Chromium launch and host resource failures as scanner infrastructure errors", () => {
    expect(
      isBrowserInfrastructureError(
        new Error("Browser launch timed out after 30000ms"),
      ),
    ).toBe(true);
    expect(
      isBrowserInfrastructureError(
        new Error("Failed to launch the browser process: spawn EAGAIN"),
      ),
    ).toBe(true);
    expect(
      isBrowserInfrastructureError(new Error("Navigation timeout of 30000 ms exceeded")),
    ).toBe(false);
  });

  it("does not let per-scan options exceed deployment browser capacity", () => {
    expect(clampScanConcurrency(8, 2)).toBe(2);
    expect(clampScanConcurrency(1, 2)).toBe(1);
    expect(clampScanConcurrency(undefined, 2)).toBe(2);
    expect(clampScanConcurrency(0, 2)).toBe(1);
  });

  it("keeps per-scan concurrency bounded independently of active scan count", () => {
    expect(calculateScanResourceAllocation(2, 1)).toEqual({
      deploymentCapacity: 2,
      perScanCapacity: 1,
    });
    expect(calculateScanResourceAllocation(4, 2)).toEqual({
      deploymentCapacity: 4,
      perScanCapacity: 2,
    });
    expect(calculateScanResourceAllocation(2, 8)).toEqual({
      deploymentCapacity: 2,
      perScanCapacity: 2,
    });
  });

  it("only treats an explicit user request as scan cancellation", () => {
    const userCancelled = new AbortController();
    userCancelled.abort("user_cancelled");
    expect(isUserRequestedScanAbort(userCancelled.signal)).toBe(true);

    for (const reason of [
      "shutdown",
      "lease_lost",
      "browser_infrastructure",
    ]) {
      const interrupted = new AbortController();
      interrupted.abort(reason);
      expect(isUserRequestedScanAbort(interrupted.signal)).toBe(false);
    }
  });

  it("identifies document URLs that must bypass the DOM browser scanner", () => {
    expect(
      isLikelyNonHtmlDocumentUrl(
        "https://example.com/assets/report.PDF?download=1#page=2",
      ),
    ).toBe(true);
    expect(
      isLikelyNonHtmlDocumentUrl("https://example.com/files/presentation.pptx"),
    ).toBe(true);
    expect(
      isLikelyNonHtmlDocumentUrl("https://example.com/products/pdf-viewer"),
    ).toBe(false);
    expect(
      isLikelyNonHtmlDocumentUrl("https://example.com/page.html"),
    ).toBe(false);
  });

  it("only bypasses Chromium for a successful confirmed non-HTML response", () => {
    const base = {
      requestedUrl: "https://example.com/report.pdf",
      capturedAt: new Date(),
      classification: "non_html" as const,
      acquisitionMethod: "static_http" as const,
      proxyStrategy: "direct" as const,
      contentType: "application/pdf",
    };
    expect(isSuccessfulNonHtmlPreflight({ ...base, status: 200 })).toBe(true);
    expect(isSuccessfulNonHtmlPreflight({ ...base, status: 302 })).toBe(true);
    expect(isSuccessfulNonHtmlPreflight({ ...base, status: 404 })).toBe(false);
    expect(isSuccessfulNonHtmlPreflight({ ...base, status: 500 })).toBe(false);
    expect(
      isSuccessfulNonHtmlPreflight({
        ...base,
        status: 200,
        classification: "waf_challenge",
      }),
    ).toBe(false);
    expect(isSuccessfulNonHtmlPreflight(undefined)).toBe(false);
  });
});