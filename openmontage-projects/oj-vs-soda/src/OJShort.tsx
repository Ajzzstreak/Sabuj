import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Easing, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import timing from "./timing.json";
import { FRUITS } from "../../fruit-truth-90s/src/fruits";

// Vertical 1080x1920 Short. Safe zone: important content above y≈1480; nothing at x>900 below y=900.
const F = "SpaceGrotesk, sans-serif";
const GREEN = "#2BB673", RED = "#E5484D", AMBER = "#F2A33A", GOLD = "#FFE03D";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SEG = Object.fromEntries((timing.segments as any[]).map((s) => [s.id, s]));
const st = (id: string, k: number) => SEG[id].sentences[k].start as number;
const WORDS = timing.words as { text: string; start: number; end: number; seg: string }[];
const wordAt = (seg: string, w: string) => (WORDS.find((x) => x.seg === seg && x.text.toLowerCase().replace(/[^a-z]/g, "") === w) ?? { start: 0 }).start;
const stroke = (w: number) => ({ WebkitTextStroke: `${w}px #111`, paintOrder: "stroke fill" as const });

const useSec = () => { const frame = useCurrentFrame(); const { fps } = useVideoConfig(); return { frame, fps, sec: frame / fps }; };
const sp = (frame: number, fps: number, at: number, cfg: Record<string, number> = {}) => spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 11, stiffness: 180, ...cfg } });
const useFont = () => {
  const [h] = useState(() => delayRender("f"));
  useEffect(() => { new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }).load().then((f) => { document.fonts.add(f); continueRender(h); }).catch(() => continueRender(h)); }, [h]);
};

const COL = [200, 530, 860];
const ITEM_Y = 600;

export const SodaCan: React.FC = () => (
  <svg width={400} height={400} viewBox="0 0 400 400" style={{ overflow: "visible" }}>
    <ellipse cx={200} cy={372} rx={110} ry={14} fill="#000" opacity={0.25} />
    <rect x={110} y={60} width={180} height={300} rx={26} fill="#5B2A86" stroke="#111" strokeWidth={8} />
    <rect x={118} y={80} width={20} height={260} rx={8} fill="#fff" opacity={0.22} />
    <ellipse cx={200} cy={62} rx={88} ry={18} fill="#C9CED6" stroke="#111" strokeWidth={6} />
    <rect x={180} y={50} width={40} height={10} rx={4} fill="#8A929E" />
    <rect x={110} y={170} width={180} height={80} fill="#F2A33A" stroke="#111" strokeWidth={5} />
    <text x={200} y={226} textAnchor="middle" fontFamily={F} fontWeight={700} fontSize={50} fill="#111">SODA</text>
    {[...Array(5)].map((_, i) => <circle key={i} cx={150 + i * 25} cy={120 + (i % 2) * 18} r={5} fill="#fff" opacity={0.5} />)}
  </svg>
);

const Item: React.FC<{ kind: "juice" | "soda" | "orange"; x: number; at: number; still?: boolean; sc?: number; y?: number }> = ({ kind, x, at, still, sc = 1.05, y = ITEM_Y }) => {
  const { frame, fps, sec } = useSec();
  const s = still ? 1 : sp(frame, fps, at, { damping: 9, stiffness: 140 });
  const Fr = kind === "juice" ? FRUITS.juice : kind === "orange" ? FRUITS.orange : null;
  return (
    <div style={{ position: "absolute", left: x - 150, top: y - 150, width: 300, height: 300, transform: `translateY(${(1 - Math.min(1, s)) * -900}px) scale(${sc})`, transformOrigin: "50% 100%" }}>
      {Fr ? <svg width={300} height={300} viewBox="0 0 400 400" style={{ overflow: "visible" }}><Fr p={0} t={still ? 0 : sec} /></svg> : <div style={{ transform: "scale(0.75)", transformOrigin: "0 0" }}><SodaCan /></div>}
    </div>
  );
};

const Cubes: React.FC<{ x: number; n: number; at: number; label: string }> = ({ x, n, at, label }) => {
  const { sec, frame, fps } = useSec();
  if (sec < at) return null;
  const full = Math.floor(n), half = n - full > 0.01;
  const cubes = [...Array(full + (half ? 1 : 0))];
  return (
    <>
      {cubes.map((_, i) => {
        const t = at + 0.25 * i;
        const k = interpolate(sec, [t, t + 0.3], [0, 1], { ...clamp, easing: Easing.out(Easing.bounce) });
        const isHalf = half && i === full;
        const y = 1180 - (i + 1) * 58;
        return <div key={i} style={{ position: "absolute", left: x - 32, top: y - (1 - k) * 700, width: isHalf ? 32 : 64, height: 54, background: "#fff", border: "4px solid #9AA4B2", borderRadius: 8, opacity: k > 0 ? 1 : 0, boxShadow: "inset 0 -8px 0 #E4E8EE" }} />;
      })}
      <div style={{ position: "absolute", left: x - 140, top: 1192, width: 280, textAlign: "center", fontFamily: F, fontWeight: 700, fontSize: 56, color: "#fff", ...stroke(4), opacity: sp(frame, fps, at + 0.25 * cubes.length) }}>{label}</div>
    </>
  );
};

const Chip: React.FC<{ x: number; y: number; at: number; text: string; good: boolean }> = ({ x, y, at, text, good }) => {
  const { frame, fps } = useSec();
  const s = sp(frame, fps, at);
  if (s <= 0.001) return null;
  return <div style={{ position: "absolute", left: x - 150, top: y, width: 300, textAlign: "center", transform: `scale(${s})`, fontFamily: F, fontWeight: 700, fontSize: 34,
    background: "#FFFDF7", color: "#111", border: `5px solid ${good ? GREEN : RED}`, borderRadius: 20, padding: "8px 6px", boxShadow: "0 8px 0 #0006" }}>{text}</div>;
};

const Stamp: React.FC<{ x: number; at: number; text: string; color: string }> = ({ x, at, text, color }) => {
  const { frame, fps } = useSec();
  const s = sp(frame, fps, at, { damping: 8, stiffness: 260 });
  if (s <= 0.001) return null;
  return <div style={{ position: "absolute", left: x - 160, top: 430, width: 320, textAlign: "center", transform: `scale(${interpolate(s, [0, 1], [2.4, 1])}) rotate(-8deg)`, opacity: Math.min(1, s) }}>
    <span style={{ fontFamily: F, fontWeight: 700, fontSize: text.length > 6 ? 46 : 64, color: "#fff", background: color, border: "5px solid #111", borderRadius: 16, padding: "6px 16px", whiteSpace: "nowrap", boxShadow: "0 8px 0 #111" }}>{text}</span>
  </div>;
};

const Background: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 35%, #1F3B6B 0%, #0B1630 70%)" }} />
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(#ffffff08 2px, transparent 2px), linear-gradient(90deg, #ffffff08 2px, transparent 2px)", backgroundSize: "60px 60px" }} />
    <div style={{ position: "absolute", top: 110, left: 60, display: "flex", gap: 12, fontFamily: F, fontWeight: 700 }}>
      <div style={{ display: "flex", borderRadius: 16, overflow: "hidden", border: "4px solid #111", fontSize: 34 }}>
        <span style={{ background: GREEN, color: "#fff", padding: "6px 14px" }}>GOOD</span><span style={{ background: "#fff", color: "#111", padding: "6px 10px", fontStyle: "italic" }}>or</span><span style={{ background: RED, color: "#fff", padding: "6px 14px" }}>BAD?</span>
      </div>
      <div style={{ background: "#111", color: GOLD, fontSize: 30, padding: "8px 14px", borderRadius: 14 }}>🍎 FOOD</div>
    </div>
  </>
);

// Frame-0 picture and loop target.
const Opening: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <div style={{ position: "absolute", top: 200, width: 1080, textAlign: "center", fontFamily: F, fontWeight: 700, lineHeight: 0.95 }}>
      <span style={{ fontSize: 150, color: GOLD, ...stroke(10), textShadow: "0 10px 0 #000" }}>JUICE ≈ </span>
      <span style={{ fontSize: 150, color: "#fff", ...stroke(10), textShadow: "0 10px 0 " + RED }}>SODA?</span>
    </div>
    <Item kind="juice" x={250} at={0} still sc={1.9} y={720} />
    <div style={{ position: "absolute", left: 540 - 80, top: 640, fontFamily: F, fontWeight: 700, fontSize: 130, color: RED, ...stroke(8) }}>VS</div>
    <Item kind="soda" x={790} at={0} still sc={1.9} y={720} />
  </AbsoluteFill>
);

const Captions: React.FC = () => {
  const { sec } = useSec();
  const groups: { w: typeof WORDS; s: number; e: number }[] = [];
  let cur: typeof WORDS = [];
  WORDS.forEach((w, i) => { cur.push(w); const n = WORDS[i + 1]; if (/[.?!:,]$/.test(w.text) || cur.length >= 3 || !n) { groups.push({ w: cur, s: cur[0].start, e: cur[cur.length - 1].end }); cur = []; } });
  const g = groups.find((x, i) => sec >= x.s - 0.05 && sec < Math.min((groups[i + 1]?.s ?? 1e9) - 0.05, x.e + 0.5));
  if (!g) return null;
  const HOT: Record<string, string> = { bad: RED, "bad.": RED, sugar: AMBER, "sugar.": AMBER, soda: RED, "soda.": RED, good: GREEN, "good.": GREEN, "out.": AMBER, "nothing.": RED };
  return (
    <div style={{ position: "absolute", top: 1290, left: 60, width: 840, textAlign: "center", background: "rgba(5,8,18,0.65)", borderRadius: 28, padding: "12px 10px 4px" }}>
      {g.w.map((w, i) => { const a = sec >= w.start && sec < w.end + 0.02; return <span key={i} style={{ fontFamily: F, fontWeight: 700, fontSize: 70, color: HOT[w.text.toLowerCase()] ?? (a ? GOLD : "#fff"), marginRight: 16, display: "inline-block", ...stroke(3) }}>{w.text.toUpperCase()}</span>; })}
    </div>
  );
};

export const OJShort: React.FC = () => {
  useFont();
  const { sec, frame, fps } = useSec();
  const main = sec >= SEG.sugar.start - 0.35;
  const loopAt = st("end", 1) - 0.1;
  const reveal = interpolate(sec, [loopAt, loopAt + 0.45], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const spike = interpolate(sec, [st("nutr", 1) + 1.5, st("nutr", 1) + 3.0], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#0B1630" }}>
      {!main ? <Opening /> : (
        <AbsoluteFill>
          <Background />
          <Item kind="juice" x={COL[0]} at={SEG.sugar.start - 0.3} />
          <Item kind="soda" x={COL[1]} at={st("sugar", 1) - 0.2} />
          {sec >= SEG.orange.start - 0.4 ? <Item kind="orange" x={COL[2]} at={SEG.orange.start - 0.3} /> :
            <div style={{ position: "absolute", left: COL[2] - 70, top: ITEM_Y - 160, width: 140, height: 140, borderRadius: 70, border: "6px dashed #ffffff55", color: "#ffffff88", fontFamily: F, fontWeight: 700, fontSize: 90, textAlign: "center", lineHeight: "130px" }}>?</div>}
          <Cubes x={COL[0]} n={5.25} at={st("sugar", 0) + 1.6} label="21 g" />
          <Cubes x={COL[1]} n={6.5} at={st("sugar", 1) + 1.4} label="26 g" />
          {sec >= SEG.orange.start && <Cubes x={COL[2]} n={3} at={st("orange", 0) + 1.6} label="12 g" />}
          <div style={{ position: "absolute", top: 240, width: 1080, textAlign: "center", fontFamily: F, fontWeight: 700, fontSize: 64, color: "#fff", ...stroke(4) }}>
            {sec < st("sugar", 2) ? "SUGAR PER 8 OZ / ITEM" : sec < SEG.nutr.start ? <span style={{ color: AMBER, fontSize: 84 }}>ONLY 5 g APART</span> :
              sec < st("nutr", 1) ? "WHAT ELSE IS INSIDE?" : sec < SEG.orange.start ? <span style={{ color: RED }}>FIBER: ~0 g → SUGAR SPIKE</span> :
              sec < SEG.verdict.start ? <span style={{ color: GREEN }}>THE WHOLE ORANGE</span> : sec < st("verdict", 1) ? "THE VERDICT" : <span style={{ color: GOLD }}>SAME PRICE, BETTER DEAL</span>}
          </div>
          {sec >= SEG.nutr.start && sec < SEG.verdict.start && (
            <>
              <Chip x={COL[0]} y={760} at={st("nutr", 0) + 1.6} text="VIT C 138% ✓" good />
              <Chip x={COL[0]} y={830} at={st("nutr", 0) + 2.3} text="POTASSIUM ✓" good />
              <Chip x={COL[1]} y={760} at={st("nutr", 0) + 3.6} text="NOTHING ✗" good={false} />
              {sec > st("nutr", 1) && <><Chip x={COL[0]} y={900} at={st("nutr", 1) + 0.6} text="FIBER ~0 g" good={false} /><Chip x={COL[1]} y={830} at={st("nutr", 1) + 0.6} text="FIBER 0 g" good={false} /></>}
              {sec >= SEG.orange.start && <><Chip x={COL[2]} y={760} at={st("orange", 0) + 2.6} text="FIBER 3 g ✓" good /><Chip x={COL[2] - 20} y={830} at={st("orange", 0) + 3.6} text="FILLS YOU UP ✓" good /></>}
            </>
          )}
          {spike > 0 && sec < SEG.orange.start && (
            <svg width={1080} height={300} style={{ position: "absolute", top: 320 }}>
              <polyline points={[0, 0.1, 0.3, 0.45, 0.5, 0.55, 0.7, 1].map((p, i) => `${100 + i * 120},${260 - [10, 12, 15, 210, 230, 120, 40, 20][i] * Math.min(1, spike * 8 / (i + 1))}`).join(" ")} fill="none" stroke={RED} strokeWidth={10} strokeLinejoin="round" />
              <text x={940} y={60} fontFamily={F} fontWeight={700} fontSize={40} fill={RED} textAnchor="end">BLOOD SUGAR ⚡</text>
            </svg>
          )}
          {sec >= SEG.verdict.start && sec < SEG.end.start + 0.2 && (
            <>
              <Stamp x={COL[1]} at={wordAt("verdict", "bad")} text="BAD" color={RED} />
              <Stamp x={COL[0]} at={wordAt("verdict", "out")} text="WATCH OUT" color={AMBER} />
              <Stamp x={COL[2]} at={wordAt("verdict", "good")} text="GOOD" color={GREEN} />
              {sec >= st("verdict", 1) && (
                <>
                  <Chip x={COL[0]} y={760} at={st("verdict", 1) + 0.3} text="≈ $0.70 / GLASS" good={false} />
                  <Chip x={COL[2] - 20} y={760} at={st("verdict", 1) + 1.0} text="≈ $0.75 EACH" good />
                </>
              )}
            </>
          )}
          {sec >= SEG.end.start && (
            <div style={{ position: "absolute", top: 760, width: 1080, textAlign: "center", transform: `scale(${sp(frame, fps, SEG.end.start, { damping: 9 })})` }}>
              <span style={{ fontFamily: F, fontWeight: 700, fontSize: 64, background: RED, color: "#fff", padding: "14px 40px", borderRadius: 24, border: "6px solid #111", boxShadow: "0 10px 0 #111" }}>FOLLOW 🔔 MORE GOOD or BAD</span>
            </div>
          )}
        </AbsoluteFill>
      )}
      {reveal > 0 && <AbsoluteFill style={{ clipPath: `circle(${reveal * 140}% at 50% 40%)` }}><Opening /></AbsoluteFill>}
      <Captions />
      <Audio src={staticFile("mix.wav")} />
    </AbsoluteFill>
  );
};
