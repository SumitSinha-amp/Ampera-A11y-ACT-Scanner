import { useAppStatus } from "@/contexts/app-status";
import { Button } from "@/components/ui/button";
import { Loader2, WifiOff, RefreshCw, Clock } from "lucide-react";

export default function MaintenancePage() {
  const { status, lastChecked, retryNow } = useAppStatus();
  const checking = status === "checking";

  const formattedTime = lastChecked
    ? lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src={`${import.meta.env.BASE_URL}act-logo.png`}
            alt="Ampera ACT Platform"
            className="h-10 w-auto object-contain opacity-80"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Status icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
              {checking ? (
                <Loader2 className="w-9 h-9 text-primary animate-spin" />
              ) : (
                <WifiOff className="w-9 h-9 text-destructive" />
              )}
            </div>
            {!checking && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-50" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-destructive" />
              </span>
            )}
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            {checking ? "Checking service status…" : "Service Unavailable"}
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            {checking
              ? "Please wait while we check the connection to the server."
              : "The ACT Platform is temporarily unavailable. This may be due to scheduled maintenance or an unexpected outage. We're working to restore service as quickly as possible."}
          </p>
        </div>

        {/* Status badge */}
        {!checking && (
          <div className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            Server unreachable
          </div>
        )}

        {/* Actions */}
        {!checking && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={retryNow} className="gap-2 min-w-[140px]">
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="gap-2 min-w-[140px]"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </Button>
          </div>
        )}

        {/* Auto-retry notice */}
        {!checking && (
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Automatically retrying every 10 seconds
            {formattedTime && (
              <span className="text-muted-foreground/70">
                &nbsp;· Last checked at {formattedTime}
              </span>
            )}
          </p>
        )}

        {/* Footer */}
        <p className="text-xs text-muted-foreground/50 pt-4 border-t border-border">
          © {new Date().getFullYear()} Ampera · A11y ACT Platform
        </p>
      </div>
    </div>
  );
}
