import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, interpolate, staticFile } from "remotion";
import timing from "./timing_door.json";
import { C, Ocean, Stars, Stick, clamp, ramp, spr, stroke, useT } from "./prims";

// Vertical 1080x1920 Short. Safe zone: content above y≈1480, nothing important at x>900 below y=900.
const F = "SpaceGrotesk, sans-serif";
const SEG = Object.fromEntries((timing.segments as any[]).map((s) => [s.id, s]));
const st = (id: string, k: number) => SEG[id].sentences[k].start as number;
const WORDS = timing.words as { text: string; start: number; end: number; seg: string }[];

const useFont = () => {
  const [h] = useState(() => delayRender("f"));
  useEffect(() => { new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }).load().then((f) => { document.fonts.add(f); continueRender(h); }).catch(() => continueRender(h)); }, [h]);
};

const Big: React.FC<{ show: boolean; at: number; top: number; size: number; color?: string; children: React.ReactNode; still?: boolean }> = ({ show, at, top, size, color = "#fff", children, still }) => {
  const { frame, fps } = useT();
  if (!show) return null;
  const s = still ? 1 : spr(frame, fps, at, { damping: 10, stiffness: 200 });
  return <div style={{ position: "absolute", left: 40, top, width: 1000, textAlign: "center", fontFamily: F, fontWeight: 700, fontSize: size, color, lineHeight: 1, letterSpacing: -2,
    opacity: Math.min(1, s), transform: `scale(${interpolate(s, [0, 1], [1.8, 1])})`, ...stroke(size / 14), textShadow: "0 8px 0 #000" }}>{children}</div>;
};

// The ocean + door stage (drawn in 1920x1080 space, scaled into the vertical frame).
const Stage: React.FC<{ sink: number; both: boolean; cold: boolean }> = ({ sink, both, cold }) => {
  const { sec } = useT();
  return (
    <div style={{ position: "absolute", left: -660, top: -60, width: 1920, height: 1080, transform: "scale(1.25)", transformOrigin: "0 0" }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <g transform={`translate(960 ${742 + sink + Math.sin(sec * 2) * 4}) rotate(${Math.sin(sec * 1.3) * 2})`}>
          <rect x={-230} y={-26} width={460} height={52} rx={8} fill="#8D6E63" stroke="#4E342E" strokeWidth={6} />
          <rect x={-200} y={-16} width={180} height={32} fill="none" stroke="#6D4C41" strokeWidth={4} />
          <rect x={20} y={-16} width={180} height={32} fill="none" stroke="#6D4C41" strokeWidth={4} />
        </g>
      </svg>
      <Stick x={1100} y={712 + sink} s={0.9} pose="lie" rot={-90} hat="hair" hatColor="#C0392B" face="flat" />
      {both ? <Stick x={860} y={712 + sink} s={0.9} pose="lie" rot={-90} hat="flat" hatColor="#8D6E63" face="o" />
        : <Stick x={1250} y={880} s={0.95} pose={cold ? "stand" : "swim"} hat="flat" hatColor="#8D6E63" face={cold ? "flat" : "smile"} />}
      <Ocean y={760} color="#0E2E52" color2="#071A30" amp={9} opacity={0.93} />
    </div>
  );
};

// Frame-0 picture (also the loop target).
const Opening: React.FC<{ still?: boolean }> = ({ still }) => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#02050D 0%,#0B1E36 45%,#071A30 100%)" }} />
    <Stars n={50} maxY={800} />
    <Stage sink={0} both={false} cold={false} />
    <Big show at={0} top={330} size={150} color={C.gold} still={still}>COULD JACK</Big>
    <Big show at={0} top={480} size={190} still={still}>FIT?</Big>
  </AbsoluteFill>
);

const Captions: React.FC = () => {
  const { sec } = useT();
  const groups: { w: typeof WORDS; s: number; e: number }[] = [];
  let cur: typeof WORDS = [];
  WORDS.forEach((w, i) => { cur.push(w); const n = WORDS[i + 1]; if (/[.?!:,]$/.test(w.text) || cur.length >= 3 || !n) { groups.push({ w: cur, s: cur[0].start, e: cur[cur.length - 1].end }); cur = []; } });
  const g = groups.find((x, i) => sec >= x.s - 0.05 && sec < Math.min((groups[i + 1]?.s ?? 1e9) - 0.05, x.e + 0.5));
  if (!g) return null;
  return (
    <div style={{ position: "absolute", top: 1290, left: 60, width: 840, textAlign: "center", background: "rgba(5,8,18,0.65)", borderRadius: 28, padding: "12px 10px 4px" }}>
      {g.w.map((w, i) => { const a = sec >= w.start && sec < w.end + 0.02; return <span key={i} style={{ fontFamily: F, fontWeight: 700, fontSize: 70, color: a ? C.gold : "#fff", marginRight: 16, display: "inline-block", ...stroke(3) }}>{w.text.toUpperCase()}</span>; })}
    </div>
  );
};

export const DoorShort: React.FC = () => {
  useFont();
  const { sec, frame, fps } = useT();
  const both = sec > st("test", 1) + 1.0 && sec < st("exp", 0);
  const sink = both ? ramp(sec, st("test", 1) + 1.2, st("test", 1) + 2.4) * 40 : 0;
  const cold = sec > st("scene", 0) + 3;
  const loopAt = st("end", 2) - 0.1;
  const reveal = ramp(sec, loopAt, loopAt + 0.45);
  const temp = ramp(sec, st("exp", 0), st("exp", 0) + 4);
  const fit = 52 + 16 * Math.sin(sec * 1.8) + 7 * Math.sin(sec * 4.1);
  return (
    <AbsoluteFill style={{ background: "#02050D" }}>
      {sec < st("scene", 0) - 0.2 ? <Opening still /> : (
        <AbsoluteFill>
          <AbsoluteFill style={{ background: "linear-gradient(180deg,#02050D 0%,#0B1E36 45%,#071A30 100%)" }} />
          <Stars n={50} maxY={800} />
          <Stage sink={sink} both={both} cold={cold} />
          {/* header */}
          <div style={{ position: "absolute", top: 110, left: 60, display: "flex", gap: 12, fontFamily: F, fontWeight: 700 }}>
            <div style={{ display: "flex", borderRadius: 16, overflow: "hidden", border: "4px solid #111", fontSize: 34 }}>
              <span style={{ background: C.green, color: "#fff", padding: "6px 14px" }}>GOOD</span><span style={{ background: "#fff", color: "#111", padding: "6px 10px", fontStyle: "italic" }}>or</span><span style={{ background: C.red, color: "#fff", padding: "6px 14px" }}>BAD?</span>
            </div>
            <div style={{ background: "#111", color: "#FFE03D", fontSize: 30, padding: "8px 14px", borderRadius: 14 }}>🎬 TITANIC</div>
          </div>
          {/* scene */}
          {sec < st("scene", 1) && (
            <>
              <Big show at={st("scene", 0) + 0.2} top={320} size={84}>ROSE: ON THE DOOR ✓</Big>
              <Big show={sec > st("scene", 0) + 2.6} at={st("scene", 0) + 2.6} top={440} size={84} color="#9FE3FF">JACK: IN THE WATER 🥶</Big>
            </>
          )}
          {sec >= st("scene", 1) && sec < st("test", 0) && (
            <div style={{ position: "absolute", left: 90, top: 330, width: 900 }}>
              <div style={{ fontFamily: F, fontWeight: 700, color: "#fff", fontSize: 54, textAlign: "center", marginBottom: 20 }}>~30 YEARS OF ARGUING</div>
              <div style={{ display: "flex", height: 90, borderRadius: 45, overflow: "hidden", border: "6px solid #111" }}>
                <div style={{ width: `${fit}%`, background: C.green, color: "#fff", fontFamily: F, fontWeight: 700, fontSize: 48, display: "flex", alignItems: "center", paddingLeft: 30 }}>FIT</div>
                <div style={{ flex: 1, background: C.red, color: "#fff", fontFamily: F, fontWeight: 700, fontSize: 48, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 30 }}>NO FIT</div>
              </div>
            </div>
          )}
          {/* test */}
          {sec >= st("test", 0) && sec < st("exp", 0) && (
            <>
              <Big show at={st("test", 0) + 0.3} top={300} size={110} color={C.green}>SIZE ✓</Big>
              <Big show={sec > st("test", 1) + 1.6} at={st("test", 1) + 1.6} top={430} size={110} color={C.red}>BUOYANCY ✗</Big>
            </>
          )}
          {/* experiment */}
          {sec >= st("exp", 0) && sec < st("end", 0) && (
            <>
              <Big show at={st("exp", 0) + 0.2} top={250} size={80}>2023 EXPERIMENT</Big>
              <div style={{ position: "absolute", left: 470, top: 360, width: 70, height: 300, borderRadius: 35, border: "6px solid #fff", background: "#0008", overflow: "hidden", opacity: sec < st("exp", 1) ? 1 : 0.25 }}>
                <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${90 - temp * 60}%`, background: temp > 0.5 ? "#4FC3F7" : C.red }} />
              </div>
              <Big show={sec > st("exp", 1) + 0.9} at={st("exp", 1) + 0.9} top={360} size={86} color={C.gold}>“MIGHT HAVE SURVIVED”</Big>
              <Big show={sec > st("exp", 1) + 2.4} at={st("exp", 1) + 2.4} top={560} size={110}>…MAYBE.</Big>
            </>
          )}
          {/* end */}
          {sec >= st("end", 0) && (
            <>
              <div style={{ position: "absolute", left: 0, top: 300, width: 1080, textAlign: "center", transform: `scale(${spr(frame, fps, st("end", 0), { damping: 9 })})` }}>
                <span style={{ fontFamily: F, fontWeight: 700, fontSize: 90, background: "#fff", color: "#111", padding: "16px 44px", borderRadius: 40, border: "6px solid #111", boxShadow: "0 12px 0 #111" }}>💬 FIT or NO FIT?</span>
              </div>
              {sec >= st("end", 1) && (
                <div style={{ position: "absolute", left: 90, top: 470, width: 900, textAlign: "center", fontFamily: F, fontWeight: 700, transform: `scale(${spr(frame, fps, st("end", 1), { damping: 10 })})` }}>
                  <div style={{ background: C.gold, color: "#111", fontSize: 58, padding: "14px 20px", borderRadius: 24, border: "6px solid #111" }}>▶ FULL $200M STORY ON THE CHANNEL</div>
                </div>
              )}
            </>
          )}
        </AbsoluteFill>
      )}
      {reveal > 0 && <AbsoluteFill style={{ clipPath: `circle(${reveal * 140}% at 50% 40%)` }}><Opening still /></AbsoluteFill>}
      <Captions />
      <Audio src={staticFile("mix_door.wav")} />
    </AbsoluteFill>
  );
};
