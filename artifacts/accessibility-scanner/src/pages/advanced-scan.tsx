import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useSite } from "@/contexts/site";
import { ProjectSelector } from "@/components/project-selector";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isUrlLikeScanName, SCAN_NAME_URL_ERROR } from "@/lib/scan-name";
import { FieldMessage } from "@/components/ui/field-message";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Shield,
  Clock,
  Search,
  Globe,
  ArrowRight,
  AlertCircle,
  Link2,
  Map,
  Layers,
  Sparkles,
  ChevronRight,
  RotateCcw,
  ExternalLink,
} from "lucide-react";

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

type ScanStrategy = "warm_instance" | "instance_pool" | "throttled" | "context_pool" | "aggressive";
type WizardStep = "configure" | "fingerprinting" | "discovering" | "review" | "creating";

interface FingerprintSignals {
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

interface FingerprintResult {
  domain: string;
  signals: FingerprintSignals;
  strategy: ScanStrategy;
  strategyLabel: string;
  strategyReason: string;
  concurrency: number;
  delayMs: number;
}

interface DiscoveryProgress {
  phase: "sitemap" | "crawling" | "dedup" | "done";
  urls: string[];
  sitemapCount: number;
  crawledCount: number;
  message: string;
}

// ── Strategy metadata ──────────────────────────────────────────────────────────

const STRATEGY_META: Record<ScanStrategy, { color: string; badge: string; icon: React.ReactNode }> = {
  warm_instance: {
    color: "border-amber-500/50 bg-amber-500/10 text-amber-400",
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    icon: <Shield className="w-4 h-4" />,
  },
  instance_pool: {
    color: "border-orange-500/50 bg-orange-500/10 text-orange-400",
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/40",
    icon: <Shield className="w-4 h-4" />,
  },
  throttled: {
    color: "border-red-500/50 bg-red-500/10 text-red-400",
    badge: "bg-red-500/20 text-red-300 border-red-500/40",
    icon: <Clock className="w-4 h-4" />,
  },
  context_pool: {
    color: "border-blue-500/50 bg-blue-500/10 text-blue-400",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    icon: <Layers className="w-4 h-4" />,
  },
  aggressive: {
    color: "border-green-500/50 bg-green-500/10 text-green-400",
    badge: "bg-green-500/20 text-green-300 border-green-500/40",
    icon: <Zap className="w-4 h-4" />,
  },
};

// ── Signal definitions ────────────────────────────────────────────────────────

interface SignalItem {
  key: keyof FingerprintSignals;
  label: string;
  getValue: (s: FingerprintSignals) => string;
  isWarning?: (s: FingerprintSignals) => boolean;
}

const SIGNAL_ITEMS: SignalItem[] = [
  {
    key: "reachable",
    label: "Reachability probe",
    getValue: (s) => (s.reachable ? "Online" : "Unreachable"),
    isWarning: (s) => !s.reachable,
  },
  {
    key: "statusCode",
    label: "HTTP status code",
    getValue: (s) => (s.statusCode !== null ? String(s.statusCode) : "N/A"),
    isWarning: (s) => s.statusCode !== null && s.statusCode >= 400,
  },
  {
    key: "responseTimeMs",
    label: "Response time",
    getValue: (s) => `${s.responseTimeMs} ms`,
    isWarning: (s) => s.responseTimeMs > 3000,
  },
  {
    key: "hasCloudflare",
    label: "Cloudflare WAF",
    getValue: (s) => (s.hasCloudflare ? (s.cloudflareEnterprise ? "Enterprise / Managed Challenge" : "Detected") : "None"),
    isWarning: (s) => s.hasCloudflare,
  },
  {
    key: "requiresJs",
    label: "JavaScript rendering",
    getValue: (s) => (s.requiresJs ? "Required (SPA)" : "Static / SSR"),
  },
  {
    key: "hasRateLimit",
    label: "Rate limiting",
    getValue: (s) => (s.hasRateLimit ? "Detected (HTTP 429)" : "None detected"),
    isWarning: (s) => s.hasRateLimit,
  },
  {
    key: "hasLoginWall",
    label: "Authentication wall",
    getValue: (s) => (s.hasLoginWall ? "Protected (401/403)" : "Public"),
    isWarning: (s) => s.hasLoginWall,
  },
  {
    key: "sitemapFound",
    label: "Sitemap.xml",
    getValue: (s) => (s.sitemapFound ? "Found" : "Not found"),
  },
];

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
  { id: "configure", label: "Configure", icon: <Search className="w-3.5 h-3.5" /> },
  { id: "fingerprinting", label: "Detect", icon: <Shield className="w-3.5 h-3.5" /> },
  { id: "discovering", label: "Discover", icon: <Globe className="w-3.5 h-3.5" /> },
  { id: "review", label: "Review", icon: <Sparkles className="w-3.5 h-3.5" /> },
];

function StepIndicator({ current }: { current: WizardStep }) {
  const order: WizardStep[] = ["configure", "fingerprinting", "discovering", "review", "creating"];
  const currentIdx = order.indexOf(current);

  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const stepIdx = order.indexOf(step.id);
        const done = stepIdx < currentIdx;
        const active = stepIdx === currentIdx;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                done
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : active
                  ? "bg-primary text-primary-foreground border border-primary"
                  : "bg-muted/50 text-muted-foreground border border-border"
              }`}
            >
              {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.icon}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 mx-1 ${stepIdx < currentIdx ? "bg-primary/50" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Strategy card ──────────────────────────────────────────────────────────────

function StrategyCard({
  fingerprint,
  concurrency,
  delay,
  onConcurrencyChange,
  onDelayChange,
  editable,
}: {
  fingerprint: FingerprintResult;
  concurrency: number;
  delay: number;
  onConcurrencyChange?: (v: number) => void;
  onDelayChange?: (v: number) => void;
  editable?: boolean;
}) {
  const meta = STRATEGY_META[fingerprint.strategy] ?? STRATEGY_META.context_pool;

  return (
    <div className={`rounded-lg border p-4 ${meta.color}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{fingerprint.strategyLabel}</span>
            <Badge variant="outline" className={`text-xs px-1.5 py-0 ${meta.badge}`}>
              {fingerprint.strategy.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-xs opacity-80 leading-relaxed">{fingerprint.strategyReason}</p>

          <div className="flex items-center gap-4 mt-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs opacity-70">Concurrency</Label>
              {editable ? (
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(e) => onConcurrencyChange?.(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  className="w-20 h-7 text-xs bg-background/50"
                />
              ) : (
                <span className="text-xs font-mono">{concurrency} parallel</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs opacity-70">Page delay</Label>
              {editable ? (
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={delay}
                  onChange={(e) => onDelayChange?.(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 h-7 text-xs bg-background/50"
                />
              ) : (
                <span className="text-xs font-mono">{delay} ms</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdvancedScanPage() {
  const { user } = useAuth();
  const { activeSite } = useSite();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<WizardStep>("configure");
  const [url, setUrl] = useState("");
  const [scanName, setScanName] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [maxPages, setMaxPages] = useState(500);
  const [applyDedup, setApplyDedup] = useState(true);

  const [fingerprint, setFingerprint] = useState<FingerprintResult | null>(null);
  const [fingerprintError, setFingerprintError] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const revealTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [discoveryProgress, setDiscoveryProgress] = useState<DiscoveryProgress | null>(null);
  const [discoveredUrls, setDiscoveredUrls] = useState<string[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const [concurrency, setConcurrency] = useState(3);
  const [delayMs, setDelayMs] = useState(500);
  const [disableJavascript, setDisableJavascript] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setProjectId(null);
    setProjectError(null);
  }, [activeSite?.id]);

  // ── Phase 1: Fingerprint ────────────────────────────────────────────────────

  const startFingerprint = useCallback(async () => {
    if (!url.trim()) return;
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`;

    setUrl(targetUrl);
    setFingerprint(null);
    setFingerprintError(null);
    setRevealedCount(0);
    setStep("fingerprinting");

    try {
      const res = await fetch(`${BASE}/api/advanced/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
      }

      const result = (await res.json()) as FingerprintResult;
      setFingerprint(result);
      setConcurrency(result.concurrency);
      setDelayMs(result.delayMs);

      // Reveal signals one by one
      let count = 0;
      revealTimer.current = setInterval(() => {
        count += 1;
        setRevealedCount(count);
        if (count >= SIGNAL_ITEMS.length) {
          clearInterval(revealTimer.current!);
          revealTimer.current = null;
        }
      }, 250);
    } catch (err) {
      setFingerprintError(err instanceof Error ? err.message : "Probe failed");
    }
  }, [url]);

  useEffect(() => {
    return () => {
      if (revealTimer.current) clearInterval(revealTimer.current);
    };
  }, []);

  // ── Phase 2: URL Discovery ──────────────────────────────────────────────────

  const startDiscovery = useCallback(() => {
    setDiscoveryProgress(null);
    setDiscoveredUrls([]);
    setDiscoveryError(null);
    setStep("discovering");

    const params = new URLSearchParams({
      url,
      max: String(maxPages),
      dedup: applyDedup ? "1" : "0",
    });

    const es = new EventSource(`${BASE}/api/advanced/discover?${params.toString()}`, {
      withCredentials: true,
    } as EventSourceInit);
    esRef.current = es;

    es.addEventListener("progress", (e: MessageEvent) => {
      const progress = JSON.parse(e.data) as DiscoveryProgress;
      setDiscoveryProgress(progress);
      setDiscoveredUrls(progress.urls);
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      const { urls } = JSON.parse(e.data) as { urls: string[]; count: number };
      setDiscoveredUrls(urls);
      setDiscoveryProgress((prev) =>
        prev
          ? { ...prev, phase: "done", urls, message: `Discovery complete — ${urls.length} pages found` }
          : { phase: "done", urls, sitemapCount: 0, crawledCount: urls.length, message: `Discovery complete — ${urls.length} pages found` },
      );
      es.close();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      let msg = "URL discovery failed";
      try {
        const data = JSON.parse(e.data) as { message: string };
        msg = data.message || msg;
      } catch {
        // no JSON data on error event
      }
      setDiscoveryError(msg);
      es.close();
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      setDiscoveryError("Lost connection to server during URL discovery");
      es.close();
    };
  }, [url, maxPages, applyDedup]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  // ── Phase 3: Create scan ────────────────────────────────────────────────────

  const createScan = useCallback(async () => {
    if (discoveredUrls.length === 0) return;
    if (projectId == null) {
      setProjectError("Project is required.");
      setCreateError("Please select a project before starting the scan.");
      setStep("review");
      return;
    }
    if (scanName.trim() && isUrlLikeScanName(scanName)) {
      setCreateError(SCAN_NAME_URL_ERROR);
      setStep("review");
      return;
    }
    setCreateError(null);
    setStep("creating");

    try {
      const res = await fetch(`${BASE}/api/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          urls: discoveredUrls,
          name: scanName.trim() || `Advanced Scan — ${new URL(url).hostname}`,
          siteId: activeSite?.id,
          projectId,
          initiatorName: user?.fullName ?? undefined,
          options: {
            isAdvancedScan: true,
            strategy: fingerprint?.strategy ?? "context_pool",
            concurrency,
            delayMs,
            ...(disableJavascript ? { disableJavascript: true } : {}),
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error: string }).error || `HTTP ${res.status}`);
      }

      const session = (await res.json()) as { id: number };
      navigate(`/scans/${session.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create scan");
      setStep("review");
    }
  }, [
    discoveredUrls,
    scanName,
    url,
    activeSite?.id,
    projectId,
    user,
    fingerprint,
    concurrency,
    delayMs,
    navigate,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Advanced Scan</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Adaptive 4-phase scanning with site fingerprinting, strategy selection, and intelligent URL discovery — similar to how enterprise accessibility platforms crawl.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step: Configure ─────────────────────────────────────────────── */}
      {step === "configure" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Configure Target
            </CardTitle>
            <CardDescription>
              Enter the site URL. We'll probe it first to pick the right scan strategy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="url">Target URL</Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startFingerprint()}
                autoFocus
              />
              <FieldMessage tone="info">
                Include https:// for the most reliable fingerprint and discovery results.
              </FieldMessage>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Scan Title <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="name"
              placeholder="e.g. Full Site Audit Q3"
                value={scanName}
                onChange={(e) => {
                  setScanName(e.target.value);
                  if (isUrlLikeScanName(e.target.value)) {
                    setCreateError(SCAN_NAME_URL_ERROR);
                  } else {
                    setCreateError(null);
                  }
                }}
                aria-invalid={Boolean(scanName && isUrlLikeScanName(scanName))}
                aria-describedby={
                  scanName && isUrlLikeScanName(scanName)
                    ? "advanced-scan-name-error"
                    : undefined
                }
              />
              {isUrlLikeScanName(scanName) && (
                <FieldMessage id="advanced-scan-name-error" tone="error">
                  {SCAN_NAME_URL_ERROR}
                </FieldMessage>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Project <span className="text-destructive">*</span>
              </Label>
              <ProjectSelector
                value={projectId}
                onChange={(nextProjectId) => {
                  setProjectId(nextProjectId);
                  setProjectError(nextProjectId == null ? "Project is required." : null);
                  setCreateError(null);
                }}
                siteId={activeSite?.id ?? null}
                required
                error={Boolean(projectError)}
              />
              {projectError ? (
                <FieldMessage tone="error">{projectError}</FieldMessage>
              ) : (
                <FieldMessage tone="info">
                  {activeSite
                    ? "Select an existing project or add a new one under this site."
                    : "Select a site first, then select or add a project under it."}
                </FieldMessage>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="maxPages">Maximum pages</Label>
                <Input
                  id="maxPages"
                  type="number"
                  min={1}
                  max={5000}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.max(1, Math.min(5000, parseInt(e.target.value) || 500)))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Template deduplication</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    id="dedup"
                    checked={applyDedup}
                    onCheckedChange={setApplyDedup}
                  />
                  <Label htmlFor="dedup" className="font-normal text-muted-foreground cursor-pointer">
                    {applyDedup ? "On — removes paginated duplicates" : "Off — scan all URLs as-is"}
                  </Label>
                </div>
              </div>
            </div>

            {user?.permissions?.canDisableJs && (
              <div className={`border rounded-lg p-3 transition-colors ${disableJavascript ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-muted/20"}`}>
                <div className="flex items-center gap-3">
                  <Shield className={`w-4 h-4 shrink-0 ${disableJavascript ? "text-amber-600" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="adv-disable-js">Disable JavaScript</Label>
                    <FieldMessage tone="warning" className="mt-1">
                      Scan with JavaScript turned off to catch server-rendered accessibility issues.
                    </FieldMessage>
                  </div>
                  <Switch
                    id="adv-disable-js"
                    checked={disableJavascript}
                    onCheckedChange={setDisableJavascript}
                  />
                </div>
              </div>
            )}

            <div className="rounded-md bg-muted/50 border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How it works</p>
              <p><span className="font-medium">Phase 1</span> — Site fingerprinting: detects Cloudflare, JS rendering, rate limits</p>
              <p><span className="font-medium">Phase 2</span> — Strategy selection: picks optimal concurrency &amp; bypass approach</p>
              <p><span className="font-medium">Phase 3</span> — URL discovery: parses sitemap + crawls links up to 2 levels deep</p>
              <p><span className="font-medium">Phase 4</span> — Adaptive scan: runs the full accessibility audit with chosen strategy</p>
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={startFingerprint} disabled={!url.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Analyse Site
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── Step: Fingerprinting ─────────────────────────────────────────── */}
      {step === "fingerprinting" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {fingerprint ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : fingerprintError ? (
                <XCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
              Phase 1 — Site Fingerprinting
            </CardTitle>
            <CardDescription>
              Probing <span className="font-mono text-xs">{url}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {fingerprintError ? (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Probe failed</p>
                  <p className="text-xs opacity-80 mt-0.5">{fingerprintError}</p>
                </div>
              </div>
            ) : (
              <>
                {SIGNAL_ITEMS.map((item, i) => {
                  const revealed = i < revealedCount;
                  const warning = fingerprint && item.isWarning?.(fingerprint.signals);
                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between py-1.5 px-2 rounded transition-all duration-300 ${
                        revealed ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {revealed ? (
                          warning ? (
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          )
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
                        )}
                        <span className="text-muted-foreground">{item.label}</span>
                      </div>
                      {revealed && fingerprint && (
                        <span className={`text-xs font-mono ${warning ? "text-amber-400" : "text-foreground"}`}>
                          {item.getValue(fingerprint.signals)}
                        </span>
                      )}
                    </div>
                  );
                })}

                {fingerprint && revealedCount >= SIGNAL_ITEMS.length && (
                  <>
                    <Separator className="my-3" />
                    <StrategyCard
                      fingerprint={fingerprint}
                      concurrency={concurrency}
                      delay={delayMs}
                      editable={false}
                    />
                  </>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep("configure")}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Back
            </Button>
            <div className="flex gap-2">
              {fingerprintError && (
                <Button variant="outline" onClick={startFingerprint}>
                  Retry probe
                </Button>
              )}
              <Button
                onClick={startDiscovery}
                disabled={!fingerprint || revealedCount < SIGNAL_ITEMS.length}
              >
                Discover URLs
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* ── Step: Discovering ────────────────────────────────────────────── */}
      {step === "discovering" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {discoveryProgress?.phase === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : discoveryError ? (
                <XCircle className="w-4 h-4 text-destructive" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              )}
              Phase 3 — URL Discovery
            </CardTitle>
            <CardDescription>
              {discoveryProgress?.message ?? "Starting URL discovery…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {discoveryError ? (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Discovery failed</p>
                  <p className="text-xs opacity-80 mt-0.5">{discoveryError}</p>
                </div>
              </div>
            ) : (
              <>
                {/* Phase progress indicators */}
                {(["sitemap", "crawling", "dedup", "done"] as const).map((phase) => {
                  const phases = ["sitemap", "crawling", "dedup", "done"] as const;
                  const phaseIdx = phases.indexOf(phase);
                  const currentIdx = discoveryProgress ? phases.indexOf(discoveryProgress.phase) : -1;
                  const done = phaseIdx < currentIdx || discoveryProgress?.phase === "done";
                  const active = phase === discoveryProgress?.phase;

                  const labels: Record<string, string> = {
                    sitemap: "Sitemap.xml",
                    crawling: "Link crawl",
                    dedup: "Deduplication",
                    done: "Complete",
                  };
                  const icons: Record<string, React.ReactNode> = {
                    sitemap: <Map className="w-3.5 h-3.5" />,
                    crawling: <Link2 className="w-3.5 h-3.5" />,
                    dedup: <Layers className="w-3.5 h-3.5" />,
                    done: <CheckCircle2 className="w-3.5 h-3.5" />,
                  };

                  return (
                    <div key={phase} className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          done
                            ? "bg-primary/20 text-primary"
                            : active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {active && discoveryProgress?.phase !== "done" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          icons[phase]
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm ${active ? "font-medium" : done ? "text-foreground" : "text-muted-foreground"}`}>
                            {labels[phase]}
                          </span>
                          {phase === "sitemap" && discoveryProgress && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {discoveryProgress.sitemapCount} URLs
                            </span>
                          )}
                          {phase === "crawling" && discoveryProgress && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {discoveryProgress.crawledCount} pages crawled
                            </span>
                          )}
                          {phase === "done" && discoveryProgress?.phase === "done" && (
                            <span className="text-xs font-mono text-primary">
                              {discoveredUrls.length} unique pages
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {discoveredUrls.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        URLs found so far ({discoveredUrls.length})
                      </p>
                      <ScrollArea className="h-36 rounded-md border bg-muted/30">
                        <div className="p-2 space-y-0.5">
                          {discoveredUrls.slice(0, 50).map((u) => (
                            <p key={u} className="text-xs font-mono text-muted-foreground truncate px-1">
                              {u}
                            </p>
                          ))}
                          {discoveredUrls.length > 50 && (
                            <p className="text-xs text-muted-foreground px-1 pt-1">
                              …and {discoveredUrls.length - 50} more
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep("fingerprinting")}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Back
            </Button>
            <div className="flex gap-2">
              {discoveryError && (
                <Button variant="outline" onClick={startDiscovery}>
                  Retry discovery
                </Button>
              )}
              <Button
                onClick={() => setStep("review")}
                disabled={discoveryProgress?.phase !== "done" && !discoveryError}
              >
                Review & Start
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* ── Step: Review ─────────────────────────────────────────────────── */}
      {step === "review" && fingerprint && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Phase 4 — Review &amp; Launch
            </CardTitle>
            <CardDescription>
              Confirm strategy and page list, then start the scan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {createError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{createError}</p>
              </div>
            )}

            {/* Strategy (editable) */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Scan Strategy</Label>
              <StrategyCard
                fingerprint={fingerprint}
                concurrency={concurrency}
                delay={delayMs}
                onConcurrencyChange={setConcurrency}
                onDelayChange={setDelayMs}
                editable
              />
            </div>

            <Separator />

            {/* URL list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pages to scan</Label>
                <Badge variant="secondary" className="font-mono">
                  {discoveredUrls.length} URL{discoveredUrls.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <ScrollArea className="h-48 rounded-md border bg-muted/30">
                <div className="p-2 space-y-0.5">
                  {discoveredUrls.map((u) => (
                    <div key={u} className="flex items-center gap-1 group px-1 py-0.5 rounded hover:bg-muted/50">
                      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-muted-foreground hover:text-foreground truncate"
                      >
                        {u}
                      </a>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              {discoveredUrls.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No URLs were discovered. Check the target URL and try again.
                </p>
              )}
            </div>

            <Separator />

            {/* Scan title */}
            <div className="space-y-1.5">
              <Label htmlFor="review-name">Scan Title</Label>
              <Input
                id="review-name"
                value={scanName}
                onChange={(e) => {
                  setScanName(e.target.value);
                  if (isUrlLikeScanName(e.target.value)) {
                    setCreateError(SCAN_NAME_URL_ERROR);
                  } else {
                    setCreateError(null);
                  }
                }}
                placeholder={`Advanced Scan — ${new URL(url).hostname}`}
                aria-invalid={Boolean(scanName && isUrlLikeScanName(scanName))}
                aria-describedby={
                  scanName && isUrlLikeScanName(scanName)
                    ? "advanced-review-name-error"
                    : undefined
                }
              />
              {isUrlLikeScanName(scanName) && (
                <FieldMessage id="advanced-review-name-error" tone="error">
                  {SCAN_NAME_URL_ERROR}
                </FieldMessage>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep("discovering")}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Re-discover
            </Button>
            <Button
              onClick={createScan}
              disabled={
                discoveredUrls.length === 0 ||
                projectId == null ||
                isUrlLikeScanName(scanName)
              }
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              Start Scan ({discoveredUrls.length} pages)
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ── Step: Creating ───────────────────────────────────────────────── */}
      {step === "creating" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-semibold">Starting scan…</p>
              <p className="text-sm text-muted-foreground mt-1">
                Creating scan session for {discoveredUrls.length} pages
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
