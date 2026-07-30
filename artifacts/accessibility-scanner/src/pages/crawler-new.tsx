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
import { Globe, Map, Link2, Shield, Zap, RefreshCw, Upload, AlertTriangle, Building2, Users, Clock, Database, CheckCircle2 } from "lucide-react";

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

function localDateTimeInputMin(): string {
  const d = new Date(Date.now() + 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type CrawlScope = "all-subdomains" | "subdomain" | "subfolder" | "exact-url";

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
  skipDiscovery: boolean;
  crawlBoost: boolean;
  scheduledStartAt: string;
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
      maxPages: 500,
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
      skipDiscovery: false,
      crawlBoost: false,
      scheduledStartAt: "",
    },
  });

  const { watch, register, setValue, handleSubmit, formState: { errors } } = form;
  const values = watch();

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
      autoScan: data.autoScan,
      crawlBoost: data.crawlBoost,
      scheduledStartAt: data.scheduledStartAt ? new Date(data.scheduledStartAt).toISOString() : undefined,
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
     if (data.scheduledStartAt && new Date(data.scheduledStartAt).getTime() <= Date.now()) {
       toast({ title: "Choose a future date and time", description: "The scheduled start must be later than now.", variant: "destructive" });
       return;
     }
     createMutation.mutate(payload);
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Crawler Scan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crawl an entire site for accessibility issues, broken links, and more.
          Phase 1 discovers all URLs; Phase 2 runs accessibility scanning.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <Tabs defaultValue="basic">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic" className="gap-1.5"><Globe className="w-3.5 h-3.5" />Basic</TabsTrigger>
            <TabsTrigger value="discovery" className="gap-1.5"><Map className="w-3.5 h-3.5" />Discovery</TabsTrigger>
            <TabsTrigger value="auth" className="gap-1.5"><Shield className="w-3.5 h-3.5" />Auth</TabsTrigger>
            <TabsTrigger value="performance" className="gap-1.5"><Zap className="w-3.5 h-3.5" />Speed</TabsTrigger>
            <TabsTrigger value="incremental" className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Incremental</TabsTrigger>
          </TabsList>

          {/* BASIC */}
          <TabsContent value="basic" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Target</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="seedUrl">Seed URL *</Label>
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

                <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <Label htmlFor="scheduledStartAt" className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Schedule start (optional)
                  </Label>
                  <Input
                    id="scheduledStartAt"
                    type="datetime-local"
                    min={localDateTimeInputMin()}
                    {...register("scheduledStartAt")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to start immediately. The time uses your browser’s local timezone and is stored safely on the server.
                  </p>
                </div>

                {/* Site selector */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Site
                  </Label>
                  <Select value={values.siteId || "none"} onValueChange={(v) => setValue("siteId", v === "none" ? "" : v)}>
                    <SelectTrigger>
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
                    </Label>
                    <Select value={values.groupId || "none"} onValueChange={(v) => setValue("groupId", v === "none" ? "" : v)}>
                      <SelectTrigger>
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
                    <SelectTrigger>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="maxPages">Max Pages</Label>
                    <Input
                      id="maxPages"
                      type="number"
                      min={1}
                      step={100}
                      placeholder="e.g. 500"
                      value={values.maxPages}
                      onChange={(e) => setValue("maxPages", Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <p className="text-xs text-muted-foreground">No upper limit — enter any value (500, 5000, 100000…)</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max Depth</Label>
                    <div className="flex items-center gap-3">
                      <Slider
                        min={0} max={20} step={1}
                        value={[values.maxDepth]}
                        onValueChange={([v]) => setValue("maxDepth", v)}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono w-8 text-right">{values.maxDepth}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Detect Broken Links</Label>
                    <p className="text-xs text-muted-foreground">HTTP HEAD check every discovered link (runs after Phase 2)</p>
                  </div>
                  <Switch
                    checked={values.detectBrokenLinks}
                    onCheckedChange={(v) => setValue("detectBrokenLinks", v)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DISCOVERY */}
          <TabsContent value="discovery" className="space-y-4 pt-4">
            {/* URL Cache callout — shown when a cache exists for this domain */}
            {(discoveryCache || cacheChecking) && (
              <Card className={`border-2 ${values.skipDiscovery ? "border-amber-400 dark:border-amber-600" : "border-border"}`}>
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
                          <Label className="text-sm">Skip Phase 1 — use cached URLs</Label>
                          <p className="text-xs text-muted-foreground">
                            Load the {discoveryCache.urlCount.toLocaleString()} cached URLs and go straight to accessibility scanning. Saves time on sites you crawl repeatedly.
                          </p>
                        </div>
                        <Switch
                          checked={values.skipDiscovery}
                          onCheckedChange={(v) => setValue("skipDiscovery", v)}
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
                    <Label>Use Sitemap</Label>
                    <p className="text-xs text-muted-foreground">Parse sitemap.xml / sitemap_index.xml for URLs</p>
                  </div>
                  <Switch checked={values.useSitemap} onCheckedChange={(v) => setValue("useSitemap", v)} />
                </div>

                {values.useSitemap && (
                  <div className="space-y-1.5 ml-4 border-l-2 border-border pl-4">
                    <Label htmlFor="sitemapUrl">Sitemap URL</Label>
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
                    <Label>Follow Links</Label>
                    <p className="text-xs text-muted-foreground">Discover new URLs by following hrefs on each page (Phase 1)</p>
                  </div>
                  <Switch checked={values.followLinks} onCheckedChange={(v) => setValue("followLinks", v)} />
                </div>

                {values.followLinks && (
                  <div className="space-y-3 ml-4 border-l-2 border-border pl-4">
                    <div>
                      <Label className="mb-1.5 block">Crawl Scope</Label>
                      <Select
                        value={values.crawlScope}
                        onValueChange={(v) => setValue("crawlScope", v as CrawlScope)}
                      >
                        <SelectTrigger>
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

                <Separator />

                {/* Locale / Path Filter — toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Locale / Path Filter</Label>
                    <p className="text-xs text-muted-foreground">Only crawl URLs whose path contains a specific string</p>
                  </div>
                  <Switch
                    checked={values.localeEnabled}
                    onCheckedChange={(v) => setValue("localeEnabled", v)}
                  />
                </div>
                {values.localeEnabled && (
                  <div className="space-y-1.5 ml-4 border-l-2 border-border pl-4">
                    <Input
                      id="localePattern"
                      placeholder="e.g. /us/en or /en-us"
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
                    <Label>Respect robots.txt</Label>
                    <p className="text-xs text-muted-foreground">Skip URLs disallowed in robots.txt</p>
                  </div>
                  <Switch checked={values.respectRobotsTxt} onCheckedChange={(v) => setValue("respectRobotsTxt", v)} />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-Scan After Discovery</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically start Phase 2 (accessibility scan) as soon as Phase 1 (discovery) finishes
                    </p>
                  </div>
                  <Switch checked={values.autoScan} onCheckedChange={(v) => setValue("autoScan", v)} />
                </div>
              </CardContent>
            </Card>

            <Card>
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
          <TabsContent value="auth" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Authenticated Crawling</CardTitle>
                <CardDescription>Log in before crawling to access protected pages.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Authentication</Label>
                    <p className="text-xs text-muted-foreground">Navigate to a login page and submit credentials first</p>
                  </div>
                  <Switch checked={values.authenticated} onCheckedChange={(v) => setValue("authenticated", v)} />
                </div>

                {values.authenticated && (
                  <div className="space-y-3 ml-4 border-l-2 border-border pl-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="authUrl">Login Page URL</Label>
                      <Input id="authUrl" type="url" placeholder="https://example.com/login" {...register("authUrl")} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="authUsernameSelector">Username Selector</Label>
                        <Input id="authUsernameSelector" placeholder="#username" {...register("authUsernameSelector")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="authPasswordSelector">Password Selector</Label>
                        <Input id="authPasswordSelector" placeholder="#password" {...register("authPasswordSelector")} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
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
          <TabsContent value="performance" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-500" />
                      Crawl Boost
                      <Badge variant="outline" className="text-xs">Beta</Badge>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Phase 1 captures each page's rendered HTML (with DOM stability wait). Phase 2 reuses it via <code className="font-mono bg-muted px-1 rounded">page.setContent()</code> — eliminates double browser visits and Cloudflare challenges in Phase 2.
                      Ideal for bot-protected or slow sites.
                    </p>
                  </div>
                  <Switch checked={values.crawlBoost} onCheckedChange={(v) => setValue("crawlBoost", v)} />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Block Assets</Label>
                    <p className="text-xs text-muted-foreground">Block images, fonts, media and analytics requests — 3–5× faster page loads (Phase 2)</p>
                  </div>
                  <Switch checked={values.blockAssets} onCheckedChange={(v) => setValue("blockAssets", v)} />
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label>Scan Delay (ms)</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={0} max={100000} step={100}
                      value={[values.scanDelayMs]}
                      onValueChange={([v]) => setValue("scanDelayMs", v)}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-16 text-right">{values.scanDelayMs} ms</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Extra wait after page load before running rules (Phase 2). 0 = scan at initial stable state (recommended).</p>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label>Chrome Tab Pool Size</Label>
                    <Badge variant="outline" className="text-xs">Config stored — parallel processing via horizontal scaling</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={1} max={5} step={1}
                      value={[values.tabPoolSize]}
                      onValueChange={([v]) => setValue("tabPoolSize", v)}
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
          <TabsContent value="incremental" className="space-y-4 pt-4">
            <Card>
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
                    <Label>Enable Incremental Mode</Label>
                    <p className="text-xs text-muted-foreground">Compare SHA-256 content hash with a previous session (checked in Phase 2)</p>
                  </div>
                  <Switch checked={values.incremental} onCheckedChange={(v) => setValue("incremental", v)} />
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
          <Button type="button" variant="outline" onClick={() => navigate("/crawler")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending} className="min-w-[160px]">
            {createMutation.isPending ? "Submitting…" : values.scheduledStartAt ? "Schedule Crawler" : "Start Crawler"}
          </Button>
        </div>
      </form>
    </div>
  );
}
