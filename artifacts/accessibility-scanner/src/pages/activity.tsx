import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { useAuth, isAdmin } from "@/contexts/auth";
import { useSite } from "@/contexts/site";
import {
  Ban,
  CheckCircle2,
  XCircle,
  Clock,
  Undo2,
  Activity,
  ExternalLink,
  Check,
  X,
  MessageSquare,
  Download,
  Search,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type DecisionRecord = {
  id: number;
  scanSessionId: number;
  pageId: number | null;
  issueId: number | null;
  ruleId: string;
  selector: string | null;
  elementSnippet: string | null;
  pageUrl: string | null;
  issueDescription: string | null;
  decisionType: "cant_fix" | "false_positive";
  scope: "single" | "selector" | "class";
  classPattern: string | null;
  pagesAffected: number | null;
  reason: string | null;
  submittedBy: number;
  submitterName: string | null;
  reviewStatus: "pending" | "confirmed" | "rejected";
  reviewedBy: number | null;
  reviewerName: string | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
};

function ReviewStatusBadge({ status }: { status: string }) {
  if (status === "confirmed")
    return <Badge className="gap-1 rounded-full border border-[#afe9d0] bg-[#e4f7f0] px-2 py-0.5 text-[10px] font-semibold text-[#14835f] whitespace-nowrap"><CheckCircle2 className="w-3 h-3" />Confirmed</Badge>;
  if (status === "rejected")
    return <Badge className="gap-1 rounded-full border border-[#f5c0c0] bg-[#fdf0f0] px-2 py-0.5 text-[10px] font-semibold text-[#be2e2e] whitespace-nowrap"><XCircle className="w-3 h-3" />Rejected</Badge>;
  return <Badge className="gap-1 rounded-full border border-[#f8d79b] bg-[#fff4e4] px-2 py-0.5 text-[10px] font-semibold text-[#b85c0c] whitespace-nowrap"><Clock className="w-3 h-3" />Pending review</Badge>;
}

function ScopeBadge({ scope }: { scope: string }) {
  if (scope === "selector") return <Badge variant="outline" className="border-[#d9d0f8] bg-[#eee9ff] text-[10px] font-semibold text-[#6d48c7] whitespace-nowrap">CSS Selector</Badge>;
  if (scope === "class") return <Badge variant="outline" className="border-[#d9d0f8] bg-[#eee9ff] text-[10px] font-semibold text-[#6d48c7] whitespace-nowrap">CSS Class (all pages)</Badge>;
  return <Badge variant="outline" className="border-[#dfe4ec] bg-[#fafbfd] text-[10px] font-medium text-[#7a8899] whitespace-nowrap">Single occurrence</Badge>;
}

function exportCSV(rows: DecisionRecord[], tab: string) {
  const headers = [
    "ID", "Scan #", "Rule", "Issue Description", "URL", "Selector",
    "Decision Type", "Scope", "Submitted By", "Date",
    "Review Status", "Reviewed By", "Reviewer Comment", "Reason",
  ];
  const escape = (v: string | null | undefined | number) =>
    v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map(d => [
      d.id, d.scanSessionId, d.ruleId, d.issueDescription, d.pageUrl, d.selector,
      d.decisionType, d.scope, d.submitterName,
      new Date(d.createdAt).toLocaleDateString(),
      d.reviewStatus, d.reviewerName, d.reviewComment, d.reason,
    ].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ActivityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeSite } = useSite();
  const adminUser = isAdmin(user);
  const [tab, setTab] = useState<"cant_fix" | "false_positive">("cant_fix");
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterRule, setFilterRule] = useState("");
  const [filterSubmitter, setFilterSubmitter] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "pending" | "confirmed" | "rejected">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Review dialog
  const [reviewTarget, setReviewTarget] = useState<DecisionRecord | null>(null);
  const [reviewAction, setReviewAction] = useState<"confirmed" | "rejected">("confirmed");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeSite?.id != null) params.set("siteId", String(activeSite.id));
      const r = await fetch(`${BASE}/api/decisions${params.size ? `?${params}` : ""}`, { credentials: "include" });
      if (r.ok) setDecisions(await r.json());
    } finally {
      setLoading(false);
    }
  }, [activeSite?.id]);

  useEffect(() => { void loadDecisions(); }, [loadDecisions]);

  const filtered = useMemo(() => {
    return decisions.filter(d => {
      if (d.decisionType !== tab) return false;
      if (search) {
        const haystack = [
          d.ruleId,
          d.issueDescription,
          d.pageUrl,
          d.selector,
          d.reason,
          d.submitterName,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (filterRule && !d.ruleId.toLowerCase().includes(filterRule.toLowerCase())) return false;
      if (filterSubmitter && !(d.submitterName ?? "").toLowerCase().includes(filterSubmitter.toLowerCase())) return false;
      if (filterStatus && d.reviewStatus !== filterStatus) return false;
      if (filterDateFrom && new Date(d.createdAt) < new Date(filterDateFrom)) return false;
      return true;
    });
  }, [decisions, tab, search, filterRule, filterSubmitter, filterStatus, filterDateFrom]);

  const hasActiveFilters = Boolean(search || filterRule || filterSubmitter || filterStatus || filterDateFrom);

  async function undo(d: DecisionRecord) {
    const r = await fetch(`${BASE}/api/decisions/${d.id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) {
      setDecisions(prev => prev.filter(x => x.id !== d.id));
      toast({ title: "Decision removed" });
    } else {
      toast({ title: "Failed to remove decision", variant: "destructive" });
    }
  }

  async function submitReview() {
    if (!reviewTarget) return;
    setReviewSaving(true);
    try {
      const r = await fetch(`${BASE}/api/decisions/${reviewTarget.id}/review`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: reviewAction, reviewComment: reviewComment || undefined }),
      });
      if (r.ok) {
        const updated: DecisionRecord = await r.json();
        setDecisions(prev => prev.map(d => d.id === updated.id ? updated : d));
        setReviewTarget(null);
        setReviewComment("");
        toast({ title: reviewAction === "confirmed" ? "False positive confirmed — points will be credited" : "False positive rejected" });
      } else {
        toast({ title: "Failed to save review", variant: "destructive" });
      }
    } finally {
      setReviewSaving(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setFilterRule("");
    setFilterSubmitter("");
    setFilterStatus("");
    setFilterDateFrom("");
  }

  const canUndo = (d: DecisionRecord) => adminUser || d.submittedBy === user?.id;

  return (
    <TooltipProvider>
      <div className="vision-page vision-activity relative min-h-[calc(100dvh-4rem)] space-y-5 overflow-hidden p-4 sm:p-6 min-w-0">
      <div className="relative w-full space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d9d0f8] bg-[#eee9ff] text-[#6d48c7] shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#6d48c7]">Activity</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#172b4d]">Issue decisions</h1>
              <p className="mt-1 text-xs text-[#7a8899]">
                Track can't-fix overrides and false-positive rulings across all scans.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a0afc2]" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search rule or URL…"
                aria-label="Search activity decisions"
                className="h-9 w-48 rounded-xl border-[#dfe4ec] bg-white/75 pl-8 pr-3 text-xs text-[#263650] placeholder:text-[#a0afc2] focus:border-[#8c72e8] focus:ring-0"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-xl border-[#dfe4ec] bg-white/75 px-3 text-xs font-semibold text-[#5a6e87] hover:bg-white"
              onClick={() => setFiltersOpen(v => !v)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-xl border-[#dfe4ec] bg-white/75 px-3 text-xs font-semibold text-[#5a6e87] hover:bg-white"
              disabled={filtered.length === 0}
              onClick={() => exportCSV(filtered, tab)}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            ["Total decisions", decisions.length, "Across all scans", "bg-violet-100/70 border-violet-200"],
            ["Pending review", decisions.filter(d => d.reviewStatus === "pending").length, "Awaiting response", "bg-amber-50/80 border-amber-200"],
            ["Confirmed", decisions.filter(d => d.reviewStatus === "confirmed").length, "Accepted overrides", "bg-teal-50/80 border-teal-200"],
          ].map(([label, value, sub, tone]) => (
            <article key={String(label)} className={`rounded-[22px] border p-5 shadow-[0_14px_34px_rgba(69,57,112,.07)] backdrop-blur-xl ${tone}`}>
              <p data-testid={`text-activity-${String(label).toLowerCase().replaceAll(" ", "-")}`} className="text-3xl font-bold tracking-tight text-[#172b4d]">{value}</p>
              <p className="mt-1 text-sm font-semibold text-[#263650]">{label}</p>
              <p className="text-xs text-[#7a8899]">{sub}</p>
            </article>
          ))}
        </div>

        {/* Tabs + inline status filters */}
        <div className="overflow-hidden rounded-[22px] border border-white/80 bg-white/70 shadow-[0_14px_34px_rgba(69,57,112,.06)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center border-b border-[#edf0f7]">
            {([
              { key: "cant_fix", label: "Can't fix", icon: Ban },
              { key: "false_positive", label: "False positives", icon: XCircle },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 border-b-2 px-5 py-3 text-xs font-semibold transition-colors ${tab === key ? "border-[#6d48c7] text-[#6d48c7]" : "border-transparent text-[#7a8899] hover:text-[#263650]"}`}
              >
                <Icon className="w-4 h-4" />
                {label}
                <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${tab === key ? "bg-[#eee9ff] text-[#6d48c7]" : "bg-[#f0f2f6] text-[#7a899e]"}`}>
                  {decisions.filter(d => d.decisionType === key).length}
                </span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 px-4 py-2">
              {([
                ["", "All"],
                ["pending", "Pending"],
                ["confirmed", "Confirmed"],
                ["rejected", "Rejected"],
              ] as const).map(([key, label]) => {
                const count = key
                  ? decisions.filter(d => d.decisionType === tab && d.reviewStatus === key).length
                  : decisions.filter(d => d.decisionType === tab).length;
                const active = filterStatus === key;
                return (
                  <button
                    key={key || "all"}
                    type="button"
                    onClick={() => setFilterStatus(key)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${active ? "bg-[#6d48c7] text-white" : "bg-[#f0f2f6] text-[#7a899e] hover:text-[#6d48c7]"}`}
                  >
                    {label} {count}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter bar */}
          {filtersOpen && (
          <div className="border-b border-[#edf0f7] bg-white/45 p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1 min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground">Rule ID</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={filterRule}
                    onChange={e => setFilterRule(e.target.value)}
                    placeholder="e.g. ACT-R3"
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1 min-w-[160px]">
                <label className="text-xs font-medium text-muted-foreground">Submitted by</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={filterSubmitter}
                    onChange={e => setFilterSubmitter(e.target.value)}
                    placeholder="Name…"
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
              {tab === "false_positive" && (
                <div className="space-y-1 min-w-[150px]">
                  <label className="text-xs font-medium text-muted-foreground">Review status</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-8 text-xs w-full justify-between font-normal">
                        {filterStatus === "pending" ? "Pending" : filterStatus === "confirmed" ? "Confirmed" : filterStatus === "rejected" ? "Rejected" : "All statuses"}
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="text-xs">
                      <DropdownMenuItem onClick={() => setFilterStatus("")}>All statuses</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus("pending")}>Pending</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus("confirmed")}>Confirmed</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterStatus("rejected")}>Rejected</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              <div className="space-y-1 min-w-[150px]">
                <label className="text-xs font-medium text-muted-foreground">From date</label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>
                  <X className="w-3 h-3 mr-1" /> Clear filters
                </Button>
              )}
            </div>
            {hasActiveFilters && (
              <p className="mt-2 text-xs text-[#7a8899]">Showing {filtered.length} of {decisions.filter(d => d.decisionType === tab).length} results</p>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            {hasActiveFilters ? (
              <p className="text-sm">No results match the active filters.</p>
            ) : (
              <>
                <p className="text-sm">No {tab === "cant_fix" ? "can't fix" : "false positive"} decisions yet.</p>
                <p className="text-xs mt-1">Use the ⚙ decision button in the Page Report to flag occurrences.</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs" style={{ minWidth: "980px" }}>
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "10%" }} />
                {tab === "false_positive" && <col style={{ width: "8%" }} />}
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: tab === "false_positive" ? "7%" : "16%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[#edf0f7] bg-[#fafbfd]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Page / selector</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Rule</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Submitted by</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Scope</th>
                  {tab === "false_positive" && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Review status</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Pages</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#7a8899]">Reason</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#7a8899]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-[#f4f6fa] last:border-0 transition-colors hover:bg-[#f8f6ff]/60">
                    {/* Issue */}
                    <td className="px-4 py-3">
                      <p className="text-xs text-[#263650] line-clamp-2">{d.issueDescription ?? d.ruleId}</p>
                      {d.selector && (
                        <code className="mt-0.5 block truncate font-mono text-[10px] text-[#9aabb8]">{d.selector}</code>
                      )}
                    </td>

                    {/* URL */}
                    <td className="px-4 py-3">
                      {d.pageUrl ? (
                        <a
                          href={d.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[#3778c8] hover:underline"
                        >
                          <span className="truncate block max-w-[160px]">{d.pageUrl.replace(/^https?:\/\//, "")}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-[#9aabb8]">—</span>
                      )}
                      <Link href={`/scans/${d.scanSessionId}`}>
                        <span className="mt-0.5 block cursor-pointer text-[10px] text-[#9aabb8] hover:underline">Scan #{d.scanSessionId}</span>
                      </Link>
                    </td>

                    {/* Rule */}
                    <td className="px-4 py-3">
                      <span className="rounded bg-[#eee9ff] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#6d48c7]">{d.ruleId}</span>
                    </td>

                    {/* Decision by */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-[#5a6e87]">{d.submitterName ?? "Unknown"}</span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-[#9aabb8]">{new Date(d.createdAt).toLocaleDateString()}</span>
                    </td>

                    {/* Scope */}
                    <td className="px-4 py-3">
                      <ScopeBadge scope={d.scope} />
                    </td>

                    {/* Status (FP tab only) */}
                    {tab === "false_positive" && (
                      <td className="px-4 py-3">
                        <ReviewStatusBadge status={d.reviewStatus} />
                        {d.reviewedBy && d.reviewerName && (
                          <p className="mt-0.5 text-[10px] text-[#9aabb8]">by {d.reviewerName}</p>
                        )}
                      </td>
                    )}

                    {/* Pages Affected */}
                    <td className="px-4 py-3">
                      {d.pagesAffected != null ? (
                        <span className="inline-flex items-center gap-1 rounded border border-[#d9d0f8] bg-[#eee9ff] px-1.5 py-0.5 text-xs font-medium text-[#6d48c7]">
                          {d.pagesAffected}
                        </span>
                      ) : (
                        <span className="text-xs text-[#9aabb8]">—</span>
                      )}
                    </td>

                    {/* Reason + reviewer comment tooltip */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        <p className="flex-1 text-xs text-[#5a6e87] line-clamp-3">
                          {d.reason ?? <span className="text-[#9aabb8]">—</span>}
                        </p>
                        {d.reviewComment && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="mt-0.5 shrink-0 text-[#9aabb8] transition-colors hover:text-[#6d48c7]"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[260px]">
                              <p className="text-xs font-medium mb-0.5">
                                Reviewer{d.reviewerName ? ` (${d.reviewerName})` : ""}:
                              </p>
                              <p className="text-xs">{d.reviewComment}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        {adminUser && tab === "false_positive" && d.reviewStatus === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                               className="grid h-7 w-7 place-items-center rounded-lg border-[#afe9d0] bg-[#e4f7f0] p-0 text-[#14835f] hover:bg-[#c6f0df]"
                              onClick={() => { setReviewTarget(d); setReviewAction("confirmed"); setReviewComment(""); }}
                               aria-label="Confirm false positive"
                            >
                               <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                               className="grid h-7 w-7 place-items-center rounded-lg border-[#f5c0c0] bg-[#fdf0f0] p-0 text-[#be2e2e] hover:bg-[#fae0e0]"
                              onClick={() => { setReviewTarget(d); setReviewAction("rejected"); setReviewComment(""); }}
                               aria-label="Reject false positive"
                            >
                               <X className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        {canUndo(d) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 rounded-lg px-2 text-xs text-[#7a8899] hover:bg-[#fdf0f0] hover:text-[#be2e2e]"
                            onClick={() => undo(d)}
                          >
                            <Undo2 className="w-3 h-3" /> Undo
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>

        {/* Review dialog */}
        <Dialog open={!!reviewTarget} onOpenChange={open => { if (!open) setReviewTarget(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {reviewAction === "confirmed"
                  ? <><CheckCircle2 className="w-4 h-4 text-green-600" />Confirm False Positive</>
                  : <><XCircle className="w-4 h-4 text-red-600" />Reject False Positive Claim</>
                }
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {reviewTarget && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground mb-0.5">{reviewTarget.ruleId} · {reviewTarget.submitterName}</p>
                  <p className="text-foreground line-clamp-2">{reviewTarget.issueDescription ?? reviewTarget.ruleId}</p>
                </div>
              )}
              {reviewAction === "confirmed" ? (
                <p className="text-sm text-muted-foreground">
                  Confirming this false positive indicates the occurrence was flagged in error and will credit points back to the site score.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Rejecting this claim means the issue stands and no points are credited. You can add an explanation for the submitter.
                </p>
              )}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Comment {reviewAction === "rejected" ? "(required reason)" : "(optional)"}:
                </label>
                <Textarea
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  rows={3}
                  placeholder={reviewAction === "rejected" ? "Explain why this is not a false positive…" : "Optional note…"}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
              <Button
                disabled={reviewSaving || (reviewAction === "rejected" && !reviewComment.trim())}
                onClick={submitReview}
                className={reviewAction === "confirmed" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              >
                {reviewSaving ? "Saving…" : reviewAction === "confirmed" ? "Confirm FP" : "Reject FP"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </TooltipProvider>
  );
}
