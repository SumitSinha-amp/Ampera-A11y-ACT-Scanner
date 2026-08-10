import { useEffect, useId, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { APP_VERSION } from "@/lib/app-version";
import {
  Accessibility,
  AudioLines,
  Captions,
  Eye,
  EyeOff,
  Focus,
  Keyboard,
  Languages,
  Loader2,
  Move3D,
  ScanFace,
  SkipForward,
  Volume2,
} from "lucide-react";

const APP_NAME = "Ampera A11y ACT Platform";
// Keep the login logo in the static public directory so it is included in
// Azure deployments without depending on the authenticated logo API.
const AMPERA_LOGO_SRC = `${import.meta.env.BASE_URL}ampera-logo.png`;

const introIcons = [
  { label: "Accessibility", icon: Accessibility, color: "#ef6f61", position: "left-[10%] top-[19%]" },
  { label: "Hearing", icon: AudioLines, color: "#0d9488", position: "left-[29%] top-[9%]" },
  { label: "Vision", icon: Eye, color: "#3b82f6", position: "right-[13%] top-[17%]" },
  { label: "Keyboard access", icon: Keyboard, color: "#e7a93b", position: "left-[5%] top-[49%]" },
  { label: "Captions", icon: Captions, color: "#8b5cf6", position: "right-[7%] top-[44%]" },
  { label: "Sign language", icon: Languages, color: "#ec4899", position: "left-[19%] bottom-[18%]" },
  { label: "Cognitive clarity", icon: Focus, color: "#14b8a6", position: "right-[23%] bottom-[11%]" },
  { label: "Mobility", icon: Move3D, color: "#f97316", position: "right-[3%] bottom-[27%]" },
] as const;

function AccessibilityIntro({ onSkip }: { onSkip: () => void }) {
  const [visibleIconCount, setVisibleIconCount] = useState(0);

  useEffect(() => {
    const sequence = window.setInterval(() => {
      setVisibleIconCount((count) => {
        if (count >= introIcons.length) {
          window.clearInterval(sequence);
          return count;
        }
        return count + 1;
      });
    }, 500);

    return () => window.clearInterval(sequence);
  }, []);

  return (
    <div className="login-intro fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#fffaf7] px-6 text-center">
      <div className="login-intro-wash absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 flex max-w-md flex-col items-center">
        <div className="login-intro-brand">
          <img src={AMPERA_LOGO_SRC} alt="Ampera" className="h-auto w-[190px] object-contain" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#64748b]">
            A11y ACT Platform
          </p>
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-[#152b54] sm:text-3xl">
          Access for everyone.
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-6 text-[#64748b]">
          Preparing your accessible workspace
        </p>
        <div className="relative mt-12 h-28 w-full max-w-sm sm:mt-16" aria-hidden="true">
          {introIcons.map(({ label, icon: Icon, color, position }, index) => (
            <span
              key={label}
              className={`login-intro-icon absolute ${position} flex h-11 w-11 items-center justify-center rounded-2xl shadow-[0_10px_24px_rgba(21,43,84,0.12)] ${index < visibleIconCount ? "is-visible" : ""}`}
              style={{ backgroundColor: color }}
            >
              <Icon className="h-5 w-5 text-white" strokeWidth={1.8} />
            </span>
          ))}
          <span className="login-intro-line absolute left-1/2 top-1/2 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-[#ef6f61] via-[#8b5cf6] to-[#14b8a6]" />
          <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#152b54] ring-8 ring-[#152b54]/10" />
        </div>
        <p className="mt-10 font-mono text-[10px] font-medium tracking-[0.18em] text-[#94a3b8]">
          VERSION {APP_VERSION}
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="login-intro-skip mt-6 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-[#64748b] transition hover:bg-white hover:text-[#152b54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2"
        >
          Skip intro
          <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function InclusiveIllustration() {
  return (
    <svg
      className="login-illustration h-auto w-full max-w-[680px]"
      viewBox="0 0 720 480"
      role="img"
      aria-label="Illustration of people using accessible technology together"
    >
      <defs>
        <linearGradient id="illustration-surface" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#eef8f7" />
          <stop offset="1" stopColor="#e7efff" />
        </linearGradient>
        <linearGradient id="illustration-screen" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#c9e7ff" />
          <stop offset="1" stopColor="#9fd9d5" />
        </linearGradient>
      </defs>
      <ellipse cx="363" cy="407" rx="274" ry="27" fill="#dce8ed" opacity=".85" />
      <path d="M85 368c55-34 127-43 188-20 44 16 94 12 141-8 74-31 167-7 219 29" fill="none" stroke="#b8d0d7" strokeLinecap="round" strokeWidth="3" />
      <path d="M111 350c37 15 66 14 91-3M526 348c41-19 73-16 105 8" fill="none" stroke="#ef6f61" strokeLinecap="round" strokeWidth="6" opacity=".45" />

      {/* Person with headset */}
      <g stroke="#152b54" strokeLinecap="round" strokeLinejoin="round">
        <path d="M113 208c-8-43 14-77 50-79 39-2 56 31 45 73-8 31-30 47-55 42-22-5-35-19-40-36Z" fill="#8a5b44" strokeWidth="3" />
        <path d="M111 167c2-48 40-70 72-48 17 12 24 32 18 53-12-5-22-18-27-33-14 21-38 31-63 28Z" fill="#1c3152" strokeWidth="3" />
        <path d="M97 153c-12 11-13 32 1 43M190 153c15 5 19 20 14 34" fill="none" stroke="#0d9488" strokeWidth="7" />
        <path d="M207 192c20 0 26 11 30 25" fill="none" stroke="#0d9488" strokeWidth="5" />
        <circle cx="210" cy="190" r="6" fill="#0d9488" strokeWidth="2" />
        <path d="M99 227c-20 35-22 83-12 135l80 10c13-45 13-89-4-132Z" fill="#ef6f61" strokeWidth="3" />
        <path d="m111 254-38 86M155 256l41 73" fill="none" stroke="#152b54" strokeWidth="14" />
        <path d="m73 340-20 38M196 329l20 37" fill="none" stroke="#8a5b44" strokeWidth="9" />
        <path d="M57 379c-17 8-20 16-12 22 17 6 34 0 43-12" fill="#152b54" strokeWidth="3" />
        <path d="M204 367c15 8 25 13 31 7 4-8-5-16-17-21" fill="#152b54" strokeWidth="3" />
        <path d="M109 251c-34-11-44 8-37 22 9 18 31 19 49 8" fill="#f0b23c" strokeWidth="3" />
        <path d="M119 256c-10 4-18 11-26 23" fill="none" stroke="#fff" strokeWidth="3" />
      </g>

      {/* Laptop user */}
      <g stroke="#152b54" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="334" cy="172" r="48" fill="#d99370" strokeWidth="3" />
        <path d="M288 168c-1-46 39-66 70-48 19 11 30 32 22 59-13-21-34-27-56-28-7 13-18 20-36 17Z" fill="#1c3152" strokeWidth="3" />
        <path d="M310 189c10 11 26 12 38 1" fill="none" strokeWidth="2.5" />
        <path d="M278 246c12-45 88-47 113 1l22 107H263Z" fill="#f0b23c" strokeWidth="3" />
        <path d="M287 259c-37 4-62 32-75 72M374 259c26 13 43 30 54 65" fill="none" stroke="#d99370" strokeWidth="13" />
        <path d="M273 322h170l-17 18H256Z" fill="#e8f0f2" strokeWidth="3" />
        <path d="M294 226h94v75h-94Z" fill="url(#illustration-screen)" strokeWidth="3" />
        <path d="M305 244h52M305 258h35M305 272h43" fill="none" stroke="#fff" strokeWidth="4" />
        <circle cx="370" cy="242" r="7" fill="#ef6f61" strokeWidth="2" />
        <path d="M262 369c-21 9-37 18-51 31M400 366c19 10 29 18 43 30" fill="none" stroke="#d99370" strokeWidth="12" />
        <path d="M207 402c17-7 31-8 45 0M433 397c15-5 27-2 38 6" fill="none" stroke="#152b54" strokeWidth="9" />
      </g>

      {/* Person with captions/phone */}
      <g stroke="#152b54" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="494" cy="203" r="42" fill="#efc08e" strokeWidth="3" />
        <path d="M453 198c1-43 43-59 74-33 15 12 17 30 10 48-13-18-29-26-52-25-8 9-18 13-32 10Z" fill="#e0a333" strokeWidth="3" />
        <path d="M480 218c10 8 21 8 30 0" fill="none" strokeWidth="2.5" />
        <path d="M440 274c19-37 78-36 104 4l-6 96H427Z" fill="#0d9488" strokeWidth="3" />
        <path d="m445 291-40 65M532 290l26 55" fill="none" stroke="#efc08e" strokeWidth="13" />
        <rect x="505" y="295" width="33" height="61" rx="5" fill="#fff" strokeWidth="3" transform="rotate(12 505 295)" />
        <path d="m513 315 15 3m-17 9 15 3m-17 9 11 2" fill="none" stroke="#3b82f6" strokeWidth="3" />
        <path d="M424 367c-18 13-29 21-39 35M560 349c16 13 25 22 35 37" fill="none" stroke="#efc08e" strokeWidth="12" />
        <path d="M382 408c18-8 30-7 42 2M592 390c15-3 27 2 35 12" fill="none" stroke="#152b54" strokeWidth="9" />
      </g>

      {/* Accessibility cue cards */}
      <g stroke="#152b54" strokeWidth="2">
        <rect x="258" y="60" width="78" height="42" rx="12" fill="#fff" />
        <rect x="270" y="72" width="17" height="17" rx="4" fill="#ef6f61" stroke="none" />
        <path d="M295 75h28M295 84h19" stroke="#94a3b8" strokeLinecap="round" />
        <rect x="557" y="112" width="82" height="48" rx="14" fill="#fff" />
        <rect x="570" y="125" width="25" height="18" rx="4" fill="#8b5cf6" stroke="none" />
        <path d="M577 131h11m-11 6h8M604 128h24M604 138h18" stroke="#94a3b8" strokeLinecap="round" />
      </g>
      <path d="M227 120c-15 3-25 12-29 26M557 144c-15 12-23 25-26 43" fill="none" stroke="#94a3b8" strokeDasharray="4 6" strokeWidth="2" />
      <circle cx="225" cy="119" r="7" fill="#ef6f61" />
      <circle cx="532" cy="188" r="7" fill="#8b5cf6" />
    </svg>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const errorId = useId();
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setShowIntro(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowIntro(false), 5600);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.mustResetPassword) {
      setLocation("/change-password");
    } else {
      setLocation("/scans");
    }
  }, [user, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page min-h-[100dvh] overflow-hidden bg-[#fffaf7] text-[#152b54]" style={{ colorScheme: "light" }}>
      {showIntro && <AccessibilityIntro onSkip={() => setShowIntro(false)} />}
      <main className="grid min-h-[100dvh] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="login-visual relative flex min-h-[430px] flex-col overflow-hidden px-6 pb-8 pt-8 sm:px-10 lg:min-h-[100dvh] lg:px-14 lg:pb-12 lg:pt-10 xl:px-20">
          <div className="login-visual-wash absolute inset-0" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={AMPERA_LOGO_SRC} alt="Ampera" className="h-auto w-[112px] object-contain" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748b]">A11y ACT Platform</p>
              </div>
            </div>
            <span className="rounded-full border border-[#152b54]/10 bg-white/60 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wide text-[#64748b] backdrop-blur">
              v{APP_VERSION}
            </span>
          </div>
          <div className="relative z-10 mt-12 max-w-xl sm:mt-16 lg:mt-20">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ef6f61]">Built around people</p>
            <h1 className="mt-4 max-w-lg font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.04em] text-[#152b54] sm:text-5xl">
              Make every scan count for everyone.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#52647c] sm:text-base">
              Find barriers, understand impact, and build a web that welcomes every person.
            </p>
          </div>
          <div className="relative z-10 mt-auto flex flex-1 items-end justify-center pt-10 lg:pt-0">
            <InclusiveIllustration />
          </div>
          <div className="relative z-10 flex items-center gap-2 text-xs font-medium text-[#64748b]">
            <ScanFace className="h-4 w-4 text-[#0d9488]" aria-hidden="true" />
            Human-centered compliance intelligence
          </div>
        </section>

        <section className="relative flex min-h-[600px] items-center justify-center overflow-hidden border-t border-[#e5e7eb] bg-white px-6 py-12 sm:px-10 lg:min-h-[100dvh] lg:border-l lg:border-t-0 lg:px-14 xl:px-20">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[#e8e5ff]/60 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 w-full max-w-[410px]">
            <div className="mb-9">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#3b82f6]">Welcome back</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] text-[#152b54] sm:text-4xl">
                Sign in to your workspace
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#64748b]">
                Continue your accessibility work with Ampera.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <div id={errorId} role="alert" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-[#ef6f61]/40 bg-[#fff1ef] px-4 py-3 text-sm font-medium text-[#a63d35]">
                  <Volume2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-bold text-[#152b54]">
                  Username or email
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="you@example.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  className="login-input h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm text-[#152b54] outline-none transition placeholder:text-[#94a3b8]"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-bold text-[#152b54]">Password</label>
                  <a href="/reset-password" className="text-xs font-semibold text-[#3b82f6] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    className="login-input h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 pr-12 text-sm text-[#152b54] outline-none transition placeholder:text-[#94a3b8]"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#152b54] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="login-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#152b54] px-4 text-sm font-bold text-white shadow-[0_12px_24px_rgba(21,43,84,0.18)] transition hover:-translate-y-0.5 hover:bg-[#203d70] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Signing in…</> : "Sign in"}
              </button>
            </form>

            <div className="mt-9 flex items-center gap-3 text-xs leading-5 text-[#94a3b8]">
              <Keyboard className="h-4 w-4 shrink-0 text-[#e7a93b]" aria-hidden="true" />
              <p>Contact your administrator to create an account or reset your password.</p>
            </div>
            <div className="mt-12 flex items-center justify-between border-t border-[#e5e7eb] pt-5 text-[11px] text-[#94a3b8]">
              <span>© {new Date().getFullYear()} Ampera</span>
              <span className="font-mono">v{APP_VERSION}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}