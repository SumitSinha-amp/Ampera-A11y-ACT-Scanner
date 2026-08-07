import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type FieldMessageTone = "error" | "info" | "warning" | "success";

const toneStyles: Record<
  FieldMessageTone,
  { icon: LucideIcon; className: string; arrowClassName: string }
> = {
  error: {
    icon: AlertCircle,
    className:
      "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-200",
    arrowClassName:
      "before:border-l-rose-300 before:border-t-rose-300 before:bg-rose-50 dark:before:border-l-rose-800 dark:before:border-t-rose-800 dark:before:bg-rose-950/35",
  },
  info: {
    icon: Info,
    className:
      "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-200",
    arrowClassName:
      "before:border-l-sky-300 before:border-t-sky-300 before:bg-sky-50 dark:before:border-l-sky-800 dark:before:border-t-sky-800 dark:before:bg-sky-950/35",
  },
  warning: {
    icon: TriangleAlert,
    className:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200",
    arrowClassName:
      "before:border-l-amber-300 before:border-t-amber-300 before:bg-amber-50 dark:before:border-l-amber-800 dark:before:border-t-amber-800 dark:before:bg-amber-950/35",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200",
    arrowClassName:
      "before:border-l-emerald-300 before:border-t-emerald-300 before:bg-emerald-50 dark:before:border-l-emerald-800 dark:before:border-t-emerald-800 dark:before:bg-emerald-950/35",
  },
};

interface FieldMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: FieldMessageTone;
}

export function FieldMessage({
  tone = "info",
  className,
  children,
  ...props
}: FieldMessageProps) {
  const styles = toneStyles[tone];
  const Icon = styles.icon;
  const isAssertive = tone === "error" || tone === "warning";

  return (
    <div
      className={cn(
        "relative mt-2 flex w-fit max-w-full items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium leading-relaxed shadow-sm",
        "before:absolute before:-top-1 before:left-4 before:h-2 before:w-2 before:rotate-45 before:border-l before:border-t",
        styles.className,
        styles.arrowClassName,
        className,
      )}
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      {...props}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}