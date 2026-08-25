import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISSUE_TYPES, PRIORITIES, Person } from "../../lib/issue-types";
import { RichTextEditor } from "./rich-text-editor";

interface IssueFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Record<string, any>;
  setField: (key: string, value: any) => void;
  people: Person[];
  onSave: () => void;
}

export function IssueForm({ open, onOpenChange, draft, setField, people, onSave }: IssueFormProps) {
  const showBug = draft.type === "bug";
  const showStory = draft.type === "story";
  const showTask = draft.type === "task";
  const customFields = draft.customFields || {};
  const setCustom = (key: string, value: string) => setField("customFields", { ...customFields, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl bg-card border-border">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl">Create Issue</DialogTitle>
          <DialogDescription>
            Detail the work that needs to be done. Rich text is supported in descriptions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider font-semibold">Issue Type</Label>
            <Select value={draft.type} onValueChange={(value) => setField("type", value)}>
              <SelectTrigger className="font-medium uppercase tracking-wide">
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
            <Label className="text-xs uppercase tracking-wider font-semibold">Priority</Label>
            <Select value={draft.priority} onValueChange={(value) => setField("priority", value)}>
              <SelectTrigger className="capitalize font-medium">
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
          
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider font-semibold">Assignee</Label>
            <Select 
              value={draft.assigneeId ? String(draft.assigneeId) : "unassigned"} 
              onValueChange={(value) => setField("assigneeId", value === "unassigned" ? null : Number(value))}
            >
              <SelectTrigger>
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
            <Label className="text-xs uppercase tracking-wider font-semibold">Labels</Label>
            <Input 
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!draft.title?.trim()}>Create Issue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
