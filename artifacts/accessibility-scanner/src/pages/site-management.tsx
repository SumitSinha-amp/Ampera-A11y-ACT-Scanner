import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useSite } from "@/contexts/site";
import {
  Play, Settings, Activity, ShieldAlert, ListFilter,
  MoreHorizontal, Pencil, Trash2, Globe, Clock,
  Calendar, Link as LinkIcon, AlertTriangle, CheckCircle2, Search,
  FileText, Shield, Loader2, Plus, ArrowLeft
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Site {
  id: number;
  name: string;
  baseUrl: string;
  defaultScope: string;
  timezone: string;
  scheduleEnabled: boolean;
  scheduleIntervalDays: number;
  nextCrawlAt: string | null;
  crawlType: string;
  assetMode: string;
}

interface Overview {
  status: string;
  lastCompletedAt: string | null;
  nextCrawlAt: string | null;
  pages: number;
  links: number;
  failedPages: number;
  assetCount: number;
  latestSession: any;
}

interface Rule {
  id: number;
  ruleType: string;
  pattern: string;
  patternType: string;
  note: string;
  enabled: boolean;
  createdAt: string;
  createdBy: string;
}

interface HistorySession {
  id: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
  totalDiscovered: number;
  totalScanned: number;
  totalFailed: number;
  totalSkipped: number;
  totalIssues: number;
  brokenLinksCount: number;
}

function fmtDateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    discovering: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    scanning: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return map[status] ?? map["pending"];
}

function OverviewTab({ site, overview, onRunNow, isRunning }: { site: Site, overview: Overview, onRunNow: () => void, isRunning: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Pages Scanned</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{overview.pages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Total pages in index</p>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Failed Pages</CardTitle>
            <AlertTriangle className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">{overview.failedPages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Encountered errors</p>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Internal Links</CardTitle>
            <LinkIcon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{overview.links.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Discovered edges</p>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Assets Checked</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{overview.assetCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Images, scripts, styles</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Control Engine Status
          </CardTitle>
          <CardDescription>Current operational state for {site.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Current Status</span>
            </div>
            <Badge variant={overview.status === "running" ? "default" : "outline"} className={overview.status === "running" ? "animate-pulse" : ""}>
              {overview.status.toUpperCase()}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Last Completed</span>
            </div>
            <span className="text-sm font-mono">{fmtDateTime(overview.lastCompletedAt)}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Next Scheduled Crawl</span>
            </div>
            <span className="text-sm font-mono text-muted-foreground">{fmtDateTime(overview.nextCrawlAt)}</span>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/30 pt-6">
          <Button onClick={onRunNow} disabled={isRunning || overview.status === "running"} size="lg" className="w-full sm:w-auto shadow-md hover:shadow-lg transition-shadow">
            {isRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2 fill-current" />}
            Initiate Manual Scan
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function RulesTab({ siteId }: { siteId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const { data, isLoading } = useQuery({
    queryKey: ["site-rules", siteId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/rules`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load rules");
      return res.json() as Promise<{ rules: Rule[] }>;
    }
  });

  const rules = data?.rules ?? [];
  const [editingRule, setEditingRule] = useState<Partial<Rule> | null>(null);

  const createRule = useMutation({
    mutationFn: async (rule: Partial<Rule>) => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to create rule");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule added successfully" });
      setEditingRule(null);
      qc.invalidateQueries({ queryKey: ["site-rules", siteId] });
    }
  });

  const updateRule = useMutation({
    mutationFn: async (rule: Partial<Rule>) => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to update rule");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule updated successfully" });
      setEditingRule(null);
      qc.invalidateQueries({ queryKey: ["site-rules", siteId] });
    }
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/rules/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to delete rule");
    },
    onSuccess: () => {
      toast({ title: "Rule removed" });
      qc.invalidateQueries({ queryKey: ["site-rules", siteId] });
    }
  });

  const getRuleTypeBadge = (type: string) => {
    switch (type) {
      case "include": return <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">Include</Badge>;
      case "exclude": return <Badge variant="outline" className="border-red-500 text-red-600 dark:text-red-400">Exclude</Badge>;
      case "remove_link": return <Badge variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400">Remove Link</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Content Processing Rules</CardTitle>
          <CardDescription>
            Precise definitions for path inclusion, exclusion, and DOM element stripping during crawl.
            Evaluated in top-down order.
          </CardDescription>
        </div>
        <Button onClick={() => setEditingRule({ enabled: true, ruleType: "exclude", patternType: "contains", pattern: "", note: "" })}>
          <Plus className="w-4 h-4 mr-2" /> Add Rule
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-32">Type</TableHead>
              <TableHead className="w-32">Match</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : rules.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No processing rules configured.</TableCell></TableRow>
            ) : (
              rules.map(rule => (
                <TableRow key={rule.id} className={!rule.enabled ? "opacity-60" : ""}>
                  <TableCell>{getRuleTypeBadge(rule.ruleType)}</TableCell>
                  <TableCell className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{rule.patternType}</TableCell>
                  <TableCell className="font-mono text-sm">{rule.pattern}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{rule.note}</TableCell>
                  <TableCell className="text-center">
                    {rule.enabled ? (
                      <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10">Active</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingRule(rule)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit Configuration
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => deleteRule.mutate(rule.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete Rule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!editingRule} onOpenChange={(o) => { if (!o) setEditingRule(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule?.id ? "Edit Configuration Rule" : "New Configuration Rule"}</DialogTitle>
            <DialogDescription>Define how the crawler interprets paths and markup.</DialogDescription>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Rule Type</Label>
                  <Select value={editingRule.ruleType} onValueChange={(v) => setEditingRule({ ...editingRule, ruleType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="include">Include URL</SelectItem>
                      <SelectItem value="exclude">Exclude URL</SelectItem>
                      <SelectItem value="remove_link">Remove Link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Match Strategy</Label>
                  <Select value={editingRule.patternType} onValueChange={(v) => setEditingRule({ ...editingRule, patternType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains substring</SelectItem>
                      <SelectItem value="exact">Exact match</SelectItem>
                      <SelectItem value="regex">Regular Expression</SelectItem>
                      <SelectItem value="glob">Glob Pattern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Pattern Definition</Label>
                <Input 
                  value={editingRule.pattern || ""} 
                  onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                  className="font-mono text-sm"
                   placeholder={editingRule.ruleType === "remove_link" ? "e.g. /logout, /tracking/*" : "e.g. /admin/*"}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Documentation / Reason</Label>
                <Input 
                  value={editingRule.note || ""} 
                  onChange={(e) => setEditingRule({ ...editingRule, note: e.target.value })}
                  placeholder="Why is this rule necessary?"
                />
              </div>
              <div className="flex items-center gap-3 pt-2 bg-muted/30 p-3 rounded-lg border border-border/50">
                <Switch 
                  checked={editingRule.enabled ?? true} 
                  onCheckedChange={(c) => setEditingRule({ ...editingRule, enabled: c })}
                />
                <div>
                  <Label className="text-base cursor-pointer" onClick={() => setEditingRule({ ...editingRule, enabled: !(editingRule.enabled ?? true) })}>Rule enabled</Label>
                  <p className="text-xs text-muted-foreground leading-none mt-1">Disabled rules are ignored during crawl operations.</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (editingRule?.id) updateRule.mutate(editingRule);
                else createRule.mutate(editingRule as Partial<Rule>);
              }}
              disabled={createRule.isPending || updateRule.isPending || !editingRule?.pattern}
            >
              {createRule.isPending || updateRule.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingRule?.id ? "Update Configuration" : "Deploy Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function HistoryTab({ history }: { history: HistorySession[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Session History Log</CardTitle>
        <CardDescription>Immutable ledger of past crawler operations and metrics.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-40">Initiated</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Scanned</TableHead>
              <TableHead className="text-right">Issues</TableHead>
              <TableHead className="text-right">Broken Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No historical sessions recorded.</TableCell></TableRow>
            ) : (
              history.map(session => (
                <TableRow key={session.id}>
                  <TableCell className="font-mono text-xs">{fmtDateTime(session.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`px-2 py-0 border-transparent ${statusBadge(session.status)}`}>
                      {session.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {fmtDuration(session.createdAt, session.completedAt)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {session.totalScanned.toLocaleString()} <span className="text-muted-foreground text-xs">/ {session.totalDiscovered.toLocaleString()}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {session.totalIssues > 0 ? (
                      <span className="text-orange-600 dark:text-orange-400">{session.totalIssues.toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {session.brokenLinksCount > 0 ? (
                      <span className="text-destructive">{session.brokenLinksCount.toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SettingsTab({ siteId, site }: { siteId: string, site: Site }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState<Partial<Site>>({
    scheduleEnabled: site.scheduleEnabled,
    scheduleIntervalDays: site.scheduleIntervalDays,
    timezone: site.timezone,
    defaultScope: site.defaultScope,
    crawlType: site.crawlType,
    assetMode: site.assetMode,
  });

  const updateSettings = useMutation({
    mutationFn: async (settings: Partial<Site>) => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration deployed successfully" });
      qc.invalidateQueries({ queryKey: ["site-overview", siteId] });
    },
    onError: (err) => {
      toast({ title: "Deployment failed", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engine Architecture Settings</CardTitle>
        <CardDescription>Global parameters for crawler execution and boundary enforcement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-foreground">Execution Engine</Label>
            <Select value={formData.crawlType} onValueChange={(v) => setFormData({ ...formData, crawlType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard (Fast Static HTML)</SelectItem>
                <SelectItem value="javascript">JavaScript Rendered (Chromium)</SelectItem>
                <SelectItem value="fast">Fast (Head analysis only)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Determines how the crawler renders pages. JS requires significantly more compute.</p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-foreground">Boundary Scope</Label>
            <Select value={formData.defaultScope} onValueChange={(v) => setFormData({ ...formData, defaultScope: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-subdomains">Cross-subdomain boundary</SelectItem>
                <SelectItem value="subdomain">Strict single domain limit</SelectItem>
                <SelectItem value="subfolder">Strict directory path limit</SelectItem>
                <SelectItem value="exact-url">Only the seed URL</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Defines edge containment behavior when navigating links.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Asset Retrieval Strategy</Label>
            <Select value={formData.assetMode} onValueChange={(v) => setFormData({ ...formData, assetMode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Comprehensive (CSS, JS, Media)</SelectItem>
                <SelectItem value="images_only">Images Only</SelectItem>
                <SelectItem value="none">No Asset Retrieval</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Controls bandwidth usage and thoroughness of structural integrity checks.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Operational Timezone</Label>
            <Select value={formData.timezone} onValueChange={(v) => setFormData({ ...formData, timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UTC">UTC (Universal Coordinated Time)</SelectItem>
                <SelectItem value="America/New_York">Eastern Time (US)</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time (US)</SelectItem>
                <SelectItem value="Europe/London">London (UK)</SelectItem>
                <SelectItem value="Europe/Paris">Paris (EU)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Reference timezone for scheduled recurring operations.</p>
          </div>
        </div>

        <div className="border-t border-border/50 pt-6">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Recurring Operations
          </h3>
          <div className="bg-muted/30 border border-border/50 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Switch 
                checked={formData.scheduleEnabled} 
                onCheckedChange={(c) => setFormData({ ...formData, scheduleEnabled: c })} 
              />
              <div>
                <Label className="text-base cursor-pointer" onClick={() => setFormData({ ...formData, scheduleEnabled: !formData.scheduleEnabled })}>
                  Enable Automated Crawl Schedule
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Executes automatically at defined intervals.</p>
              </div>
            </div>
            
            {formData.scheduleEnabled && (
              <div className="space-y-2 pl-12 max-w-xs">
                <Label className="text-foreground">Execution Interval (Days)</Label>
                <Input 
                  type="number" 
                  min={1} 
                  max={365} 
                  value={formData.scheduleIntervalDays || 7} 
                  onChange={(e) => setFormData({ ...formData, scheduleIntervalDays: parseInt(e.target.value) || 7 })}
                  className="font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/30 pt-6 justify-end">
        <Button disabled={updateSettings.isPending} onClick={() => updateSettings.mutate(formData)} className="px-8 shadow-sm">
          {updateSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Deploy Configuration
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function SiteManagementPage() {
  const params = useParams<{ siteId: string }>();
  const { activeSiteId, activeSite, isLoading: isSitesLoading } = useSite();
  // The direct crawler-management route is driven by the global site switcher.
  // Keep the parameterized route for existing bookmarks and site-directory links.
  const routeSiteId = params.siteId ? Number(params.siteId) : null;
  const selectedSiteId = routeSiteId ?? activeSiteId;
  const siteId = selectedSiteId ? String(selectedSiteId) : undefined;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["site-overview", siteId],
    queryFn: async () => {
      if (!siteId) throw new Error("Select a site to manage its crawl");
      const res = await fetch(`${BASE}/api/sites/${siteId}/overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load site overview");
      return res.json() as Promise<{ site: Site; overview: Overview; history: HistorySession[] }>;
    },
    enabled: Boolean(siteId),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/sites/${siteId}/run-now`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to trigger scan");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Command acknowledged", description: "Scan sequence initiated." });
      qc.invalidateQueries({ queryKey: ["site-overview", siteId] });
    },
    onError: (err) => {
      toast({ title: "Sequence failure", description: err.message, variant: "destructive" });
    }
  });

  if (isSitesLoading || (Boolean(siteId) && isLoading)) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!siteId) {
    return (
      <div className="p-12 max-w-xl mx-auto">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-10 flex flex-col items-center text-center space-y-3">
            <Globe className="w-10 h-10 text-primary" />
            <h2 className="text-lg font-semibold">Select a site to manage</h2>
            <p className="text-sm text-muted-foreground">
              Choose a site from the site switcher at the top of the page to open its crawl control room.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-12 max-w-lg mx-auto">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-8 flex flex-col items-center text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-destructive" />
            <h2 className="text-lg font-semibold text-destructive">Data Retrieval Failed</h2>
            <p className="text-sm text-muted-foreground">Unable to fetch configuration data for the specified site.</p>
            <Button variant="outline" asChild className="mt-4"><Link href="/crawler/manage">Return to Crawl Management</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { site, overview, history } = data;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      <div className="flex items-center gap-4 pb-2 border-b border-border/60">
        <Button variant="outline" size="icon" asChild className="shrink-0 h-9 w-9 border-border/60 hover:bg-muted/50">
          <Link href="/crawler/manage"><ArrowLeft className="w-4 h-4 text-muted-foreground" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-2xl font-bold truncate tracking-tight">{site.name} Control Room</h1>
          </div>
          <p className="text-sm text-muted-foreground truncate font-mono bg-muted/40 px-2 py-0.5 rounded-md inline-block">
            {site.baseUrl}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 bg-muted/40 border border-border/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Overview Metrics</TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Content Rules</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Session History</TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Engine Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="m-0 animate-in fade-in-50 duration-500">
          <OverviewTab site={site} overview={overview} onRunNow={() => runNow.mutate()} isRunning={runNow.isPending} />
        </TabsContent>

        <TabsContent value="rules" className="m-0 animate-in fade-in-50 duration-500">
          <RulesTab siteId={siteId!} />
        </TabsContent>

        <TabsContent value="history" className="m-0 animate-in fade-in-50 duration-500">
          <HistoryTab history={history || []} />
        </TabsContent>

        <TabsContent value="settings" className="m-0 animate-in fade-in-50 duration-500">
          <SettingsTab siteId={siteId!} site={site} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
