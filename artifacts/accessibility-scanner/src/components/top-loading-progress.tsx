import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating, useMutationState } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import "./loading-state.css";

type LoadingActivity = {
  count: number;
  change: (delta: number) => void;
  actions: { id: number; message: string; source: "explicit" | "network" }[];
  beginAction: (message: string, source?: "explicit" | "network") => () => void;
  liveScan: LiveScanProgress | null;
  updateLiveScan: (next: LiveScanProgress | null, scanId: number) => void;
};

type LiveScanProgress = {
  scanId: number;
  status: "running" | "paused";
  percent: number;
  authoritative: boolean;
};

const LoadingActivityContext = createContext<LoadingActivity | null>(null);

export function LoadingActivityProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [actions, setActions] = useState<LoadingActivity["actions"]>([]);
  const [liveScan, setLiveScan] = useState<LiveScanProgress | null>(null);
  const nextActionId = useRef(0);
  const change = useCallback((delta: number) => setCount((current) => Math.max(0, current + delta)), []);
  const beginAction = useCallback((message: string, source: "explicit" | "network" = "explicit") => {
    const id = ++nextActionId.current;
    setActions((current) => [...current, { id, message, source }]);
    return () => setActions((current) => current.filter((action) => action.id !== id));
  }, []);
  const updateLiveScan = useCallback((next: LiveScanProgress | null, scanId: number) => {
    setLiveScan((current) => {
      if (!next) return current?.scanId === scanId ? null : current;
      const percent = Math.max(0, Math.min(100, Math.round(next.percent)));
      // Hold the recorded percentage while paused, including when late page
      // completions arrive. Allow the first live-status response to replace
      // the less accurate scan-summary percentage.
      if (next.status === "paused" && current?.scanId === scanId &&
          current.status === "paused" && (current.authoritative || !next.authoritative)) {
        return current;
      }
      if (current?.scanId === scanId && current.status === next.status &&
          current.percent === percent && current.authoritative === next.authoritative) {
        return current;
      }
      return { ...next, percent };
    });
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch;
    const monitoredFetch: typeof window.fetch = (input, init) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        return originalFetch.call(window, input, init);
      }
      let url: URL;
      try {
        url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      } catch {
        return originalFetch.call(window, input, init);
      }
      if (url.origin !== window.location.origin || !url.pathname.includes("/api/")) {
        return originalFetch.call(window, input, init);
      }
      const message = method === "DELETE" ? "Deleting…"
        : /\/upload(?:\/|$)/.test(url.pathname) ? "Uploading…"
        : method === "PUT" || method === "PATCH" ? "Saving changes…"
        : "Processing action…";
      const finish = beginAction(message, "network");
      try {
        return originalFetch.call(window, input, init).finally(finish);
      } catch (error) {
        finish();
        throw error;
      }
    };
    window.fetch = monitoredFetch;
    return () => {
      if (window.fetch === monitoredFetch) window.fetch = originalFetch;
    };
  }, [beginAction]);

  return <LoadingActivityContext.Provider value={{ count, change, actions, beginAction, liveScan, updateLiveScan }}>{children}</LoadingActivityContext.Provider>;
}

/** Registers only the scan currently visible on the live progress page. */
export function LiveScanProgressReporter({ scanId, status, percent, authoritative }: LiveScanProgress) {
  const updateLiveScan = useContext(LoadingActivityContext)?.updateLiveScan;
  useEffect(() => {
    updateLiveScan?.({ scanId, status, percent, authoritative }, scanId);
  }, [updateLiveScan, scanId, status, percent, authoritative]);
  useEffect(() => () => updateLiveScan?.(null, scanId), [updateLiveScan, scanId]);
  return null;
}

/** Tracks a user-initiated async operation, including downloads that do not use React Query. */
export function useActionProgress() {
  const activity = useContext(LoadingActivityContext);
  if (!activity) throw new Error("useActionProgress requires LoadingActivityProvider");
  const { beginAction } = activity;
  return useCallback(async <T,>(message: string, operation: () => Promise<T>): Promise<T> => {
    const finish = beginAction(message);
    try {
      return await operation();
    } finally {
      finish();
    }
  }, [beginAction]);
}

export function useTrackPageLoading() {
  const activity = useContext(LoadingActivityContext);
  const change = activity?.change;
  useEffect(() => {
    change?.(1);
    return () => change?.(-1);
  }, [change]);
}

function loadingMessage(path: string) {
  if (path.startsWith("/sites/")) return path.includes("/issues") ? "Loading site issues…" : "Loading site data…";
  if (path.startsWith("/scans/") && path.endsWith("/report")) return "Preparing scan report…";
  if (path.startsWith("/scans/")) return "Loading scan results…";
  if (path === "/scans") return "Loading scan history…";
  if (path.startsWith("/crawler")) return "Loading crawler data…";
  if (path.startsWith("/issues")) return "Loading issues…";
  if (path.startsWith("/quality-assurance")) return "Loading quality checks…";
  if (path.startsWith("/admin")) return "Loading administration data…";
  return "Loading workspace data…";
}

export function TopLoadingProgress() {
  const activity = useContext(LoadingActivityContext);
  const manualLoads = activity?.count ?? 0;
  const { user } = useAuth();
  const liveScan = user ? activity?.liveScan : null;
  const [location] = useLocation();
  // Ignore background refreshes; they already have data on screen.
  const firstFetches = useIsFetching({
    predicate: (query) => query.state.status === "pending" && query.state.fetchStatus === "fetching",
  });
  const mutations = useIsMutating();
  const mutationMessages = useMutationState({
    filters: { status: "pending" },
    select: (mutation) => mutation.options.meta?.activityMessage as string | undefined,
  });
  const actionMessage = activity?.actions.slice().reverse().find((action) => action.source === "explicit")?.message
    ?? mutationMessages.slice().reverse().find((message) => Boolean(message))
    ?? activity?.actions[activity.actions.length - 1]?.message
    ?? (mutations > 0 ? "Processing changes…" : loadingMessage(location));
  const message = liveScan
    ? liveScan.status === "paused"
      ? `Scan paused at ${liveScan.percent}%`
      : `Scanning… ${liveScan.percent}%`
    : actionMessage;
  const [routeSettling, setRouteSettling] = useState(true);
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(0);
  const finishTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setRouteSettling(true);
    const timer = window.setTimeout(() => setRouteSettling(false), 320);
    return () => window.clearTimeout(timer);
  }, [location]);

  const busy = Boolean(user) && (Boolean(liveScan) || routeSettling || firstFetches > 0 || manualLoads > 0 || mutations > 0 || (activity?.actions.length ?? 0) > 0);
  useEffect(() => {
    if (liveScan) setProgress(liveScan.percent);
  }, [liveScan]);
  useEffect(() => {
    window.clearTimeout(finishTimer.current);
    if (!user) {
      window.clearTimeout(hideTimer.current);
      startedAt.current = 0;
      setPhase("idle");
      setProgress(0);
      return;
    }
    if (busy) {
      window.clearTimeout(hideTimer.current);
      if (!startedAt.current) startedAt.current = Date.now();
      setPhase("running");
      setProgress((current) => current === 0 || current === 100 ? 9 : current);
    } else if (startedAt.current) {
      const wait = Math.max(0, 440 - (Date.now() - startedAt.current));
      finishTimer.current = window.setTimeout(() => {
        setProgress(100);
        setPhase("complete");
        hideTimer.current = window.setTimeout(() => {
          startedAt.current = 0;
          setPhase("idle");
          setProgress(0);
        }, 360);
      }, wait);
    }
    return () => {
      window.clearTimeout(finishTimer.current);
      window.clearTimeout(hideTimer.current);
    };
  }, [busy, user]);

  useEffect(() => {
    if (phase !== "running" || liveScan) return;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(90, current + Math.max(0.5, (90 - current) * 0.09)));
    }, 470);
    return () => window.clearInterval(timer);
  }, [phase, liveScan]);

  if (phase === "idle") return null;
  return (
    <div className="top-data-progress" role="status" aria-live="polite" aria-label={phase === "complete" ? "Completed" : message}>
      <div className="top-data-progress__track" aria-hidden="true">
        <div className="top-data-progress__bar" style={{ width: `${liveScan?.percent ?? progress}%` }} />
      </div>
      {phase === "running" && <span className="top-data-progress__message">{message}</span>}
    </div>
  );
}