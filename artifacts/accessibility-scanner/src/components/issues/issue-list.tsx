import React from "react";
import { Issue, TYPE_COLORS, STATUS_COLORS, STATUS_LABELS } from "../../lib/issue-types";
import { Badge } from "@/components/ui/badge";

interface IssueListProps {
  issues: Issue[];
  onSelect: (id: number) => void;
  selectedId: number | null;
}

export function IssueList({ issues, onSelect, selectedId }: IssueListProps) {
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

  return (
    <div aria-label="Issues" className="divide-y divide-border h-full overflow-y-auto bg-card">
      {issues.map((issue) => (
        <button
          key={issue.id}
          onClick={() => onSelect(issue.id)}
          aria-current={selectedId === issue.id ? "true" : undefined}
          className={`w-full text-left p-4 hover:bg-muted/50 transition-colors focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:outline-none ${
            selectedId === issue.id ? "bg-primary/5 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground/70">{issue.issueKey}</span>
              <span>•</span>
              <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
            </div>
            <Badge className={`${STATUS_COLORS[issue.status]} px-1.5 py-0 text-[10px] uppercase font-bold tracking-wider border-0`}>
              {STATUS_LABELS[issue.status]}
            </Badge>
          </div>
          
          <h4 className={`text-sm font-semibold line-clamp-2 mb-2 ${selectedId === issue.id ? "text-primary" : "text-foreground"}`}>
            {issue.title}
          </h4>
          
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <Badge className={`${TYPE_COLORS[issue.type]} px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase border-0`}>
                {issue.type}
              </Badge>
              {issue.priority && (
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  issue.priority.includes('high') ? 'text-destructive' : 
                  issue.priority === 'medium' ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'
                }`}>
                  {issue.priority}
                </span>
              )}
            </div>
            
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[10px] text-foreground">
                {issue.assigneeName ? issue.assigneeName.charAt(0).toUpperCase() : "?"}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
