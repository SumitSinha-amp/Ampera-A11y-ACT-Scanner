import React, { useRef, useState } from "react";
import { Paperclip, Loader2, X, File as FileIcon, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadAttachment } from "../../hooks/use-issues";
import { IssueAttachment } from "../../lib/issue-types";

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
  const isImage = attachment.contentType.startsWith("image/");
  const isVideo = attachment.contentType.startsWith("video/");
  const url = issueId && attachment.id ? `/api/issues/${issueId}/attachments/${attachment.id}` : undefined;

  return (
    <div className="relative group flex items-center gap-3 p-2 rounded-md border bg-muted/30">
      <div className="flex-shrink-0 h-10 w-10 rounded overflow-hidden bg-muted flex items-center justify-center">
        {isImage && url ? (
          <img src={url} alt={attachment.filename} className="h-full w-full object-cover" />
        ) : isVideo && url ? (
          <video src={url} className="h-full w-full object-cover" aria-label={attachment.filename} />
        ) : isImage ? (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        ) : (
          <FileIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <a 
          href={url || "#"} 
          target="_blank" 
          rel="noreferrer"
          className={`text-sm font-medium truncate block ${url ? "hover:underline text-primary" : "text-foreground"}`}
        >
          {attachment.filename}
        </a>
        <p className="text-xs text-muted-foreground">
          {(attachment.size / 1024).toFixed(1)} KB
        </p>
      </div>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
          onClick={onRemove}
          aria-label={`Remove ${attachment.filename}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
