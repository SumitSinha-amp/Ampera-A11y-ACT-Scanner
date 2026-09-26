import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import "./loading-state.css";

const LoadingActivityContext = createContext<{ count: number; change: (delta: number) => void } | null>(null);

export function LoadingActivityProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const change = useCallback((delta: number) => setCount((current) => Math.max(0, current + delta)), []);
  return <LoadingActivityContext.Provider value={{ count, change }}>{children}</LoadingActivityContext.Provider>;
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
  const manualLoads = useContext(LoadingActivityContext)?.count ?? 0;
  const { user } = useAuth();
  const [location] = useLocation();
  // Ignore background refreshes; they already have data on screen.
  const firstFetches = useIsFetching({
    predicate: (query) => query.state.status === "pending" && query.state.fetchStatus === "fetching",
  });
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

  const busy = Boolean(user) && (routeSettling || firstFetches > 0 || manualLoads > 0);
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
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(90, current + Math.max(0.5, (90 - current) * 0.09)));
    }, 470);
    return () => window.clearInterval(timer);
  }, [phase]);

  if (phase === "idle") return null;
  return (
    <div className="top-data-progress" role="status" aria-live="polite" aria-label={phase === "complete" ? "Loading complete" : loadingMessage(location)}>
      <div className="top-data-progress__track" aria-hidden="true">
        <div className="top-data-progress__bar" style={{ width: `${progress}%` }} />
      </div>
      {phase === "running" && <span className="top-data-progress__message">{loadingMessage(location)}</span>}
    </div>
  );
}