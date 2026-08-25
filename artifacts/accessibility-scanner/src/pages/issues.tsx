import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Columns3, List, Loader2, Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

import { useIssues, usePeople, useCreateIssue } from "../hooks/use-issues";
import { ISSUE_TYPES, STATUS_LABELS } from "../lib/issue-types";
import { IssueList } from "../components/issues/issue-list";
import { IssueBoard } from "../components/issues/issue-board";
import { IssueDetail } from "../components/issues/issue-detail";
import { IssueForm } from "../components/issues/issue-form";

// We'll use simple flex/grid layouts instead of resizable panels to ensure stability
// since we don't have absolute certainty the Resizable component is complete in shadcn setup.

export default function IssuesPage() {
  const [location, navigate] = useLocation();
  const { data: issueData, isLoading: issuesLoading } = useIssues();
  const { data: peopleData, isLoading: peopleLoading } = usePeople();
  const createIssue = useCreateIssue();
  const { toast } = useToast();
  const { user } = useAuth();

  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  
  const [draft, setDraft] = useState<Record<string, any>>({ 
    type: "bug", priority: "medium", status: "todo", title: "", description: "", labels: [], checklist: [] 
  });

  const canCreate = user?.permissions?.canCreateIssue ?? false;
  const canEdit = user?.permissions?.canEditIssue ?? false;
  const canComment = user?.permissions?.canCommentIssue ?? false;
  const canManage = user?.permissions?.canManageIssues ?? false;

  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    if (params.get("create") === "1") {
      setDraft({
        type: params.get("type") ?? "bug", 
        priority: params.get("priority") ?? "medium", 
        status: "todo",
        title: params.get("title") ?? "", 
        description: params.get("description") ?? "",
        siteId: params.get("siteId") ? Number(params.get("siteId")) : null, 
        scanId: params.get("scanId") ? Number(params.get("scanId")) : null,
        pageId: params.get("pageId") ? Number(params.get("pageId")) : null, 
        ruleId: params.get("ruleId") ?? null,
        selector: params.get("selector") ?? null, 
        sourceDescription: params.get("source") ?? null, 
        labels: [], 
        checklist: [],
      });
      setCreateOpen(true); 
      navigate("/issues", { replace: true });
    }
  }, [location, navigate]);

  const issues = issueData?.issues || [];
  const metrics = issueData?.metrics || { total: 0, open: 0, inProgress: 0, done: 0, bugs: 0 };
  const people = peopleData || [];

  const filtered = useMemo(() => issues.filter((issue) =>
    (!search || [issue.issueKey, issue.title, issue.description, issue.siteName ?? ""].join(" ").toLowerCase().includes(search.toLowerCase())) &&
    (typeFilter === "all" || issue.type === typeFilter) && 
    (statusFilter === "all" || issue.status === statusFilter)
  ), [issues, search, typeFilter, statusFilter]);

  const allStatuses = Array.from(new Set(issues.map(i => i.status)));

  const handleCreateSave = () => {
    createIssue.mutate(draft, {
      onSuccess: (saved) => {
        setCreateOpen(false);
        toast({ title: "Issue created", description: saved.issueKey });
        if (view === "list") {
          setSelectedIssueId(saved.id);
        }
      },
      onError: (err) => {
        toast({ title: "Couldn't save issue", description: err.message, variant: "destructive" });
      }
    });
  };

  const setDraftField = (key: string, value: any) => setDraft((current) => ({ ...current, [key]: value }));
  const openNewIssue = () => { 
    if (!canCreate) return; 
    setDraft({ type: "bug", priority: "medium", status: "todo", title: "", description: "", labels: [], checklist: [] }); 
    setCreateOpen(true); 
  };

  if (issuesLoading || peopleLoading) {
    return <div className="flex justify-center p-14"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] p-4 md:p-6 bg-muted/10 space-y-4">
      
      {/* Header */}
      <div className="flex-none flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase text-primary mb-1">Work Management</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Issues</h1>
        </div>
        {canCreate && (
          <Button onClick={openNewIssue} size="lg" className="font-semibold shadow-sm">
            <Plus className="h-5 w-5 mr-2" /> Create Issue
          </Button>
        )}
      </div>

      {/* Metrics Row */}
      <div className="flex-none grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Total", metrics.total, "text-foreground"], 
          ["Open", metrics.open, "text-blue-600 dark:text-blue-400"], 
          ["In progress", metrics.inProgress, "text-amber-600 dark:text-amber-400"], 
          ["Complete", metrics.done, "text-emerald-600 dark:text-emerald-400"], 
          ["Bugs", metrics.bugs, "text-rose-600 dark:text-rose-400"]
        ].map(([label, value, style]) => (
          <Card key={String(label)} className="bg-card shadow-sm border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
              <p className={`text-2xl font-black ${style}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex-none bg-card p-2 rounded-lg border shadow-sm flex flex-col md:flex-row items-center gap-2">
        <div className="relative flex-1 min-w-0 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            aria-label="Search issues" 
            className="pl-9 border-transparent focus-visible:border-ring bg-muted/50 font-medium" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search keywords or keys..." 
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger aria-label="Filter by issue type" className="w-full md:w-[140px] font-medium bg-muted/50 border-transparent">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ISSUE_TYPES.map(t => <SelectItem key={t} value={t} className="uppercase text-xs font-bold tracking-wider">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filter by issue status" className="w-full md:w-[160px] font-medium bg-muted/50 border-transparent">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {allStatuses.map((value) => (
                <SelectItem key={value} value={value} className="font-medium">{STATUS_LABELS[value] || value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={view} onValueChange={(value) => { setView(value as "list" | "board"); setSelectedIssueId(null); }} className="w-auto">
            <TabsList aria-label="Issue view" className="h-10 bg-muted/50 p-1">
              <TabsTrigger value="list" aria-label="List view" className="px-3"><List className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="board" aria-label="Board view" className="px-3"><Columns3 className="h-4 w-4" /></TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 min-h-0 relative">
        {view === "board" ? (
          <div className="absolute inset-0 border rounded-lg overflow-hidden bg-card shadow-sm">
            <IssueBoard 
              issues={filtered} 
              statuses={typeFilter === "bug" ? ["todo", "in_progress", "fixed", "review", "release_to_retest", "reopen", "verified", "closed"] : 
                       (typeFilter === "task" || typeFilter === "story" ? ["todo", "in_progress", "deployed", "review", "release_to_retest", "reopen", "verified", "complete"] : 
                       Array.from(new Set(Object.keys(STATUS_LABELS))))} 
              onSelect={(id) => {
                setSelectedIssueId(id);
                // In board view, we switch to list view to show details, or we could use a Sheet.
                // Switching to list view is a dense, fast way to handle it without external Sheet dependencies.
                setView("list");
              }} 
              selectedId={selectedIssueId}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex border rounded-lg overflow-hidden bg-card shadow-sm">
            {/* Sidebar List */}
            <div className={`flex flex-col border-r bg-muted/10 transition-all duration-300 ${selectedIssueId ? 'w-1/3 hidden md:flex' : 'w-full'}`}>
              <IssueList issues={filtered} onSelect={setSelectedIssueId} selectedId={selectedIssueId} />
            </div>
            
            {/* Detail Pane */}
            {selectedIssueId ? (
              <div className="flex-1 w-full md:w-2/3 min-w-0 bg-background relative z-10">
                <IssueDetail 
                  id={selectedIssueId} 
                  people={people} 
                  issues={issues}
                  canEdit={canEdit} 
                  canComment={canComment} 
                  canManage={canManage} 
                  onClose={() => setSelectedIssueId(null)}
                  onSelectIssue={setSelectedIssueId}
                />
              </div>
            ) : (
              <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-muted/5">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold tracking-tight">Select an issue</h3>
                <p className="text-muted-foreground mt-2 max-w-sm">
                  Choose an issue from the list to view its details, update its status, or add comments.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <IssueForm 
        open={createOpen} 
        onOpenChange={setCreateOpen} 
        draft={draft} 
        setField={setDraftField} 
        people={people} 
        issues={issues}
        onSave={handleCreateSave} 
      />
    </div>
  );
}
