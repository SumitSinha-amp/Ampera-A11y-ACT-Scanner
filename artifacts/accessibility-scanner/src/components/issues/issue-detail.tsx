import React, { useState } from "react";
import { Loader2, MessageSquare, Archive, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useIssue, useUpdateIssue, useAddComment, useArchiveIssue } from "../../hooks/use-issues";
import { getStatusTransitions, STATUS_LABELS, STATUS_COLORS, TYPE_COLORS, Person } from "../../lib/issue-types";
import { RichTextEditor } from "./rich-text-editor";
import { AttachmentControl, AttachmentPreview } from "./attachment-control";
import { useToast } from "@/hooks/use-toast";
import { sanitizeIssueHtml } from "../../lib/sanitize-issue-html";

interface IssueDetailProps {
  id: number;
  people: Person[];
  canEdit: boolean;
  canComment: boolean;
  canManage: boolean;
  onClose?: () => void;
}

export function IssueDetail({ id, people, canEdit, canComment, canManage, onClose }: IssueDetailProps) {
  const { data, isLoading } = useIssue(id);
  const updateIssue = useUpdateIssue(id);
  const addComment = useAddComment(id);
  const archiveIssue = useArchiveIssue();
  const { toast } = useToast();

  const [commentBody, setCommentBody] = useState("");
  const [commentAttachments, setCommentAttachments] = useState<any[]>([]);

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { issue, comments, activity, attachments } = data;

  const handleStatusChange = (newStatus: string) => {
    updateIssue.mutate({ status: newStatus });
  };

  const handleAssigneeChange = (assigneeId: string) => {
    updateIssue.mutate({ assigneeId: assigneeId === "unassigned" ? null : Number(assigneeId) });
  };

  const submitComment = () => {
    if (!commentBody.trim() && commentAttachments.length === 0) return;
    const mentionIds = people.filter((person) => commentBody.includes(`@${person.name}`)).map((person) => person.id);
    addComment.mutate(
      { body: commentBody, mentionIds, attachments: commentAttachments },
      {
        onSuccess: () => {
          setCommentBody("");
          setCommentAttachments([]);
          toast({ title: "Comment added" });
        }
      }
    );
  };

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this issue?")) return;
    archiveIssue.mutate(id, {
      onSuccess: () => {
        toast({ title: "Issue archived" });
        onClose?.();
      }
    });
  };

  const allowedStatuses = [issue.status, ...getStatusTransitions(issue.type, issue.status)];

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="flex-none p-5 lg:p-6 border-b bg-card">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-muted-foreground">{issue.issueKey}</span>
            <Badge className={`${TYPE_COLORS[issue.type]} px-2 py-0.5 text-xs font-bold uppercase tracking-wider border-0`}>
              {issue.type}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <Button variant="ghost" size="sm" onClick={handleArchive} className="text-muted-foreground hover:text-destructive">
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="md:hidden">
                Close
              </Button>
            )}
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground leading-snug">{issue.title}</h1>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 p-5 lg:p-6">
          
          {/* Main Column */}
          <div className="xl:col-span-2 space-y-8">
            {/* Description */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Description</h3>
              <div 
                className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed bg-muted/20 p-4 rounded-lg border"
                dangerouslySetInnerHTML={{ __html: sanitizeIssueHtml(issue.description) || "<p>No description provided.</p>" }}
              />
            </section>

            {/* Type-Specific Fields */}
            {issue.type === "bug" && (
              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {issue.stepsToReproduce && (
                  <div className="bg-destructive/5 border border-destructive/10 p-4 rounded-lg md:col-span-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-destructive mb-2">Steps to Reproduce</h4>
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeIssueHtml(issue.stepsToReproduce) }} />
                  </div>
                )}
                {issue.expectedResult && (
                  <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-lg">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">Expected Result</h4>
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeIssueHtml(issue.expectedResult) }} />
                  </div>
                )}
                {issue.actualResult && (
                  <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-lg">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">Actual Result</h4>
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeIssueHtml(issue.actualResult) }} />
                  </div>
                )}
              </section>
            )}

            {issue.type === "story" && issue.acceptanceCriteria && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Acceptance Criteria</h3>
                <div className="bg-muted/30 p-4 rounded-lg border prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeIssueHtml(issue.acceptanceCriteria) }} />
              </section>
            )}

            {issue.type === "task" && issue.checklist && issue.checklist.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Checklist</h3>
                <div className="space-y-2 bg-muted/20 p-4 rounded-lg border">
                  {issue.checklist.map((item, idx) => (
                    <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                        checked={item.done}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const newList = [...(issue.checklist || [])];
                          newList[idx].done = e.target.checked;
                          updateIssue.mutate({ checklist: newList });
                        }}
                      />
                      <span className={`text-sm ${item.done ? 'line-through text-muted-foreground' : 'text-foreground group-hover:text-primary transition-colors'}`}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {issue.customFields && Object.keys(issue.customFields).length > 0 && (
              <section className="grid gap-3 sm:grid-cols-2">
                {Object.entries(issue.customFields).filter(([, value]) => Boolean(value)).map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/15 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{String(value)}</p>
                  </div>
                ))}
              </section>
            )}

            {/* Source Reference */}
            {issue.ruleId && (
              <section className="bg-muted/40 p-4 rounded-lg border flex flex-col gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Source Finding</h4>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{issue.ruleId}</span>
                  </div>
                  {issue.siteName && <span>• Site: {issue.siteName}</span>}
                  {issue.pageId && <span>• Page ID: {issue.pageId}</span>}
                </div>
                {issue.selector && (
                  <code className="mt-2 block p-2 bg-background border rounded text-xs text-muted-foreground break-all">
                    {issue.selector}
                  </code>
                )}
                {issue.sourceDescription && (
                  <p className="text-sm text-muted-foreground mt-2">{issue.sourceDescription}</p>
                )}
              </section>
            )}

            {/* Attachments */}
            {(attachments && attachments.length > 0) && (
              <section>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Attachments</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attachments.map(att => (
                    <AttachmentPreview key={att.id || att.objectPath} attachment={att} issueId={issue.id} />
                  ))}
                </div>
              </section>
            )}

            {/* Comments */}
            <section className="pt-6 border-t">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Activity</h3>
              
              {canComment && (
                <div className="mb-8 bg-muted/10 p-4 rounded-lg border">
                  <h4 className="text-xs font-bold uppercase tracking-wider mb-3">Add Comment</h4>
                  <RichTextEditor 
                    value={commentBody} 
                    onChange={setCommentBody} 
                    placeholder="Write a comment... Use @ to mention" 
                    people={people}
                  />
                  
                  {commentAttachments.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {commentAttachments.map((att, idx) => (
                         <AttachmentPreview 
                           key={idx} 
                           attachment={att} 
                           onRemove={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))} 
                         />
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-3 flex items-center justify-between">
                    <AttachmentControl 
                      issueId={issue.id} 
                      onUploaded={(att) => setCommentAttachments(prev => [...prev, att])} 
                    />
                    <Button onClick={submitComment} disabled={!commentBody.trim() && commentAttachments.length === 0}>
                      Save Comment
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-4">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center text-primary font-bold text-xs mt-1">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="font-semibold text-sm">{comment.authorName}</span>
                        <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 bg-muted/20 p-3 rounded-lg border" dangerouslySetInnerHTML={{ __html: sanitizeIssueHtml(comment.body) }} />
                      
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {comment.attachments.map(att => (
                            <AttachmentPreview key={att.id || att.objectPath} attachment={att} issueId={issue.id} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {activity.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 py-1 pl-11 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                    <span><strong className="text-foreground/70 font-medium">{event.actorName}</strong> {event.action} • {new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>

          </div>

          {/* Right Column - Meta Data */}
          <div className="space-y-6">
            <div className="bg-muted/10 rounded-lg border p-4 space-y-5">
              
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Status</Label>
                <Select value={issue.status} onValueChange={handleStatusChange} disabled={!canEdit}>
                  <SelectTrigger className={`w-full ${STATUS_COLORS[issue.status]} font-semibold tracking-wide border-0`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedStatuses.map(status => (
                      <SelectItem key={status} value={status} className="font-medium">
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Assignee</Label>
                <Select value={issue.assigneeId ? String(issue.assigneeId) : "unassigned"} onValueChange={handleAssigneeChange} disabled={!canEdit}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {people.map(person => (
                      <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Priority</Label>
                <Select 
                  value={issue.priority} 
                  onValueChange={(v) => updateIssue.mutate({ priority: v })} 
                  disabled={!canEdit}
                >
                  <SelectTrigger className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["lowest", "low", "medium", "high", "highest"].map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {issue.severity && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Severity</Label>
                  <div className="text-sm font-medium capitalize flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${issue.severity === 'critical' ? 'bg-destructive' : 'bg-amber-500'}`} />
                    {issue.severity}
                  </div>
                </div>
              )}

              {issue.labels && issue.labels.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Labels</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {issue.labels.map(label => (
                      <Badge key={label} variant="secondary" className="font-normal">{label}</Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="pt-4 border-t space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Created</span>
                  <span className="font-medium">{new Date(issue.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Updated</span>
                  <span className="font-medium">{new Date(issue.updatedAt).toLocaleDateString()}</span>
                </div>
                {issue.reporterName && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Reporter</span>
                    <span className="font-medium">{issue.reporterName}</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
