import { Skeleton } from "@/components/ui/skeleton";
import { useTrackPageLoading } from "@/components/top-loading-progress";
import "./loading-state.css";

type Variant = "dashboard" | "table" | "report" | "detail";

export function PageLoadingSkeleton({
  variant = "table",
  message = "Loading data…",
  metrics = 4,
}: {
  variant?: Variant;
  message?: string;
  metrics?: number;
}) {
  useTrackPageLoading();
  return (
    <div className="page-loading-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label={message}>
      <span className="page-loading-skeleton__message">{message}</span>
      <div aria-hidden="true">
        <div className="page-loading-skeleton__header">
          <Skeleton className="h-7 w-48 max-w-[65%]" />
          <Skeleton className="mt-3 h-3 w-72 max-w-[85%]" />
        </div>

        {(variant === "dashboard" || variant === "report") && (
          <div className={`page-loading-skeleton__metrics${metrics === 5 ? " page-loading-skeleton__metrics--five" : ""}`}>
            {Array.from({ length: metrics }, (_, index) => (
              <div className="page-loading-skeleton__card" key={index}>
                <Skeleton className="h-6 w-6 rounded-lg" />
                <Skeleton className="mt-4 h-3 w-24 max-w-full" />
                <Skeleton className="mt-3 h-7 w-20" />
                <Skeleton className="mt-3 h-2.5 w-28 max-w-full" />
              </div>
            ))}
          </div>
        )}

        {(variant === "table" || variant === "detail") && (
          <div className="page-loading-skeleton__filters">
            <Skeleton className="h-9 w-44 max-w-[48%]" />
            <Skeleton className="h-9 w-28 max-w-[35%]" />
            <Skeleton className="h-9 w-24 max-w-[25%]" />
          </div>
        )}

        <div className={variant === "dashboard" || variant === "report" ? `page-loading-skeleton__panels page-loading-skeleton__panels--${variant}` : "page-loading-skeleton__list"}>
          {variant === "dashboard" || variant === "report"
            ? Array.from({ length: 3 }, (_, index) => (
                <div className="page-loading-skeleton__card page-loading-skeleton__chart" key={index}>
                  <Skeleton className="h-4 w-36 max-w-[80%]" />
                  <Skeleton className="mt-3 h-2.5 w-28 max-w-[70%]" />
                  <Skeleton className="mt-8 h-[175px] w-full rounded-lg" />
                </div>
              ))
            : Array.from({ length: variant === "detail" ? 4 : 6 }, (_, index) => (
                <div className="page-loading-skeleton__row" key={index}>
                  <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-2/3 max-w-64" />
                    <Skeleton className="mt-2 h-2.5 w-1/2 max-w-44" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}