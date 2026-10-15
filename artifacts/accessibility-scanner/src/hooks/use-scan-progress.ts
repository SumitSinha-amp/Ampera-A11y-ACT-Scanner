import { useEffect, useRef } from "react";
import {
  freezePausedScanProgress,
  getScanProgress,
  type ScanProgressInput,
  type ScanProgressSnapshot,
} from "@/lib/scan-progress";

export function useScanProgress(input: ScanProgressInput & {
  scanId: number;
  authoritative: boolean;
}) {
  const previous = useRef<ScanProgressSnapshot | null>(null);
  const progress = getScanProgress(input);
  const snapshot = freezePausedScanProgress(previous.current, {
    scanId: input.scanId,
    status: input.status,
    percent: progress.percent,
    authoritative: input.authoritative,
  });
  useEffect(() => {
    previous.current = snapshot;
  }, [snapshot]);
  return { ...progress, percent: snapshot.percent };
}
