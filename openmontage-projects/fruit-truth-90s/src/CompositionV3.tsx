import React, { useEffect, useState } from "react";
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing,
} from "remotion";
import timing from "./timing_v3.json";
import { FRUITS } from "./fruits";

// v3 — 57 s re-cut. Shorts safe zone respected:
//   nothing important below y=1480 (title/channel overlay) and nothing at x>900 below y=900
//   (like/comment/share column). Captions live at y≈1290.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FONT = "SpaceGrotesk, sans-serif";
const SERIF = "PlayfairItalic, serif";

type Sent = { role: string; text: string; start: number; end: number };
type Nutrient = { label: string; value: string; warn?: boolean };
type Seg = {
  id: string; kind: string; start: number; end: number; sentences: Sent[];
  name?: string; unit?: string; kcal?: number; score?: number; verdict?: string;
  price?: string; priceUnit?: string; nutrients?: Nutrient[];
};
type Word = { text: string; start: number; end: number; seg: string };
const SEGS = timing.segments as Seg[];
const WORDS = timing.words as Word[];
const FRUIT_SEGS = SEGS.filter((s) => s.kind === "fruit");

type Theme = { bg: string; bg2: string; ink: string; ghost: string; dark: boolean };
const THEME: Record<string, Theme> = {
  cold: { bg: "#5E2350", bg2: "#3A0F33", ink: "#FFF0F6", ghost: "#712C61", dark: true },
  hook: { bg: "#17162B", bg2: "#262448", ink: "#FFF6E8", ghost: "#2E2C55", dark: true },
  banana: { bg: "#0F5257", bg2: "#0B3F43", ink: "#FFF6E8", ghost: "#16666C", dark: true },
  mango: { bg: "#5E2350", bg2: "#47193C", ink: "#FFF0F6", ghost: "#712C61", dark: true },
  juice: { bg: "#B3261E", bg2: "#7A140F", ink: "#FFF3E6", ghost: "#C4352C", dark: true },
  blueberries: { bg: "#FFC6DA", bg2: "#FFAFCB", ink: "#1E1A4A", ghost: "#FFB3CE", dark: false },
  outro: { bg: "#17162B", bg2: "#262448", ink: "#FFF6E8", ghost: "#2E2C55", dark: true },
};
const VERDICT_COLOR = (score: number) => (score >= 75 ? "#2BB673" : score >= 45 ? "#F2A33A" : "#E5484D");

// Per-item layouts — every scene composed differently.
type ChipPos = { x: number; y: number; w: number; ax: number; ay: number };
type Layout = {
  fruit: { cx: number; cy: number; s: number };
  chips: ChipPos[];
  gauge: { x: number; y: number; s: number };
  tag: { x: number; y: number; s: number };
};
const LAYOUT: Record<string, Layout> = {
  banana: {
    fruit: { cx: 320, cy: 700, s: 1.25 },
    chips: [{ x: 560, y: 420, w: 340, ax: 420, ay: 560 }, { x: 560, y: 600, w: 340, ax: 430, ay: 680 }, { x: 560, y: 780, w: 340, ax: 420, ay: 800 }],
    gauge: { x: 40, y: 965, s: 0.8 },
    tag: { x: 590, y: 930, s: 0.72 },
  },
  mango: {
    fruit: { cx: 720, cy: 690, s: 1.15 },
    chips: [{ x: 50, y: 420, w: 340, ax: 590, ay: 560 }, { x: 50, y: 600, w: 340, ax: 560, ay: 690 }, { x: 50, y: 780, w: 340, ax: 590, ay: 800 }],
    gauge: { x: 430, y: 965, s: 0.8 },
    tag: { x: 80, y: 930, s: 0.72 },
  },
  juice: {
    fruit: { cx: 400, cy: 690, s: 1.2 },
    chips: [{ x: 680, y: 420, w: 300, ax: 520, ay: 500 }, { x: 680, y: 600, w: 300, ax: 520, ay: 690 }, { x: 680, y: 780, w: 300, ax: 520, ay: 820 }],
    gauge: { x: 40, y: 965, s: 0.8 },
    tag: { x: 590, y: 930, s: 0.72 },
  },
  blueberries: {
    fruit: { cx: 540, cy: 690, s: 1.0 },
    chips: [{ x: 40, y: 420, w: 330, ax: 400, ay: 600 }, { x: 40, y: 760, w: 330, ax: 400, ay: 780 }, { x: 710, y: 420, w: 330, ax: 680, ay: 600 }],
    gauge: { x: 316, y: 965, s: 0.8 },
    tag: { x: 720, y: 640, s: 0.66 },
  },
};

// ------------------------------------------------------------------ fonts / helpers
const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [
      new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }),
      new FontFace("PlayfairItalic", `url(${staticFile("PlayfairDisplay-Italic-latin.woff2")})`, { style: "normal" }),
    ];
    Promise.all(faces.map((f) => f.load().then((l) => document.fonts.add(l))))
      .then(() => continueRender(handle)).catch(() => continueRender(handle));
  }, [handle]);
};
const useSec = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, sec: frame / fps };
};
const sp = (frame: number, fps: number, at: number, cfg = {}) =>
  spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 13, stiffness: 140, mass: 0.8, ...cfg } });
const stroke = (w: number, c = "#111") => ({ WebkitTextStroke: `${w}px ${c}`, paintOrder: "stroke fill" as const });

// ------------------------------------------------------------------ backdrop
const Backdrop: React.FC<{ th: Theme; label: string; local: number; revealAt?: number }> = ({ th, label, local, revealAt = 0 }) => {
  const reveal = interpolate(local, [revealAt, revealAt + 0.5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const drift = local * 22;
  const row = (top: number, left: number) => (
    <div style={{ position: "absolute", top, left, whiteSpace: "nowrap", transform: "rotate(-8deg)", fontFamily: FONT, fontWeight: 700,
      fontSize: 330, letterSpacing: -12, color: th.ghost, lineHeight: 1 }}>{`${label} ${label} ${label}`}</div>
  );
  return (
    <AbsoluteFill style={{ clipPath: `circle(${reveal * 140}% at 50% 36%)`, background: `radial-gradient(circle at 50% 36%, ${th.bg} 0%, ${th.bg} 45%, ${th.bg2} 100%)` }}>
      {row(140, -200 - drift)}{row(1240, -600 + drift)}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ chip
const Chip: React.FC<{ n: Nutrient; pos: ChipPos; at: number; dark: boolean }> = ({ n, pos, at, dark }) => {
  const { frame, fps } = useSec();
  const s = sp(frame, fps, at, { damping: 11 });
  const fromLeft = pos.x < pos.ax;
  const ex = fromLeft ? pos.x + pos.w : pos.x;
  const ey = pos.y + 62;
  const col = n.warn ? "#F2A33A" : "#2BB673";
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
        <line x1={pos.ax} y1={pos.ay} x2={pos.ax + (ex - pos.ax) * s} y2={pos.ay + (ey - pos.ay) * s}
          stroke={dark ? "#FFFFFF" : "#2A1410"} strokeOpacity={0.55} strokeWidth={4} strokeDasharray="10 10" />
        <circle cx={pos.ax} cy={pos.ay} r={9 * s} fill={col} />
      </svg>
      <div style={{
        position: "absolute", left: pos.x, top: pos.y, width: pos.w, opacity: s, boxSizing: "border-box",
        transform: `translateX(${(1 - s) * (fromLeft ? -60 : 60)}px) scale(${0.7 + 0.3 * s})`, transformOrigin: fromLeft ? "right center" : "left center",
        background: "#FFFDF7", borderRadius: 26, padding: "16px 22px", boxShadow: "0 12px 0 rgba(0,0,0,0.18)",
        border: `5px solid ${col}`, fontFamily: FONT, color: "#1B1830",
      }}>
        <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7, display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: col, display: "inline-block" }} />
          {n.label}{n.warn ? " ⚠" : ""}
        </div>
        <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, whiteSpace: "nowrap" }}>{n.value}</div>
      </div>
    </>
  );
};

// ------------------------------------------------------------------ gauge
const Gauge: React.FC<{ score: number; verdict: string; at: number; ink: string; x: number; y: number; s: number }> = ({ score, verdict, at, ink, x, y, s }) => {
  const { frame, fps } = useSec();
  const inS = sp(frame, fps, at);
  const needle = sp(frame, fps, at + 0.25, { damping: 9, stiffness: 90 });
  const ang = -90 + 180 * (score / 100) * needle;
  const stamp = sp(frame, fps, at + 0.7, { damping: 8, stiffness: 200 });
  const R = 170;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [Math.cos(((a - 180) * Math.PI) / 180) * R, Math.sin(((a - 180) * Math.PI) / 180) * R];
    const [p0, p1] = [p(a0), p(a1)];
    return `M${p0[0]},${p0[1]} A${R},${R} 0 0 1 ${p1[0]},${p1[1]}`;
  };
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 560, height: 360, opacity: inS, transformOrigin: "left top",
      transform: `translateY(${(1 - inS) * 80}px) scale(${s})` }}>
      <svg width={560} height={260} viewBox="-280 -220 560 260">
        <path d={arc(0, 60)} stroke="#E5484D" strokeWidth={46} fill="none" />
        <path d={arc(60, 120)} stroke="#F2A33A" strokeWidth={46} fill="none" />
        <path d={arc(120, 180)} stroke="#2BB673" strokeWidth={46} fill="none" />
        <text x={-R} y={36} textAnchor="middle" fontFamily={FONT} fontSize={26} fontWeight={700} fill={ink} opacity={0.75}>BAD</text>
        <text x={R} y={36} textAnchor="middle" fontFamily={FONT} fontSize={26} fontWeight={700} fill={ink} opacity={0.75}>GOOD</text>
        <g transform={`rotate(${ang})`}><path d="M-12,0 L0,-150 L12,0 Z" fill={ink} /></g>
        <circle r={22} fill={ink} />
      </svg>
      <div style={{ position: "absolute", left: 0, width: 560, top: 268, textAlign: "center", fontFamily: FONT, fontWeight: 700,
        fontSize: verdict.length > 6 ? 62 : 84, color: "#fff", letterSpacing: 1, opacity: stamp,
        transform: `scale(${interpolate(stamp, [0, 1], [2.2, 1])}) rotate(-3deg)` }}>
        <span style={{ background: VERDICT_COLOR(score), padding: "8px 30px", borderRadius: 18, boxShadow: "0 10px 0 rgba(0,0,0,0.25)", border: "4px solid #111" }}>{verdict}</span>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ price tag
const PriceTag: React.FC<{ price: string; unit: string; at: number; dark: boolean; x: number; y: number; s: number }> = ({ price, unit, at, dark, x, y, s }) => {
  const { sec } = useSec();
  const local = sec - at;
  if (local < 0) return null;
  const drop = interpolate(local, [0, 0.35], [-800, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const swing = 22 * Math.exp(-local * 2.2) * Math.sin(local * 9);
  return (
    <div style={{ position: "absolute", left: x, top: y + drop, width: 360, height: 460, transformOrigin: "180px 0px", transform: `rotate(${swing}deg) scale(${s})` }}>
      <svg width={360} height={460} style={{ position: "absolute" }}>
        <line x1={180} y1={0} x2={180} y2={110} stroke={dark ? "#FFF6E8" : "#2A1410"} strokeWidth={4} />
        <path d="M180,90 L320,170 L320,430 Q320,446 304,446 L56,446 Q40,446 40,430 L40,170 Z" fill="#FFF3C9" stroke="#C99A2E" strokeWidth={6} />
        <circle cx={180} cy={150} r={16} fill="none" stroke="#C99A2E" strokeWidth={6} />
      </svg>
      <div style={{ position: "absolute", top: 200, width: 360, textAlign: "center", fontFamily: FONT, color: "#2A1410" }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 3, opacity: 0.65 }}>US AVG ≈</div>
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>{price}</div>
        <div style={{ fontSize: 34, fontWeight: 500 }}>{unit}</div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ header (with source line)
const Header: React.FC<{ idx: number; ink: string; seg?: Seg; at: number }> = ({ idx, ink, seg, at }) => {
  const { frame, fps } = useSec();
  const s = sp(frame, fps, at, { damping: 12 });
  return (
    <>
      <div style={{ position: "absolute", top: 110, left: 70, right: 70, display: "flex", justifyContent: "space-between", fontFamily: FONT, color: ink, fontSize: 32, fontWeight: 700, letterSpacing: 4 }}>
        <span>GOOD OR BAD?</span>
        <span style={{ display: "flex", gap: 10 }}>
          {FRUIT_SEGS.map((_, n) => (
            <span key={n} style={{ width: 22, height: 22, borderRadius: 11, background: ink, opacity: n < idx ? 1 : 0.25, display: "inline-block", marginTop: 6 }} />
          ))}
        </span>
      </div>
      {seg && (
        <div style={{ position: "absolute", top: 175, left: 0, width: 1080, textAlign: "center", fontFamily: FONT, color: ink,
          transform: `translateY(${(1 - s) * -60}px)`, opacity: s }}>
          <div style={{ fontSize: seg.name!.length > 8 ? 104 : 120, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>{seg.name}</div>
          <div style={{ fontSize: 32, fontWeight: 500, opacity: 0.85, marginTop: 8 }}>{seg.unit} · {seg.kcal} kcal</div>
          <div style={{ fontSize: 22, fontWeight: 500, opacity: 0.6, marginTop: 4, letterSpacing: 1 }}>SOURCE: USDA FOODDATA CENTRAL</div>
        </div>
      )}
    </>
  );
};

// ------------------------------------------------------------------ knife slash
// Keep in sync with build_mix.py (SFX schedule).
const SLASH_LEAD = 0.15;
const SLASH_TO_OPEN = 0.24;
const SLASH_ANGLE: Record<string, number> = { banana: -62, mango: 48, juice: -20, blueberries: 28, cold: 32 };
const JUICE: Record<string, string> = { banana: "#F7D35C", mango: "#FFB300", juice: "#FF9800", blueberries: "#7B3FB0", cold: "#FFB300" };
const KnifeSlash: React.FC<{ at: number; angle: number; juice: string; cx: number; cy: number; size?: number }> = ({ at, angle, juice, cx, cy, size = 1 }) => {
  const { sec } = useSec();
  const l = sec - at;
  if (l < -0.05 || l > 1.3) return null;
  const SWIPE = 0.2;
  const L = 330 * size;
  const k = interpolate(l, [0, SWIPE], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const tipX = -L + 2 * L * k;
  const tailX = -L + 2 * L * interpolate(l, [0.06, SWIPE + 0.12], [0, 1], clamp);
  const trailO = interpolate(l, [0, 0.05, SWIPE + 0.1, SWIPE + 0.35], [0, 1, 1, 0], clamp);
  const knifeO = interpolate(l, [0, 0.03, SWIPE, SWIPE + 0.12], [0, 1, 1, 0], clamp);
  const flash = interpolate(l, [SWIPE * 0.5, SWIPE * 0.7, SWIPE + 0.2], [0, 0.9, 0], clamp);
  const tt = Math.max(0, l - SWIPE * 0.6);
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} width={1080} height={1920}>
      <defs>
        <linearGradient id="trail" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0} /><stop offset="0.7" stopColor="#fff" stopOpacity={0.85} /><stop offset="1" stopColor="#fff" stopOpacity={1} />
        </linearGradient>
      </defs>
      <g transform={`translate(${cx} ${cy}) rotate(${angle})`}>
        <g transform={`rotate(${-angle})`}>
          {[...Array(18)].map((_, i) => {
            const side = i % 2 ? 1 : -1;
            const a = ((90 * side + (((i * 37) % 60) - 30)) * Math.PI) / 180;
            const speed = (380 + ((i * 53) % 260)) * size;
            const x0 = (((i * 29) % 200) - 100) * size;
            return <circle key={i} cx={x0 + Math.cos(a) * speed * tt} cy={Math.sin(a) * speed * tt + 900 * tt * tt} r={(7 + ((i * 13) % 12)) * size}
              fill={juice} opacity={tt > 0 ? interpolate(tt, [0, 0.5, 0.9], [1, 1, 0], clamp) : 0} stroke="#00000044" strokeWidth={3} />;
          })}
        </g>
        <polygon points={`${tailX},0 ${tipX},-15 ${tipX + 16},0 ${tipX},15`} fill="url(#trail)" opacity={trailO} style={{ filter: "drop-shadow(0 0 14px rgba(255,255,255,0.9))" }} />
        <line x1={-L} y1={0} x2={L} y2={0} stroke="#fff" strokeWidth={4} opacity={flash} />
        <g transform={`translate(${tipX} 0) scale(${1.7 * size})`} opacity={knifeO}>
          <path d="M14,-4 L-150,-24 L-160,-4 L-150,6 Z" fill="#E8EEF2" stroke="#9AA6AE" strokeWidth={3} />
          <path d="M14,-4 L-150,-24 L-150,-14 Z" fill="#FFFFFF" opacity={0.8} />
          <rect x={-250} y={-16} width={92} height={26} rx={10} fill="#3B2A20" />
          <circle cx={-228} cy={-3} r={4} fill="#C9A86A" /><circle cx={-190} cy={-3} r={4} fill="#C9A86A" />
        </g>
      </g>
    </svg>
  );
};

// A fruit drawn into its 400-box, positioned by visual centre (cx, cy) and scale.
const FruitAt: React.FC<{ id: string; cx: number; cy: number; s: number; p: number; t: number; dx?: number; dy?: number; sx?: number; sy?: number }> =
  ({ id, cx, cy, s, p, t, dx = 0, dy = 0, sx = 1, sy = 1 }) => {
    const F = FRUITS[id];
    return (
      <div style={{ position: "absolute", left: cx - 200, top: cy - 200, width: 400, height: 400,
        transform: `translate(${dx}px, ${dy}px) scale(${s * sx}, ${s * sy})`, transformOrigin: "50% 50%" }}>
        <svg width={400} height={400} viewBox="0 0 400 400" style={{ overflow: "visible" }}><F p={p} t={t} /></svg>
      </div>
    );
  };

// ------------------------------------------------------------------ COLD OPEN (frame 0 = loop target)
const COLD_SLASH = 0.1;
const ColdVisual: React.FC<{ local: number; still?: boolean }> = ({ local, still }) => {
  const { fps } = useSec();
  const l = still ? 0 : local;
  const open = interpolate(l, [COLD_SLASH + SLASH_TO_OPEN, COLD_SLASH + SLASH_TO_OPEN + 1.0], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const hit = l > COLD_SLASH + 0.12 ? Math.exp(-(l - COLD_SLASH - 0.12) * 9) * Math.sin((l - COLD_SLASH) * 70) * 14 : 0;
  const txt = spring({ frame: Math.round((l - 0.42) * fps), fps, config: { damping: 8, stiffness: 220 } });
  const zoom = 1 + 0.04 * l;
  return (
    <AbsoluteFill>
      <Backdrop th={THEME.cold} label="SUGAR" local={l + 1} />
      <FruitAt id="mango" cx={540} cy={850} s={1.5 * zoom} p={open} t={l} dx={hit} />
      {!still && <KnifeSlash at={COLD_SLASH} angle={SLASH_ANGLE.cold} juice={JUICE.cold} cx={540} cy={850} size={1.3} />}
      <div style={{ position: "absolute", top: 190, width: 1080, textAlign: "center", fontFamily: FONT, fontWeight: 700, lineHeight: 0.9,
        opacity: txt, transform: `scale(${interpolate(txt, [0, 1], [2.6, 1])}) rotate(-4deg)` }}>
        <div style={{ fontSize: 220, color: "#FFE03D", letterSpacing: -8, ...stroke(14), textShadow: "0 14px 0 #111" }}>45g</div>
        <div style={{ fontSize: 150, color: "#fff", letterSpacing: -6, ...stroke(12), textShadow: "0 12px 0 #E5484D" }}>SUGAR?!</div>
      </div>
    </AbsoluteFill>
  );
};
const ColdScene: React.FC = () => {
  const { sec } = useSec();
  return <ColdVisual local={sec} />;
};

// ------------------------------------------------------------------ HOOK
const MINI = ["banana", "mango", "juice", "blueberries"];
const HookScene: React.FC<{ seg: Seg; offset: number }> = ({ seg, offset }) => {
  const { frame, fps, sec } = useSec();
  const th = THEME.hook;
  const rel = (abs: number) => abs - seg.start + offset;
  const w = WORDS.filter((x) => x.seg === "hook");
  const at = (word: string) => rel((w.find((x) => x.text.toLowerCase().startsWith(word)) ?? w[0]).start);
  const four = sp(frame, fps, at("four"), { damping: 10 });
  const good = sp(frame, fps, at("good"), { damping: 8, stiffness: 220 });
  const or = sp(frame, fps, at("or"), { damping: 10 });
  const bad = sp(frame, fps, at("bad"), { damping: 8, stiffness: 220 });
  const cost = sp(frame, fps, at("cost"), { damping: 11 });
  return (
    <AbsoluteFill>
      <Backdrop th={th} label="FRUIT" local={sec} />
      <div style={{ position: "absolute", top: 190, width: 1080, textAlign: "center", fontFamily: FONT, color: th.ink }}>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: 8, opacity: four, transform: `translateY(${(1 - four) * -30}px)` }}>4 FRUITS</div>
        <div style={{ fontSize: 220, fontWeight: 700, letterSpacing: -10, lineHeight: 0.95, color: "#2BB673", ...stroke(8), transform: `scale(${interpolate(good, [0, 1], [2.4, 1])})`, opacity: good }}>GOOD</div>
        <div style={{ fontFamily: SERIF, fontSize: 110, lineHeight: 1, opacity: or, transform: `rotate(${(1 - or) * 30}deg)` }}>or</div>
        <div style={{ fontSize: 220, fontWeight: 700, letterSpacing: -10, lineHeight: 0.95, color: "#E5484D", ...stroke(8), transform: `scale(${interpolate(bad, [0, 1], [2.4, 1])}) rotate(${(1 - bad) * -10}deg)`, opacity: bad }}>BAD?</div>
        <div style={{ marginTop: 30, fontSize: 56, fontWeight: 700, opacity: cost, transform: `translateY(${(1 - cost) * 40}px)` }}>
          <span style={{ background: "#FFF3C9", color: "#2A1410", padding: "10px 30px", borderRadius: 20 }}>+ what it really costs $</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1010, left: 110, width: 780, display: "flex", justifyContent: "space-between" }}>
        {MINI.map((id, i) => {
          const F = FRUITS[id];
          const s = sp(frame, fps, rel(seg.start) + 0.12 * i, { damping: 8, stiffness: 160 });
          return (
            <div key={id} style={{ width: 170, height: 170, transform: `translateY(${(1 - s) * -900 + Math.sin(sec * 5 + i) * 6}px)` }}>
              <svg width={170} height={170} viewBox="0 0 400 400" style={{ overflow: "visible" }}><F p={0} t={sec} /></svg>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ FRUIT SCENE
const FruitScene: React.FC<{ seg: Seg; idx: number; offset: number }> = ({ seg, idx, offset }) => {
  const { frame, fps, sec } = useSec();
  const th = THEME[seg.id];
  const L = LAYOUT[seg.id];
  const rel = (abs: number) => abs - seg.start + offset;
  const r = Object.fromEntries(seg.sentences.map((s) => [s.role, s])) as Record<string, Sent>;
  const enter = sp(frame, fps, rel(r.intro.start) - 0.1, { damping: 9, stiffness: 120 });
  const slashAt = rel(r.nutr.start) - SLASH_LEAD;
  const openAt = slashAt + SLASH_TO_OPEN;
  const decon = interpolate(sec, [openAt, openAt + (seg.id === "juice" ? 2.4 : 1.4)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const hit = sec > slashAt + 0.12 ? Math.exp(-(sec - slashAt - 0.12) * 9) * Math.sin((sec - slashAt) * 70) * 10 : 0;
  const squash = 1 + 0.12 * Math.sin(Math.min(1, enter) * Math.PI) * (1 - Math.min(1, sec / 1.2));
  const nd = r.nutr.end - r.nutr.start;
  const villain = seg.id === "juice";
  const alarm = villain ? interpolate(sec, [rel(r.verdict.start) + 0.6, rel(r.verdict.start) + 0.8], [0, 1], clamp) * (0.5 + 0.5 * Math.sin(sec * 12)) : 0;
  return (
    <AbsoluteFill>
      <Backdrop th={th} label={seg.name!.toUpperCase()} local={sec} />
      {villain && <AbsoluteFill style={{ boxShadow: `inset 0 0 160px 40px rgba(255,0,0,${0.55 * alarm})` }} />}
      <Header idx={idx} ink={th.ink} seg={seg} at={rel(r.intro.start)} />
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(1 - enter) * -700}px)` }}>
        <FruitAt id={seg.id} cx={L.fruit.cx} cy={L.fruit.cy} s={L.fruit.s * Math.min(1, enter + 0.0001)} p={decon} t={sec} dx={hit} sx={1 / squash} sy={squash} />
      </div>
      <KnifeSlash at={slashAt} angle={SLASH_ANGLE[seg.id]} juice={JUICE[seg.id]} cx={L.fruit.cx} cy={L.fruit.cy} size={0.9} />
      {seg.nutrients!.map((n, i) => (
        <Chip key={i} n={n} pos={L.chips[i]} at={rel(r.nutr.start) + 0.45 + (i * Math.max(0.6, nd - 0.7)) / 3} dark={th.dark} />
      ))}
      <Gauge score={seg.score!} verdict={seg.verdict!} at={rel(r.verdict.start)} ink={th.ink} {...L.gauge} />
      <PriceTag price={seg.price!} unit={seg.priceUnit!} at={rel(r.price.start)} dark={th.dark} {...L.tag} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ OUTRO → loops into the cold open
const OutroScene: React.FC<{ seg: Seg; offset: number }> = ({ seg, offset }) => {
  const { frame, fps, sec } = useSec();
  const th = THEME.outro;
  const ranked = [...FRUIT_SEGS].sort((a, b) => b.score! - a.score!);
  const rel = (abs: number) => abs - seg.start + offset;
  const follow = sp(frame, fps, rel(seg.sentences[0].start) + 0.1, { damping: 10 });
  const loopAt = rel(seg.sentences[1].start) - 0.1;
  const reveal = interpolate(sec, [loopAt, loopAt + 0.45], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <Backdrop th={th} label="RANKED" local={sec} />
      <div style={{ position: "absolute", top: 180, width: 1080, textAlign: "center", fontFamily: FONT, color: th.ink, fontSize: 92, fontWeight: 700, letterSpacing: -3 }}>THE RANKING</div>
      {ranked.map((s, i) => {
        const F = FRUITS[s.id];
        const k = sp(frame, fps, 0.1 * (ranked.length - i), { damping: 14 });
        return (
          <div key={s.id} style={{ position: "absolute", left: 70, top: 330 + i * 165, width: 820, height: 145, display: "flex", alignItems: "center", gap: 20, opacity: k }}>
            <div style={{ width: 130, height: 130, position: "relative" }}>
              <svg width={130} height={130} viewBox="0 0 400 400" style={{ overflow: "visible" }}><F p={0} t={sec} /></svg>
              {i === 0 && <div style={{ position: "absolute", top: -48, left: 32, fontSize: 60, transform: `scale(${sp(frame, fps, 0.7, { damping: 7 })})` }}>👑</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, color: th.ink, fontSize: 40, fontWeight: 700 }}>
                {i + 1}. {s.name} <span style={{ opacity: 0.6, fontWeight: 500, fontSize: 30 }}>{s.price} {s.priceUnit}</span>
                {s.score! < 45 && <span style={{ marginLeft: 12, background: "#E5484D", color: "#fff", fontSize: 26, padding: "2px 12px", borderRadius: 10 }}>BAD</span>}
              </div>
              <div style={{ height: 30, borderRadius: 15, background: "#ffffff22", marginTop: 8 }}>
                <div style={{ height: 30, borderRadius: 15, width: `${s.score! * k}%`, background: VERDICT_COLOR(s.score!) }} />
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 1030, width: 1080, textAlign: "center", fontFamily: FONT, opacity: follow, transform: `scale(${0.6 + 0.4 * follow})` }}>
        <span style={{ background: "#E5484D", color: "#fff", fontSize: 56, fontWeight: 700, padding: "18px 40px", borderRadius: 24, border: "5px solid #111" }}>FOLLOW → PART 2: VEGGIES</span>
      </div>
      {/* seamless loop: wipe back to the exact frame-0 picture */}
      {reveal > 0 && (
        <AbsoluteFill style={{ clipPath: `circle(${reveal * 140}% at 50% 40%)` }}>
          <ColdVisual local={0} still />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ captions (safe-zone: y≈1290)
type Group = { words: Word[]; start: number; end: number };
const GROUPS: Group[] = (() => {
  const out: Group[] = [];
  let cur: Word[] = [];
  WORDS.forEach((w, i) => {
    cur.push(w);
    const next = WORDS[i + 1];
    if (/[.?!:,]$/.test(w.text) || cur.length >= 3 || !next || next.seg !== w.seg) {
      out.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = [];
    }
  });
  return out;
})();
const HOT: Record<string, string> = {
  "good.": "#2BB673", "good,": "#2BB673", good: "#2BB673", "excellent.": "#2BB673",
  watch: "#F2A33A", "out.": "#F2A33A", "bad,": "#E5484D", "bad?": "#E5484D", bad: "#E5484D",
  sugar: "#FFB300", "sugar.": "#FFB300", soda: "#E5484D", "soda.": "#E5484D",
};
const Captions: React.FC = () => {
  const { sec } = useSec();
  const g = GROUPS.find((x, i) => sec >= x.start - 0.05 && sec < (GROUPS[i + 1]?.start ?? x.end + 0.6) - 0.05 && sec < x.end + 0.6);
  if (!g) return null;
  const pop = interpolate(sec, [g.start - 0.05, g.start + 0.08], [0.85, 1], clamp);
  return (
    <div style={{ position: "absolute", top: 1290, left: 60, width: 840, textAlign: "center", background: "rgba(10,10,20,0.6)", borderRadius: 28,
      padding: "12px 10px 4px", fontFamily: FONT, fontWeight: 700, fontSize: 70, lineHeight: 1.1, letterSpacing: -1, transform: `scale(${pop})` }}>
      {g.words.map((w, i) => {
        const active = sec >= w.start && sec < w.end + 0.02;
        const hot = HOT[w.text.toLowerCase()];
        return (
          <span key={i} style={{ color: hot ?? (active ? "#FFE03D" : "#FFFFFF"), ...stroke(3), textShadow: "0 6px 0 rgba(0,0,0,0.45)",
            marginRight: 16, display: "inline-block", transform: active ? "translateY(-6px) scale(1.06)" : "none" }}>{w.text.toUpperCase()}</span>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ root
const LEAD = 0.35;
export const FruitShortV3: React.FC = () => {
  useFonts();
  const { fps } = useVideoConfig();
  let idx = 0;
  return (
    <AbsoluteFill style={{ background: "#17162B" }}>
      {SEGS.map((seg, i) => {
        const from = i === 0 ? 0 : Math.round((seg.start - LEAD) * fps);
        const next = SEGS[i + 1];
        const to = next ? Math.round((next.start - LEAD) * fps) + 20 : timing.durationInFrames;
        const offset = LEAD;
        let el: React.ReactNode;
        if (seg.kind === "cold") el = <ColdScene />;
        else if (seg.kind === "hook") el = <HookScene seg={seg} offset={offset} />;
        else if (seg.kind === "outro") el = <OutroScene seg={seg} offset={offset} />;
        else { idx += 1; el = <FruitScene seg={seg} idx={idx} offset={offset} />; }
        return <Sequence key={seg.id} from={from} durationInFrames={to - from} name={seg.id}>{el}</Sequence>;
      })}
      <Captions />
      <Audio src={staticFile("mix_v3.wav")} />
    </AbsoluteFill>
  );
};
