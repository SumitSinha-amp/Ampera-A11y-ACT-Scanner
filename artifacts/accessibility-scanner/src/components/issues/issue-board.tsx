import React from "react";
import { Issue, TYPE_COLORS, STATUS_COLORS, STATUS_LABELS } from "../../lib/issue-types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface IssueBoardProps {
  issues: Issue[];
  statuses: readonly string[];
  onSelect: (id: number) => void;
  selectedId: number | null;
}

export function IssueBoard({ issues, statuses, onSelect, selectedId }: IssueBoardProps) {
  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4 bg-muted/10 items-start">
      {statuses.map((status) => {
        const columnIssues = issues.filter((x) => x.status === status);
        return (
          <section key={status} className="w-[300px] flex-shrink-0 rounded-lg border bg-muted/30 flex flex-col max-h-full">
            <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-muted/30 backdrop-blur-sm z-10">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{STATUS_LABELS[status]}</h2>
              <Badge variant="secondary" className="font-mono text-xs">{columnIssues.length}</Badge>
            </div>
            
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {columnIssues.map((issue) => (
                <Card 
                  key={issue.id} 
                  className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${selectedId === issue.id ? "ring-2 ring-primary border-transparent" : "shadow-sm"}`}
                  onClick={() => onSelect(issue.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge className={`${TYPE_COLORS[issue.type]} px-1.5 py-0 text-[10px] font-semibold tracking-wide uppercase border-0`}>
                        {issue.type}
                      </Badge>
                      <span className="text-[11px] font-mono font-medium text-muted-foreground">{issue.issueKey}</span>
                    </div>
                    
                    <p className="text-sm font-medium leading-snug line-clamp-2 mb-3">
                      {issue.title}
                    </p>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        {issue.priority && (
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            issue.priority.includes('high') ? 'text-destructive' : 
                            issue.priority === 'medium' ? 'text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'
                          }`}>
                            {issue.priority}
                          </span>
                        )}
                      </div>
                      
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary" title={issue.assigneeName || "Unassigned"}>
                        {issue.assigneeName ? issue.assigneeName.charAt(0).toUpperCase() : "?"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {columnIssues.length === 0 && (
                <div className="h-20 flex items-center justify-center border-2 border-dashed rounded-md text-xs text-muted-foreground/50 font-medium">
                  Drop issues here
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
