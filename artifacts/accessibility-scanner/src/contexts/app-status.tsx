import { createContext, useContext, useEffect, useRef, useState } from "react";

export type AppStatus = "checking" | "online" | "offline";

interface AppStatusContextValue {
  status: AppStatus;
  lastChecked: Date | null;
  retryNow: () => void;
}

const AppStatusContext = createContext<AppStatusContextValue>({
  status: "checking",
  lastChecked: null,
  retryNow: () => {},
});

const HEALTH_URL = `${import.meta.env.BASE_URL}api/healthz`.replace("//", "/");
const POLL_INTERVAL_ONLINE = 30_000;
const POLL_INTERVAL_OFFLINE = 10_000;
const TIMEOUT_MS = 8_000;

async function checkHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function AppStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AppStatus>("checking");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = async () => {
    const ok = await checkHealth();
    setLastChecked(new Date());
    setStatus(ok ? "online" : "offline");
    timerRef.current = setTimeout(run, ok ? POLL_INTERVAL_ONLINE : POLL_INTERVAL_OFFLINE);
  };

  useEffect(() => {
    run();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const retryNow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("checking");
    run();
  };

  return (
    <AppStatusContext.Provider value={{ status, lastChecked, retryNow }}>
      {children}
    </AppStatusContext.Provider>
  );
}

export function useAppStatus() {
  return useContext(AppStatusContext);
}
