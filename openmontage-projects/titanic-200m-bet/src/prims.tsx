import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const FONT = "SpaceGrotesk, sans-serif";
export const SERIF = "Playfair, serif";
export const W = 1920, H = 1080;

export const C = {
  navy: "#0B1630", night: "#070D1F", ink: "#F5EFE2", gold: "#F2B33D", red: "#E5484D", green: "#2BB673",
  sea: "#0E3B5C", seaDeep: "#06233A", ice: "#DDF3FF", paper: "#F5EFE2", dark: "#14121F", amber: "#F2A33A",
};

// ------------------------------------------------------------------ time helpers
export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, sec: frame / fps };
};
export const spr = (frame: number, fps: number, at: number, cfg: Record<string, number> = {}) =>
  spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 13, stiffness: 140, mass: 0.8, ...cfg } });
export const ramp = (sec: number, a: number, b: number, from = 0, to = 1, ease = Easing.inOut(Easing.cubic)) =>
  interpolate(sec, [a, b], [from, to], { ...clamp, easing: ease });
export const stroke = (w: number, c = "#111") => ({ WebkitTextStroke: `${w}px ${c}`, paintOrder: "stroke fill" as const });

// ------------------------------------------------------------------ camera (slow push / drift)
export const Cam: React.FC<{ dur: number; z0?: number; z1?: number; x0?: number; x1?: number; y0?: number; y1?: number; children: React.ReactNode }> =
  ({ dur, z0 = 1, z1 = 1.08, x0 = 0, x1 = 0, y0 = 0, y1 = 0, children }) => {
    const { sec } = useT();
    const k = ramp(sec, 0, Math.max(1, dur), 0, 1, Easing.inOut(Easing.sin));
    return (
      <AbsoluteFill style={{ transform: `translate(${x0 + (x1 - x0) * k}px, ${y0 + (y1 - y0) * k}px) scale(${z0 + (z1 - z0) * k})`, transformOrigin: "50% 50%" }}>
        {children}
      </AbsoluteFill>
    );
  };

// ------------------------------------------------------------------ text
export const Pop: React.FC<{ at: number; children: React.ReactNode; x?: number; y?: number; w?: number; size?: number; color?: string; rot?: number; sw?: number; shadow?: string; align?: "center" | "left" | "right"; font?: string; out?: number }> =
  ({ at, children, x = 0, y = 0, w = W, size = 90, color = C.ink, rot = 0, sw = 0, shadow, align = "center", font = FONT, out }) => {
    const { frame, fps, sec } = useT();
    const s = spr(frame, fps, at, { damping: 10, stiffness: 180 });
    const o = out !== undefined ? ramp(sec, out, out + 0.3, 1, 0) : 1;
    if (s <= 0.001) return null;
    return (
      <div style={{ position: "absolute", left: x, top: y, width: w, textAlign: align, fontFamily: font, fontWeight: 700, fontSize: size, color, lineHeight: 1.0,
        letterSpacing: size > 100 ? -3 : -1, opacity: Math.min(1, s) * o, transform: `scale(${interpolate(s, [0, 1], [1.9, 1])}) rotate(${rot}deg)`,
        textShadow: shadow, ...(sw ? stroke(sw) : {}) }}>
        {children}
      </div>
    );
  };

export const Words: React.FC<{ at: number; text: string; x?: number; y?: number; w?: number; size?: number; color?: string; stagger?: number; hot?: Record<string, string> }> =
  ({ at, text, x = 0, y = 0, w = W, size = 70, color = C.ink, stagger = 0.08, hot = {} }) => {
    const { frame, fps } = useT();
    return (
      <div style={{ position: "absolute", left: x, top: y, width: w, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: size, color, lineHeight: 1.15 }}>
        {text.split(" ").map((wd, i) => {
          const s = spr(frame, fps, at + i * stagger, { damping: 12, stiffness: 200 });
          return <span key={i} style={{ display: "inline-block", marginRight: size * 0.28, opacity: Math.min(1, s), transform: `translateY(${(1 - s) * 40}px)`, color: hot[wd] ?? color }}>{wd}</span>;
        })}
      </div>
    );
  };

export const Stamp: React.FC<{ at: number; text: string; x: number; y: number; color?: string; size?: number; rot?: number }> =
  ({ at, text, x, y, color = C.red, size = 80, rot = -8 }) => {
    const { frame, fps } = useT();
    const s = spr(frame, fps, at, { damping: 9, stiffness: 260 });
    if (s <= 0.001) return null;
    return (
      <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${interpolate(s, [0, 1], [2.6, 1])}) rotate(${rot}deg)`, opacity: Math.min(1, s),
        border: `${size / 10}px solid ${color}`, color, padding: `${size * 0.1}px ${size * 0.35}px`, borderRadius: size * 0.18, fontFamily: FONT, fontWeight: 700,
        fontSize: size, letterSpacing: 2, whiteSpace: "nowrap", background: "rgba(255,255,255,0.06)" }}>{text}</div>
    );
  };

export const Counter: React.FC<{ from: number; to: number; a: number; b: number; fmt: (n: number) => string; x: number; y: number; size?: number; color?: string; w?: number; align?: "center" | "left" | "right" }> =
  ({ from, to, a, b, fmt, x, y, size = 120, color = C.ink, w = 900, align = "center" }) => {
    const { sec } = useT();
    if (sec < a - 0.05) return null;
    const v = from + (to - from) * ramp(sec, a, b, 0, 1, Easing.out(Easing.cubic));
    return <div style={{ position: "absolute", left: x, top: y, width: w, textAlign: align, fontFamily: FONT, fontWeight: 700, fontSize: size, color, letterSpacing: -2, ...stroke(size / 18) }}>{fmt(v)}</div>;
  };
export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const moneyM = (n: number) => "$" + Math.round(n) + "M";

// ------------------------------------------------------------------ backgrounds
export const Grad: React.FC<{ top: string; bottom: string }> = ({ top, bottom }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` }} />
);
export const Stars: React.FC<{ n?: number; maxY?: number }> = ({ n = 90, maxY = 620 }) => {
  const { sec } = useT();
  return (
    <svg width={W} height={H} style={{ position: "absolute" }}>
      {[...Array(n)].map((_, i) => {
        const x = (i * 211) % W, y = (i * 97) % maxY, r = 1 + (i % 3) * 0.8;
        return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.35 + 0.35 * Math.sin(sec * 2 + i)} />;
      })}
    </svg>
  );
};
export const Grid: React.FC<{ color?: string; step?: number }> = ({ color = "#ffffff14", step = 60 }) => (
  <AbsoluteFill style={{ backgroundImage: `linear-gradient(${color} 2px, transparent 2px), linear-gradient(90deg, ${color} 2px, transparent 2px)`, backgroundSize: `${step}px ${step}px` }} />
);

// ------------------------------------------------------------------ ocean (draw AFTER ship so it hides what's under water)
export const Ocean: React.FC<{ y: number; color?: string; color2?: string; amp?: number; opacity?: number }> = ({ y, color = C.sea, color2 = C.seaDeep, amp = 10, opacity = 1 }) => {
  const { sec } = useT();
  const pts: string[] = [];
  for (let x = -40; x <= W + 40; x += 40) pts.push(`${x},${y + Math.sin(x * 0.012 + sec * 1.6) * amp + Math.sin(x * 0.031 - sec * 2.3) * amp * 0.4}`);
  const p2: string[] = [];
  for (let x = -40; x <= W + 40; x += 40) p2.push(`${x},${y + 26 + Math.sin(x * 0.017 - sec * 1.2) * amp * 0.7}`);
  return (
    <svg width={W} height={H} style={{ position: "absolute", opacity }}>
      <defs><linearGradient id={`oc${y}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={color2} /></linearGradient></defs>
      <polygon points={`-40,${H} ${pts.join(" ")} ${W + 40},${H}`} fill={`url(#oc${y})`} />
      <polyline points={pts.join(" ")} fill="none" stroke="#ffffff55" strokeWidth={3} />
      <polyline points={p2.join(" ")} fill="none" stroke="#ffffff22" strokeWidth={2} />
    </svg>
  );
};

// ------------------------------------------------------------------ ship (side view; waterline y=0; stern x=0 → bow x=1000)
export const SPLIT_X = 630;
const Hull: React.FC<{ lights: boolean }> = ({ lights }) => (
  <g>
    {/* masts + rigging */}
    <line x1={70} y1={-70} x2={60} y2={-320} stroke="#2a2a2a" strokeWidth={6} />
    <line x1={930} y1={-70} x2={940} y2={-330} stroke="#2a2a2a" strokeWidth={6} />
    <line x1={60} y1={-315} x2={940} y2={-325} stroke="#2a2a2a" strokeWidth={2} opacity={0.7} />
    {/* funnels */}
    {[280, 420, 560, 700].map((fx, i) => (
      <g key={i} transform={`translate(${fx} -140) skewX(-8)`}>
        <rect x={-24} y={-150} width={48} height={150} fill="#E2A43A" />
        <rect x={-24} y={-150} width={48} height={32} fill="#151515" />
        {lights && i < 3 && <rect x={-24} y={-150} width={48} height={6} fill="#ffffff22" />}
      </g>
    ))}
    {/* superstructure */}
    <rect x={200} y={-142} width={600} height={34} fill="#F3EFE4" />
    <rect x={120} y={-110} width={770} height={42} fill="#F3EFE4" />
    {[...Array(34)].map((_, i) => <rect key={i} x={135 + i * 22} y={-100} width={12} height={10} fill={lights ? "#FFE48A" : "#5B6470"} />)}
    {[...Array(26)].map((_, i) => <rect key={i} x={215 + i * 22} y={-134} width={12} height={9} fill={lights ? "#FFE48A" : "#5B6470"} />)}
    {/* hull */}
    <path d="M0,-70 L1000,-70 L986,-14 Q974,40 900,46 L80,46 Q20,40 8,0 Z" fill="#17171B" />
    <path d="M6,10 L992,10 Q976,42 900,46 L80,46 Q22,42 6,10 Z" fill="#8E1F1F" />
    <rect x={0} y={-74} width={1000} height={6} fill="#F3EFE4" />
    {[...Array(42)].map((_, i) => <circle key={i} cx={40 + i * 22} cy={-42} r={4} fill={lights ? "#FFD966" : "#3A3F47"} />)}
    {[...Array(42)].map((_, i) => <circle key={i} cx={40 + i * 22} cy={-22} r={3.5} fill={lights ? "#FFD966" : "#3A3F47"} opacity={0.9} />)}
  </g>
);
export const Ship: React.FC<{ x: number; y: number; s?: number; rot?: number; lights?: boolean; split?: boolean; bowRot?: number; sternRot?: number; bowDy?: number; sternDy?: number; sternDx?: number; crack?: number; id?: string }> =
  ({ x, y, s = 1, rot = 0, lights = false, split = false, bowRot = 0, sternRot = 0, bowDy = 0, sternDy = 0, sternDx = 0, crack = 0, id = "s" }) => (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <defs>
        <clipPath id={`stern${id}`}><rect x={-100} y={-600} width={SPLIT_X + 100} height={1200} /></clipPath>
        <clipPath id={`bow${id}`}><rect x={SPLIT_X} y={-600} width={600} height={1200} /></clipPath>
      </defs>
      <g transform={`translate(${x} ${y}) scale(${s}) rotate(${rot} 500 0) translate(-500 0)`}>
        {!split ? (
          <g><Hull lights={lights} />{crack > 0 && <path d={`M${SPLIT_X},-290 L${SPLIT_X - 12},-150 L${SPLIT_X + 10},-60 L${SPLIT_X - 6},46`} stroke="#FFE7A0" strokeWidth={6 * crack} fill="none" opacity={crack} />}</g>
        ) : (
          <>
            <g transform={`translate(${sternDx} ${sternDy}) rotate(${sternRot} ${SPLIT_X} 0)`} clipPath={`url(#stern${id})`}><Hull lights={lights} /></g>
            <g transform={`translate(0 ${bowDy}) rotate(${bowRot} ${SPLIT_X} 0)`} clipPath={`url(#bow${id})`}><Hull lights={false} /></g>
          </>
        )}
      </g>
    </svg>
  );

export const Iceberg: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <svg width={W} height={H} style={{ position: "absolute", overflow: "visible" }}>
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-160,0 L-120,-90 L-70,-120 L-40,-210 L10,-150 L60,-180 L110,-80 L170,0 Z" fill="#E6F6FF" />
      <path d="M-40,-210 L10,-150 L-10,-60 L-70,-120 Z" fill="#BFE3F6" />
      <path d="M60,-180 L110,-80 L40,-40 Z" fill="#CDEBFA" />
      <path d="M-160,0 L170,0 L120,140 L-40,190 L-150,110 Z" fill="#9FD0EA" opacity={0.35} />
    </g>
  </svg>
);

// ------------------------------------------------------------------ stick figures
export type Pose = "stand" | "point" | "cheer" | "panic" | "fly" | "shrug" | "think" | "present" | "lie" | "swim" | "laugh";
type Hat = "cap" | "top" | "flat" | "hair" | "none";
const ARMS: Record<Pose, [number, number, number, number]> = {
  // [leftUpper, leftFore, rightUpper, rightFore] degrees from straight down; positive = outward
  stand: [14, 4, 14, 4], point: [14, 4, 95, 0], cheer: [155, 10, 155, 10], panic: [140, 40, 140, 40], fly: [90, 0, 90, 0],
  shrug: [55, -95, 55, -95], think: [14, 4, 35, -150], present: [14, 4, 70, -35], lie: [90, 0, 90, 0], swim: [120, 30, 120, 30], laugh: [30, -120, 30, -120],
};
export const Stick: React.FC<{ x: number; y: number; s?: number; pose?: Pose; color?: string; hat?: Hat; hatColor?: string; walk?: boolean; face?: "smile" | "frown" | "o" | "flat"; sweat?: boolean; flip?: boolean; prop?: "megaphone" | "briefcase" | "none"; mustache?: boolean; rot?: number; bob?: number }> =
  ({ x, y, s = 1, pose = "stand", color = "#F5EFE2", hat = "none", hatColor = "#E5484D", walk = false, face = "smile", sweat = false, flip = false, prop = "none", mustache = false, rot = 0, bob = 0 }) => {
    const { sec } = useT();
    const osc = pose === "panic" || pose === "laugh" ? Math.sin(sec * 18) * 18 : pose === "swim" ? Math.sin(sec * 6) * 25 : 0;
    const [lu, lf, ru, rf] = ARMS[pose];
    const sh = { x: 0, y: -132 };
    const arm = (sgn: number, u: number, f: number) => {
      const a1 = ((u + (sgn < 0 ? osc : -osc)) * Math.PI) / 180, a2 = ((u + f) * Math.PI) / 180;
      const e = { x: sh.x + sgn * 44 * Math.sin(a1), y: sh.y + 44 * Math.cos(a1) };
      const h = { x: e.x + sgn * 42 * Math.sin(a2), y: e.y + 42 * Math.cos(a2) };
      return { e, h };
    };
    const L = arm(-1, lu, lf), R = arm(1, ru, rf);
    const sw = walk ? Math.sin(sec * 9) * 22 : 0;
    const leg = (sgn: number, a: number) => {
      const r = (a * Math.PI) / 180;
      const k = { x: sgn * 10 + 38 * Math.sin(r), y: -68 + 38 * Math.cos(r) };
      return { k, f: { x: k.x + 36 * Math.sin(r * 0.6), y: k.y + 36 } };
    };
    const lg = leg(-1, -10 + sw), rg = leg(1, 10 - sw);
    const by = bob ? Math.sin(sec * bob) * 6 : walk ? Math.abs(Math.sin(sec * 9)) * -5 : 0;
    return (
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        <g transform={`translate(${x} ${y + by}) rotate(${rot}) scale(${flip ? -s : s} ${s})`} stroke={color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1={0} y1={-146} x2={0} y2={-70} />
          <polyline points={`0,-70 ${lg.k.x},${lg.k.y} ${lg.f.x},${lg.f.y}`} />
          <polyline points={`0,-70 ${rg.k.x},${rg.k.y} ${rg.f.x},${rg.f.y}`} />
          <polyline points={`${sh.x},${sh.y} ${L.e.x},${L.e.y} ${L.h.x},${L.h.y}`} />
          <polyline points={`${sh.x},${sh.y} ${R.e.x},${R.e.y} ${R.h.x},${R.h.y}`} />
          <circle cx={0} cy={-174} r={28} fill={C.dark} />
          {/* face */}
          <g stroke="none" fill={color}>
            <circle cx={-10} cy={-178} r={4} /><circle cx={10} cy={-178} r={4} />
          </g>
          {face === "smile" && <path d="M-11,-164 Q0,-155 11,-164" strokeWidth={4} />}
          {face === "frown" && <path d="M-11,-158 Q0,-167 11,-158" strokeWidth={4} />}
          {face === "o" && <circle cx={0} cy={-161} r={5} strokeWidth={4} />}
          {face === "flat" && <line x1={-9} y1={-162} x2={9} y2={-162} strokeWidth={4} />}
          {mustache && <path d="M-14,-166 Q-6,-160 0,-166 Q6,-160 14,-166" strokeWidth={5} />}
          {/* hats */}
          {hat === "cap" && <g stroke="none" fill={hatColor}><path d="M-28,-188 Q0,-222 28,-188 Z" /><rect x={10} y={-192} width={34} height={8} rx={4} /></g>}
          {hat === "top" && <g stroke="none" fill="#111"><rect x={-22} y={-236} width={44} height={44} /><rect x={-34} y={-196} width={68} height={8} rx={3} /><rect x={-22} y={-206} width={44} height={8} fill={hatColor} /></g>}
          {hat === "flat" && <g stroke="none" fill={hatColor}><path d="M-30,-190 Q-4,-214 26,-196 L40,-186 L-30,-186 Z" /></g>}
          {hat === "hair" && <g stroke={hatColor} strokeWidth={8}><path d="M-26,-190 Q-40,-150 -30,-120" /><path d="M26,-190 Q40,-150 30,-118" /><path d="M-28,-188 Q0,-214 28,-188" /></g>}
          {sweat && <path d="M34,-200 Q42,-186 34,-180 Q26,-186 34,-200 Z" fill="#8FD3FF" stroke="none" />}
          {prop === "megaphone" && <g transform={`translate(${R.h.x} ${R.h.y})`} stroke="none" fill={C.gold}><path d="M0,-10 L46,-30 L46,30 L0,10 Z" /></g>}
          {prop === "briefcase" && <g transform={`translate(${L.h.x - 22} ${L.h.y})`} stroke="none" fill="#6B4423"><rect x={0} y={0} width={44} height={32} rx={4} /><rect x={14} y={-8} width={16} height={8} fill="none" stroke="#6B4423" strokeWidth={4} /></g>}
        </g>
      </svg>
    );
  };

export const Bubble: React.FC<{ at: number; x: number; y: number; text: string; size?: number; out?: number; color?: string; bg?: string }> = ({ at, x, y, text, size = 46, out, color = "#111", bg = "#fff" }) => {
  const { frame, fps, sec } = useT();
  const s = spr(frame, fps, at, { damping: 11, stiffness: 220 });
  const o = out !== undefined ? ramp(sec, out, out + 0.25, 1, 0) : 1;
  if (s <= 0.001 || o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-100%) scale(${s})`, transformOrigin: "50% 100%", opacity: o,
      background: bg, color, borderRadius: 26, padding: "12px 26px", fontFamily: FONT, fontWeight: 700, fontSize: size, whiteSpace: "nowrap", border: "5px solid #111", boxShadow: "0 8px 0 #111" }}>
      {text}
      <div style={{ position: "absolute", left: "50%", bottom: -22, width: 0, height: 0, borderLeft: "14px solid transparent", borderRight: "14px solid transparent", borderTop: `22px solid #111`, transform: "translateX(-50%)" }} />
    </div>
  );
};

// ------------------------------------------------------------------ props
export const Trophy: React.FC<{ x: number; y: number; s?: number; dim?: boolean }> = ({ x, y, s = 1, dim }) => (
  <svg width={W} height={H} style={{ position: "absolute", overflow: "visible" }}>
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={dim ? 0.25 : 1}>
      <path d="M-40,-150 L40,-150 L34,-90 Q0,-60 -34,-90 Z" fill={dim ? "none" : C.gold} stroke={dim ? "#fff" : "#B07A12"} strokeWidth={5} strokeDasharray={dim ? "8 6" : undefined} />
      <path d="M-40,-140 Q-70,-140 -60,-110 Q-52,-96 -34,-96" fill="none" stroke={dim ? "#fff" : C.gold} strokeWidth={8} />
      <path d="M40,-140 Q70,-140 60,-110 Q52,-96 34,-96" fill="none" stroke={dim ? "#fff" : C.gold} strokeWidth={8} />
      <rect x={-8} y={-72} width={16} height={36} fill={dim ? "none" : C.gold} stroke={dim ? "#fff" : "none"} strokeWidth={4} />
      <rect x={-38} y={-36} width={76} height={36} rx={6} fill={dim ? "none" : "#3A2A12"} stroke={dim ? "#fff" : "none"} strokeWidth={4} />
      {!dim && <path d="M0,-136 L6,-122 L21,-122 L9,-113 L13,-99 L0,-108 L-13,-99 L-9,-113 L-21,-122 L-6,-122 Z" fill="#FFF3C4" />}
    </g>
  </svg>
);

export const BillStack: React.FC<{ x: number; y: number; n: number; w?: number }> = ({ x, y, n, w = 220 }) => (
  <svg width={W} height={H} style={{ position: "absolute", overflow: "visible" }}>
    {[...Array(Math.max(0, Math.floor(n)))].map((_, i) => (
      <g key={i} transform={`translate(${x + ((i * 7) % 11) - 5} ${y - i * 16})`}>
        <rect x={-w / 2} y={-14} width={w} height={14} rx={3} fill="#2E8B57" stroke="#1D5E3A" strokeWidth={2} />
        <rect x={-w / 2 + 10} y={-12} width={w - 20} height={10} rx={2} fill="none" stroke="#9BE3B5" strokeWidth={1.5} />
      </g>
    ))}
  </svg>
);

export const PriceTag: React.FC<{ at: number; x: number; y: number; price: string; label?: string; s?: number }> = ({ at, x, y, price, label = "", s = 1 }) => {
  const { sec } = useT();
  const l = sec - at;
  if (l < 0) return null;
  const drop = interpolate(l, [0, 0.35], [-900, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const swing = 20 * Math.exp(-l * 2) * Math.sin(l * 8);
  return (
    <div style={{ position: "absolute", left: x - 230 * s, top: y + drop, width: 460, height: 560, transformOrigin: "230px 0px", transform: `scale(${s}) rotate(${swing}deg)` }}>
      <svg width={460} height={560} style={{ position: "absolute" }}>
        <line x1={230} y1={0} x2={230} y2={120} stroke="#F5EFE2" strokeWidth={5} />
        <path d="M230,100 L420,200 L420,530 Q420,550 400,550 L60,550 Q40,550 40,530 L40,200 Z" fill="#FFF3C9" stroke="#C99A2E" strokeWidth={8} />
        <circle cx={230} cy={170} r={20} fill="none" stroke="#C99A2E" strokeWidth={8} />
      </svg>
      <div style={{ position: "absolute", top: 240, width: 460, textAlign: "center", fontFamily: FONT, color: "#2A1410" }}>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 3, opacity: 0.7 }}>{label}</div>
        <div style={{ fontSize: price.length > 6 ? 88 : 120, fontWeight: 700, letterSpacing: -4, lineHeight: 1.05 }}>{price}</div>
      </div>
    </div>
  );
};

export const Gauge: React.FC<{ at: number; score: number; x: number; y: number; s?: number; verdict?: string; verdictAt?: number }> = ({ at, score, x, y, s = 1, verdict, verdictAt }) => {
  const { frame, fps } = useT();
  const inS = spr(frame, fps, at);
  const needle = spr(frame, fps, verdictAt ?? at + 0.3, { damping: 8, stiffness: 70 });
  const wob = verdictAt !== undefined && frame / fps < verdictAt ? Math.sin(frame / 3) * 25 : 0;
  const ang = -90 + 180 * (score / 100) * needle + wob;
  const stamp = spr(frame, fps, (verdictAt ?? at) + 0.8, { damping: 8, stiffness: 220 });
  const R = 200;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [Math.cos(((a - 180) * Math.PI) / 180) * R, Math.sin(((a - 180) * Math.PI) / 180) * R];
    const [p0, p1] = [p(a0), p(a1)];
    return `M${p0[0]},${p0[1]} A${R},${R} 0 0 1 ${p1[0]},${p1[1]}`;
  };
  return (
    <div style={{ position: "absolute", left: x - 300, top: y - 250, width: 600, height: 420, opacity: inS, transform: `scale(${s * (0.7 + 0.3 * inS)})` }}>
      <svg width={600} height={300} viewBox="-300 -250 600 300">
        <path d={arc(0, 60)} stroke={C.red} strokeWidth={56} fill="none" />
        <path d={arc(60, 120)} stroke={C.amber} strokeWidth={56} fill="none" />
        <path d={arc(120, 180)} stroke={C.green} strokeWidth={56} fill="none" />
        <text x={-R} y={46} textAnchor="middle" fontFamily={FONT} fontSize={32} fontWeight={700} fill="#fff">BAD</text>
        <text x={R} y={46} textAnchor="middle" fontFamily={FONT} fontSize={32} fontWeight={700} fill="#fff">GOOD</text>
        <g transform={`rotate(${ang})`}><path d="M-14,0 L0,-178 L14,0 Z" fill="#fff" /></g>
        <circle r={26} fill="#fff" />
      </svg>
      {verdict && (
        <div style={{ position: "absolute", top: 310, width: 600, textAlign: "center", opacity: stamp, transform: `scale(${interpolate(stamp, [0, 1], [2.4, 1])}) rotate(-4deg)` }}>
          <span style={{ background: C.green, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 84, padding: "6px 36px", borderRadius: 20, border: "6px solid #111" }}>{verdict}</span>
        </div>
      )}
    </div>
  );
};

// Generic studio building (no real logos).
export const Studio: React.FC<{ x: number; y: number; label: string; color: string; crack?: number; s?: number }> = ({ x, y, label, color, crack = 0, s = 1 }) => (
  <svg width={W} height={H} style={{ position: "absolute", overflow: "visible" }}>
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-140} y={-220} width={280} height={220} fill={color} stroke="#111" strokeWidth={6} />
      <path d="M-160,-220 L0,-300 L160,-220 Z" fill="#2B2B3A" stroke="#111" strokeWidth={6} />
      {[...Array(6)].map((_, i) => <rect key={i} x={-110 + (i % 3) * 80} y={-190 + Math.floor(i / 3) * 70} width={50} height={44} fill="#FFE48A" stroke="#111" strokeWidth={3} />)}
      <rect x={-30} y={-60} width={60} height={60} fill="#3B2A20" stroke="#111" strokeWidth={4} />
      <text x={0} y={-238} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={34} fill="#fff">{label}</text>
      {crack > 0 && <path d="M-20,-300 L10,-230 L-25,-160 L15,-90 L-10,0" stroke="#111" strokeWidth={8 * crack} fill="none" />}
    </g>
  </svg>
);

export const Sub: React.FC<{ x: number; y: number; s?: number; light?: boolean }> = ({ x, y, s = 1, light = true }) => (
  <svg width={W} height={H} style={{ position: "absolute", overflow: "visible" }}>
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {light && <path d="M60,10 L520,-150 L520,260 Z" fill="url(#beam)" opacity={0.55} />}
      <defs><linearGradient id="beam" x1="0" x2="1"><stop offset="0" stopColor="#FFF7C2" stopOpacity={0.9} /><stop offset="1" stopColor="#FFF7C2" stopOpacity={0} /></linearGradient></defs>
      <ellipse cx={0} cy={0} rx={90} ry={62} fill="#F2C230" stroke="#111" strokeWidth={6} />
      <circle cx={42} cy={-4} r={26} fill="#7FD6FF" stroke="#111" strokeWidth={6} />
      <rect x={-70} y={-86} width={60} height={30} rx={8} fill="#F2C230" stroke="#111" strokeWidth={5} />
      <rect x={-120} y={-14} width={34} height={28} fill="#555" stroke="#111" strokeWidth={4} />
      <line x1={-40} y1={58} x2={-60} y2={80} stroke="#111" strokeWidth={6} />
      <line x1={40} y1={58} x2={60} y2={80} stroke="#111" strokeWidth={6} />
    </g>
  </svg>
);

export const Card: React.FC<{ at: number; x: number; y: number; w: number; h: number; bg?: string; children?: React.ReactNode; out?: number; rot?: number }> = ({ at, x, y, w, h, bg = "#FFFDF7", children, out, rot = 0 }) => {
  const { frame, fps, sec } = useT();
  const s = spr(frame, fps, at, { damping: 12 });
  const o = out !== undefined ? ramp(sec, out, out + 0.3, 1, 0) : 1;
  if (s <= 0.001 || o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, background: bg, borderRadius: 30, border: "6px solid #111", boxShadow: "0 14px 0 #111",
      transform: `translateY(${(1 - s) * 120}px) rotate(${rot}deg) scale(${0.8 + 0.2 * s})`, opacity: Math.min(1, s) * o, overflow: "hidden" }}>
      {children}
    </div>
  );
};
