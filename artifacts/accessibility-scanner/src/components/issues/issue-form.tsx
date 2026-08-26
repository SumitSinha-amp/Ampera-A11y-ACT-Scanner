import React, { useEffect, useRef, useState } from "react";
import { File as FileIcon, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISSUE_TYPES, PRIORITIES, Person, Issue } from "../../lib/issue-types";
import { RichTextEditor } from "./rich-text-editor";

interface IssueFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Record<string, any>;
  setField: (key: string, value: any) => void;
  people: Person[];
  issues: Issue[];
  onSave: (attachments: File[]) => void;
  isSaving?: boolean;
}

export function IssueForm({ open, onOpenChange, draft, setField, people, issues, onSave, isSaving = false }: IssueFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const showBug = draft.type === "bug";
  const showStory = draft.type === "story";
  const showTask = draft.type === "task";
  const customFields = draft.customFields || {};
  const epics = issues.filter((issue) => issue.type === "epic");
  const setCustom = (key: string, value: string) => setField("customFields", { ...customFields, [key]: value });

  useEffect(() => {
    if (!open) {
      setAttachments([]);
      setAttachmentError("");
    }
  }, [open]);

  const addAttachments = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files);
    const tooLarge = selected.find((file) => file.size > 50 * 1024 * 1024);
    if (tooLarge) {
      setAttachmentError(`${tooLarge.name} is larger than 50 MB.`);
      return;
    }
    setAttachmentError("");
    setAttachments((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...selected.filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSaving && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl bg-card border-border">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl">Create Issue</DialogTitle>
          <DialogDescription>
            Detail the work that needs to be done. Rich text is supported in descriptions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="issue-type" className="text-xs uppercase tracking-wider font-semibold">Issue Type</Label>
            <Select value={draft.type} onValueChange={(value) => {
              setField("type", value);
              if (value === "epic") setField("epicId", null);
            }}>
              <SelectTrigger id="issue-type" className="font-medium uppercase tracking-wide">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="uppercase font-medium tracking-wide">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="issue-priority" className="text-xs uppercase tracking-wider font-semibold">Priority</Label>
            <Select value={draft.priority} onValueChange={(value) => setField("priority", value)}>
              <SelectTrigger id="issue-priority" className="capitalize font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value} className="capitalize font-medium">{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="issue-title" className="text-xs uppercase tracking-wider font-semibold">Summary (Title)</Label>
            <Input 
              id="issue-title" 
              value={draft.title || ""} 
              onChange={(e) => setField("title", e.target.value)} 
              placeholder="What needs to happen?" 
              className="text-base font-medium"
            />
          </div>
          
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs uppercase tracking-wider font-semibold">Description</Label>
            <RichTextEditor 
              value={draft.description || ""} 
              onChange={(v) => setField("description", v)} 
              placeholder="Provide context, impact, and links..."
              people={people}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-dashed bg-muted/15 p-3 sm:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider">Attachments</Label>
                <p className="mt-1 text-xs text-muted-foreground">Add images or documents to support the summary and description. Maximum 50 MB per file.</p>
              </div>
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                multiple
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                aria-label="Choose issue attachments"
                onChange={(event) => {
                  addAttachments(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
                <Paperclip className="h-4 w-4" />
                Add files or images
              </Button>
            </div>
            {attachmentError && <p role="alert" className="text-xs font-medium text-destructive">{attachmentError}</p>}
            {attachments.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Files to upload">
                {attachments.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}`} className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-2">
                    {file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0 text-violet-600" /> : <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      aria-label={`Remove ${file.name}`}
                      disabled={isSaving}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {draft.type !== "epic" && (
            <div className="space-y-2">
              <Label htmlFor="issue-epic" className="text-xs uppercase tracking-wider font-semibold">Epic <span className="normal-case font-normal text-muted-foreground">(optional)</span></Label>
              <Select
                value={draft.epicId ? String(draft.epicId) : "no-epic"}
                onValueChange={(value) => setField("epicId", value === "no-epic" ? null : Number(value))}
              >
                <SelectTrigger id="issue-epic">
                  <SelectValue placeholder="No Epic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-epic">No Epic</SelectItem>
                  {epics.map((epic) => (
                    <SelectItem key={epic.id} value={String(epic.id)}>
                      {epic.issueKey} — {epic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Group this work under an Epic you can access.</p>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="issue-assignee" className="text-xs uppercase tracking-wider font-semibold">Assignee</Label>
            <Select 
              value={draft.assigneeId ? String(draft.assigneeId) : "unassigned"} 
              onValueChange={(value) => setField("assigneeId", value === "unassigned" ? null : Number(value))}
            >
              <SelectTrigger id="issue-assignee">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {people.map((person) => (
                  <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="issue-labels" className="text-xs uppercase tracking-wider font-semibold">Labels</Label>
            <Input 
              id="issue-labels"
              value={(draft.labels || []).join(", ")} 
              onChange={(e) => setField("labels", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} 
              placeholder="e.g. accessibility, high-impact" 
            />
          </div>
          
          {showStory && (
            <div className="space-y-2 sm:col-span-2 p-4 bg-muted/20 rounded-md border">
              <Label className="text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">Acceptance Criteria</Label>
              <RichTextEditor 
                value={draft.acceptanceCriteria || ""} 
                onChange={(v) => setField("acceptanceCriteria", v)} 
                placeholder="What needs to be true to consider this complete?"
              />
              <div className="mt-4 space-y-2">
                <Label className="text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">Business value</Label>
                <Input value={customFields.businessValue || ""} onChange={(e) => setCustom("businessValue", e.target.value)} placeholder="Why is this story valuable now?" />
              </div>
            </div>
          )}
          
          {showTask && (
            <div className="space-y-2 sm:col-span-2 p-4 bg-muted/20 rounded-md border">
              <Label className="text-xs uppercase tracking-wider font-semibold text-blue-700 dark:text-blue-400">Checklist (One per line)</Label>
              <textarea 
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={(draft.checklist || []).map((x: any) => x.text).join("\n")} 
                onChange={(e) => setField("checklist", e.target.value.split("\n").filter(Boolean).map((text) => ({ text, done: false })))} 
                rows={3} 
                placeholder="Review heading hierarchy&#10;Verify on mobile" 
              />
            </div>
          )}
          
          {showBug && (
            <div className="space-y-4 sm:col-span-2 p-4 bg-rose-500/5 rounded-md border border-rose-500/20">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400">Severity</Label>
                  <Select value={draft.severity || "not_set"} onValueChange={(value) => setField("severity", value === "not_set" ? null : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_set">Not set</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400">Environment</Label>
                  <Input value={draft.environment || ""} onChange={(e) => setField("environment", e.target.value)} placeholder="Production, Chrome 120..." />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400">Steps to Reproduce</Label>
                <RichTextEditor value={draft.stepsToReproduce || ""} onChange={(v) => setField("stepsToReproduce", v)} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">Expected Result</Label>
                  <RichTextEditor value={draft.expectedResult || ""} onChange={(v) => setField("expectedResult", v)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400">Actual Result</Label>
                  <RichTextEditor value={draft.actualResult || ""} onChange={(v) => setField("actualResult", v)} />
                </div>
              </div>
            </div>
          )}

          {draft.type === "epic" && <div className="space-y-4 sm:col-span-2 rounded-md border border-purple-500/20 bg-purple-500/5 p-4">
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">Objective</Label><Input value={customFields.objective || ""} onChange={(e) => setCustom("objective", e.target.value)} placeholder="What outcome does this epic advance?" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">Target outcome</Label><RichTextEditor value={customFields.targetOutcome || ""} onChange={(value) => setCustom("targetOutcome", value)} placeholder="Define the measurable outcome or release goal." /></div>
          </div>}

          {draft.type === "content" && <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Audience</Label><Input value={customFields.audience || ""} onChange={(e) => setCustom("audience", e.target.value)} placeholder="Who is this for?" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Channel</Label><Input value={customFields.channel || ""} onChange={(e) => setCustom("channel", e.target.value)} placeholder="Website, email, social…" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Publish target</Label><Input type="date" value={customFields.publishTarget || ""} onChange={(e) => setCustom("publishTarget", e.target.value)} /></div>
          </div>}

          {draft.type === "test" && <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Test scope</Label><Input value={customFields.scope || ""} onChange={(e) => setCustom("scope", e.target.value)} placeholder="Flows, pages, or criteria to test" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Test environment</Label><Input value={customFields.testEnvironment || ""} onChange={(e) => setCustom("testEnvironment", e.target.value)} placeholder="Browser, device, staging…" /></div>
            <div className="space-y-2 sm:col-span-2"><Label className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Expected result</Label><RichTextEditor value={customFields.testExpectedResult || ""} onChange={(value) => setCustom("testExpectedResult", value)} placeholder="How will the team know this test passed?" /></div>
          </div>}

          {draft.type === "request" && <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 rounded-md border border-indigo-500/20 bg-indigo-500/5 p-4">
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Request category</Label><Input value={customFields.requestCategory || ""} onChange={(e) => setCustom("requestCategory", e.target.value)} placeholder="Access, change, support…" /></div>
            <div className="space-y-2"><Label className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Impact</Label><Input value={customFields.impact || ""} onChange={(e) => setCustom("impact", e.target.value)} placeholder="Who is affected and how?" /></div>
          </div>}
        </div>
        
        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={() => onSave(attachments)} disabled={!draft.title?.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? "Creating…" : "Create Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
