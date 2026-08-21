import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Globe,
  History,
  Loader2,
  XCircle,
  FileText,
  Link2,
  Globe2,
  BarChart3,
  Shield,
  Search,
  Flag,
  CheckCircle2,
} from "lucide-react";
import { useQASites, useQASelectedSite, QAPageShell, QA_BASE, type QASiteEntry } from "@/pages/qa-shared";

interface QAStatus {
  running: boolean;
  totalPages: number;
  totalLinks: number;
  checked: number;
  broken: number;
  redirects: number;
  unchecked: number;
  pageChecks: {
    pageTitles: PageCheckSummary;
    metaDescriptions: PageCheckSummary;
    h1Headings: PageCheckSummary;
    contentDepth: PageCheckSummary;
    sitemapCoverage: PageCheckSummary;
    responseStatus: PageCheckSummary;
  };
}

interface PageCheckSummary {
  checked: number;
  issues: number;
}

function DonutChart({ pass, warn, fail }: { pass: number; warn: number; fail: number }) {
  const total = pass + warn + fail;
  const r = 36, circ = 2 * Math.PI * r;
  const passArc = total > 0 ? (pass / total) * circ : 0;
  const warnArc = total > 0 ? (warn / total) * circ : 0;
  const failArc = total > 0 ? (fail / total) * circ : 0;
  let offset = 0;

  const segs = [
    { arc: passArc, color: "#10b981", label: "Pass" },
    { arc: warnArc, color: "#f59e0b", label: "Warning" },
    { arc: failArc, color: "#ef4444", label: "Fail" },
  ];
  
  const elements = segs.map((s, i) => {
    if (s.arc === 0) return null;
    const el = (
      <circle key={i} cx="44" cy="44" r={r} fill="none" strokeWidth="12"
        stroke={s.color} strokeLinecap="butt"
        strokeDasharray={`${s.arc.toFixed(1)} ${Math.max(0, circ - s.arc).toFixed(1)}`}
        strokeDashoffset={-offset}
        style={{ transform: "rotate(-90deg)", transformOrigin: "44px 44px" }} 
      />
    );
    offset += s.arc;
    return el;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" className="drop-shadow-sm">
          <circle cx="44" cy="44" r={r} fill="none" strokeWidth="12" stroke="currentColor" className="text-muted/20" />
          {total > 0 && elements}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <p className="text-sm font-bold text-foreground leading-tight">{total}</p>
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">checks</p>
        </div>
      </div>
      <div className="space-y-2 flex-1">
        {[
          ["Pass", pass, "bg-emerald-500"],
          ["Warning", warn, "bg-amber-500"],
          ["Fail", fail, "bg-red-500"]
        ].map(([l, v, bg]) => (
          <div key={l as string} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${bg}`} />
            <span className="text-xs text-muted-foreground font-medium">{l}</span>
            <span className="ml-auto font-semibold text-xs text-foreground">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QAStatCard({
  label,
  value,
  sub,
  icon,
  color,
  bg,
  border,
  delayMs = 0,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  delayMs?: number;
}) {
  return (
    <article 
      className="relative rounded-[22px] border border-white/80 bg-card/80 p-5 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className={`grid h-10 w-10 place-items-center rounded-xl border ${bg} ${border} ${color} mb-4 shadow-sm`}>{icon}</div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="text-sm font-medium text-foreground/90 mt-1">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </article>
  );
}

function PageLevelChecks({ checks }: { checks: QAStatus["pageChecks"] | undefined }) {
  const rows = [
    { key: "pageTitles", label: "Page titles", href: "/quality-assurance/inventory/meta-tags" },
    { key: "metaDescriptions", label: "Meta descriptions", href: "/quality-assurance/inventory/meta-tags" },
    { key: "h1Headings", label: "H1 headings", href: "/quality-assurance/inventory/meta-tags" },
    { key: "contentDepth", label: "Content depth", href: "/quality-assurance/issues" },
    { key: "sitemapCoverage", label: "Sitemap coverage", href: "/quality-assurance/sitemap" },
    { key: "responseStatus", label: "Response status", href: "/quality-assurance/inventory/pages" },
  ] as const;

  return (
    <section className="rounded-[22px] border border-white/80 bg-card/80 p-5 shadow-[0_14px_34px_rgba(69,57,112,.06)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "300ms" }}>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Page-level checks</h2>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const data = checks?.[row.key];
          const checked = data?.checked ?? 0;
          const issues = data?.issues ?? 0;
          const passingPercent = checked > 0 ? Math.max(0, Math.min(100, ((checked - issues) / checked) * 100)) : 0;
          const tone = issues === 0
            ? { icon: "text-emerald-600 dark:text-emerald-400", surface: "bg-emerald-500/10", bar: "bg-emerald-500" }
            : issues / Math.max(checked, 1) > 0.1
              ? { icon: "text-red-600 dark:text-red-400", surface: "bg-red-500/10", bar: "bg-red-500" }
              : { icon: "text-amber-600 dark:text-amber-400", surface: "bg-amber-500/10", bar: "bg-amber-500" };

          return (
            <Link
              key={row.key}
              href={row.href}
              className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-background/30 px-4 py-3 transition-colors hover:bg-background/55"
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone.surface} ${tone.icon}`}>
                {issues === 0 ? <CheckCircle2 className="h-4 w-4" /> : issues / Math.max(checked, 1) > 0.1 ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{row.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {checked.toLocaleString()} pages checked{issues > 0 ? ` · ${issues.toLocaleString()} issue${issues === 1 ? "" : "s"} found` : ""}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="hidden h-2 w-28 overflow-hidden rounded-full bg-muted sm:block"
                title={checked > 0 ? `${Math.round(passingPercent)}% passing` : "No pages checked"}
              >
                <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${passingPercent}%` }} />
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function OverviewContent({ site }: { site: QASiteEntry }) {
  const { data: status, isLoading } = useQuery<QAStatus | null>({
    queryKey: ["qa-status", site.scanId],
    queryFn: async () => {
      if (!site.scanId) return null;
      const r = await fetch(`${QA_BASE}/api/scans/${site.scanId}/qa/status`, {
        credentials: "include",
      });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!site.scanId,
    staleTime: 30_000,
  });

  if (!site.scanId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground animate-in fade-in duration-500">
        <div className="h-16 w-16 rounded-full bg-muted/50 grid place-items-center border border-border/50">
          <AlertTriangle className="w-8 h-8 opacity-80" />
        </div>
        <p className="text-lg font-semibold text-foreground">No completed scan linked to this site.</p>
        <p className="text-sm text-center max-w-md">
          Run a crawler scan from the{" "}
          <Link href="/crawler" className="font-medium text-primary hover:underline">
            Crawler
          </Link>{" "}
          and link it to this site to see QA data.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  const crawledDate = site.crawledAt
    ? new Date(site.crawledAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
    
  const pass = Math.max(0, (status?.checked ?? 0) - (status?.broken ?? 0) - (status?.redirects ?? 0));
  const warn = status?.redirects ?? 0;
  const fail = status?.broken ?? 0;

  const NAV_TILES = [
    { label: "Page inventory", href: "/quality-assurance/inventory/pages", icon: <FileText className="h-5 w-5"/>, desc: "All discovered pages with metadata", tone: "violet" },
    { label: "Link inventory", href: "/quality-assurance/inventory/links", icon: <Link2 className="h-5 w-5"/>, desc: "All discovered links across the site", tone: "teal" },
    { label: "Broken links", href: "/quality-assurance/links/broken", icon: <XCircle className="h-5 w-5"/>, desc: "4xx, 5xx, and connection failures", tone: "red" },
    { label: "Redirects", href: "/quality-assurance/links/overview", icon: <ArrowRight className="h-5 w-5"/>, desc: "301/302 redirect chains and loops", tone: "amber" },
    { label: "Priority pages", href: "/quality-assurance/priority-pages", icon: <Flag className="h-5 w-5"/>, desc: "High-traffic and critical pages", tone: "blue" },
    { label: "Single page check", href: "/quality-assurance/single-page-check", icon: <Search className="h-5 w-5"/>, desc: "Run on-demand QA tests", tone: "violet" },
    { label: "Check history", href: "/quality-assurance/check-history", icon: <History className="h-5 w-5"/>, desc: "Previous QA scan runs and trends", tone: "amber" },
  ];

  const TONE = {
    violet: "border-primary/20 bg-primary/10 text-primary",
    blue:   "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    teal:   "border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400",
    amber:  "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red:    "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <QAStatCard 
          label="Total pages" 
          value={status?.totalPages ?? site.pageCount ?? 0} 
          sub="Indexed inventory" 
          icon={<Globe className="h-5 w-5"/>} 
          color="text-primary" 
          bg="bg-primary/10" 
          border="border-primary/20" 
          delayMs={0} 
        />
        <QAStatCard 
          label="Links checked" 
          value={status?.checked ?? 0} 
          sub="Total evaluations" 
          icon={<BarChart3 className="h-5 w-5"/>} 
          color="text-emerald-600 dark:text-emerald-400" 
          bg="bg-emerald-500/10" 
          border="border-emerald-500/20" 
          delayMs={50} 
        />
        <QAStatCard 
          label="Broken links" 
          value={status?.broken ?? site.brokenLinksCount ?? 0} 
          sub="Require attention" 
          icon={<XCircle className="h-5 w-5"/>} 
          color="text-red-600 dark:text-red-400" 
          bg="bg-red-500/10" 
          border="border-red-500/20" 
          delayMs={100} 
        />
        <QAStatCard 
          label="Redirects" 
          value={status?.redirects ?? 0} 
          sub="Non-blocking chains" 
          icon={<ArrowRight className="h-5 w-5"/>} 
          color="text-amber-600 dark:text-amber-400" 
          bg="bg-amber-500/10" 
          border="border-amber-500/20" 
          delayMs={150} 
        />
        <QAStatCard
          label="Meta issues"
          value={status?.pageChecks?.metaDescriptions?.issues ?? 0}
          sub="Title and description quality"
          icon={<FileText className="h-5 w-5"/>}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-500/10"
          border="border-amber-500/20"
          delayMs={200}
        />
        <QAStatCard
          label="Content issues"
          value={status?.pageChecks?.contentDepth?.issues ?? 0}
          sub="Pages needing more content"
          icon={<AlertTriangle className="h-5 w-5"/>}
          color="text-red-600 dark:text-red-400"
          bg="bg-red-500/10"
          border="border-red-500/20"
          delayMs={250}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <article className="relative rounded-[22px] border border-white/80 bg-card/80 p-6 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "200ms" }}>
          <h3 className="text-sm font-semibold text-foreground mb-6">Check distribution</h3>
          <DonutChart pass={pass} warn={warn} fail={fail} />
          
          <div className="mt-8 pt-5 border-t border-border/50 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5" /> Site URL</span>
              <a href={site.siteUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-primary transition-colors truncate max-w-[150px]">{site.siteUrl}</a>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Last crawl</span>
              <span className="font-semibold text-foreground">{crawledDate}</span>
            </div>
          </div>
        </article>
        
        <article className="relative rounded-[22px] border border-white/80 bg-card/80 p-6 backdrop-blur-xl shadow-[0_14px_34px_rgba(69,57,112,.06)] animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "250ms" }}>
          <h3 className="text-sm font-semibold text-foreground mb-5">Scan details</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-4 transition-colors hover:bg-background/50">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Scan ID</p>
                <p className="text-xs text-muted-foreground mt-0.5">Primary identifier</p>
              </div>
              <span className="font-mono text-sm font-bold text-foreground">#{site.scanId}</span>
            </div>
            
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-4 transition-colors hover:bg-background/50">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Crawler session</p>
                <p className="text-xs text-muted-foreground mt-0.5">Linked data source</p>
              </div>
              <span className="font-mono text-sm font-bold text-foreground">{site.crawlerSessionId != null ? `#${site.crawlerSessionId}` : "—"}</span>
            </div>
            
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-4 transition-colors hover:bg-background/50">
              <div className="h-10 w-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Pages scanned</p>
                <p className="text-xs text-muted-foreground mt-0.5">Discovered inventory</p>
              </div>
              <span className="font-mono text-sm font-bold text-foreground">{site.pageCount ?? 0}</span>
            </div>
          </div>
          
          <div className="mt-5">
            <Button variant="outline" className="w-full gap-2 rounded-xl" asChild>
              <Link href={`/scans/${site.scanId}`}>
                View full scan report <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </article>
      </section>

      <PageLevelChecks checks={status?.pageChecks} />

      <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "300ms" }}>
        <h2 className="text-sm font-semibold text-foreground mb-4">QA modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {NAV_TILES.map((t, i) => (
            <Link key={i} href={t.href} className="group block text-left rounded-[22px] border border-white/80 bg-card/80 p-5 backdrop-blur-xl shadow-[0_8px_20px_rgba(69,57,112,.05)] hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(69,57,112,.10)] transition-all duration-200">
              <div className={`grid h-11 w-11 place-items-center rounded-xl border mb-3 transition-colors ${TONE[t.tone as keyof typeof TONE]}`}>{t.icon}</div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{t.label}</p>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function QualityAssurancePage() {
  const { data: sites = [], isLoading } = useQASites();
  const [, selected] = useQASelectedSite(sites);

  return (
    <QAPageShell
      activeTab="overview"
    >
      {!isLoading && sites.length === 0 ? (
        <Card className="rounded-[22px] border-border/75 bg-card/80 shadow-[0_8px_28px_rgba(76,57,133,0.06)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: "100ms" }}>
          <CardContent className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
            <div className="h-16 w-16 rounded-full bg-muted/50 grid place-items-center border border-border/50">
              <Globe className="w-8 h-8 opacity-80" />
            </div>
            <p className="text-lg font-semibold text-foreground">No crawler-linked sites found</p>
            <p className="text-sm text-center max-w-sm">
              QA data is linked to crawler scans. Run a full crawler scan from the{" "}
              <Link href="/crawler" className="font-medium text-primary hover:underline">Crawler</Link>{" "}
              and assign it to a site to see QA metrics here.
            </p>
            <Button asChild className="mt-2 rounded-xl">
              <Link href="/crawler/new">Start a crawler scan</Link>
            </Button>
          </CardContent>
        </Card>
      ) : selected ? (
        <OverviewContent site={selected} />
      ) : null}
    </QAPageShell>
  );
}
