import {
  Activity,
  AlertTriangle,
  Check,
  Database,
  GitBranch,
  Link2,
  Radar,
  ScanLine,
  Sparkles,
  Clock3,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

type Tone = "violet" | "blue" | "teal" | "amber";

interface TimeDetails {
  elapsed: string | null;
  crawl: string | null;
  scan: string | null;
  processing: string | null;
}

interface LiveSession {
  status: string;
  totalDiscovered: number;
  pendingPages?: number;
  totalScanned: number;
  totalFailed: number;
  totalSkipped: number;
  totalIssues: number;
  pagesWithIssues?: number;
  brokenLinksCount: number;
  scanningPages?: number;
  scanSessionId: number | null;
  scanStartedAt: string | null;
  crawlBoost?: boolean;
  /** Raw session config forwarded from the API — values read with explicit casts below */
  config?: Record<string, unknown>;
}

interface CrawlerLiveOverviewProps {
  session: LiveSession;
  trueTotalPages: number;
  progress: number;
  discoveryProgress: number;
  phase2Started: boolean;
  elapsedTime: string | null;
  timeDetails: TimeDetails;
}

const liveKeyframes = `
  @keyframes crawler-orbit { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes crawler-scan { 0%,100% { transform: translateX(-3px); opacity: .35 } 50% { transform: translateX(26px); opacity: 1 } }
  @keyframes crawler-pulse { 0%,100% { transform: scale(.92); opacity: .4 } 50% { transform: scale(1.08); opacity: 1 } }
  @keyframes crawler-dash { to { stroke-dashoffset: -18 } }
  @keyframes crawler-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
  @keyframes crawler-sweep { 0% { left: -12%; opacity: .6 } 100% { left: 110%; opacity: .3 } }
  @media (prefers-reduced-motion: reduce) {
    .crawler-live-overview *, .crawler-live-overview *::before, .crawler-live-overview *::after {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
`;

function TileIcon({ tone, kind }: { tone: Tone; kind: "radar" | "scan" | "links" | "issues" }) {
  const styles: Record<Tone, { shell: string; glow: string }> = {
    violet: { shell: "bg-[#eee9ff] text-[#6d48c7]", glow: "#8c72e8" },
    blue: { shell: "bg-[#e6f2ff] text-[#3778c8]", glow: "#6da9ef" },
    teal: { shell: "bg-[#e5f6f4] text-[#198f88]", glow: "#62c8bd" },
    amber: { shell: "bg-[#fff3df] text-[#aa6b16]", glow: "#e7a44b" },
  };
  const style = styles[tone];

  return (
    <div className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${style.shell}`}>
      <span className="absolute inset-1 rounded-xl border border-current/20" style={{ animation: "crawler-pulse 2.8s ease-in-out infinite" }} />
      {kind === "radar" && (
        <>
          <span className="absolute inset-2 rounded-full border border-current/25 border-dashed" style={{ animation: "crawler-orbit 7s linear infinite" }} />
          <Radar className="relative h-6 w-6" strokeWidth={1.7} />
        </>
      )}
      {kind === "scan" && (
        <>
          <div className="absolute left-3 right-3 top-1/2 h-px overflow-hidden bg-current/20">
            <span className="block h-full w-5 bg-current" style={{ animation: "crawler-scan 1.65s ease-in-out infinite" }} />
          </div>
          <ScanLine className="relative h-6 w-6" strokeWidth={1.7} />
        </>
      )}
      {kind === "links" && (
        <>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 56 56" aria-hidden="true">
            <path d="M10 38 C18 15,27 42,35 20 S46 19,48 10" fill="none" stroke={style.glow} strokeWidth="1.5" strokeDasharray="5 5" style={{ animation: "crawler-dash 1.8s linear infinite" }} />
          </svg>
          <Link2 className="relative h-6 w-6" strokeWidth={1.7} />
        </>
      )}
      {kind === "issues" && (
        <>
          <Sparkles className="absolute -right-1 -top-1 h-4 w-4 animate-pulse" />
          <AlertTriangle className="relative h-6 w-6" strokeWidth={1.7} />
        </>
      )}
    </div>
  );
}

function LiveTile({
  eyebrow,
  title,
  value,
  detail,
  tone,
  kind,
  status,
  children,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  kind: "radar" | "scan" | "links" | "issues";
  status?: string;
  children?: ReactNode;
}) {
  const borders: Record<Tone, string> = {
    violet: "border-[#d9d0f8]",
    blue: "border-[#c8def8]",
    teal: "border-[#c2e9e4]",
    amber: "border-[#f2dbb3]",
  };

  return (
    <article className={`group relative overflow-hidden rounded-[22px] border bg-white/70 p-5 shadow-[0_14px_34px_rgba(69,57,112,.07)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(69,57,112,.12)] ${borders[tone]}`}>
      <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-white/70 blur-2xl transition duration-500 group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#77839a]">{eyebrow}</p>
          <p className="mt-2 text-sm font-semibold text-[#263650]">{title}</p>
        </div>
        <TileIcon kind={kind} tone={tone} />
      </div>
      <div className="relative mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-[2.35rem] font-semibold leading-none tracking-[-.07em] text-[#172b4d]">{value}</p>
          <p className="mt-2 text-xs text-[#718097]">{detail}</p>
        </div>
        {status && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#edf8f6] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-[#198f88]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#198f88]" />
            {status}
          </span>
        )}
      </div>
      {children}
    </article>
  );
}

export function CrawlerLiveOverview({
  session,
  trueTotalPages,
  progress,
  discoveryProgress,
  phase2Started,
  elapsedTime,
  timeDetails,
}: CrawlerLiveOverviewProps) {
  const phase1Active = session.status === "pending" || session.status === "starting" || session.status === "discovering";
  const queuedForDiscovery = session.pendingPages ?? 0;
  // Phase 1 is truly complete when the session has advanced past the crawl phase, OR when an
  // interrupted session (paused/failed/cancelled) left zero pending pages — meaning all URLs were
  // visited before the interruption.  Sessions that never started (pending/starting) are excluded
  // via the !phase1Active guard even if pendingPages happens to be 0.
  const phase1Complete =
    session.status === "crawled" ||
    session.status === "scanning" ||
    session.status === "completed" ||
    (!phase1Active && queuedForDiscovery === 0 && session.totalDiscovered > 0);
  const isScanning = session.status === "scanning";
  const isLive = phase1Active || isScanning;
  const discovered = trueTotalPages || session.totalDiscovered;
  const pagesWithIssues = session.pagesWithIssues ?? 0;
  const scanDetail = phase2Started
    ? `${progress}% of discovered pages`
    : "Waiting for accessibility scan";

  // Phase 1 mode flags derived from session config (values are unknown — cast explicitly)
  const cfg = session.config ?? {};
  const isCached = cfg.skipDiscovery === true;
  const maxPages = typeof cfg.maxPages === "number" ? cfg.maxPages : 0;
  // Max-reached: Phase 1 finished and the discovered count meets the configured page cap
  const isMaxReached = phase1Complete && !isCached && maxPages > 0 && discovered >= maxPages;
  // Incremental: comparing content against a previous session (not a full cache skip)
  const isIncremental = cfg.incremental === true && !isCached;
  // Crawl Boost: Phase 1 crawl and Phase 2 scan run in parallel
  const isCrawlBoost = !!(session.crawlBoost);
  // For Crawl Boost active: how many URLs have already passed Phase 1 (been crawled)
  const crawledSoFar = isCrawlBoost && phase1Active ? Math.max(0, discovered - queuedForDiscovery) : 0;

  // Derive Phase 1 detail text for the tile
  const phase1Detail = isCached
    ? "Discovery cache · Phase 1 skipped"
    : phase1Active
      ? isCrawlBoost
        ? `${crawledSoFar.toLocaleString()} crawled · ${queuedForDiscovery.toLocaleString()} still in crawl queue`
        : `${discoveryProgress}% crawled · ${queuedForDiscovery.toLocaleString()} in crawl queue`
      : phase1Complete
        ? isMaxReached
          ? `Capped at ${maxPages.toLocaleString()} (site max)`
          : "Phase 1 complete"
        : queuedForDiscovery > 0
          ? `${discoveryProgress}% crawled · ${queuedForDiscovery.toLocaleString()} pages not yet crawled`
          : `${discoveryProgress}% crawled — crawl stopped`;

  // Derive Phase 1 pipeline sub-label (shorter, for the pipeline card)
  const phase1PipelineLabel = isCached
    ? "From discovery cache"
    : phase1Active
      ? isCrawlBoost
        ? `${crawledSoFar.toLocaleString()} crawled · ${queuedForDiscovery.toLocaleString()} queued`
        : `${queuedForDiscovery.toLocaleString()} pages still to crawl`
      : phase1Complete
        ? isMaxReached
          ? `Capped at ${maxPages.toLocaleString()} (site max)`
          : "All URLs crawled"
        : queuedForDiscovery > 0
          ? `${queuedForDiscovery.toLocaleString()} pages not yet crawled`
          : "Crawl stopped";

  // Phase 1 tile title adapts to mode
  const phase1Title = isCached ? "URLs from cache" : "URLs found";

  return (
    <section className="crawler-live-overview relative space-y-5">
      <style>{liveKeyframes}</style>
      <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#e7dcff] opacity-70 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 top-12 h-80 w-80 rounded-full bg-[#dff5f4] opacity-75 blur-3xl" aria-hidden="true" />

      <div className="relative flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#6d48c7]">Live overview</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-[#172b4d]">Crawler mission control</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#7a879d]" aria-live="polite">
          <Activity className={`h-3.5 w-3.5 text-[#198f88] ${isLive ? "animate-pulse" : ""}`} />
          {isLive ? "Updating live" : "Latest crawl snapshot"}
        </div>
      </div>

      <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LiveTile
          eyebrow="Phase 01"
          title={phase1Title}
          value={discovered.toLocaleString()}
          detail={phase1Detail}
          kind="radar"
          tone="violet"
          status={phase1Active ? "live" : isCached ? "synced" : "synced"}
        >
          {/* ── Discovery cache: URLs loaded from a saved snapshot, Phase 1 skipped ── */}
          {isCached ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <Database className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="text-[11px] font-semibold text-amber-800">Discovery cache used</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-amber-700">
                    URLs were loaded from a saved crawl snapshot — Phase 1 was skipped.
                    {maxPages > 0 && discovered < maxPages
                      ? ` Site limit is ${maxPages.toLocaleString()} pages; ${(maxPages - discovered).toLocaleString()} unused.`
                      : maxPages > 0 && discovered >= maxPages
                        ? ` All ${maxPages.toLocaleString()} cached URLs used (site max).`
                        : null}
                  </p>
                </div>
              </div>
            </div>
          ) : isCrawlBoost && phase1Active ? (
            /* ── Crawl Boost active: crawl + scan running in parallel ── */
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#6d48c7]">
                  <span className="h-2 w-2 rounded-full bg-[#8c72e8]" aria-hidden="true" />
                  {crawledSoFar.toLocaleString()} crawled
                </span>
                <span className="text-[11px] text-[#77839a]">{queuedForDiscovery.toLocaleString()} in crawl queue</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#eee9ff]">
                <div
                  className="h-full rounded-full bg-[#8c72e8] transition-all duration-700"
                  style={{ width: `${discovered > 0 ? Math.min(100, Math.round((crawledSoFar / discovered) * 100)) : 0}%` }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#eee9ff] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-[#6d48c7]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8c72e8]" aria-hidden="true" />
                  Crawl boost
                </span>
                <span className="text-[10px] text-[#77839a]">Scan starting in parallel</span>
              </div>
            </div>
          ) : (
            /* ── Normal / complete / interrupted ── */
            <div className="mt-5 space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#eee9ff]">
                <div className="h-full rounded-full bg-[#8c72e8] transition-all duration-700" style={{ width: `${Math.min(100, discoveryProgress)}%` }} />
              </div>
              {/* Max pages hit */}
              {isMaxReached && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  At site page limit — some pages may not have been crawled
                </div>
              )}
              {/* Incremental badge (when not at limit) */}
              {isIncremental && phase1Complete && !isMaxReached && (
                <div className="flex items-center gap-1.5 text-[11px] text-teal-600">
                  <GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Incremental scan · comparing with previous session
                </div>
              )}
              {/* Crawl Boost complete badge */}
              {isCrawlBoost && phase1Complete && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eee9ff] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-[#6d48c7]">
                    <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    Crawl boost
                  </span>
                  <span className="text-[10px] text-[#77839a]">Phase 1 complete</span>
                </div>
              )}
            </div>
          )}
        </LiveTile>
        <LiveTile eyebrow="Phase 02" title="Pages scanned" value={session.totalScanned.toLocaleString()} detail={scanDetail} kind="scan" tone="blue" status={isScanning ? "live" : phase2Started ? "synced" : undefined}>
          <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-[#e6f2ff]">
            <div className="h-full rounded-full bg-[#5f9ce7] transition-all duration-700" style={{ width: `${phase2Started ? progress : 0}%` }} />
            {isScanning && <span className="absolute inset-y-0 w-8 bg-white/70 blur-sm" style={{ left: `${Math.max(0, progress - 10)}%`, animation: "crawler-sweep 1.4s ease-in-out infinite" }} />}
          </div>
        </LiveTile>
        <LiveTile eyebrow="Quality signal" title="Broken links" value={session.brokenLinksCount.toLocaleString()} detail="4xx, 5xx, and redirect failures" kind="links" tone="teal">
          <div className="mt-5 flex items-center gap-1">
            {[22, 38, 30, 48, 34, 42, 27, 36, 24, 31, 18, 26].map((height, index) => (
              <span key={index} className="flex-1 rounded-full bg-[#8ad5cc]" style={{ height: `${height / 2}px`, opacity: 0.35 + index / 24, animation: isLive ? `crawler-float ${1.8 + index * 0.12}s ease-in-out infinite` : undefined, animationDelay: `${index * 70}ms` }} />
            ))}
          </div>
        </LiveTile>
        <LiveTile eyebrow="Accessibility pulse" title="Pages with issues" value={pagesWithIssues.toLocaleString()} detail={`${session.totalIssues.toLocaleString()} confirmed issue occurrences`} kind="issues" tone="amber">
          <div className="mt-5 flex items-center gap-2 text-xs text-[#a26a1e]">
            <Zap className="h-3.5 w-3.5" />
            <span>{session.totalFailed > 0 ? `${session.totalFailed} page${session.totalFailed === 1 ? "" : "s"} need a retry` : "Signal is being analysed"}</span>
          </div>
        </LiveTile>
      </div>

      <div className="relative grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <article className="h-full rounded-[22px] border border-white/80 bg-white/65 p-4 shadow-[0_14px_34px_rgba(69,57,112,.06)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#77839a]">Pipeline status</p>
              <h3 className="mt-1 text-sm font-semibold text-[#263650]">Two-phase crawl + scan</h3>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="rounded-2xl border border-[#d9d0f8] bg-[#f8f6ff] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#6d48c7]">
                {phase1Active ? (
                  <Radar className="h-4 w-4 animate-[spin_2.5s_linear_infinite] motion-reduce:animate-none" aria-label="Crawling in progress" />
                ) : phase1Complete ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Crawl interrupted" />
                )}
                Phase 1 · URL crawl
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight text-[#172b4d]">{discovered.toLocaleString()}</p>
              <p className="mt-0.5 text-[10px] text-[#77839a]">{phase1PipelineLabel}</p>
            </div>
            <div className="relative hidden h-px w-12 bg-[#c7b9f3] sm:block" aria-hidden="true">
              <span className="absolute -right-0.5 -top-1 h-2.5 w-2.5 rounded-full bg-[#8c72e8] shadow-[0_0_0_5px_rgba(140,114,232,.12)]" />
            </div>
            <div className="rounded-2xl border border-[#c8def8] bg-[#f4f9ff] p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#3778c8]">
                {isScanning ? (
                  <ScanLine className="h-4 w-4 animate-pulse motion-reduce:animate-none" aria-label="Accessibility scan in progress" />
                ) : phase2Started && session.status === "completed" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ScanLine className="h-4 w-4 opacity-70" aria-hidden="true" />
                )}
                Phase 2 · accessibility
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight text-[#172b4d]">{phase2Started ? session.totalScanned.toLocaleString() : "—"}<span className="text-sm font-normal text-[#8a97aa]">{phase2Started ? ` / ${discovered.toLocaleString()}` : ""}</span></p>
              <p className="mt-0.5 text-[10px] text-[#77839a]">{phase2Started ? `${progress}% analysed` : "Waiting to start"}</p>
            </div>
          </div>
        </article>

        <article className="relative h-full overflow-hidden rounded-[22px] border border-[#30486c] bg-[linear-gradient(145deg,#1c345b_0%,#172b4d_58%,#122442_100%)] p-4 text-white shadow-[0_18px_40px_rgba(23,43,77,.2)]">
          <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-[#6d48c7]/25 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-12 h-36 w-36 rounded-full bg-[#198f88]/15 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#8edbd1]/70 to-transparent" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[12px] font-bold uppercase tracking-[.2em] text-[#b8c5d9]">Time details</p>
                <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#8edbd1]">
                  <span className={`h-2 w-2 rounded-full bg-[#8edbd1] ${elapsedTime ? "animate-pulse shadow-[0_0_0_5px_rgba(142,219,209,.12)]" : "opacity-60"}`} />
                  {elapsedTime ? "Live timing" : "Recorded timing"}
                </div>
              </div>
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#8edbd1]/25 bg-[#8edbd1]/10 text-[#8edbd1] shadow-[0_0_24px_rgba(142,219,209,.12)]">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: "Elapsed time", value: timeDetails.elapsed, accent: "bg-[#8edbd1]", line: "from-[#8edbd1]/80" },
                { label: "Crawl time", value: timeDetails.crawl, accent: "bg-[#b9a7ff]", line: "from-[#b9a7ff]/80" },
                { label: "Scan time", value: timeDetails.scan, accent: "bg-[#78b9ff]", line: "from-[#78b9ff]/80" },
                { label: "Processing time", value: timeDetails.processing, accent: "bg-[#ffc978]", line: "from-[#ffc978]/80" },
              ].map(({ label, value, accent, line }) => (
                <div key={label} className="group rounded-xl border border-white/10 bg-white/[.065] p-2.5 transition-colors hover:border-white/20 hover:bg-white/[.1]">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${accent} shadow-[0_0_10px_currentColor]`} aria-hidden="true" />
                    <p className="text-[10px] font-medium text-[#b8c5d9]">{label}</p>
                  </div>
                  <p className={`mt-2 text-[clamp(1rem,2vw,1.2rem)] font-bold leading-none tracking-tight ${value ? "text-white" : "text-[#8395b0]"}`}>{value ?? "—"}</p>
                  <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[.08]" aria-hidden="true">
                    <div className={`h-full w-full rounded-full bg-gradient-to-r ${line} to-transparent opacity-80`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}