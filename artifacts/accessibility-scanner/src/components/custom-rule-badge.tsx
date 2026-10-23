import { Badge } from "@/components/ui/badge";
import { ACT_RULES } from "@/lib/actRules";

export function CustomRuleBadge({ ruleId }: { ruleId: string }) {
  if (!ACT_RULES[ruleId]?.custom) return null;
  return (
    <Badge variant="outline" className="shrink-0 border-fuchsia-300/70 bg-fuchsia-50 px-1.5 py-0 text-[10px] font-semibold text-fuchsia-800 dark:border-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-200">
      Custom
    </Badge>
  );
}
