import { useId, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

/** Keep model suggestions separate from human-created, confirmed work items. */
export function LanguageReviewNotice({
  scanId, pageId, pageUrl, selector, canCreateIssue,
}: {
  scanId: number;
  pageId: number;
  pageUrl: string;
  selector: string | null;
  canCreateIssue: boolean;
}) {
  const [verified, setVerified] = useState(false);
  const [, navigate] = useLocation();
  const id = useId();
  return (
    <section aria-label="Human language review" className="mx-4 my-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <p className="font-semibold">Human verification required</p>
      <p className="mt-1 leading-relaxed">
        This suggestion is not a confirmed accessibility failure. Read the passage, verify its actual language,
        and check whether it needs its own language declaration. Names, borrowed words, and technical terms may be exceptions.
      </p>
      <p className="mt-2 leading-relaxed">
        If the suggestion is wrong, use the occurrence’s decision control to mark it as a false positive.
      </p>
      {canCreateIssue && (
        <>
          <div className="mt-3 flex items-start gap-2">
            <input id={id} type="checkbox" checked={verified}
              onChange={event => setVerified(event.target.checked)} className="mt-0.5" />
            <label htmlFor={id}>I verified that this is a language change requiring a local language declaration.</label>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={!verified} className="mt-2 h-auto whitespace-normal text-xs"
            onClick={() => {
              if (!verified) return;
              const params = new URLSearchParams({
                create: "1", type: "bug", scanId: String(scanId), pageId: String(pageId),
                title: "Confirmed language-of-parts issue",
                source: `Human-verified ACT-R132 language review: ${pageUrl}${selector ? `; element ${selector}` : ""}. Reviewer confirmed a language change requiring a local lang declaration.`,
              });
              navigate(`/issues?${params}`);
            }}>
            Create a human-confirmed issue
          </Button>
        </>
      )}
    </section>
  );
}
