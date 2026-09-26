import { useEffect, useState } from "react";

const STARTUP_STAGES = [
  { message: "Initializing environment...", target: 25, duration: 250 },
  { message: "Verifying credentials...", target: 60, duration: 400 },
  { message: "Loading user preferences...", target: 85, duration: 500 },
  { message: "Preparing workspace...", target: 95, duration: 1500 },
];

export function AppStartupLoader() {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const logoSrc = `${import.meta.env.BASE_URL}ampera-logo.png`;

  useEffect(() => {
    // Fade in after a brief delay to avoid flash if loading is nearly instant
    const timer = setTimeout(() => setIsVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let animationFrame: number;
    let lastTime = performance.now();
    
    const animate = (currentTime: number) => {
      const currentStage = STARTUP_STAGES[stage];
      if (!currentStage) return;

      const delta = currentTime - lastTime;
      
      setProgress((prev) => {
        const remaining = currentStage.target - prev;
        // Calculate step based on delta time to make it frame-rate independent
        const step = (remaining / currentStage.duration) * delta;
        const next = Math.min(currentStage.target, prev + Math.max(0.1, step));
        
        if (next >= currentStage.target && stage < STARTUP_STAGES.length - 1) {
          setStage(s => s + 1);
        }
        
        return next;
      });

      lastTime = currentTime;
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [stage]);

  const currentMessage = STARTUP_STAGES[Math.min(stage, STARTUP_STAGES.length - 1)]?.message || STARTUP_STAGES[STARTUP_STAGES.length - 1].message;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div 
        className={`w-full max-w-[280px] sm:max-w-sm flex flex-col items-center gap-10 transition-opacity duration-700 ease-out ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="relative flex flex-col items-center">
           <img
             src={logoSrc}
             alt="Ampera Accessibility Scanner"
             className="h-10 sm:h-12 w-auto object-contain motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700"
           />
        </div>

        <div className="w-full flex flex-col gap-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 motion-safe:delay-150 motion-safe:fill-mode-both">
          <div className="flex justify-between items-baseline px-0.5">
            <span
              className="text-sm font-medium text-foreground/80 tracking-tight"
              aria-live="polite"
              aria-atomic="true"
            >
              {currentMessage}
            </span>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums tracking-tighter">
              {Math.round(progress)}%
            </span>
          </div>

          <div
            className="h-1.5 w-full bg-muted/60 overflow-hidden rounded-full shadow-inner"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Application loading progress"
          >
            <div
              className="h-full bg-primary motion-safe:transition-all motion-safe:duration-75 ease-linear rounded-full relative overflow-hidden"
              style={{ width: `${progress}%` }}
            >
              {/* Subtle shimmer effect on the progress bar */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .animate-shimmer {
            animation: shimmer 1.5s infinite linear;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-shimmer {
            display: none;
          }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
