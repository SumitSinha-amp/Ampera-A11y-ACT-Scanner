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
    return <Badge className="bg-green-100 text-green-800 border-green-200 gap-1 font-normal whitespace-nowrap"><CheckCircle2 className="w-3 h-3" />Confirmed FP</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 font-normal whitespace-nowrap"><XCircle className="w-3 h-3" />Rejected</Badge>;
  return <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1 font-normal whitespace-nowrap"><Clock className="w-3 h-3" />Pending Review</Badge>;
}

function ScopeBadge({ scope }: { scope: string }) {
  if (scope === "selector") return <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap">CSS Selector</Badge>;
  if (scope === "class") return <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap">CSS Class (all pages)</Badge>;
  return <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap">Single occurrence</Badge>;
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
      if (filterRule && !d.ruleId.toLowerCase().includes(filterRule.toLowerCase())) return false;
      if (filterSubmitter && !(d.submitterName ?? "").toLowerCase().includes(filterSubmitter.toLowerCase())) return false;
      if (filterStatus && d.reviewStatus !== filterStatus) return false;
      if (filterDateFrom && new Date(d.createdAt) < new Date(filterDateFrom)) return false;
      return true;
    });
  }, [decisions, tab, filterRule, filterSubmitter, filterStatus, filterDateFrom]);

  const hasActiveFilters = filterRule || filterSubmitter || filterStatus || filterDateFrom;

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
    setFilterRule("");
    setFilterSubmitter("");
    setFilterStatus("");
    setFilterDateFrom("");
  }

  const canUndo = (d: DecisionRecord) => adminUser || d.submittedBy === user?.id;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary shrink-0" />
            <div>
              <h1 className="text-2xl font-bold">Activity</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Review and manage occurrence decisions across all scans
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
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
              className="gap-1.5"
              disabled={filtered.length === 0}
              onClick={() => exportCSV(filtered, tab)}
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <div className="flex gap-0">
            {([
              { key: "cant_fix", label: "Dismissed as Can't Fix", icon: Ban },
              { key: "false_positive", label: "Dismissed as False Positive", icon: XCircle },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="w-4 h-4" />
                {label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {decisions.filter(d => d.decisionType === key).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        {filtersOpen && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
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
              <p className="text-xs text-muted-foreground mt-2">Showing {filtered.length} of {decisions.filter(d => d.decisionType === tab).length} results</p>
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
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm table-fixed" style={{ minWidth: "980px" }}>
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
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">URL</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rule</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Decision by</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scope</th>
                  {tab === "false_positive" && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pages</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    {/* Issue */}
                    <td className="px-4 py-3">
                      <p className="text-xs text-foreground line-clamp-2">{d.issueDescription ?? d.ruleId}</p>
                      {d.selector && (
                        <code className="text-[10px] text-muted-foreground font-mono truncate block mt-0.5">{d.selector}</code>
                      )}
                    </td>

                    {/* URL */}
                    <td className="px-4 py-3">
                      {d.pageUrl ? (
                        <a
                          href={d.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-violet-600 hover:underline flex items-center gap-1"
                        >
                          <span className="truncate block max-w-[160px]">{d.pageUrl.replace(/^https?:\/\//, "")}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      <Link href={`/scans/${d.scanSessionId}`}>
                        <span className="text-[10px] text-muted-foreground hover:underline cursor-pointer block mt-0.5">Scan #{d.scanSessionId}</span>
                      </Link>
                    </td>

                    {/* Rule */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-foreground">{d.ruleId}</span>
                    </td>

                    {/* Decision by */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-foreground">{d.submitterName ?? "Unknown"}</span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</span>
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
                          <p className="text-[10px] text-muted-foreground mt-0.5">by {d.reviewerName}</p>
                        )}
                      </td>
                    )}

                    {/* Pages Affected */}
                    <td className="px-4 py-3">
                      {d.pagesAffected != null ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                          {d.pagesAffected}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Reason + reviewer comment tooltip */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        <p className="text-xs text-foreground line-clamp-3 flex-1">
                          {d.reason ?? <span className="text-muted-foreground">—</span>}
                        </p>
                        {d.reviewComment && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
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
                              className="h-7 text-xs px-2 gap-1 text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => { setReviewTarget(d); setReviewAction("confirmed"); setReviewComment(""); }}
                            >
                              <Check className="w-3 h-3" /> Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2 gap-1 text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() => { setReviewTarget(d); setReviewAction("rejected"); setReviewComment(""); }}
                            >
                              <X className="w-3 h-3" /> Reject
                            </Button>
                          </>
                        )}
                        {canUndo(d) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-destructive"
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
    </TooltipProvider>
  );
}
