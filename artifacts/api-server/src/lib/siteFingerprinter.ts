import { logger } from "./logger";

export type ScanStrategy = "warm_instance" | "instance_pool" | "throttled" | "context_pool" | "aggressive";

export interface FingerprintSignals {
  reachable: boolean;
  statusCode: number | null;
  hasCloudflare: boolean;
  cloudflareEnterprise: boolean;
  requiresJs: boolean;
  hasRateLimit: boolean;
  hasLoginWall: boolean;
  sitemapFound: boolean;
  responseTimeMs: number;
  contentLength: number | null;
}

export interface FingerprintResult {
  domain: string;
  signals: FingerprintSignals;
  strategy: ScanStrategy;
  strategyLabel: string;
  strategyReason: string;
  concurrency: number;
  delayMs: number;
}

function selectStrategy(signals: FingerprintSignals): {
  strategy: ScanStrategy;
  label: string;
  reason: string;
  concurrency: number;
  delayMs: number;
} {
  if (!signals.reachable) {
    return {
      strategy: "context_pool",
      label: "Context Pool",
      reason: "Site was unreachable during probe — using balanced defaults. Verify the URL is accessible.",
      concurrency: 3,
      delayMs: 500,
    };
  }
  if (signals.cloudflareEnterprise) {
    return {
      strategy: "warm_instance",
      label: "Warm Instance",
      reason: "Cloudflare Enterprise / managed challenge detected. Using a persistent browser profile with cached session cookies to pass bot challenges without triggering re-verification.",
      concurrency: 2,
      delayMs: 2000,
    };
  }
  if (signals.hasCloudflare) {
    return {
      strategy: "instance_pool",
      label: "Instance Pool",
      reason: "Cloudflare WAF detected. Using persistent browser contexts to maintain session cookies across pages and reduce challenge frequency.",
      concurrency: 3,
      delayMs: 1000,
    };
  }
  if (signals.hasRateLimit) {
    return {
      strategy: "throttled",
      label: "Throttled Sequential",
      reason: "Rate-limiting detected (HTTP 429 or Retry-After header). Scanning one page at a time with a delay to stay under the server's request threshold.",
      concurrency: 1,
      delayMs: 3000,
    };
  }
  if (!signals.requiresJs && signals.responseTimeMs < 600) {
    return {
      strategy: "aggressive",
      label: "Aggressive Parallel",
      reason: "Fast server-rendered site with no bot protection detected. Using maximum parallelism for the quickest possible scan.",
      concurrency: 6,
      delayMs: 0,
    };
  }
  return {
    strategy: "context_pool",
    label: "Context Pool",
    reason: "Standard site with no special protection. Using isolated browser contexts for reliable parallel scanning with a short inter-page delay.",
    concurrency: 3,
    delayMs: 500,
  };
}

export async function fingerprintSite(targetUrl: string): Promise<FingerprintResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  const domain = parsedUrl.hostname;
  const signals: FingerprintSignals = {
    reachable: false,
    statusCode: null,
    hasCloudflare: false,
    cloudflareEnterprise: false,
    requiresJs: false,
    hasRateLimit: false,
    hasLoginWall: false,
    sitemapFound: false,
    responseTimeMs: 0,
    contentLength: null,
  };

  const t0 = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });

    signals.responseTimeMs = Date.now() - t0;
    signals.statusCode = response.status;
    signals.reachable = true;

    const cfRay = response.headers.get("cf-ray");
    const server = (response.headers.get("server") ?? "").toLowerCase();
    const cfCache = response.headers.get("cf-cache-status");
    const retryAfter = response.headers.get("retry-after");

    if (cfRay || server.includes("cloudflare") || cfCache !== null) {
      signals.hasCloudflare = true;
    }

    if (response.status === 401 || response.status === 403) {
      signals.hasLoginWall = true;
    }

    if (response.status === 429 || retryAfter !== null) {
      signals.hasRateLimit = true;
    }

    if (response.ok || response.status === 200) {
      const body = await response.text();
      signals.contentLength = body.length;

      const bodyLower = body.toLowerCase();
      if (
        bodyLower.includes("just a moment") ||
        bodyLower.includes("checking your browser") ||
        bodyLower.includes("cf-browser-verification") ||
        bodyLower.includes("cloudflare ray id") ||
        bodyLower.includes("please wait") && bodyLower.includes("ddos")
      ) {
        signals.hasCloudflare = true;
        signals.cloudflareEnterprise = true;
      }

      if (cfRay && (body.includes("__cf_chl") || body.includes("cf-challenge"))) {
        signals.cloudflareEnterprise = true;
      }

      const textContent = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (textContent.length < 500 && body.includes("<script") && body.length < 5000) {
        signals.requiresJs = true;
      }
    }
  } catch (err) {
    signals.responseTimeMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("TimeoutError") && !msg.includes("ECONNREFUSED")) {
      logger.warn({ domain, err: msg }, "Fingerprint probe failed");
    }
  }

  // Sitemap probe (non-blocking, best-effort)
  try {
    const sitemapUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/sitemap.xml`;
    const sm = await fetch(sitemapUrl, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SitemapChecker/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    signals.sitemapFound = sm.ok;
  } catch {
    // Not critical
  }

  const { strategy, label, reason, concurrency, delayMs } = selectStrategy(signals);

  return {
    domain,
    signals,
    strategy,
    strategyLabel: label,
    strategyReason: reason,
    concurrency,
    delayMs,
  };
}
