/**
 * 2026-11-07 (Mira): the app's own background (behind the panels — never on the projector).
 *  - Built-in scenes are drawn here with SVG/CSS (no image files, works offline, sharp on any screen).
 *    Animations are CSS only (transform / opacity) and stop when data-motion="off" or "reduce motion".
 *  - "img-…" / "vid-…" = a picture or video from the Media tab (video: muted loop).
 *  - A canvas-colored layer on top (dim) keeps the panels and text readable.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppBackground } from "../lib/appearance";
import { useSongBackground } from "../lib/songBackground";
import { getVideoUrl, isVideoId } from "../lib/mediaStore";

// Same "random" stars every time (no jumping on re-render).
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const W = 1600;
const H = 900;
const svgProps = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid slice", className: "absolute inset-0 h-full w-full", "aria-hidden": true } as const;

/** A sine wave path, 2 × W wide, so sliding it left by W loops without a seam. */
function wavePath(y: number, amp: number, period: number, phase = 0) {
  let d = `M0 ${H}L0 ${y}`;
  for (let x = 0; x <= W * 2; x += 20) d += `L${x} ${(y + Math.sin(((x + phase) / period) * Math.PI * 2) * amp).toFixed(1)}`;
  return d + `L${W * 2} ${H}Z`;
}

/** Mountain ridge: jagged line from left to right, filled to the bottom. */
function ridge(seed: number, base: number, height: number, step: number) {
  const r = seeded(seed);
  let d = `M0 ${H}L0 ${base}`;
  let y = base;
  for (let x = 0; x <= W; x += step) {
    y = Math.min(base + height * 0.3, Math.max(base - height, y + (r() - 0.5) * height * 0.9));
    d += `L${x} ${y.toFixed(0)}`;
  }
  return d + `L${W} ${H}Z`;
}

function Stars({ count, seed, maxY = H, className = "" }: { count: number; seed: number; maxY?: number; className?: string }) {
  const stars = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, (_, i) => ({ x: r() * W, y: r() * maxY, rad: 0.6 + r() * 1.6, delay: -(r() * 6), dur: 3 + r() * 4, i }));
  }, [count, seed, maxY]);
  return (
    <g className={className}>
      {stars.map((s) => (
        <circle key={s.i} cx={s.x} cy={s.y} r={s.rad} fill="#fff" className="wtp-twinkle" style={{ animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }} />
      ))}
    </g>
  );
}

function Pines({ seed, base, size, color, count }: { seed: number; base: number; size: number; color: string; count: number }) {
  const trees = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, (_, i) => {
      const x = (i / count) * W + r() * (W / count);
      const h = size * (0.7 + r() * 0.6);
      const w = h * 0.38;
      const y = base + r() * size * 0.25;
      return `M${x.toFixed(0)} ${(y - h).toFixed(0)}L${(x + w / 2).toFixed(0)} ${y.toFixed(0)}L${(x - w / 2).toFixed(0)} ${y.toFixed(0)}Z`;
    }).join("");
  }, [seed, base, size, count]);
  return (
    <g fill={color}>
      <path d={trees} />
      <rect x="0" y={base + size * 0.2} width={W} height={H} />
    </g>
  );
}

function Scene({ id }: { id: string }) {
  switch (id) {
    case "scene-aurora":
      return (
        <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(180deg, #050b16 0%, #0a1a2b 60%, #07131f 100%)" }}>
          <svg {...svgProps}>
            <Stars count={70} seed={7} maxY={H * 0.7} />
          </svg>
          <div className="wtp-aurora-a absolute -left-[10%] top-[5%] h-[60%] w-[70%] rounded-full opacity-60 blur-[70px]" style={{ background: "radial-gradient(closest-side, #14b8a6, transparent)" }} />
          <div className="wtp-aurora-b absolute right-[-10%] top-[15%] h-[55%] w-[65%] rounded-full opacity-50 blur-[80px]" style={{ background: "radial-gradient(closest-side, #8b5cf6, transparent)" }} />
          <div className="wtp-aurora-c absolute bottom-[0%] left-[20%] h-[45%] w-[60%] rounded-full opacity-40 blur-[90px]" style={{ background: "radial-gradient(closest-side, #22c55e, transparent)" }} />
        </div>
      );
    case "scene-stars":
      return (
        <div className="absolute inset-0 overflow-hidden" style={{ background: "radial-gradient(120% 80% at 50% 100%, #2a2f6b 0%, transparent 60%), linear-gradient(180deg, #03050f 0%, #111538 100%)" }}>
          <svg {...svgProps}>
            <g className="wtp-drift-slow">
              <Stars count={160} seed={11} />
            </g>
            <Stars count={40} seed={23} />
            <line x1="1200" y1="80" x2="1320" y2="130" stroke="#fff" strokeWidth="2" strokeLinecap="round" className="wtp-shooting" />
          </svg>
        </div>
      );
    case "scene-bokeh": {
      const colors = ["#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#fb923c", "#34d399"];
      const r = seeded(31);
      const dots = Array.from({ length: 16 }, (_, i) => ({
        left: r() * 100,
        top: 10 + r() * 90,
        size: 60 + r() * 160,
        color: colors[i % colors.length],
        dur: 18 + r() * 22,
        delay: -(r() * 30),
        op: 0.25 + r() * 0.35,
        i,
      }));
      return (
        <div className="absolute inset-0 overflow-hidden" style={{ background: "radial-gradient(100% 80% at 50% 0%, #2a1740 0%, #0f0a1a 70%)" }}>
          {dots.map((d) => (
            <span
              key={d.i}
              className="wtp-float absolute rounded-full blur-[6px]"
              style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, background: `radial-gradient(closest-side, ${d.color}, transparent)`, opacity: d.op, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
            />
          ))}
        </div>
      );
    }
    case "scene-waves":
      return (
        <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(180deg, #0b1d3a 0%, #13305e 55%, #1d4ed8 100%)" }}>
          <svg {...svgProps}>
            <g className="wtp-wave-slow"><path d={wavePath(560, 26, 400)} fill="#1e3a8a" opacity="0.7" /></g>
            <g className="wtp-wave-mid"><path d={wavePath(640, 22, 320, 90)} fill="#1d4ed8" opacity="0.6" /></g>
            <g className="wtp-wave-fast"><path d={wavePath(730, 18, 200, 40)} fill="#3b82f6" opacity="0.5" /></g>
          </svg>
        </div>
      );
    case "scene-mountains":
      return (
        <div className="absolute inset-0 overflow-hidden">
          <svg {...svgProps}>
            <defs>
              <linearGradient id="wtpMtSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3b1d6e" />
                <stop offset="0.45" stopColor="#f97316" />
                <stop offset="0.7" stopColor="#fcd34d" />
              </linearGradient>
              <radialGradient id="wtpMtSun">
                <stop offset="0" stopColor="#fff7d6" />
                <stop offset="0.35" stopColor="#fde68a" />
                <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="url(#wtpMtSky)" />
            <circle cx="800" cy="520" r="260" fill="url(#wtpMtSun)" className="wtp-glow" />
            <g className="wtp-cloud" opacity="0.55" fill="#ffe4c4">
              <ellipse cx="300" cy="200" rx="160" ry="22" />
              <ellipse cx="380" cy="185" rx="90" ry="20" />
              <ellipse cx="1150" cy="260" rx="200" ry="20" />
            </g>
            <path d={ridge(3, 560, 180, 60)} fill="#7c3aed" opacity="0.75" />
            <path d={ridge(5, 640, 160, 50)} fill="#5b21b6" />
            <path d={ridge(9, 730, 120, 40)} fill="#3b0f7a" />
            <path d={ridge(13, 820, 70, 30)} fill="#1e0b45" />
          </svg>
        </div>
      );
    case "scene-forest":
      return (
        <div className="absolute inset-0 overflow-hidden">
          <svg {...svgProps}>
            <defs>
              <linearGradient id="wtpFoSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#c9dccf" />
                <stop offset="0.6" stopColor="#7fa792" />
                <stop offset="1" stopColor="#1f4535" />
              </linearGradient>
            </defs>
            <rect width={W} height={H} fill="url(#wtpFoSky)" />
            <Pines seed={2} base={470} size={170} color="#6b9682" count={46} />
            <g className="wtp-mist" opacity="0.5"><rect x="-200" y="500" width={W + 400} height="70" rx="35" fill="#e6efe9" /></g>
            <Pines seed={4} base={590} size={230} color="#3f6e58" count={36} />
            <g className="wtp-mist-rev" opacity="0.4"><rect x="-200" y="640" width={W + 400} height="80" rx="40" fill="#dbe7df" /></g>
            <Pines seed={8} base={720} size={300} color="#1d4433" count={26} />
            <Pines seed={12} base={850} size={360} color="#0c2219" count={18} />
          </svg>
        </div>
      );
    case "scene-ocean":
      return (
        <div className="absolute inset-0 overflow-hidden">
          <svg {...svgProps}>
            <defs>
              <linearGradient id="wtpOcSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4c1d95" />
                <stop offset="0.55" stopColor="#f97316" />
                <stop offset="1" stopColor="#fdba74" />
              </linearGradient>
              <linearGradient id="wtpOcSea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0e7490" />
                <stop offset="1" stopColor="#042f3e" />
              </linearGradient>
            </defs>
            <rect width={W} height="500" fill="url(#wtpOcSky)" />
            <circle cx="800" cy="500" r="120" fill="#fff1c1" className="wtp-glow" />
            <rect y="500" width={W} height="400" fill="url(#wtpOcSea)" />
            <g fill="#fde68a">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <rect key={i} x={760 - i * 14} y={520 + i * 38} width={80 + i * 28} height="5" rx="2.5" className="wtp-shimmer" style={{ animationDelay: `${-i * 0.6}s` }} />
              ))}
            </g>
            <g className="wtp-wave-mid"><path d={wavePath(700, 10, 160)} fill="#0b5566" opacity="0.6" /></g>
            <g className="wtp-wave-fast"><path d={wavePath(800, 14, 220, 60)} fill="#073b4c" opacity="0.8" /></g>
          </svg>
        </div>
      );
    case "scene-lake":
      return (
        <div className="absolute inset-0 overflow-hidden">
          <svg {...svgProps}>
            <defs>
              <linearGradient id="wtpLkSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#060a1f" />
                <stop offset="1" stopColor="#1e2a5a" />
              </linearGradient>
              <radialGradient id="wtpLkMoon">
                <stop offset="0" stopColor="#fefce8" />
                <stop offset="0.25" stopColor="#fef9c3" />
                <stop offset="1" stopColor="#fef9c3" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height="560" fill="url(#wtpLkSky)" />
            <Stars count={110} seed={41} maxY={480} />
            <circle cx="1120" cy="200" r="180" fill="url(#wtpLkMoon)" className="wtp-glow" />
            <circle cx="1120" cy="200" r="44" fill="#fefce8" />
            <path d={ridge(17, 520, 140, 50)} fill="#111a3d" />
            <rect y="560" width={W} height="340" fill="#070d24" />
            <g fill="#fef9c3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <rect key={i} x={1095 - i * 10} y={590 + i * 40} width={50 + i * 20} height="4" rx="2" className="wtp-shimmer" style={{ animationDelay: `${-i * 0.7}s` }} />
              ))}
            </g>
          </svg>
        </div>
      );
    default:
      return null;
  }
}

function MediaBg({ id, blur, motion }: { id: string; blur: number; motion: boolean }) {
  const bg = useSongBackground(id);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (motion) v.play().catch(() => undefined);
    else v.pause();
  }, [motion, videoUrl]);
  useEffect(() => {
    if (!isVideoId(id)) return setVideoUrl(null);
    let alive = true;
    getVideoUrl(id)
      .then((u) => alive && setVideoUrl(u))
      .catch(() => alive && setVideoUrl(null));
    return () => {
      alive = false;
    };
  }, [id]);
  // blur scales the layer up a little so the soft edges stay off screen
  const style: React.CSSProperties = blur ? { filter: `blur(${blur}px)`, transform: "scale(1.06)" } : {};
  return (
    <div className="absolute inset-0" style={style}>
      {bg.css && <div className="absolute inset-0" style={{ background: bg.css }} />}
      {videoUrl && <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" src={videoUrl} autoPlay={motion} muted loop playsInline />}
    </div>
  );
}

export const AppBackdrop: React.FC<{ bg: AppBackground; motion: boolean }> = ({ bg, motion }) => {
  if (!bg.id) return null;
  const isScene = bg.id.startsWith("scene-");
  return (
    <div className="app-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true" data-testid="app-backdrop" data-bg={bg.id}>
      {isScene ? <Scene id={bg.id} /> : <MediaBg id={bg.id} blur={bg.blur} motion={motion} />}
      {/* canvas-colored veil: dark in dark mode, light in light mode */}
      <div className="absolute inset-0" style={{ background: "var(--c-canvas)", opacity: bg.dim }} />
    </div>
  );
};
