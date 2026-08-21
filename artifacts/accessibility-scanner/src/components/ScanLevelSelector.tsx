import { CheckCheck, Check } from "lucide-react";
import { ALL_SCAN_LEVELS } from "@/lib/scanLevels";

export type { ScanLevel } from "@/lib/scanLevels";

const LEVEL_META: Record<
  string,
  { badge: string; label: string; description: string; activeBg: string; activeBorder: string; activeText: string }
> = {
  A: {
    badge: "A",
    label: "Level A",
    description: "Basic accessibility — must-fix blockers",
    activeBg: "bg-[#a21caf]/10 dark:bg-[#a21caf]/20",
    activeBorder: "border-[#a21caf]",
    activeText: "text-[#a21caf]",
  },
  AA: {
    badge: "AA",
    label: "Level AA",
    description: "Standard compliance — legal & WCAG 2.2 baseline",
    activeBg: "bg-[#6d28d9]/10 dark:bg-[#6d28d9]/20",
    activeBorder: "border-[#6d28d9]",
    activeText: "text-[#6d28d9]",
  },
  AAA: {
    badge: "AAA",
    label: "Level AAA",
    description: "Enhanced — broadest conformance coverage",
    activeBg: "bg-[#1d4ed8]/10 dark:bg-[#1d4ed8]/20",
    activeBorder: "border-[#1d4ed8]",
    activeText: "text-[#1d4ed8]",
  },
  "WAI-ARIA": {
    badge: "ARIA",
    label: "WAI-ARIA",
    description: "ARIA roles, states & property correctness",
    activeBg: "bg-[#0d9488]/10 dark:bg-[#0d9488]/20",
    activeBorder: "border-[#0d9488]",
    activeText: "text-[#0d9488]",
  },
  "Best Practice": {
    badge: "BP",
    label: "Best Practice",
    description: "Industry-standard recommendations beyond WCAG",
    activeBg: "bg-[#d97706]/10 dark:bg-[#d97706]/20",
    activeBorder: "border-[#d97706]",
    activeText: "text-[#d97706]",
  },
};

const BADGE_BG: Record<string, string> = {
  A: "bg-[#a21caf]",
  AA: "bg-[#6d28d9]",
  AAA: "bg-[#1d4ed8]",
  "WAI-ARIA": "bg-[#0d9488]",
  "Best Practice": "bg-[#d97706]",
};

export function ScanLevelSelector({
  value,
  onChange,
  variant = "pills",
}: {
  value: string[];
  onChange: (levels: string[]) => void;
  /** "pills" — compact inline row (manual scan). "card" — full card grid (crawler scan). */
  variant?: "pills" | "card";
}) {
  const allSelected = ALL_SCAN_LEVELS.every((l) => value.includes(l));

  const toggle = (id: string) => {
    if (value.includes(id)) {
      if (value.length === 1) return;
      onChange(value.filter((l) => l !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const toggleAll = () => {
    if (allSelected) onChange(["A"]);
    else onChange([...ALL_SCAN_LEVELS]);
  };

  if (variant === "card") {
    return (
      <div className="flex h-full flex-col">
        {/* Subtitle + toggle row — title comes from the Card's CardHeader */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Choose which rule levels to include in this scan
          </p>
          <button
            type="button"
            onClick={toggleAll}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>

        {/* Card grid — 3 cols for WCAG levels, then 2 for ARIA/BP */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ALL_SCAN_LEVELS.map((id) => {
            const meta = LEVEL_META[id];
            const active = value.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(id)}
                className={`relative flex flex-col items-start rounded-2xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  active
                    ? `${meta.activeBorder} bg-background`
                    : "border-border/40 bg-muted/30 opacity-55 hover:opacity-75 hover:border-border"
                }`}
              >
                {/* Badge + checkmark row */}
                <div className="mb-3 flex w-full items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-[12px] font-bold text-white transition-colors ${
                      active ? BADGE_BG[id] : "bg-muted-foreground/40"
                    }`}
                  >
                    {meta.badge}
                  </span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded transition-all ${
                      active ? `${BADGE_BG[id]} text-white` : "border border-border/60 bg-background"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" strokeWidth={2.5} />}
                  </span>
                </div>

                {/* Level name */}
                <span
                  className={`text-[14px] font-bold leading-tight transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {meta.label}
                </span>

                {/* Description */}
                <span
                  className={`mt-1.5 text-[12px] leading-snug transition-colors ${
                    active ? "text-muted-foreground" : "text-muted-foreground/60"
                  }`}
                >
                  {meta.description}
                </span>
              </button>
            );
          })}
        </div>

        {!allSelected && (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Only rules matching the selected levels will be checked in this scan.
          </p>
        )}
      </div>
    );
  }

  // ── Pill variant (default) ────────────────────────────────────────────────
  return (
    <div className="rounded-xl border-2 border-border/60 bg-muted/20 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">Accessibility scope</span>
          <span className="text-[11px] text-muted-foreground">
            — {allSelected ? "all levels" : `${value.length} of ${ALL_SCAN_LEVELS.length} levels`}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_SCAN_LEVELS.map((id) => {
          const meta = LEVEL_META[id];
          const active = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(id)}
              className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                active
                  ? `${meta.activeBg} ${meta.activeBorder}`
                  : "border-border/50 bg-background opacity-50 hover:opacity-70"
              }`}
            >
              <span
                className={`inline-flex min-w-[22px] items-center justify-center rounded px-1 py-px text-[10px] font-bold leading-none text-white transition-colors ${
                  active ? BADGE_BG[id] : "bg-muted-foreground/50"
                }`}
              >
                {meta.badge}
              </span>
              <span
                className={`text-[12px] font-semibold transition-colors ${
                  active ? meta.activeText : "text-muted-foreground"
                }`}
              >
                {meta.label}
              </span>
              <span
                className={`hidden text-[11px] transition-colors sm:inline ${
                  active ? "text-muted-foreground" : "text-muted-foreground/50"
                }`}
              >
                · {meta.description}
              </span>
            </button>
          );
        })}
      </div>

      {!allSelected && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Only rules matching the selected levels will be checked in this scan.
        </p>
      )}
    </div>
  );
}
