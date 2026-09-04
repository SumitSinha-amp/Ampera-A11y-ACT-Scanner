import React, { useRef, useState } from "react";
import { Download, ExternalLink, Paperclip, Loader2, X, File as FileIcon, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUploadAttachment } from "../../hooks/use-issues";
import { IssueAttachment } from "../../lib/issue-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AttachmentControlProps {
  issueId: number;
  onUploaded: (attachment: IssueAttachment) => void;
  className?: string;
}

export function AttachmentControl({ issueId, onUploaded, className }: AttachmentControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const uploadAttachment = useUploadAttachment(issueId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const attachment = await uploadAttachment.mutateAsync(file);
      onUploaded(attachment);
    } catch (error) {
      console.error("Failed to upload attachment:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className={className}>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        aria-label="Choose file attachment"
        onChange={handleFileChange}
        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4 mr-2" />
        )}
        Attach File
      </Button>
    </div>
  );
}

export function AttachmentPreview({ 
  attachment, 
  issueId, 
  onRemove 
}: { 
  attachment: IssueAttachment; 
  issueId?: number;
  onRemove?: () => void 
}) {
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isImage = attachment.contentType.startsWith("image/");
  const isVideo = attachment.contentType.startsWith("video/");
  const isPdf = attachment.contentType === "application/pdf";
  const url = issueId && attachment.id ? `${BASE}/api/issues/${issueId}/attachments/${attachment.id}` : undefined;
  const restorePreviewFocus = () => {
    window.setTimeout(() => previewTriggerRef.current?.focus({ preventScroll: true }), 0);
  };

  return (
    <>
      <div className="relative group flex items-center gap-2 rounded-md border bg-muted/30 p-1.5">
        <button
          ref={previewTriggerRef}
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded p-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default"
          disabled={!url}
          onClick={() => url && setPreviewOpen(true)}
          aria-label={url ? `Preview ${attachment.filename}` : undefined}
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
            {isImage && url ? (
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : isVideo && url ? (
              <video src={url} className="h-full w-full object-cover" muted aria-hidden="true" />
            ) : isImage ? (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            ) : (
              <FileIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-medium ${url ? "text-primary hover:underline" : "text-foreground"}`}>
              {attachment.filename}
            </span>
            <span className="block text-xs text-muted-foreground">
              {(attachment.size / 1024).toFixed(1)} KB
            </span>
          </div>
        </button>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            onClick={onRemove}
            aria-label={`Remove ${attachment.filename}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {url && (
        <Dialog
          open={previewOpen}
          onOpenChange={(nextOpen) => {
            setPreviewOpen(nextOpen);
            if (!nextOpen) restorePreviewFocus();
          }}
        >
          <DialogContent
            className="flex max-h-[92vh] max-w-5xl grid-rows-none flex-col gap-0 overflow-hidden p-0"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              restorePreviewFocus();
            }}
          >
            <DialogHeader className="border-b px-5 py-4 pr-14">
              <DialogTitle className="truncate text-base">{attachment.filename}</DialogTitle>
              <DialogDescription>
                Attachment preview · {(attachment.size / 1024).toFixed(1)} KB
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950/95 p-4 sm:p-6">
              {isImage ? (
                <img
                  src={url}
                  alt={attachment.filename}
                  className="max-h-[72vh] max-w-full rounded object-contain shadow-2xl"
                />
              ) : isVideo ? (
                <video
                  src={url}
                  controls
                  autoPlay
                  className="max-h-[72vh] max-w-full rounded bg-black shadow-2xl"
                  aria-label={attachment.filename}
                />
              ) : isPdf ? (
                <iframe
                  src={url}
                  title={`Preview of ${attachment.filename}`}
                  className="h-[72vh] w-full rounded bg-white"
                />
              ) : (
                <div className="flex max-w-md flex-col items-center gap-4 rounded-xl bg-card p-8 text-center shadow-2xl">
                  <FileIcon className="h-14 w-14 text-muted-foreground" />
                  <div>
                    <p className="break-all font-semibold">{attachment.filename}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This file type cannot be previewed in the browser.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t bg-card px-5 py-3">
              <Button asChild variant="outline" size="sm">
                <a href={url} download={attachment.filename}>
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open in new tab
                </a>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
