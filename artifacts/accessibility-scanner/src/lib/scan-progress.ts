export interface ScanProgressInput {
  totalUrls: number;
  status: string;
  counts?: Record<string, number>;
  pages?: ReadonlyArray<{ status: string }>;
  scannedUrls?: number;
  failedUrls?: number;
}

// Milestones, not a time estimate. A pending URL has not started; retrying
// work is started but not complete. Every terminal outcome counts as processed.
const STAGE_WEIGHTS: Record<string, number> = {
  pending: 0,
  requeued: 0.05,
  navigating: 0.1,
  rendering: 0.35,
  analyzing: 0.65,
  scanning: 0.65,
  saving: 0.9,
  completed: 1,
  failed: 1,
  not_available: 1,
  cancelled: 1,
};

export function getScanProgress(input: ScanProgressInput) {
  const counts: Record<string, number> = input.counts ?? {};
  if (!input.counts) {
    if (input.pages?.length) {
      for (const page of input.pages) counts[page.status] = (counts[page.status] ?? 0) + 1;
    } else {
      counts.completed = input.scannedUrls ?? 0;
      counts.failed = input.failedUrls ?? 0;
    }
  }
  const total = Math.max(0, input.totalUrls);
  const processed = Math.min(total, ["completed", "failed", "not_available", "cancelled"]
    .reduce((sum, status) => sum + Math.max(0, counts[status] ?? 0), 0));
  const weighted = Object.entries(counts).reduce(
    (sum, [status, count]) => sum + Math.max(0, count) * (STAGE_WEIGHTS[status] ?? 0),
    0,
  );
  const active = ["running", "pending", "paused"].includes(input.status);
  const percent = input.status === "completed"
    ? 100
    : total > 0 ? Math.min(active ? 99 : 100, Math.round(weighted / total * 100)) : 0;
  return { percent, processed };
}

export interface ScanProgressSnapshot {
  scanId: number;
  status: string;
  percent: number;
  authoritative: boolean;
}

export function freezePausedScanProgress(
  previous: ScanProgressSnapshot | null,
  next: ScanProgressSnapshot,
): ScanProgressSnapshot {
  if (
    next.status === "paused" && previous?.scanId === next.scanId &&
    (previous.authoritative || !next.authoritative)
  ) return { ...next, percent: previous.percent };
  return next;
}
