import React from "react";
import { Issue, TYPE_COLORS, STATUS_COLORS, STATUS_LABELS } from "../../lib/issue-types";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";

interface IssueListProps {
  issues: Issue[];
  onSelect: (id: number) => void;
  selectedId: number | null;
  variant?: "table" | "compact";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function Assignee({ issue, showName = false }: { issue: Issue; showName?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {issue.assigneeName ? issue.assigneeName.charAt(0).toUpperCase() : "?"}
      </span>
      {showName && <span className="truncate text-xs text-muted-foreground">{issue.assigneeName || "Unassigned"}</span>}
    </div>
  );
}

export function IssueList({ issues, onSelect, selectedId, variant = "compact" }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-muted/10">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="font-semibold text-lg">No matching issues</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-[250px]">
          Try adjusting your filters or create a new issue to get started.
        </p>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div aria-label="Issues" className="h-full overflow-auto bg-card">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr className="border-b">
              <th className="w-32 px-4 py-2.5">Key</th>
              <th className="min-w-[280px] px-3 py-2.5">Summary</th>
              <th className="w-24 px-3 py-2.5">Type</th>
              <th className="w-36 px-3 py-2.5">Status</th>
              <th className="w-24 px-3 py-2.5">Priority</th>
              <th className="w-44 px-3 py-2.5">Assignee</th>
              <th className="w-28 px-3 py-2.5">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {issues.map((issue) => (
              <tr
                key={issue.id}
                tabIndex={0}
                aria-label={`Open ${issue.issueKey}: ${issue.title}`}
                aria-current={selectedId === issue.id ? "true" : undefined}
                onClick={() => onSelect(issue.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(issue.id);
                  }
                }}
                className={`cursor-pointer transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  selectedId === issue.id ? "bg-primary/5" : "bg-card"
                }`}
              >
                <td className={`border-l-2 px-4 py-2.5 font-mono text-xs font-semibold ${selectedId === issue.id ? "border-l-primary text-primary" : "border-l-transparent text-muted-foreground"}`}>
                  {issue.issueKey}
                </td>
                <td className="max-w-0 px-3 py-2.5">
                  <div className="truncate font-medium text-foreground">{issue.title}</div>
                  {(issue.projectName || issue.siteName) && (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {[issue.projectName, issue.siteName].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge className={`${TYPE_COLORS[issue.type]} border-0 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide`}>
                    {issue.type}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Badge className={`${STATUS_COLORS[issue.status]} border-0 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide`}>
                    {STATUS_LABELS[issue.status] || issue.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs font-medium capitalize text-foreground/80">{issue.priority}</td>
                <td className="px-3 py-2.5"><Assignee issue={issue} showName /></td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(issue.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div aria-label="Issues" className="h-full divide-y divide-border overflow-y-auto bg-card">
      {issues.map((issue) => (
        <button
          key={issue.id}
          onClick={() => onSelect(issue.id)}
          aria-current={selectedId === issue.id ? "true" : undefined}
          className={`w-full border-l-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
            selectedId === issue.id ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge className={`${TYPE_COLORS[issue.type]} border-0 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide`}>
                  {issue.type}
                </Badge>
                <span className="font-mono text-[11px] font-semibold text-muted-foreground">{issue.issueKey}</span>
              </div>
              <h4 className={`mt-1 truncate text-sm font-medium ${selectedId === issue.id ? "text-primary" : "text-foreground"}`}>
                {issue.title}
              </h4>
            </div>
            <Assignee issue={issue} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Badge className={`${STATUS_COLORS[issue.status]} border-0 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide`}>
              {STATUS_LABELS[issue.status] || issue.status}
            </Badge>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              <span>{formatDate(issue.updatedAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{issue.priority}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
