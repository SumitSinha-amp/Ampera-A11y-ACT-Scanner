import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Globe, Map, Link2, Shield, Zap, RefreshCw, RotateCcw, Upload, AlertTriangle, Building2, Users, Clock, Database, CheckCircle2, Info } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const COMMON_TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "US Eastern (EST/EDT)", value: "America/New_York" },
  { label: "US Central (CST/CDT)", value: "America/Chicago" },
  { label: "US Mountain (MST/MDT)", value: "America/Denver" },
  { label: "US Pacific (PST/PDT)", value: "America/Los_Angeles" },
  { label: "US Alaska", value: "America/Anchorage" },
  { label: "US Hawaii", value: "Pacific/Honolulu" },
  { label: "Canada Eastern", value: "America/Toronto" },
  { label: "Canada Pacific", value: "America/Vancouver" },
  { label: "UK (GMT/BST)", value: "Europe/London" },
  { label: "Ireland (GMT/IST)", value: "Europe/Dublin" },
  { label: "Central Europe (CET/CEST)", value: "Europe/Berlin" },
  { label: "Paris / Rome / Madrid", value: "Europe/Paris" },
  { label: "Eastern Europe (EET/EEST)", value: "Europe/Helsinki" },
  { label: "Moscow (MSK)", value: "Europe/Moscow" },
  { label: "India (IST)", value: "Asia/Kolkata" },
  { label: "Singapore (SGT)", value: "Asia/Singapore" },
  { label: "China (CST)", value: "Asia/Shanghai" },
  { label: "Japan (JST)", value: "Asia/Tokyo" },
  { label: "Australia Eastern (AEST)", value: "Australia/Sydney" },
  { label: "Australia Western (AWST)", value: "Australia/Perth" },
  { label: "New Zealand (NZST)", value: "Pacific/Auckland" },
  { label: "Gulf (GST)", value: "Asia/Dubai" },
  { label: "South Africa (SAST)", value: "Africa/Johannesburg" },
  { label: "Brazil (BRT)", value: "America/Sao_Paulo" },
];

// Detect user's local timezone for default
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function localDateInputMin(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type CrawlScope = "all-subdomains" | "subdomain" | "subfolder" | "exact-url";

const CRAWLER_TABS = ["basic", "discovery", "auth", "performance", "incremental"] as const;
type CrawlerTab = (typeof CRAWLER_TABS)[number];

function OptionHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label={`Help: ${text}`}
          title="Show help"
        >
          <Info aria-hidden="true" className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

interface FormValues {
  seedUrl: string;
  siteId: string;
  groupId: string;
  timezone: string;
  sitemapUrl: string;
  localeEnabled: boolean;
  localePattern: string;
  maxPages: number;
  maxDepth: number;
  respectRobotsTxt: boolean;
  useSitemap: boolean;
  followLinks: boolean;
  crawlScope: CrawlScope;
  blockAssets: boolean;
  tabPoolSize: number;
  scanDelayMs: number;
  authenticated: boolean;
  authUrl: string;
  authUsernameSelector: string;
  authPasswordSelector: string;
  authUsername: string;
  authPassword: string;
  authSubmitSelector: string;
  incremental: boolean;
  prevSessionId: string;
  detectBrokenLinks: boolean;
  autoScan: boolean;
  crawlOnly: boolean;
  skipDiscovery: boolean;
  crawlBoost: boolean;
  scheduledDate: string;
  scheduledTime: string;
}

interface Site { id: number; name: string; baseUrl: string; }
interface Group { id: number; name: string; roleLabel?: string; }
interface DiscoveryCache { id: number; domain: string; urlCount: number; cachedAt: string; sourceSessionId: number | null; }

export default function CrawlerNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: sitesData } = useQuery({
    queryKey: ["my-sites"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites/my-sites`, { credentials: "include" });
      if (!res.ok) return { sites: [] as Site[] };
      return res.json() as Promise<{ sites: Site[] }>;
    },
  });

  const { data: groupsData } = useQuery({
    queryKey: ["my-groups"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/auth/my-groups`, { credentials: "include" });
      if (!res.ok) return [] as Group[];
      return res.json() as Promise<Group[]>;
    },
  });

  const sites = sitesData?.sites ?? [];
  const groups = groupsData ?? [];

  // Default timezone: prefer a matching entry, fallback to UTC
  const defaultTz = COMMON_TIMEZONES.some((t) => t.value === LOCAL_TZ) ? LOCAL_TZ : "UTC";

  const form = useForm<FormValues>({
    defaultValues: {
      seedUrl: "",
      siteId: "",
      groupId: "",
      timezone: defaultTz,
      sitemapUrl: "",
      localeEnabled: false,
      localePattern: "",
      maxPages: 2000,
      maxDepth: 5,
      respectRobotsTxt: true,
      useSitemap: true,
      followLinks: true,
      crawlScope: "subdomain" as CrawlScope,
      blockAssets: true,
      tabPoolSize: 1,
      scanDelayMs: 0,
      authenticated: false,
      authUrl: "",
      authUsernameSelector: "#username",
      authPasswordSelector: "#password",
      authUsername: "",
      authPassword: "",
      authSubmitSelector: "[type=submit]",
      incremental: false,
      prevSessionId: "",
      detectBrokenLinks: true,
      autoScan: true,
      crawlOnly: false,
      skipDiscovery: false,
      crawlBoost: false,
      scheduledDate: "",
      scheduledTime: "",
    },
  });

  const { watch, register, setValue, handleSubmit, resetField, formState: { errors } } = form;
  const values = watch();
  const [activeTab, setActiveTab] = useState<CrawlerTab>("basic");
  const activeTabIndex = CRAWLER_TABS.indexOf(activeTab);

  // Discovery cache detection — check when seedUrl changes
  const [discoveryCache, setDiscoveryCache] = useState<DiscoveryCache | null>(null);
  const [cacheChecking, setCacheChecking] = useState(false);
  const prevSeedDomain = useRef<string>("");
  useEffect(() => {
    const url = values.seedUrl?.trim();
    let domain = "";
    try { domain = new URL(url).hostname; } catch { /* invalid URL */ }
    if (!domain || domain === prevSeedDomain.current) return;
    prevSeedDomain.current = domain;
    setDiscoveryCache(null);
    setValue("skipDiscovery", false);
    setCacheChecking(true);
    fetch(`${BASE}/api/crawler/discovery-cache?domain=${encodeURIComponent(domain)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: DiscoveryCache | null) => {
        setDiscoveryCache(data?.id ? data : null);
      })
      .catch(() => {})
      .finally(() => setCacheChecking(false));
  }, [values.seedUrl]);

  // Auto-detect previous session for incremental mode when a site is selected
  const [autoDetected, setAutoDetected] = useState<{ id: number; name: string; createdAt: string } | null>(null);
  const prevSiteId = useRef<string>("");
  useEffect(() => {
    const sid = values.siteId;
    if (!sid || sid === prevSiteId.current) return;
    prevSiteId.current = sid;
    setAutoDetected(null);
    fetch(`${BASE}/api/crawler/sessions?siteId=${sid}&status=completed&limit=1`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const prev = data?.sessions?.[0];
        if (prev) {
          setAutoDetected({ id: prev.id, name: prev.name, createdAt: prev.createdAt });
          setValue("incremental", true);
          setValue("prevSessionId", String(prev.id));
        }
      })
      .catch(() => {});
  }, [values.siteId]);

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await fetch(`${BASE}/api/crawler/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to create crawler");
      }
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (session) => {
      toast({ title: "Crawler started!", description: `Crawl session #${session.id} — Phase 1 (discovery) is running.` });
      navigate(`/crawler/${session.id}`);
    },
    onError: (err) => {
      toast({ title: "Failed to start crawler", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = handleSubmit((data) => {
    const selectedGroup = groups.find((g) => String(g.id) === data.groupId);
     let scheduledStartAt: string | undefined;
     if (data.scheduledDate || data.scheduledTime) {
       if (!data.scheduledDate || !data.scheduledTime) {
         toast({
           title: "Choose both a date and time",
           description: "Select a date and time to schedule the crawler, or leave both fields blank to start immediately.",
           variant: "destructive",
         });
         return;
       }
       const scheduledDate = new Date(`${data.scheduledDate}T${data.scheduledTime}`);
       if (Number.isNaN(scheduledDate.getTime())) {
         toast({ title: "Choose a valid date and time", variant: "destructive" });
         return;
       }
       scheduledStartAt = scheduledDate.toISOString();
     }
     const payload: any = {
      seedUrl: data.seedUrl.trim(),
      maxPages: data.maxPages,
      maxDepth: data.maxDepth,
      respectRobotsTxt: data.respectRobotsTxt,
      useSitemap: data.useSitemap,
      followLinks: data.followLinks,
      crawlScope: data.crawlScope,
      blockAssets: data.blockAssets,
      tabPoolSize: data.tabPoolSize,
      scanDelayMs: data.scanDelayMs,
      authenticated: data.authenticated,
      incremental: data.incremental,
      detectBrokenLinks: data.detectBrokenLinks,
       autoScan: data.crawlOnly ? false : data.autoScan,
       crawlOnly: data.crawlOnly,
      crawlBoost: data.crawlBoost,
       scheduledStartAt,
      timezone: data.timezone || undefined,
      initiatorName: user?.fullName ?? user?.username,
      initiatorRole: selectedGroup?.roleLabel ?? undefined,
    };
    if (data.siteId) payload.siteId = parseInt(data.siteId, 10);
    if (data.groupId) payload.groupId = parseInt(data.groupId, 10);
    if (data.localeEnabled && data.localePattern.trim()) payload.localePattern = data.localePattern.trim();
    if (data.useSitemap && data.sitemapUrl) payload.sitemapUrl = data.sitemapUrl.trim();
    if (data.authenticated) {
      payload.authUrl = data.authUrl.trim();
      payload.authUsernameSelector = data.authUsernameSelector.trim();
      payload.authPasswordSelector = data.authPasswordSelector.trim();
      payload.authUsername = data.authUsername;
      payload.authPassword = data.authPassword;
      payload.authSubmitSelector = data.authSubmitSelector.trim();
    }
    if (data.incremental && data.prevSessionId) {
      payload.prevSessionId = parseInt(data.prevSessionId, 10);
    }
    if (data.skipDiscovery) {
      payload.skipDiscovery = true;
    }
      if (scheduledStartAt && new Date(scheduledStartAt).getTime() <= Date.now()) {
       toast({ title: "Choose a future date and time", description: "The scheduled start must be later than now.", variant: "destructive" });
       return;
     }
     createMutation.mutate(payload);
  });

  return (
    <TooltipProvider delayDuration={250}>
    <div className="w-full max-w-none space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Crawler Scan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crawl an entire site for accessibility issues, broken links, and more.
          Phase 1 discovers all URLs; Phase 2 runs accessibility scanning.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CrawlerTab)}>
          <TabsList aria-label="New crawler scan configuration sections" className="grid w-full grid-cols-5">
            <TabsTrigger value="basic" className="gap-1.5" aria-label="Basic crawler settings"><Globe aria-hidden="true" className="w-3.5 h-3.5" />Basic</TabsTrigger>
            <TabsTrigger value="discovery" className="gap-1.5" aria-label="URL discovery settings"><Map aria-hidden="true" className="w-3.5 h-3.5" />Discovery</TabsTrigger>
            <TabsTrigger value="auth" className="gap-1.5" aria-label="Authentication settings"><Shield aria-hidden="true" className="w-3.5 h-3.5" />Auth</TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5" aria-label="Crawler speed settings"><Zap aria-hidden="true" className="w-3.5 h-3.5" />Speed</TabsTrigger>
            <TabsTrigger value="incremental" className="gap-1.5" aria-label="Incremental scan settings"><RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />Incremental</TabsTrigger>
          </TabsList>

          {/* BASIC */}
            <TabsContent value="basic" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-stretch">
            <Card>
              <CardHeader><CardTitle>Target</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="seedUrl" className="flex items-center gap-1">
                    Seed URL *
                    <OptionHelp text="The first page the crawler visits. Use the full https:// URL for the site or section you want to scan." />
                  </Label>
                  <Input
                    id="seedUrl"
                    type="url"
                    placeholder="https://example.com"
                    {...register("seedUrl", { required: "Seed URL is required" })}
                  />
                  <p className="text-xs text-muted-foreground">
                    The starting URL. The crawl name is auto-generated from this domain and today's date.
                  </p>
                  {errors.seedUrl && <p className="text-xs text-destructive">{errors.seedUrl.message}</p>}
                </div>

                {/* Site selector */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Site
                    <OptionHelp text="Associate this crawl with an accessible site so it appears in that site's history and dashboards." />
                  </Label>
                  <Select value={values.siteId || "none"} onValueChange={(v) => setValue("siteId", v === "none" ? "" : v)}>
                    <SelectTrigger aria-label="Select a site for this crawl">
                      <SelectValue placeholder="Select a site (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No site selected</SelectItem>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} — {s.baseUrl}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Associate this crawl with a site (uses site name in auto-generated crawl title).{" "}
                    <a href="/crawler/sites" className="text-primary hover:underline">Manage sites →</a>
                  </p>
                </div>

                {/* Group selector */}
                {groups.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Group
                      <OptionHelp text="Choose a group when the crawl should use that group's site access and role context." />
                    </Label>
                    <Select value={values.groupId || "none"} onValueChange={(v) => setValue("groupId", v === "none" ? "" : v)}>
                      <SelectTrigger aria-label="Select a permission group for this crawl">
                        <SelectValue placeholder="Select a group (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No group</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            {g.name}{g.roleLabel ? ` (${g.roleLabel})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Timezone selector */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Timezone
                  </Label>
                  <Select value={values.timezone || "UTC"} onValueChange={(v) => setValue("timezone", v)}>
                    <SelectTrigger aria-label="Select the crawl display timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Used for displaying crawl timestamps. Default is your local timezone.
                  </p>
                </div>

               </CardContent>
             </Card>

             <Card>
               <CardHeader><CardTitle>Coverage</CardTitle></CardHeader>
               <CardContent className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="maxPages" className="flex items-center gap-1">
                      Max Pages
                      <OptionHelp text="Maximum number of URLs this crawl may discover. Higher values provide broader coverage but may take longer." />
                    </Label>
                    <Input
                      id="maxPages"
                      type="number"
                      min={1}
                      step={100}
                       placeholder="e.g. 2000"
                      value={values.maxPages}
                      onChange={(e) => setValue("maxPages", Math.max(1, parseInt(e.target.value) || 1))}
                    />
                     <p className="text-xs text-muted-foreground">Enter any page count (2,000, 5,000, 100,000…). Scheduled site crawls use the site setting.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      Max Depth
                      <OptionHelp text="Maximum number of link levels to follow from the seed URL. A depth of 0 scans only the seed page." />
                    </Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        min={0} max={20} step={1}
                        value={[values.maxDepth]}
                        onValueChange={([v]) => setValue("maxDepth", v)}
                        aria-label="Maximum crawl depth"
                        className="flex-1"
                      />
                      <span className="text-sm font-mono w-8 text-right">{values.maxDepth}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Detect Broken Links
                      <OptionHelp text="Checks discovered links for unreachable destinations after the accessibility scan." />
                    </Label>
                    <p className="text-xs text-muted-foreground">HTTP HEAD check every discovered link (runs after Phase 2)</p>
                  </div>
                  <Switch
                    checked={values.detectBrokenLinks}
                    onCheckedChange={(v) => setValue("detectBrokenLinks", v)}
                    aria-label="Detect broken links"
                  />
                </div>

               <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-4">
                 <div className="flex items-center justify-between gap-2">
                   <Label className="flex items-center gap-1.5">
                     <Clock className="w-3.5 h-3.5" />
                     Schedule start (optional)
                     <OptionHelp text="Leave this blank to start immediately. Otherwise, the crawl begins at the selected local time." />
                   </Label>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Button
                         type="button"
                         variant="ghost"
                         size="icon"
                         className="h-7 w-7 shrink-0"
                         onClick={() => {
                           resetField("scheduledDate");
                           resetField("scheduledTime");
                         }}
                         aria-label="Reset scheduled date and time"
                       >
                         <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                       </Button>
                     </TooltipTrigger>
                     <TooltipContent>Reset date and time</TooltipContent>
                   </Tooltip>
                 </div>
                 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                   <div className="space-y-1.5">
                     <Label htmlFor="scheduledDate" className="text-xs font-medium">Date</Label>
                     <Input
                       id="scheduledDate"
                       type="date"
                       min={localDateInputMin()}
                       {...register("scheduledDate")}
                     />
                   </div>
                   <div className="space-y-1.5">
                     <Label htmlFor="scheduledTime" className="text-xs font-medium">Time</Label>
                     <Input
                       id="scheduledTime"
                       type="time"
                       step={60}
                       {...register("scheduledTime")}
                     />
                   </div>
                 </div>
                 <p className="text-xs text-muted-foreground">
                   Leave both blank to start immediately. The time uses your browser’s local timezone and is stored safely on the server.
                 </p>
               </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DISCOVERY */}
           <TabsContent value="discovery" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-stretch">
            {/* URL Cache callout — shown when a cache exists for this domain */}
            {(discoveryCache || cacheChecking) && (
               <Card className={`border-2 lg:col-span-2 ${values.skipDiscovery ? "border-amber-400 dark:border-amber-600" : "border-border"}`}>
                <CardContent className="pt-4">
                  {cacheChecking ? (
                    <p className="text-xs text-muted-foreground">Checking for saved URL cache…</p>
                  ) : discoveryCache ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Database className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">URL cache available for {discoveryCache.domain}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {discoveryCache.urlCount.toLocaleString()} URLs saved on {new Date(discoveryCache.cachedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            {" "}from session #{discoveryCache.sourceSessionId}
                          </p>
                        </div>
                        {values.skipDiscovery && (
                          <CheckCircle2 className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm flex items-center gap-1">
                            Skip Phase 1 — use cached URLs
                            <OptionHelp text="Use the saved URL inventory instead of discovering links again. This is faster but will not find newly added URLs." />
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Load the {discoveryCache.urlCount.toLocaleString()} cached URLs and go straight to accessibility scanning. Saves time on sites you crawl repeatedly.
                          </p>
                        </div>
                        <Switch
                          checked={values.skipDiscovery}
                          onCheckedChange={(v) => setValue("skipDiscovery", v)}
                          aria-label="Skip discovery and use cached URLs"
                        />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

             <Card>
              <CardHeader><CardTitle>URL Discovery</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Use Sitemap
                      <OptionHelp text="Read sitemap.xml or sitemap_index.xml to find URLs in addition to links discovered on pages." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Parse sitemap.xml / sitemap_index.xml for URLs</p>
                  </div>
                  <Switch
                    checked={values.useSitemap}
                    onCheckedChange={(v) => setValue("useSitemap", v)}
                    aria-label="Use sitemap for URL discovery"
                  />
                </div>

                {values.useSitemap && (
                  <div className="space-y-1.5 ml-4 border-l-2 border-border pl-4">
                    <Label htmlFor="sitemapUrl" className="flex items-center gap-1">
                      Sitemap URL
                      <OptionHelp text="Optional custom sitemap address. Leave blank to use the site's standard sitemap location." />
                    </Label>
                    <Input
                      id="sitemapUrl"
                      type="url"
                      placeholder="https://example.com/sitemap.xml"
                      {...register("sitemapUrl")}
                    />
                    <p className="text-xs text-muted-foreground">Leave blank to auto-detect from seed URL.</p>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Follow Links
                      <OptionHelp text="When enabled, the crawler follows links found in page content within the selected crawl scope." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Discover new URLs by following hrefs on each page (Phase 1)</p>
                  </div>
                  <Switch
                    checked={values.followLinks}
                    onCheckedChange={(v) => setValue("followLinks", v)}
                    aria-label="Follow links during discovery"
                  />
                </div>

                {values.followLinks && (
                  <div className="space-y-3 ml-4 border-l-2 border-border pl-4">
                    <div>
                      <Label className="mb-1.5 block flex items-center gap-1">
                        Crawl Scope
                        <OptionHelp text="Controls which URLs are considered in scope: the exact URL, a folder, the current subdomain, or all subdomains." />
                      </Label>
                      <Select
                        value={values.crawlScope}
                        onValueChange={(v) => setValue("crawlScope", v as CrawlScope)}
                      >
                        <SelectTrigger aria-label="Select the crawl scope">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subdomain">Subdomain — same hostname only (www-aware)</SelectItem>
                          <SelectItem value="all-subdomains">All Subdomains — any subdomain of root domain</SelectItem>
                          <SelectItem value="subfolder">Subfolder — stay within seed URL's path prefix</SelectItem>
                          <SelectItem value="exact-url">Exact URL — single page, no link following</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {values.crawlScope === "subdomain" && "Only follows links on the same hostname. www.example.com and example.com are treated as identical."}
                        {values.crawlScope === "all-subdomains" && "Follows links on any subdomain of the root domain — blog.example.com, shop.example.com, etc."}
                        {values.crawlScope === "subfolder" && "Restricts crawling to URLs that share the seed URL's path prefix (e.g. seed /us/en/ → only /us/en/* pages)."}
                        {values.crawlScope === "exact-url" && "Only scans the seed URL itself. No links are followed."}
                      </p>
                    </div>
                  </div>
                )}

               </CardContent>
             </Card>

             <Card>
               <CardHeader><CardTitle>Filters &amp; Scan Behavior</CardTitle></CardHeader>
               <CardContent className="space-y-4">
                <Separator />

                {/* Locale / Path Filter — toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Locale / Path Filter
                      <OptionHelp text="Restricts discovery to URLs containing the configured path or locale pattern." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Only crawl URLs whose path contains a specific string</p>
                  </div>
                  <Switch
                    checked={values.localeEnabled}
                    onCheckedChange={(v) => setValue("localeEnabled", v)}
                    aria-label="Enable locale or path filter"
                  />
                </div>
                {values.localeEnabled && (
                  <div className="space-y-1.5 ml-4 border-l-2 border-border pl-4">
                    <Input
                      id="localePattern"
                      placeholder="e.g. /us/en or /en-us"
                      aria-label="Locale or path filter pattern"
                      {...register("localePattern")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Only crawl URLs whose path contains this string.
                      Example: <code className="font-mono bg-muted px-1 rounded">/us/en</code> restricts crawling to the US English locale.
                    </p>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Respect robots.txt
                      <OptionHelp text="Skips URLs that the site's robots.txt explicitly disallows." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Skip URLs disallowed in robots.txt</p>
                  </div>
                  <Switch
                    checked={values.respectRobotsTxt}
                    onCheckedChange={(v) => setValue("respectRobotsTxt", v)}
                    aria-label="Respect robots.txt"
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Auto-Scan After Discovery
                      <OptionHelp text="Starts the accessibility scan automatically after URL discovery finishes. Turn this off to review the page inventory first." />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically start Phase 2 (accessibility scan) as soon as Phase 1 (discovery) finishes
                    </p>
                  </div>
                  <Switch
                    checked={values.autoScan}
                    onCheckedChange={(v) => setValue("autoScan", v)}
                    aria-label="Automatically start accessibility scan after discovery"
                  />
                </div>

                 <Separator />

                 <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/20">
                   <div>
                     <Label className="flex items-center gap-1">
                       Crawl Only
                       <OptionHelp text="Discover and save URLs without running accessibility checks. You can start the accessibility scan later from the crawl details page." />
                     </Label>
                     <p className="text-xs text-muted-foreground">
                       Stop after Phase 1 and leave the crawl ready for an optional accessibility scan
                     </p>
                   </div>
                   <Switch
                     checked={values.crawlOnly}
                     onCheckedChange={(v) => {
                       setValue("crawlOnly", v);
                       if (v) setValue("autoScan", false);
                     }}
                     aria-label="Crawl only without accessibility scanning"
                   />
                 </div>
              </CardContent>
            </Card>

              <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4" />Bulk URL Import</CardTitle>
                <CardDescription>
                  After creating the crawler, you can import additional URLs from a CSV file (one URL per row).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-yellow-500" />
                  Create the crawler first, then use the <strong>Import URLs</strong> button on the detail page to add a CSV file.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AUTH */}
           <TabsContent value="auth" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-stretch">
             <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Authenticated Crawling</CardTitle>
                <CardDescription>Log in before crawling to access protected pages.</CardDescription>
              </CardHeader>
               <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Enable Authentication
                      <OptionHelp text="Logs into a protected site before crawling. Use this only when the login form details below are complete." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Navigate to a login page and submit credentials first</p>
                  </div>
                  <Switch
                    checked={values.authenticated}
                    onCheckedChange={(v) => setValue("authenticated", v)}
                    aria-label="Enable authenticated crawling"
                  />
                </div>

                 {values.authenticated && (
                   <div className="grid gap-3 ml-4 border-l-2 border-border pl-4 lg:grid-cols-2">
                     <div className="space-y-1.5 lg:col-span-2">
                      <Label htmlFor="authUrl">Login Page URL</Label>
                      <Input id="authUrl" type="url" placeholder="https://example.com/login" {...register("authUrl")} />
                    </div>
                     <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="authUsernameSelector">Username Selector</Label>
                        <Input id="authUsernameSelector" placeholder="#username" {...register("authUsernameSelector")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="authPasswordSelector">Password Selector</Label>
                        <Input id="authPasswordSelector" placeholder="#password" {...register("authPasswordSelector")} />
                      </div>
                    </div>
                     <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                       <div className="space-y-1.5">
                        <Label htmlFor="authUsername">Username</Label>
                        <Input id="authUsername" {...register("authUsername")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="authPassword">Password</Label>
                        <Input id="authPassword" type="password" {...register("authPassword")} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="authSubmitSelector">Submit Button Selector</Label>
                      <Input id="authSubmitSelector" placeholder="[type=submit]" {...register("authSubmitSelector")} />
                    </div>
                    <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 p-3 text-xs text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
                      <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                      Credentials are stored encrypted in JSONB. The password is stripped from API responses.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PERFORMANCE */}
           <TabsContent value="performance" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-stretch">
             <Card>
              <CardHeader><CardTitle>Page Loading</CardTitle></CardHeader>
               <CardContent className="space-y-4">
                 <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-500" />
                      Crawl Boost
                      <OptionHelp text="Captures rendered page snapshots during discovery so Phase 2 can reuse them and avoid a second browser visit." />
                      <Badge variant="outline" className="text-xs">Beta</Badge>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Phase 1 captures each page's rendered HTML (with DOM stability wait). Phase 2 reuses it via <code className="font-mono bg-muted px-1 rounded">page.setContent()</code> — eliminates double browser visits and Cloudflare challenges in Phase 2.
                      Ideal for bot-protected or slow sites.
                    </p>
                  </div>
                  <Switch
                    checked={values.crawlBoost}
                    onCheckedChange={(v) => setValue("crawlBoost", v)}
                    aria-label="Enable crawl boost"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Block Assets
                      <OptionHelp text="Prevents non-essential assets from loading during discovery to reduce bandwidth and speed up crawling." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Block images, fonts, media and analytics requests — 3–5× faster page loads (Phase 2)</p>
                  </div>
                  <Switch
                    checked={values.blockAssets}
                    onCheckedChange={(v) => setValue("blockAssets", v)}
                    aria-label="Block non-essential assets"
                  />
                </div>
              </CardContent>
             </Card>

             <Card>
              <CardHeader><CardTitle>Timing &amp; Concurrency</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    Scan Delay (ms)
                    <OptionHelp text="Extra time to wait after a page becomes stable before accessibility rules run." />
                  </Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={0} max={100000} step={100}
                      value={[values.scanDelayMs]}
                      onValueChange={([v]) => setValue("scanDelayMs", v)}
                      aria-label="Scan delay in milliseconds"
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-16 text-right">{values.scanDelayMs} ms</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Extra wait after page load before running rules (Phase 2). 0 = scan at initial stable state (recommended).</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="flex items-center gap-1">
                      Chrome Tab Pool Size
                      <OptionHelp text="Number of browser tabs available for scanning. Higher values can use more memory." />
                    </Label>
                    <Badge variant="outline" className="text-xs">Config stored — parallel processing via horizontal scaling</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={1} max={5} step={1}
                      value={[values.tabPoolSize]}
                      onValueChange={([v]) => setValue("tabPoolSize", v)}
                      aria-label="Chrome tab pool size"
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-4 text-right">{values.tabPoolSize}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Number of concurrent tabs for Phase 2. Currently serialized by the shared browser mutex.</p>
                </div>
              </CardContent>
             </Card>
          </TabsContent>

          {/* INCREMENTAL */}
           <TabsContent value="incremental" className="grid gap-4 pt-4 lg:grid-cols-2 lg:items-stretch">
             <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Incremental Re-Scan</CardTitle>
                <CardDescription>Skip pages whose HTML content hasn't changed since the previous crawl.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {autoDetected && (
                  <div className="flex items-start gap-2 p-3 bg-teal-50 dark:bg-teal-950/30 rounded-lg border border-teal-200 dark:border-teal-800 text-sm text-teal-800 dark:text-teal-300">
                    <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Previous crawl detected: <strong>{autoDetected.name}</strong> (ID #{autoDetected.id}).
                      Incremental mode has been auto-enabled — only changed pages will be re-scanned.
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1">
                      Enable Incremental Mode
                      <OptionHelp text="Compares page content with a previous completed crawl and skips pages whose content has not changed." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Compare SHA-256 content hash with a previous session (checked in Phase 2)</p>
                  </div>
                  <Switch
                    checked={values.incremental}
                    onCheckedChange={(v) => setValue("incremental", v)}
                    aria-label="Enable incremental mode"
                  />
                </div>

                {values.incremental && (
                  <div className="space-y-1.5 ml-4 border-l-2 border-border pl-4">
                    <Label htmlFor="prevSessionId">Previous Crawler Session ID</Label>
                    <Input
                      id="prevSessionId"
                      type="number"
                      placeholder="e.g. 42"
                      {...register("prevSessionId")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Pages whose HTML hash matches the previous session will be marked "skipped" — saving time and API quota.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/crawler")} aria-label="Cancel and return to crawler history">
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab(CRAWLER_TABS[activeTabIndex - 1])}
              disabled={activeTabIndex === 0}
              aria-label="Go to previous crawler settings section"
            >
              Previous
            </Button>
            {activeTabIndex < CRAWLER_TABS.length - 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab(CRAWLER_TABS[activeTabIndex + 1])}
                aria-label="Go to next crawler settings section"
              >
                Next
              </Button>
            )}
          </div>
           <Button type="submit" disabled={createMutation.isPending} className="min-w-[160px]" aria-label={values.scheduledDate || values.scheduledTime ? "Schedule crawler" : values.crawlOnly ? "Start crawl only" : "Start crawler"}>
             {createMutation.isPending ? "Submitting…" : values.scheduledDate || values.scheduledTime ? "Schedule Crawler" : values.crawlOnly ? "Start Crawl Only" : "Start Crawler"}
          </Button>
        </div>
      </form>
    </div>
    </TooltipProvider>
  );
}
