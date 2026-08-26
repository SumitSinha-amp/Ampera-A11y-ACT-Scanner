import { ArrowDownUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type IssueSort = "updated_desc" | "updated_asc" | "created_desc" | "priority_desc" | "key_asc" | "summary_asc";

export const ISSUE_SORT_OPTIONS: { value: IssueSort; label: string }[] = [
  { value: "updated_desc", label: "Updated: newest" },
  { value: "updated_asc", label: "Updated: oldest" },
  { value: "created_desc", label: "Created: newest" },
  { value: "priority_desc", label: "Priority: highest" },
  { value: "key_asc", label: "Key: ascending" },
  { value: "summary_asc", label: "Summary: A–Z" },
];

interface IssueSortSelectProps {
  value: IssueSort;
  onChange: (value: IssueSort) => void;
  className?: string;
}

export function IssueSortSelect({ value, onChange, className = "" }: IssueSortSelectProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Select value={value} onValueChange={(next) => onChange(next as IssueSort)}>
        <SelectTrigger aria-label="Sort issues" className="h-9 w-full border-transparent bg-muted/50 text-xs font-medium shadow-none sm:w-[172px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {ISSUE_SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}