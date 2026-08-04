import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accessibility,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Globe,
  MousePointerClick,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

export const APP_UPDATES_VERSION = "1.3.0";
export const APP_UPDATES_MONTH = "August 2026";

type UpdateGroup = {
  icon: typeof Accessibility;
  title: string;
  description: string;
  features: string[];
};

export const updateGroups: UpdateGroup[] = [
  {
    icon: Accessibility,
    title: "Accessibility rule coverage",
    description: "Broader, more useful checks aligned with ACT and WCAG workflows.",
    features: [
      "Expanded WCAG 2.1 and WCAG 2.2, ARIA, and best-practice rule coverage",
      "Issue versus Potential Issue outcomes are classified per occurrence instead of blanketing a whole rule",
      "Manual-review references identify criteria that need human or interactive-state verification",
      "New experimental rule ACT-R118: “HTML images contain no text” is now available; it asks reviewers to check human-language text and the decorative, incidental, essential, and redundant exceptions",
      "Improved image alternatives, contrast, fixed font-size, touch-target, headings, landmarks, keyboard, and media checks",
      "Rule evidence includes selectors, HTML context, remediation, WCAG criteria, impact, and legal mapping",
    ],
  },
  {
    icon: Workflow,
    title: "Scan workflows",
    description: "More control over scans from the first URL through the final report.",
    features: [
      "Add URLs to an active, paused, or pending scan without restarting it",
      "Remove URLs that are still pending in a live scan queue with safe pending-only handling",
      "Live page progress now shows URL, stage, load time, scan time, issues, and actions",
      "Extension counts beside the URL type filter cover PDFs, HTML, and every other extension in the scan",
      "Manual scan history stays separate from crawler history while preserving older site-less scans",
      "Retry, pause, resume, cancel, and recovery states are reflected consistently in the interface",
    ],
  },
  {
    icon: Globe,
    title: "Crawler and discovery",
    description: "Site crawling is now easier to manage, monitor, and recover.",
    features: [
      "Crawl Only mode discovers URLs without scanning them until accessibility scanning is explicitly started",
      "Sitemap, URL-list, and crawl-based discovery workflows with crawler-specific history and details",
      "Crawled-page and accessibility-scanned-page counts are tracked independently",
      "Scheduling, Run now, page limits, speed controls, filters, pagination, and progress views",
      "Failed crawler pages are automatically requeued before a session can be finalized",
      "Crawler policies are snapshotted per session so later site-setting changes do not alter an active run",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Protected-site reliability",
    description: "Scanning now handles slow, proxied, WAF-protected, and JavaScript-heavy sites more safely.",
    features: [
      "WAF-aware browser fallback for pages that reject plain HTTP requests or return bot challenges",
      "Progressive navigation retries with aligned hard deadlines for slow pages",
      "Rendered JavaScript snapshots include CSS and visual assets for stable report layouts",
      "Rule-time HTML is captured before ACT rules run, while final visual resources and bounding boxes are captured afterward",
      "Broken URLs include final 4xx/5xx responses plus confirmed transport and redirect failures",
      "Browser rule bundles are embedded and verified during production builds for reliable deployment",
    ],
  },
  {
    icon: RefreshCw,
    title: "Incremental scans and recovery",
    description: "Repeat scans spend less time on unchanged pages without carrying forward bad results.",
    features: [
      "Raw-HTML content hashing detects unchanged pages before launching a full browser scan",
      "Safe baselines can carry forward verified results, but failed pages never qualify for carry-forward",
      "Orphaned scans recover after a server restart and resume pending work",
      "Mid-flight pages are reset and requeued when a scan is resumed",
      "Concurrent queue workers atomically claim pages so queue changes cannot delete a page that already started",
    ],
  },
  {
    icon: ClipboardCheck,
    title: "Quality Assurance",
    description: "Review the quality of links, pages, metadata, and site content in one workspace.",
    features: [
      "Broken-link, redirect, transport, and unsafe-link review with source-page context",
      "Page, link, media, document, email, phone, CSS, JavaScript, sitemap, and word inventories",
      "Meta-tag, priority-page, spelling, and page-quality review areas",
      "Check history and issue tracking for repeatable QA workflows",
      "Crawler results and QA data remain available through dedicated scan detail views",
    ],
  },
  {
    icon: BarChart3,
    title: "Reports and analysis",
    description: "Turn large scan results into practical, shareable insights.",
    features: [
      "Site dashboards, WCAG/ADA/EAA compliance views, rule reports, and page-level details",
      "Smart Analysis groups recurring issues by shared components and patterns",
      "CSV, Excel, and PDF exports for scans, reports, and analysis results",
      "False-positive review and per-occurrence notes help teams keep triage decisions precise",
      "Large-scan report endpoints use database aggregation to avoid loading every row into memory",
    ],
  },
  {
    icon: Settings2,
    title: "Platform controls and permissions",
    description: "The platform now adapts better to teams, roles, sites, and accessibility preferences.",
    features: [
      "Role-aware navigation and permission boundaries for scans, crawlers, QA, sites, and dashboards",
      "Site ownership and site selection determine the right customer and administrator views",
      "Settings opens as an in-app dialog, including proxy configuration and application preferences",
      "Accessibility mode preferences persist locally and apply from the document root",
      "Sidebar collapse, favorites, active-site selection, and account controls persist between visits",
    ],
  },
  {
    icon: Sparkles,
    title: "Guidance and experience",
    description: "New guidance makes the platform easier to learn and return to.",
    features: [
      "App Walkthrough highlights the header, navigation, menus, account controls, version, and updates",
      "App Updates now provides a complete release history for the recent platform improvements",
      "Version badges and update indicators make new capabilities easier to discover",
      "Accessible controls include descriptive labels for compact actions, filters, pagination, and icon buttons",
      "Stable loading, empty, error, and partial-progress states make long-running work clearer",
    ],
  },
  {
    icon: Database,
    title: "Deployment and operations",
    description: "Production packaging and large-scale operation received reliability improvements.",
    features: [
      "Startup migrations safely add newly required database columns to existing environments",
      "Production builds verify frontend assets, API bundles, browser rule bundles, and runtime dependencies",
      "Chrome profiles use a cache location outside the repository to prevent oversized checkpoints",
      "Scan status and report APIs use efficient SQL aggregation for large scans",
      "Health checks, workflow restarts, and startup recovery provide clearer operational signals",
    ],
  },
];

function UpdateCard({ group }: { group: UpdateGroup }) {
  const Icon = group.icon;
  return (
    <div
      data-testid={`card-update-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/30"
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <h2 className="text-sm font-semibold">{group.title}</h2>
      <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{group.description}</p>
      <ul className="mt-3 space-y-2">
        {group.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppUpdatesContent({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge className="mb-3 gap-1.5 bg-primary/10 text-primary hover:bg-primary/15">
            <Sparkles className="h-3.5 w-3.5" />
            Version {APP_UPDATES_VERSION}
          </Badge>
          <h1 className={compact ? "text-2xl font-bold tracking-tight" : "text-3xl font-bold tracking-tight"}>
            What&apos;s new
          </h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            A complete look at the accessibility scanning, crawler, QA, reporting,
            reliability, and platform improvements added recently.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {APP_UPDATES_MONTH}
        </Badge>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <div className="h-1 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Release highlights
          </CardTitle>
          <CardDescription>
            Built to make scanning results more trustworthy, large sites easier
            to manage, and the platform easier to navigate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {[
            { icon: Zap, text: "More control over active scan queues and crawler runs" },
            { icon: ShieldCheck, text: "More reliable results on protected and JavaScript-heavy sites" },
            { icon: BarChart3, text: "Clearer reporting and analysis for large scan datasets" },
            { icon: MousePointerClick, text: "More discoverable guidance, settings, and accessible controls" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{text}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {updateGroups.map((group) => (
          <UpdateCard key={group.title} group={group} />
        ))}
      </div>
    </div>
  );
}

export default function AppUpdates() {
  return (
    <div className="mx-auto max-w-6xl">
      <AppUpdatesContent />
    </div>
  );
}