import React, { useEffect, useState } from "react";
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing,
} from "remotion";
import timing from "./timing.json";
import { FRUITS } from "./fruits";

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

const THEME: Record<string, { bg: string; bg2: string; ink: string; ghost: string; dark: boolean }> = {
  hook: { bg: "#17162B", bg2: "#262448", ink: "#FFF6E8", ghost: "#2E2C55", dark: true },
  banana: { bg: "#0F5257", bg2: "#0B3F43", ink: "#FFF6E8", ghost: "#16666C", dark: true },
  apple: { bg: "#FFE3CF", bg2: "#FFD2B3", ink: "#2A1410", ghost: "#FFD0B0", dark: false },
  avocado: { bg: "#3A271C", bg2: "#2A1C14", ink: "#F6F1DE", ghost: "#4A3326", dark: true },
  blueberries: { bg: "#FFC6DA", bg2: "#FFAFCB", ink: "#1E1A4A", ghost: "#FFB3CE", dark: false },
  orange: { bg: "#1D3B8F", bg2: "#152C6E", ink: "#FFF6E8", ghost: "#264AA6", dark: true },
  mango: { bg: "#5E2350", bg2: "#47193C", ink: "#FFF0F6", ghost: "#712C61", dark: true },
  outro: { bg: "#17162B", bg2: "#262448", ink: "#FFF6E8", ghost: "#2E2C55", dark: true },
};
const VERDICT_COLOR = (score: number) => (score >= 75 ? "#2BB673" : score >= 65 ? "#F2A33A" : "#E5484D");

// ------------------------------------------------------------------ fonts
const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [
      new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }),
      new FontFace("PlayfairItalic", `url(${staticFile("PlayfairDisplay-Italic-latin.woff2")})`, { style: "normal" }),
    ];
    Promise.all(faces.map((f) => f.load().then((l) => document.fonts.add(l))))
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
};

// ------------------------------------------------------------------ helpers
const useSec = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps, sec: frame / fps };
};
const sp = (frame: number, fps: number, at: number, cfg = {}) =>
  spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 13, stiffness: 140, mass: 0.8, ...cfg } });

// ------------------------------------------------------------------ backdrop
const Backdrop: React.FC<{ id: string; label: string; local: number }> = ({ id, label, local }) => {
  const th = THEME[id];
  const reveal = interpolate(local, [0, 0.55], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const drift = local * 22;
  return (
    <AbsoluteFill style={{ clipPath: `circle(${reveal * 140}% at 50% 36%)`, background: `radial-gradient(circle at 50% 36%, ${th.bg} 0%, ${th.bg} 45%, ${th.bg2} 100%)` }}>
      <div style={{ position: "absolute", top: 120, left: -200 - drift, whiteSpace: "nowrap", transform: "rotate(-8deg)",
        fontFamily: FONT, fontWeight: 700, fontSize: 330, letterSpacing: -12, color: th.ghost, lineHeight: 1 }}>
        {`${label} ${label} ${label}`}
      </div>
      <div style={{ position: "absolute", top: 1240, left: -600 + drift, whiteSpace: "nowrap", transform: "rotate(-8deg)",
        fontFamily: FONT, fontWeight: 700, fontSize: 330, letterSpacing: -12, color: th.ghost, lineHeight: 1 }}>
        {`${label} ${label} ${label}`}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ chips
const CHIP_POS = [
  { x: 70, y: 400, ax: 390, ay: 600 },
  { x: 610, y: 400, ax: 690, ay: 600 },
  { x: 70, y: 1010, ax: 380, ay: 930 },
  { x: 610, y: 1010, ax: 700, ay: 930 },
];
const Chip: React.FC<{ n: Nutrient; i: number; at: number; dark: boolean }> = ({ n, i, at, dark }) => {
  const { frame, fps } = useSec();
  const s = sp(frame, fps, at, { damping: 11 });
  const pos = CHIP_POS[i];
  const left = i % 2 === 0;
  const fromX = left ? -60 : 60;
  const line = interpolate(s, [0, 1], [0, 1], clamp);
  const ex = pos.x + (left ? 400 : 0);
  const ey = pos.y + 60;
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0 }} width={1080} height={1920}>
        <line x1={pos.ax} y1={pos.ay} x2={pos.ax + (ex - pos.ax) * line} y2={pos.ay + (ey - pos.ay) * line}
          stroke={dark ? "#FFFFFF" : "#2A1410"} strokeOpacity={0.55} strokeWidth={4} strokeDasharray="10 10" />
        <circle cx={pos.ax} cy={pos.ay} r={9 * s} fill={n.warn ? "#F2A33A" : "#2BB673"} />
      </svg>
      <div style={{
        position: "absolute", left: pos.x, top: pos.y, width: 400, opacity: s,
        transform: `translateX(${(1 - s) * fromX}px) scale(${0.7 + 0.3 * s})`, transformOrigin: left ? "right center" : "left center",
        background: "#FFFDF7", borderRadius: 28, padding: "20px 26px", boxShadow: "0 14px 0 rgba(0,0,0,0.18)",
        border: `5px solid ${n.warn ? "#F2A33A" : "#2BB673"}`, fontFamily: FONT, color: "#1B1830",
      }}>
        <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", opacity: 0.7, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ width: 16, height: 16, borderRadius: 8, background: n.warn ? "#F2A33A" : "#2BB673", display: "inline-block" }} />
          {n.label}{n.warn ? " ⚠" : ""}
        </div>
        <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>{n.value}</div>
      </div>
    </>
  );
};

// ------------------------------------------------------------------ verdict gauge
const Gauge: React.FC<{ score: number; verdict: string; at: number; ink: string }> = ({ score, verdict, at, ink }) => {
  const { frame, fps } = useSec();
  const inS = sp(frame, fps, at);
  const needle = sp(frame, fps, at + 0.25, { damping: 9, stiffness: 90 });
  const ang = -90 + 180 * (score / 100) * needle;
  const stamp = sp(frame, fps, at + 0.7, { damping: 8, stiffness: 200 });
  const col = VERDICT_COLOR(score);
  const R = 170;
  const arc = (a0: number, a1: number) => {
    const p0 = [Math.cos(((a0 - 180) * Math.PI) / 180) * R, Math.sin(((a0 - 180) * Math.PI) / 180) * R];
    const p1 = [Math.cos(((a1 - 180) * Math.PI) / 180) * R, Math.sin(((a1 - 180) * Math.PI) / 180) * R];
    return `M${p0[0]},${p0[1]} A${R},${R} 0 0 1 ${p1[0]},${p1[1]}`;
  };
  return (
    <div style={{ position: "absolute", left: 50, top: 1175, width: 560, height: 360, opacity: inS, transform: `translateY(${(1 - inS) * 80}px)` }}>
      <svg width={560} height={260} viewBox="-280 -220 560 260">
        <path d={arc(0, 60)} stroke="#E5484D" strokeWidth={46} fill="none" />
        <path d={arc(60, 120)} stroke="#F2A33A" strokeWidth={46} fill="none" />
        <path d={arc(120, 180)} stroke="#2BB673" strokeWidth={46} fill="none" />
        <text x={-R} y={36} textAnchor="middle" fontFamily={FONT} fontSize={26} fontWeight={700} fill={ink} opacity={0.75}>BAD</text>
        <text x={R} y={36} textAnchor="middle" fontFamily={FONT} fontSize={26} fontWeight={700} fill={ink} opacity={0.75}>GOOD</text>
        <g transform={`rotate(${ang})`}>
          <path d="M-12,0 L0,-150 L12,0 Z" fill={ink} />
        </g>
        <circle r={22} fill={ink} />
      </svg>
      <div style={{
        position: "absolute", left: 0, width: 560, top: 268, textAlign: "center", fontFamily: FONT, fontWeight: 700,
        fontSize: verdict.length > 10 ? 50 : 70, color: "#fff", letterSpacing: 1,
        transform: `scale(${interpolate(stamp, [0, 1], [2.2, 1])}) rotate(-3deg)`, opacity: stamp,
      }}>
        <span style={{ background: col, padding: "8px 26px", borderRadius: 18, boxShadow: "0 10px 0 rgba(0,0,0,0.2)" }}>{verdict}</span>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ price tag (swinging)
const PriceTag: React.FC<{ price: string; unit: string; at: number; dark: boolean }> = ({ price, unit, at, dark }) => {
  const { sec } = useSec();
  const local = sec - at;
  if (local < 0) return null;
  const drop = interpolate(local, [0, 0.35], [-700, 0], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
  const swing = 22 * Math.exp(-local * 2.2) * Math.sin(local * 9);
  const string = dark ? "#FFF6E8" : "#2A1410";
  return (
    <div style={{ position: "absolute", left: 660, top: 1165 + drop, width: 360, height: 460, transformOrigin: "180px 0px", transform: `rotate(${swing}deg) scale(0.86)` }}>
      <svg width={360} height={460} style={{ position: "absolute" }}>
        <line x1={180} y1={0} x2={180} y2={110} stroke={string} strokeWidth={4} />
        <path d="M180,90 L320,170 L320,430 Q320,446 304,446 L56,446 Q40,446 40,430 L40,170 Z" fill="#FFF3C9" stroke="#C99A2E" strokeWidth={6} />
        <circle cx={180} cy={150} r={16} fill={dark ? "#0000" : "#0000"} stroke="#C99A2E" strokeWidth={6} />
      </svg>
      <div style={{ position: "absolute", top: 200, width: 360, textAlign: "center", fontFamily: FONT, color: "#2A1410" }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 3, opacity: 0.65 }}>US AVG ≈</div>
        <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>{price}</div>
        <div style={{ fontSize: 34, fontWeight: 500 }}>{unit}</div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ header
const Header: React.FC<{ idx: number; ink: string; name?: string; unit?: string; kcal?: number; at: number }> = ({ idx, ink, name, unit, kcal, at }) => {
  const { frame, fps } = useSec();
  const s = sp(frame, fps, at, { damping: 12 });
  return (
    <>
      <div style={{ position: "absolute", top: 90, left: 70, right: 70, display: "flex", justifyContent: "space-between", fontFamily: FONT, color: ink, fontSize: 32, fontWeight: 700, letterSpacing: 4 }}>
        <span>GOOD OR BAD?</span>
        <span style={{ display: "flex", gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} style={{ width: 22, height: 22, borderRadius: 11, background: ink, opacity: n <= idx ? 1 : 0.25, display: "inline-block", marginTop: 6 }} />
          ))}
        </span>
      </div>
      {name && (
        <div style={{ position: "absolute", top: 160, left: 0, width: 1080, textAlign: "center", fontFamily: FONT, color: ink,
          transform: `translateY(${(1 - s) * -60}px)`, opacity: s }}>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>{name}</div>
          <div style={{ fontSize: 34, fontWeight: 500, opacity: 0.8, marginTop: 8 }}>{unit} · {kcal} kcal</div>
        </div>
      )}
    </>
  );
};

// ------------------------------------------------------------------ knife slash (Fruit-Ninja style)
// Keep in sync with build_mix.py (SFX schedule).
const SLASH_LEAD = 0.15;     // slash starts this long before the nutrition line
const SLASH_TO_OPEN = 0.24;  // fruit opens this long after the slash starts
const SLASH_ANGLE: Record<string, number> = { banana: -62, apple: -8, avocado: -80, blueberries: 28, orange: -35, mango: 48 };
const JUICE: Record<string, string> = { banana: "#F7D35C", apple: "#F2B45C", avocado: "#B9D86E", blueberries: "#7B3FB0", orange: "#FFA62B", mango: "#FFB300" };
const KnifeSlash: React.FC<{ at: number; angle: number; juice: string; cy: number }> = ({ at, angle, juice, cy }) => {
  const { sec } = useSec();
  const l = sec - at;
  if (l < -0.05 || l > 1.3) return null;
  const SWIPE = 0.2;
  const L = 330;
  const k = interpolate(l, [0, SWIPE], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const tipX = -L + 2 * L * k;
  const tailX = -L + 2 * L * interpolate(l, [0.06, SWIPE + 0.12], [0, 1], clamp);
  const trailO = interpolate(l, [0, 0.05, SWIPE + 0.1, SWIPE + 0.35], [0, 1, 1, 0], clamp);
  const knifeO = interpolate(l, [0, 0.03, SWIPE, SWIPE + 0.12], [0, 1, 1, 0], clamp);
  const flash = interpolate(l, [SWIPE * 0.5, SWIPE * 0.7, SWIPE + 0.2], [0, 0.9, 0], clamp);
  const drops = [...Array(16)].map((_, i) => {
    const side = i % 2 ? 1 : -1;
    const spread = ((i * 37) % 60) - 30;
    const speed = 380 + ((i * 53) % 260);
    const a = ((90 * side + spread) * Math.PI) / 180;
    const tt = Math.max(0, l - SWIPE * 0.6);
    const x0 = (((i * 29) % 200) - 100);
    const x = x0 + Math.cos(a) * speed * tt;
    const y = Math.sin(a) * speed * tt;
    const r = 7 + ((i * 13) % 12);
    return { x, y, r, o: tt > 0 ? interpolate(tt, [0, 0.5, 0.9], [1, 1, 0], clamp) : 0 };
  });
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} width={1080} height={1920}>
      <defs>
        <linearGradient id="trail" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.7" stopColor="#fff" stopOpacity={0.85} />
          <stop offset="1" stopColor="#fff" stopOpacity={1} />
        </linearGradient>
      </defs>
      <g transform={`translate(540 ${cy}) rotate(${angle})`}>
        {/* juice splatter (gravity is applied in screen space via counter-rotation) */}
        <g transform={`rotate(${-angle})`}>
          {drops.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y + 900 * Math.max(0, l - SWIPE * 0.6) ** 2} r={d.r} fill={juice} opacity={d.o} stroke="#00000044" strokeWidth={3} />
          ))}
        </g>
        {/* glowing slash trail, tapered */}
        <polygon points={`${tailX},0 ${tipX},-15 ${tipX + 16},0 ${tipX},15`} fill="url(#trail)" opacity={trailO}
          style={{ filter: "drop-shadow(0 0 14px rgba(255,255,255,0.9))" }} />
        <line x1={-L} y1={0} x2={L} y2={0} stroke="#fff" strokeWidth={4} opacity={flash} />
        {/* the knife */}
        <g transform={`translate(${tipX} 0) scale(1.7)`} opacity={knifeO}>
          <path d="M14,-4 L-150,-24 L-160,-4 L-150,6 Z" fill="#E8EEF2" stroke="#9AA6AE" strokeWidth={3} />
          <path d="M14,-4 L-150,-24 L-150,-14 Z" fill="#FFFFFF" opacity={0.8} />
          <rect x={-250} y={-16} width={92} height={26} rx={10} fill="#3B2A20" />
          <circle cx={-228} cy={-3} r={4} fill="#C9A86A" /><circle cx={-190} cy={-3} r={4} fill="#C9A86A" />
        </g>
      </g>
    </svg>
  );
};

// ------------------------------------------------------------------ fruit scene
const FruitScene: React.FC<{ seg: Seg; idx: number; offset: number }> = ({ seg, idx, offset }) => {
  const { frame, fps, sec } = useSec();
  const th = THEME[seg.id];
  const rel = (abs: number) => abs - seg.start + offset;
  const sIntro = seg.sentences.find((s) => s.role === "intro")!;
  const sNutr = seg.sentences.find((s) => s.role === "nutr")!;
  const sVer = seg.sentences.find((s) => s.role === "verdict")!;
  const sPrice = seg.sentences.find((s) => s.role === "price")!;
  const Fruit = FRUITS[seg.id];
  const enter = sp(frame, fps, rel(sIntro.start) - 0.1, { damping: 9, stiffness: 120 });
  const slashAt = rel(sNutr.start) - SLASH_LEAD;
  const openAt = slashAt + SLASH_TO_OPEN;
  const decon = interpolate(sec, [openAt, openAt + 1.4], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  // impact jolt when the blade connects
  const hit = sec > slashAt + 0.12 ? Math.exp(-(sec - slashAt - 0.12) * 9) * Math.sin((sec - slashAt) * 70) * 10 : 0;
  // squash on landing
  const squash = 1 + 0.12 * Math.sin(Math.min(1, enter) * Math.PI) * (1 - Math.min(1, sec / 1.2));
  // shrink fruit up a bit when verdict arrives to make room
  const settle = sp(frame, fps, rel(sVer.start) - 0.2, { damping: 16 });
  const scale = 1.5 * enter * (1 - 0.12 * settle);
  const nutrDur = sNutr.end - sNutr.start;
  return (
    <AbsoluteFill>
      <Backdrop id={seg.id} label={seg.name!.toUpperCase()} local={sec} />
      <Header idx={idx} ink={th.ink} name={seg.name} unit={seg.unit} kcal={seg.kcal} at={rel(sIntro.start)} />
      <div style={{ position: "absolute", left: 540 - 200, top: 800 - 200 - 30 * settle, width: 400, height: 400,
        transform: `translate(${hit}px, ${(1 - enter) * -500}px) scale(${scale / squash}, ${scale * squash})`, transformOrigin: "50% 90%" }}>
        <svg width={400} height={400} viewBox="0 0 400 400" style={{ overflow: "visible" }}>
          <Fruit p={decon} t={sec} />
        </svg>
      </div>
      <KnifeSlash at={slashAt} angle={SLASH_ANGLE[seg.id]} juice={JUICE[seg.id]} cy={720 - 30 * settle} />
      {seg.nutrients!.map((n, i) => (
        <Chip key={i} n={n} i={i} at={rel(sNutr.start) + 0.5 + (i * Math.max(0.6, nutrDur - 0.8)) / 4} dark={th.dark} />
      ))}
      <Gauge score={seg.score!} verdict={seg.verdict!} at={rel(sVer.start)} ink={th.ink} />
      <PriceTag price={seg.price!} unit={seg.priceUnit!} at={rel(sPrice.start)} dark={th.dark} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ hook
const MINI = ["banana", "apple", "avocado", "blueberries", "orange", "mango"];
const HookScene: React.FC<{ seg: Seg; offset: number }> = ({ seg, offset }) => {
  const { frame, fps, sec } = useSec();
  const th = THEME.hook;
  const rel = (abs: number) => abs - seg.start + offset;
  const w = WORDS.filter((x) => x.seg === "hook");
  const at = (word: string) => rel((w.find((x) => x.text.toLowerCase().startsWith(word)) ?? w[0]).start);
  const good = sp(frame, fps, at("good"), { damping: 8, stiffness: 220 });
  const or = sp(frame, fps, at("or"), { damping: 10 });
  const bad = sp(frame, fps, at("bad"), { damping: 8, stiffness: 220 });
  const cost = sp(frame, fps, at("cost"), { damping: 11 });
  const crack = at("crack");
  const shake = sec > crack ? Math.sin(sec * 60) * 10 * Math.exp(-(sec - crack) * 3) : 0;
  return (
    <AbsoluteFill>
      <Backdrop id="hook" label="FRUIT" local={sec + 1} />
      <div style={{ position: "absolute", top: 220, width: 1080, textAlign: "center", fontFamily: FONT, color: th.ink }}>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: 8, opacity: sp(frame, fps, rel(seg.start) + 0.1) }}>6 FRUITS</div>
        <div style={{ fontSize: 230, fontWeight: 700, letterSpacing: -10, lineHeight: 0.95, color: "#2BB673", transform: `scale(${interpolate(good, [0, 1], [2.4, 1])})`, opacity: good }}>GOOD</div>
        <div style={{ fontFamily: SERIF, fontSize: 120, lineHeight: 1, opacity: or, transform: `rotate(${(1 - or) * 30}deg)` }}>or</div>
        <div style={{ fontSize: 230, fontWeight: 700, letterSpacing: -10, lineHeight: 0.95, color: "#E5484D", transform: `scale(${interpolate(bad, [0, 1], [2.4, 1])}) rotate(${(1 - bad) * -10}deg)`, opacity: bad }}>BAD?</div>
        <div style={{ marginTop: 40, fontSize: 60, fontWeight: 700, opacity: cost, transform: `translateY(${(1 - cost) * 40}px)` }}>
          <span style={{ background: "#FFF3C9", color: "#2A1410", padding: "10px 30px", borderRadius: 20 }}>+ what it really costs $</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 1180, left: 40, width: 1000, display: "flex", justifyContent: "space-between" }}>
        {MINI.map((id, i) => {
          const F = FRUITS[id];
          const s = sp(frame, fps, rel(seg.start) + 0.15 * i, { damping: 8, stiffness: 160 });
          const bob = Math.sin(sec * 4 + i) * 6;
          return (
            <div key={id} style={{ width: 160, height: 160, transform: `translateY(${(1 - s) * -900 + bob}px) rotate(${shake * (i % 2 ? 1 : -1)}deg)` }}>
              <svg width={160} height={160} viewBox="0 0 400 400" style={{ overflow: "visible" }}><F p={0} t={sec} /></svg>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ outro
const OutroScene: React.FC<{ seg: Seg; offset: number }> = ({ seg, offset }) => {
  const { frame, fps, sec } = useSec();
  const th = THEME.outro;
  const ranked = SEGS.filter((s) => s.kind === "fruit").sort((a, b) => b.score! - a.score!);
  const rel = (abs: number) => abs - seg.start + offset;
  const follow = sp(frame, fps, rel(seg.sentences[1].start), { damping: 10 });
  return (
    <AbsoluteFill>
      <Backdrop id="outro" label="RANKED" local={sec} />
      <div style={{ position: "absolute", top: 150, width: 1080, textAlign: "center", fontFamily: FONT, color: th.ink, fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>
        THE RANKING
      </div>
      {ranked.map((s, i) => {
        const F = FRUITS[s.id];
        const k = sp(frame, fps, rel(seg.start) + 0.12 * (ranked.length - i), { damping: 14 });
        const top = i === 0;
        return (
          <div key={s.id} style={{ position: "absolute", left: 70, top: 330 + i * 160, width: 940, height: 140, display: "flex", alignItems: "center", gap: 20, opacity: k }}>
            <div style={{ width: 130, height: 130, position: "relative" }}>
              <svg width={130} height={130} viewBox="0 0 400 400" style={{ overflow: "visible" }}><F p={0} t={sec} /></svg>
              {top && <div style={{ position: "absolute", top: -50, left: 30, fontSize: 64, transform: `scale(${sp(frame, fps, rel(seg.start) + 1.2, { damping: 7 })})` }}>👑</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FONT, color: th.ink, fontSize: 40, fontWeight: 700 }}>{i + 1}. {s.name} <span style={{ opacity: 0.6, fontWeight: 500, fontSize: 32 }}>{s.price} {s.priceUnit}</span></div>
              <div style={{ height: 34, borderRadius: 17, background: "#ffffff22", marginTop: 8 }}>
                <div style={{ height: 34, borderRadius: 17, width: `${s.score! * k}%`, background: VERDICT_COLOR(s.score!) }} />
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 1330, width: 1080, textAlign: "center", fontFamily: FONT, opacity: follow, transform: `scale(${0.6 + 0.4 * follow})` }}>
        <span style={{ background: "#E5484D", color: "#fff", fontSize: 58, fontWeight: 700, padding: "18px 40px", borderRadius: 24 }}>FOLLOW → PART 2: VEGGIES</span>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ captions
type Group = { words: Word[]; start: number; end: number };
const GROUPS: Group[] = (() => {
  const out: Group[] = [];
  let cur: Word[] = [];
  WORDS.forEach((w, i) => {
    cur.push(w);
    const next = WORDS[i + 1];
    const brk = /[.?!:,]$/.test(w.text) || cur.length >= 3 || !next || next.seg !== w.seg;
    if (brk) { out.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; }
  });
  return out;
})();
const HOT: Record<string, string> = { good: "#2BB673", "good,": "#2BB673", "good.": "#2BB673", excellent: "#2BB673", "excellent.": "#2BB673", watch: "#E5484D", "out.": "#E5484D", bad: "#E5484D" };
const Captions: React.FC = () => {
  const { sec } = useSec();
  const g = GROUPS.find((x, i) => sec >= x.start - 0.05 && sec < (GROUPS[i + 1]?.start ?? x.end + 0.6) - 0.05 && sec < x.end + 0.6);
  if (!g) return null;
  const pop = interpolate(sec, [g.start - 0.05, g.start + 0.08], [0.85, 1], clamp);
  return (
    <div style={{ position: "absolute", top: 1585, left: 60, width: 960, textAlign: "center", background: "rgba(10,10,20,0.55)", borderRadius: 30, padding: "14px 10px 6px", fontFamily: FONT, fontWeight: 700, fontSize: 74, lineHeight: 1.1, letterSpacing: -1, transform: `scale(${pop})` }}>
      {g.words.map((w, i) => {
        const active = sec >= w.start && sec < w.end + 0.02;
        const hot = HOT[w.text.toLowerCase()];
        return (
          <span key={i} style={{
            color: hot ?? (active ? "#FFE03D" : "#FFFFFF"),
            WebkitTextStroke: "3px #111",
            paintOrder: "stroke fill",
            textShadow: "0 6px 0 rgba(0,0,0,0.45)",
            marginRight: 18, display: "inline-block",
            transform: active ? "translateY(-6px) scale(1.06)" : "none",
          }}>{w.text.toUpperCase()}</span>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ root composition
const LEAD = 0.35; // scene starts slightly before its narration
export const FruitShort: React.FC = () => {
  useFonts();
  const { fps } = useVideoConfig();
  let fruitIdx = 0;
  return (
    <AbsoluteFill style={{ background: "#17162B" }}>
      {SEGS.map((seg, i) => {
        const from = i === 0 ? 0 : Math.round((seg.start - LEAD) * fps);
        const next = SEGS[i + 1];
        const to = next ? Math.round((next.start - LEAD) * fps) + 20 : timing.durationInFrames;
        const offset = i === 0 ? seg.start : LEAD;
        let el: React.ReactNode;
        if (seg.kind === "hook") el = <HookScene seg={seg} offset={offset} />;
        else if (seg.kind === "outro") el = <OutroScene seg={seg} offset={offset} />;
        else { fruitIdx += 1; el = <FruitScene seg={seg} idx={fruitIdx} offset={offset} />; }
        return <Sequence key={seg.id} from={from} durationInFrames={to - from} name={seg.id}>{el}</Sequence>;
      })}
      <Captions />
      <Audio src={staticFile("mix.wav")} />
    </AbsoluteFill>
  );
};
