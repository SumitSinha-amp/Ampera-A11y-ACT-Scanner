import { useRef, useEffect, useMemo } from "react";

const BASE_URL = import.meta.env.BASE_URL as string;
const b = (f: string) => `${BASE_URL}${f}`.replace(/\/\//g, "/");

const logoSrc  = b("act-logo-main.png");

/* ─── Fixed icon positions matching reference layout ─────────────── */
const ICONS = [
  { name: "Accessibility",  src: b("icon-accessibility.png"),  left: "14%", top: "11%" },
  { name: "Hearing",        src: b("icon-hearing.png"),         left: "55%", top:  "9%" },
  { name: "Vision",         src: b("icon-vision.png"),          left: "77%", top: "22%" },
  { name: "Keyboard",       src: b("icon-keyboard.png"),        left:  "4%", top: "43%" },
  { name: "CC",             src: b("icon-cc.png"),              left: "83%", top: "43%" },
  { name: "Sign Language",  src: b("icon-sign-language.png"),   left: "16%", top: "68%" },
  { name: "Analytics",      src: b("icon-analytics.png"),       left: "38%", top: "81%" },
  { name: "Wheelchair",     src: b("icon-wheelchair.png"),      left: "59%", top: "66%" },
  { name: "Cognitive",      src: b("icon-cognitive.png"),       left: "80%", top: "77%" },
];

/* ─── Single icon circle with animated arc rings ─────────────────── */
function IconCircle({ name, src, left, top }: { name: string; src: string; left: string; top: string }) {
  const S = 80; // container size px
  const C = S / 2 + 18; // SVG centre (with padding)
  const SVG = S + 36;

  return (
    <div style={{ position: "absolute", left, top, width: S, height: S, zIndex: 10 }}>
      {/* Animated arc rings */}
      <svg
        style={{ position: "absolute", top: -18, left: -18, width: SVG, height: SVG, overflow: "visible", pointerEvents: "none" }}
        viewBox={`0 0 ${SVG} ${SVG}`}
      >
        {/* Outer slow clockwise dashed ring */}
        <circle
          cx={C} cy={C} r={S / 2 + 13}
          fill="none" stroke="rgba(168,85,247,0.55)" strokeWidth="1"
          strokeDasharray="12 7"
          style={{ transformOrigin: `${C}px ${C}px`, animation: "flbSpin 12s linear infinite" }}
        />
        {/* Inner fast counter-clockwise arc segments */}
        <circle
          cx={C} cy={C} r={S / 2 + 5}
          fill="none" stroke="rgba(217,70,239,0.75)" strokeWidth="1.2"
          strokeDasharray="24 42"
          style={{ transformOrigin: `${C}px ${C}px`, animation: "flbSpin 7s linear infinite reverse" }}
        />
      </svg>

      {/* Glow blob behind the icon */}
      <div className="flb-icon-glow" />

      {/* Icon circle — uses the PNG directly (already has its own ring artwork) */}
      <div className="flb-icon-circle" aria-label={name}>
        <img
          src={src}
          alt={name}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
        />
      </div>
    </div>
  );
}

/* ─── Dot-wave cluster (SVG, static) ─────────────────────────────── */
function genDots(cx: number, cy: number, count: number, fromAngle: number, toAngle: number) {
  const dots: { x: number; y: number; r: number; op: number }[] = [];
  const rings = 22;
  for (let ring = 0; ring < rings; ring++) {
    const radius = 28 + ring * 11;
    const nDots = Math.round(6 + ring * 2.2);
    for (let d = 0; d < nDots; d++) {
      const angle = fromAngle + ((toAngle - fromAngle) * d) / (nDots - 1);
      const rad = (angle * Math.PI) / 180;
      const jitter = (Math.random() - 0.5) * 10;
      const x = cx + (radius + jitter) * Math.cos(rad);
      const y = cy + (radius + jitter) * Math.sin(rad) * 0.72;
      const fade = 1 - ring / rings;
      const op = (0.18 + fade * 0.55) * (0.5 + Math.random() * 0.5);
      const sz = 0.55 + fade * 1.4;
      dots.push({ x, y, r: Math.max(0.4, sz), op: Math.min(0.9, op) });
    }
  }
  return dots;
}

function DotCluster({ cx, cy, fromAngle, toAngle, count }: { cx: number; cy: number; fromAngle: number; toAngle: number; count: number }) {
  const dots = useMemo(() => genDots(cx, cy, count, fromAngle, toAngle), [cx, cy, fromAngle, toAngle, count]);
  return (
    <>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#d946ef" opacity={d.op} />
      ))}
    </>
  );
}

/* ─── Canvas particle network ─────────────────────────────────────── */
function useParticleNetwork(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const N = 48;
    type Node = { x: number; y: number; vx: number; vy: number; pulse: number };
    const nodes: Node[] = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      pulse: Math.random() * Math.PI * 2,
    }));

    type Particle = { from: number; to: number; t: number; speed: number };
    const particles: Particle[] = Array.from({ length: 30 }, () => ({
      from: Math.floor(Math.random() * N),
      to: Math.floor(Math.random() * N),
      t: Math.random(),
      speed: 0.002 + Math.random() * 0.003,
    }));

    const MAX_D = 120;
    let raf: number;

    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.012;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }

      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_D) {
          const a = (1 - dist / MAX_D) * 0.2;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(148,64,220,${a})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      for (const n of nodes) {
        const g = 0.5 + 0.5 * Math.sin(n.pulse);
        ctx.beginPath(); ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217,70,239,${0.5 + 0.4 * g})`; ctx.fill();
      }

      for (const p of particles) {
        p.t += p.speed;
        if (p.t >= 1) {
          p.t = 0; p.from = p.to;
          const cands: number[] = [];
          for (let k = 0; k < N; k++) {
            if (k === p.from) continue;
            const dx = nodes[p.from].x - nodes[k].x, dy = nodes[p.from].y - nodes[k].y;
            if (Math.sqrt(dx * dx + dy * dy) < MAX_D) cands.push(k);
          }
          p.to = cands.length ? cands[Math.floor(Math.random() * cands.length)] : (p.from + 1) % N;
        }
        const { x: x0, y: y0 } = nodes[p.from], { x: x1, y: y1 } = nodes[p.to];
        const x = x0 + (x1 - x0) * p.t, y = y0 + (y1 - y0) * p.t;
        const trail = Math.max(0, p.t - 0.12);
        const tx = x0 + (x1 - x0) * trail, ty = y0 + (y1 - y0) * trail;
        const tg = ctx.createLinearGradient(tx, ty, x, y);
        tg.addColorStop(0, "rgba(168,85,247,0)"); tg.addColorStop(1, "rgba(240,120,255,0.65)");
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y);
        ctx.strokeStyle = tg; ctx.lineWidth = 1.3; ctx.stroke();
        const hg = ctx.createRadialGradient(x, y, 0, x, y, 6);
        hg.addColorStop(0, "rgba(255,255,255,1)"); hg.addColorStop(1, "rgba(168,85,247,0)");
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ref]);
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function FuturisticLoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useParticleNetwork(canvasRef);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#0d0022" }}>

      {/* Background gradient */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 70% at 40% 40%, #1a0038 0%, #0d0022 55%, #060010 100%)" }} />

      {/* Canvas: animated particle network */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.7 }} />

      {/* Dot-wave clusters */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice">
        <DotCluster cx={80}  cy={240} fromAngle={-30}  toAngle={210} count={500} />
        <DotCluster cx={720} cy={660} fromAngle={150}  toAngle={390} count={500} />
        <DotCluster cx={680} cy={130} fromAngle={200}  toAngle={360} count={200} />
        <DotCluster cx={110} cy={760} fromAngle={20}   toAngle={180} count={200} />
      </svg>

      {/* Circuit traces */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice">
        <path d="M0 180 H90 L130 140 H240 L270 170 H360" stroke="#9333ea" strokeWidth="0.9" fill="none" strokeDasharray="7 5" className="flb-tr" />
        <circle cx="90"  cy="180" r="2.5" fill="none" stroke="#d946ef" strokeWidth="1" />
        <circle cx="130" cy="140" r="2.5" fill="none" stroke="#d946ef" strokeWidth="1" />
        <circle cx="270" cy="170" r="2.5" fill="none" stroke="#d946ef" strokeWidth="1" />
        <text x="590" y="95"  fill="#7c3aed" fontSize="10" fontFamily="monospace" opacity="0.7">&gt;&gt;&gt;&gt;</text>
        <text x="610" y="310" fill="#7c3aed" fontSize="10" fontFamily="monospace" opacity="0.6">&gt;&gt;&gt;</text>
        <path d="M0 600 H70 L110 560 H210" stroke="#6d28d9" strokeWidth="0.9" fill="none" strokeDasharray="7 5" className="flb-tr-r" />
        <circle cx="70"  cy="600" r="2.5" fill="none" stroke="#a855f7" strokeWidth="1" />
        <circle cx="110" cy="560" r="2.5" fill="none" stroke="#a855f7" strokeWidth="1" />
        <text x="40"  y="650" fill="#7c3aed" fontSize="10" fontFamily="monospace" opacity="0.65">&gt;&gt;&gt;&gt;&gt;</text>
        <text x="20"  y="700" fill="#7c3aed" fontSize="9"  fontFamily="monospace" opacity="0.5">&gt;&gt;&gt;</text>
        <path d="M800 720 H680 L640 760 H520" stroke="#9333ea" strokeWidth="0.9" fill="none" strokeDasharray="7 5" className="flb-tr-r" />
        <circle cx="680" cy="720" r="2.5" fill="none" stroke="#d946ef" strokeWidth="1" />
        <circle cx="640" cy="760" r="2.5" fill="none" stroke="#d946ef" strokeWidth="1" />
        <text x="680" y="830" fill="#7c3aed" fontSize="10" fontFamily="monospace" opacity="0.65">&gt;&gt;&gt;&gt;</text>
        <line x1="310" y1="110" x2="345" y2="145" stroke="#9333ea" strokeWidth="0.8" opacity="0.5" />
        <line x1="490" y1="340" x2="540" y2="340" stroke="#9333ea" strokeWidth="0.8" opacity="0.4" strokeDasharray="4 3" />
        <circle cx="210" cy="560" r="3" fill="#d946ef" opacity="0.8" className="flb-glow-dot" />
        <circle cx="350" cy="170" r="3" fill="#d946ef" opacity="0.8" className="flb-glow-dot" style={{ animationDelay: "0.7s" }} />
        <circle cx="520" cy="760" r="3" fill="#a855f7" opacity="0.7" className="flb-glow-dot" style={{ animationDelay: "1.4s" }} />
      </svg>

      {/* Data-stream sweeps */}
      <div className="flb-streams">
        {[16, 31, 52, 67, 84].map((pct, i) => (
          <div key={i} className="flb-stream"
            style={{ top: `${pct}%`, animationDelay: `${i * 2.1}s`, animationDuration: `${10 + i * 1.8}s` }} />
        ))}
      </div>

      {/* Fixed PNG icon circles */}
      {ICONS.map(icon => <IconCircle key={icon.name} {...icon} />)}

      {/* Centre glow blob */}
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 320, height: 320, transform: "translate(-50%,-50%)", borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Logo + tagline */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none px-6 text-center">
        <div className="flb-logo-wrap">
          <img
            src={logoSrc}
            alt="Ampera ACT Platform"
            className="flb-logo"
            draggable={false}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <p className="flb-tagline">
          Professional web accessibility scanning and compliance auditing powered by Ampera.
        </p>
      </div>

      {/* ── Styles ── */}
      <style>{`
        @keyframes flbSpin      { to { transform: rotate(360deg); } }
        @keyframes flbFadeUp    { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes flbFloat     { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        @keyframes flbGlowDot   { 0%,100% { opacity:.3; } 50% { opacity:1; } }
        @keyframes flbTrace     { 0% { stroke-dashoffset:600; } 100% { stroke-dashoffset:0; } }
        @keyframes flbStream    { from { transform:translateX(-100%); } to { transform:translateX(200%); } }

        .flb-icon-glow {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 90px; height: 90px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(168,85,247,0.55) 0%, rgba(109,40,217,0.28) 45%, transparent 72%);
          filter: blur(8px);
          animation: flbIconGlow 3s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes flbIconGlow {
          0%,100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1);   }
          50%      { opacity: 1;   transform: translate(-50%,-50%) scale(1.25); }
        }

        .flb-icon-circle {
          position: relative; z-index: 1;
          width: 80px; height: 80px; border-radius: 50%;
          background: transparent;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }

        .flb-tr     { stroke-dasharray: 600; animation: flbTrace 16s linear infinite; }
        .flb-tr-r   { stroke-dasharray: 600; animation: flbTrace 16s linear infinite reverse; }
        .flb-glow-dot { animation: flbGlowDot 2.5s ease-in-out infinite; }

        .flb-streams { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
        .flb-stream {
          position: absolute; left: 0; width: 55%;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.7) 30%, rgba(255,180,255,0.95) 50%, rgba(168,85,247,0.7) 70%, transparent 100%);
          animation: flbStream linear infinite; filter: blur(0.4px);
        }

        .flb-logo-wrap { animation: flbFloat 6s ease-in-out infinite; }
        .flb-logo {
          width: 420px; max-width: 90%; object-fit: contain; user-select: none;
          filter: drop-shadow(0 0 18px rgba(217,70,239,.55)) drop-shadow(0 0 50px rgba(168,85,247,.35));
        }
        .flb-tagline {
          margin-top: 18px; max-width: 290px; font-size: 13px; line-height: 1.7;
          color: rgba(210,180,255,0.6);
          animation: flbFadeUp 2s ease forwards;
        }

        @media (max-width: 1024px) {
          .flb-logo { width: 230px; }
          .flb-icon-circle { width: 58px; height: 58px; }
        }
      `}</style>
    </div>
  );
}
