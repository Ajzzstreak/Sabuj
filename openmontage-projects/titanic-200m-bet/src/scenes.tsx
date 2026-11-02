import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { geoMercator, geoPath } from "d3-geo";
import * as topojson from "topojson-client";
import world from "world-atlas/countries-110m.json";
import {
  BillStack, Bubble, C, Cam, Card, Counter, FONT, Gauge, Grad, Grid, H, Iceberg, Ocean, Pop, PriceTag, SERIF, Ship, Stamp,
  Stars, Stick, Studio, Sub, Trophy, W, Words, clamp, money, moneyM, ramp, spr, stroke, useT,
} from "./prims";

export type SceneProps = { b: (i: number) => number; dur: number; seg: any };

// ================================================================== COLD OPEN
export const Cold: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const shipX = interpolate(sec, [0, dur], [-260, 1250]);
  return (
    <AbsoluteFill>
      <Grad top="#050915" bottom="#11284A" />
      <Stars />
      <Cam dur={dur} z0={1.0} z1={1.12} y1={-20}>
        <svg width={W} height={H} style={{ position: "absolute" }}><circle cx={1580} cy={180} r={70} fill="#F4F1DA" opacity={0.9} /></svg>
        <Ship x={shipX} y={760} s={0.85} lights />
        <Ocean y={770} color="#0C2E4C" color2="#04121F" />
      </Cam>
      <Pop at={b(0) + 0.3} y={120} size={64} color="#CFE3FF">HOLLYWOOD, 1997</Pop>
      <Pop at={b(1)} y={220} size={170} color={C.red} sw={8} out={b(3) - 0.2}>IT WILL SINK.</Pop>
      <Pop at={b(2)} x={260} y={430} w={600} size={60} color={C.ink} rot={-3} out={b(3) - 0.2}>① ON SCREEN</Pop>
      <Pop at={b(2) + 1.4} x={1000} y={430} w={700} size={60} color={C.gold} rot={3} out={b(3) - 0.2}>② AT THE BOX OFFICE</Pop>
      <PriceTag at={b(3)} x={1500} y={40} price="$200M" label="BUDGET" s={0.9} />
      <Pop at={b(3) + 1.6} x={80} y={200} w={1100} size={78} align="left" out={b(4) - 0.1}>THE MOST EXPENSIVE MOVIE EVER MADE</Pop>
      <Pop at={b(4)} x={80} y={230} w={1200} size={140} color={C.red} sw={7} rot={-4} align="left">WORST BET?</Pop>
      <Pop at={b(4) + 1.2} x={80} y={420} w={1200} size={140} color={C.green} sw={7} rot={3} align="left">BEST BET?</Pop>
    </AbsoluteFill>
  );
};

// ================================================================== ACT TITLE CARD
export const Title: React.FC<SceneProps> = ({ seg, dur }) => {
  const { sec, frame, fps } = useT();
  const s = spr(frame, fps, 0.15, { damping: 12 });
  const wipe = ramp(sec, 0.05, 0.6, 0, 1, Easing.out(Easing.cubic));
  const l = ramp(sec, 0.4, 1.2, 0, 1);
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <Grid color="#ffffff08" step={80} />
      <div style={{ position: "absolute", left: 0, top: 520, height: 8, width: W * wipe, background: C.gold }} />
      <div style={{ position: "absolute", width: W, top: 150, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 340, color: "transparent",
        WebkitTextStroke: `6px ${C.gold}`, opacity: s, transform: `scale(${interpolate(s, [0, 1], [1.5, 1])})` }}>{seg.num === "★" ? "★" : `ACT ${seg.num}`}</div>
      <div style={{ position: "absolute", width: W, top: 600, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 110, color: C.ink, letterSpacing: 6,
        opacity: l, transform: `translateY(${(1 - l) * 40}px)` }}>{seg.label}</div>
      <div style={{ position: "absolute", inset: 0, opacity: 0.35 }}><Ship x={interpolate(sec, [0, dur], [-300, W + 300])} y={900} s={0.32} /></div>
    </AbsoluteFill>
  );
};

// ================================================================== PITCH
export const Pitch: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const execPose = sec > b(7) ? "cheer" : sec > b(5) && sec < b(6) ? "laugh" : sec > b(3) ? "shrug" : "stand";
  const execFace = sec > b(7) ? "smile" : sec > b(5) && sec < b(6) ? "smile" : sec > b(3) ? "o" : "flat";
  const strike = (at: number) => ramp(sec, at, at + 0.3);
  const items = ["3-HOUR RUNTIME", "PERIOD ROMANCE", "NO SUPERHEROES", "SAD ENDING"];
  return (
    <AbsoluteFill>
      <Grad top="#2D2A4A" bottom="#1A1830" />
      <Cam dur={dur} z0={1} z1={1.06}>
        {/* whiteboard */}
        <div style={{ position: "absolute", left: 560, top: 110, width: 800, height: 560, background: "#FBFAF5", border: "12px solid #8A8FA0", borderRadius: 14, boxShadow: "0 20px 0 #0006" }} />
        {sec < b(4) - 0.1 && (
          <>
            <Pop at={b(1)} x={600} y={160} w={720} size={44} color="#222">THE #1 DISASTER OF THE 1900s</Pop>
            <Pop at={b(1) + 1.6} x={600} y={240} w={720} size={70} color={C.red}>↓</Pop>
            <Pop at={b(1) + 2.6} x={600} y={320} w={720} size={64} color="#222">A LOVE STORY ♥</Pop>
            <Pop at={b(2)} x={600} y={440} w={720} size={58} color="#C2185B">ROMEO + JULIET</Pop>
            <Pop at={b(2) + 0.7} x={600} y={520} w={720} size={58} color="#1D3B8F">ON THE TITANIC</Pop>
          </>
        )}
        {sec >= b(4) - 0.1 && sec < b(6) - 0.1 && items.map((t, i) => {
          const at = b(4) + 1.5 + i * 1.3;
          return (
            <React.Fragment key={t}>
              <Pop at={at} x={640} y={170 + i * 110} w={640} size={56} color="#222" align="left">{t}</Pop>
              {sec > at + 0.5 && <div style={{ position: "absolute", left: 1210, top: 165 + i * 110, fontFamily: FONT, fontWeight: 700, fontSize: 70, color: C.red, transform: `scale(${strike(at + 0.5)})` }}>✗</div>}
            </React.Fragment>
          );
        })}
        {sec >= b(6) - 0.1 && (
          <>
            <Pop at={b(6)} x={600} y={200} w={720} size={60} color="#222">ICEBERG</Pop>
            <Pop at={b(6) + 0.9} x={600} y={300} w={720} size={60} color="#222">→ SHIP SINKS</Pop>
            <Pop at={b(6) + 1.8} x={600} y={400} w={720} size={60} color="#222">→ THE END</Pop>
          </>
        )}
        <Stick x={380} y={900} s={1.5} pose={sec > b(7) ? "cheer" : sec > b(1) ? "present" : "point"} hat="cap" hatColor={C.red} prop={sec > b(7) ? "none" : "megaphone"} face={sec > b(3) && sec < b(7) ? "flat" : "smile"} />
        <Stick x={1520} y={900} s={1.45} pose={execPose as any} hat="top" hatColor={C.gold} face={execFace as any} sweat={sec > b(3) && sec < b(5)} flip prop="briefcase" />
        <Stick x={1720} y={910} s={1.35} pose={execPose as any} hat="top" hatColor="#4FC3F7" face={execFace as any} flip />
        <Bubble at={b(3) + 0.3} out={b(4)} x={1600} y={560} text="EVERYONE KNOWS THE ENDING!" size={40} />
        <Bubble at={b(5)} out={b(6)} x={1610} y={560} text="HA HA HA!" size={56} />
        <Bubble at={b(6) + 2.6} out={b(7)} x={1600} y={560} text="NO TWIST?!" size={50} />
      </Cam>
      <Pop at={b(3)} x={0} y={720} w={W} size={74} color={C.red} sw={4} out={b(4) - 0.2}>SPOILER: IT SINKS</Pop>
      <Stamp at={b(7) + 0.4} text="APPROVED" x={960} y={400} color={C.green} size={130} />
    </AbsoluteFill>
  );
};

// ================================================================== DIVE
export const Dive: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const depth = ramp(sec, 0, b(2), 0, 1, Easing.inOut(Easing.quad));
  const subY = 240 + depth * 300;
  const wreckY = interpolate(depth, [0.5, 1], [1300, 860], clamp);
  const bubbles = [...Array(24)].map((_, i) => ({ x: 700 + ((i * 53) % 300), y: ((i * 131 + -sec * 160) % 1100 + 1100) % 1100, r: 4 + (i % 4) * 2 }));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${interpolate(depth, [0, 1], [0, 1]) > 0.5 ? "#02121F" : "#0B4D73"} 0%, #010810 100%)` }} />
      <AbsoluteFill style={{ background: "#0B4D73", opacity: 1 - depth }} />
      <Cam dur={dur} z0={1} z1={1.1}>
        <svg width={W} height={H} style={{ position: "absolute" }}>
          {bubbles.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="none" stroke="#9FE3FF" strokeWidth={2} opacity={0.5} />)}
          {/* wreck: bow section on the sea floor */}
          <g transform={`translate(980 ${wreckY}) rotate(-6)`} opacity={0.9}>
            <path d="M0,0 L620,0 L700,-60 L700,-120 L60,-120 Z" fill="#2C3B45" stroke="#5E7A86" strokeWidth={4} />
            <rect x={120} y={-170} width={380} height={50} fill="#33454F" />
            {[...Array(14)].map((_, i) => <circle key={i} cx={100 + i * 40} cy={-70} r={7} fill="#0A1A22" />)}
            <path d="M0,0 L-20,-60 L10,-140 L60,-120" fill="#25333B" />
          </g>
          <rect x={0} y={wreckY + 10} width={W} height={400} fill="#0B1418" />
        </svg>
        <Sub x={500} y={subY} s={1.1} light={depth > 0.4} />
      </Cam>
      <div style={{ position: "absolute", left: 60, top: 60, fontFamily: FONT, fontWeight: 700, color: "#9FE3FF", fontSize: 34, letterSpacing: 3 }}>DEPTH</div>
      <Counter from={0} to={12500} a={0.2} b={b(2)} fmt={(n) => `${Math.round(n).toLocaleString("en-US")} FT`} x={60} y={100} w={800} align="left" size={110} color="#fff" />
      <Pop at={b(1) + 3} x={60} y={250} w={900} size={48} color="#9FE3FF" align="left">NORTH ATLANTIC · NEAR FREEZING · PITCH DARK</Pop>
      {sec > b(2) && (
        <div style={{ position: "absolute", right: 80, top: 70, display: "flex", gap: 12 }}>
          {[...Array(12)].map((_, i) => {
            const k = ramp(sec, b(2) + 0.6 + i * 0.12, b(2) + 0.8 + i * 0.12);
            return <div key={i} style={{ width: 22, height: 90, background: C.gold, borderRadius: 6, transform: `scaleY(${k})`, transformOrigin: "bottom", border: "3px solid #111" }} />;
          })}
        </div>
      )}
      <Pop at={b(2) + 0.4} x={1100} y={190} w={760} size={110} color={C.gold} sw={5}>12 DIVES</Pop>
      <Words at={b(3) + 1.4} x={160} y={880} w={1600} size={56} text="ONE OF THE FEW PEOPLE ALIVE TO VISIT THE WRECK" />
      <Card at={b(4)} x={1150} y={420} w={640} h={300} bg="#111">
        <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: FONT, fontWeight: 700, color: C.ink }}>
          <div style={{ fontSize: 46 }}>🎞 REAL WRECK FOOTAGE</div>
          <div style={{ fontSize: 40, color: C.gold, marginTop: 14 }}>→ OPENS THE MOVIE</div>
        </div>
      </Card>
    </AbsoluteFill>
  );
};

// ================================================================== BUILD
const land = topojson.feature(world as any, (world as any).objects.countries) as any;
export const Build: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const proj = geoMercator().center([-112, 31]).scale(1500).translate([520, 520]);
  const path = geoPath(proj);
  const pin = proj([-117.06, 32.36])!; // Rosarito, Baja California
  const tankFill = ramp(sec, b(2), b(2) + 3.5);
  const pieces = (at: number) => ramp(sec, at, at + 0.6, 0, 1, Easing.out(Easing.back(1.4)));
  const hullK = pieces(b(3)), supK = pieces(b(3) + 0.8);
  const fun = [0, 1, 2, 3].map((i) => pieces(b(3) + 1.5 + i * 0.35));
  const mapO = ramp(sec, b(2) - 0.4, b(2) + 0.2, 1, 0);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "#0E3D73" }} />
      <Grid color="#ffffff18" step={60} />
      <Cam dur={dur} z0={1} z1={1.05}>
        {mapO > 0 && (
          <svg width={W} height={H} style={{ position: "absolute", opacity: mapO * ramp(sec, b(1), b(1) + 0.6) }}>
            {land.features.map((f: any, i: number) => <path key={i} d={path(f) ?? ""} fill="#1E5A9C" stroke="#9CC7FF" strokeWidth={2} />)}
            <circle cx={pin[0]} cy={pin[1]} r={16 + 6 * Math.sin(sec * 6)} fill={C.red} stroke="#fff" strokeWidth={4} />
          </svg>
        )}
        {mapO > 0 && <Pop at={b(1) + 0.8} x={pin[0] + 40} y={pin[1] - 140} w={800} size={60} align="left" color="#fff">NEW STUDIO · BAJA, MEXICO</Pop>}
        {sec > b(2) - 0.4 && (
          <svg width={W} height={H} style={{ position: "absolute", opacity: ramp(sec, b(2) - 0.4, b(2)) }}>
            {/* tank */}
            <rect x={260} y={420} width={1400} height={520} fill="none" stroke="#CFE6FF" strokeWidth={8} strokeDasharray="22 12" />
            <rect x={264} y={940 - 516 * tankFill * 0.72} width={1392} height={516 * tankFill * 0.72} fill="#2E86C1" opacity={0.75} />
          </svg>
        )}
        {sec > b(3) - 0.2 && (
          <div style={{ position: "absolute", inset: 0 }}>
            <div style={{ opacity: hullK, transform: `translateY(${(1 - hullK) * -400}px)` }}><Ship x={960} y={770} s={0.95} /></div>
          </div>
        )}
        {sec > b(3) - 0.2 && <svg width={W} height={H} style={{ position: "absolute" }}><rect x={264} y={770} width={1392} height={170} fill="#2E86C1" opacity={0.55} /></svg>}
        {sec > b(4) && [0, 1, 2].map((i) => <Stick key={i} x={700 + i * 160 + ((sec * 40 + i * 90) % 200)} y={770 - 74 * 0.95 - 4} s={0.3} walk />)}
      </Cam>
      <Counter from={0} to={17000000} a={b(2)} b={b(2) + 3.5} fmt={(n) => `${Math.round(n).toLocaleString("en-US")} GAL`} x={0} y={170} w={W} size={96} color="#fff" />
      <Pop at={b(3) + 1} x={0} y={290} w={W} size={70} color={C.gold} sw={3}>NEAR FULL-SCALE REPLICA</Pop>
      <Stamp at={b(4) + 0.2} text="NOT A MODEL" x={1500} y={380} color={C.red} size={80} />
      {sec > b(5) && (
        <div style={{ position: "absolute", left: 0, top: 50, width: W, display: "flex", justifyContent: "center", gap: 60, fontFamily: FONT, fontWeight: 700, fontSize: 64, color: "#fff" }}>
          {["🚢 A SHIP", "🎬 A STUDIO", "🌊 AN OCEAN"].map((t, i) => {
            const k = ramp(sec, b(5) + 1.6 + i * 0.6, b(5) + 2.0 + i * 0.6, 0, 1, Easing.out(Easing.back(2)));
            return <span key={t} style={{ transform: `scale(${k})`, display: "inline-block", background: "#0008", padding: "8px 28px", borderRadius: 20 }}>{t}</span>;
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ================================================================== MONEY PIT
export const Money: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const v = sec < b(1) ? 60 + ramp(sec, 0, b(1)) * 40 : sec < b(1) + 1.6 ? 100 : sec < b(1) + 3.2 ? 150 : 200;
  const shown = interpolate(sec, [0, b(1), b(1) + 0.4, b(1) + 1.6, b(1) + 2.0, b(1) + 3.2, b(1) + 3.6], [60, 100, 100, 100, 150, 150, 200], clamp);
  const barH = (shown / 200) * 640;
  const over = shown > 110;
  return (
    <AbsoluteFill>
      <Grad top="#1D2B1F" bottom="#0B140D" />
      <Cam dur={dur} z0={1} z1={1.07}>
        {/* budget thermometer */}
        <div style={{ position: "absolute", left: 140, top: 200, width: 160, height: 680, borderRadius: 80, border: "8px solid #fff", overflow: "hidden", background: "#0006" }}>
          <div style={{ position: "absolute", bottom: 0, width: "100%", height: barH, background: over ? C.red : C.green }} />
          <div style={{ position: "absolute", bottom: (100 / 200) * 640, width: "100%", height: 6, background: "#fff" }} />
        </div>
        <div style={{ position: "absolute", left: 320, top: 200 + 640 - (100 / 200) * 640 - 24, fontFamily: FONT, color: "#fff", fontSize: 32, fontWeight: 700 }}>← PLAN?</div>
        <BillStack x={1350} y={900} n={shown / 6} w={380} />
        {sec > b(2) && [...Array(10)].map((_, i) => {
          const l = sec - b(2) - i * 0.25;
          if (l < 0) return null;
          return <div key={i} style={{ position: "absolute", left: 900 + (i % 5) * 120, top: 700 - l * 260, fontSize: 70, opacity: Math.max(0, 1 - l / 2.2), transform: `rotate(${l * 90}deg)` }}>{i % 2 ? "💸" : "🔥"}</div>;
        })}
        {sec > b(3) - 0.3 && sec < b(4) - 0.2 && (
          <>
            <Studio x={760} y={940} label="STUDIO A" color="#3E6BBF" s={0.9} />
            <Studio x={1680} y={940} label="STUDIO B" color="#8E44AD" s={0.9} />
            <Pop at={b(3) + 0.8} x={960} y={600} w={500} size={110} color={C.gold}>+</Pop>
          </>
        )}
        {sec > b(4) - 0.2 && (
          <>
            <Stick x={820} y={940} s={1.5} pose={sec > b(4) + 2.5 ? "shrug" : "present"} hat="cap" hatColor={C.red} face="smile" />
            <Card at={b(4) + 0.6} x={980} y={380} w={360} h={170} bg="#FFF3C9"><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, textAlign: "center", marginTop: 50 }}>HIS FEE</div></Card>
            <Card at={b(4) + 1.4} x={1380} y={380} w={420} h={170} bg="#FFF3C9"><div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, textAlign: "center", marginTop: 50 }}>HIS PROFITS %</div></Card>
            <Stamp at={b(4) + 2.6} text="GIVEN UP" x={1390} y={465} color={C.red} size={90} />
          </>
        )}
      </Cam>
      <Counter from={60} to={200} a={-1} b={-0.5} fmt={() => `$${Math.round(shown)},000,000`} x={420} y={70} w={1400} align="left" size={130} color={over ? C.red : "#fff"} />
      <Pop at={b(0) + 0.4} x={420} y={220} w={900} size={44} color="#9BE3B5" align="left">BUDGET</Pop>
      {sec < b(3) - 0.3 && <Stamp at={b(1) + 3.4} text="OVER BUDGET" x={1300} y={380} color={C.red} size={96} />}
    </AbsoluteFill>
  );
};

// ================================================================== HEADLINES
export const Headlines: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec, frame, fps } = useT();
  const papers = ["MOST EXPENSIVE FILM EVER?", "DELAYED AGAIN", "WILL IT SINK?"];
  const reel = ramp(sec, b(3), b(3) + 3.6, 0, 1, Easing.in(Easing.quad));
  return (
    <AbsoluteFill>
      <Grad top="#3B1F1F" bottom="#170B0B" />
      <Cam dur={dur} z0={1.02} z1={1.1}>
        {sec < b(2) && (
          <>
            <Card at={0.1} x={660} y={150} w={600} h={520} bg="#FFFDF7">
              <div style={{ background: C.red, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 56, textAlign: "center", padding: 16 }}>RELEASE DATE</div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 110, textAlign: "center", marginTop: 60, color: "#222", textDecoration: sec > b(0) + 1.2 ? "line-through" : "none", textDecorationColor: C.red, textDecorationThickness: 10 }}>SUMMER</div>
              {sec > b(0) + 1.8 && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 96, textAlign: "center", color: C.red, transform: `scale(${spr(frame, fps, b(0) + 1.8, { damping: 9 })})` }}>DECEMBER</div>}
            </Card>
            <Stamp at={b(1) + 2.4} text="TROUBLE" x={960} y={800} size={120} />
          </>
        )}
        {sec >= b(2) && sec < b(3) && papers.map((t, i) => {
          const at = b(2) + i * 1.1;
          const s = spr(frame, fps, at, { damping: 11 });
          return (
            <div key={t} style={{ position: "absolute", left: 300 + i * 420, top: 220 + (i % 2) * 120, width: 520, height: 420, background: "#F2EEE3", border: "5px solid #111", opacity: Math.min(1, s),
              transform: `rotate(${(1 - s) * 720 + (i - 1) * 6}deg) scale(${s})`, boxShadow: "0 16px 0 #0008", fontFamily: SERIF, color: "#111", padding: 24, boxSizing: "border-box" }}>
              <div style={{ fontSize: 28, borderBottom: "3px solid #111", fontFamily: FONT, fontWeight: 700, letterSpacing: 4 }}>THE INDUSTRY BUZZ</div>
              <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, marginTop: 30 }}>{t}</div>
              <div style={{ marginTop: 26, height: 12, background: "#bbb", width: "90%" }} /><div style={{ marginTop: 10, height: 12, background: "#bbb", width: "70%" }} />
            </div>
          );
        })}
        {sec >= b(3) && (
          <>
            <Iceberg x={1500} y={700} s={1.3} />
            <div style={{ position: "absolute", left: 200 + reel * 1050, top: 560, fontSize: 150, transform: `rotate(${reel * 30}deg)` }}>🎞️</div>
            <Ocean y={700} color="#3A1414" color2="#170808" />
          </>
        )}
        {sec >= b(4) && (
          <>
            <Studio x={600} y={900} label="STUDIO A" color="#3E6BBF" s={0.7} crack={ramp(sec, b(4) + 1.5, b(4) + 2)} />
            <Studio x={1320} y={900} label="STUDIO B" color="#8E44AD" s={0.7} crack={ramp(sec, b(4) + 1.8, b(4) + 2.3)} />
          </>
        )}
      </Cam>
      {sec >= b(2) && sec < b(3) && <Pop at={b(2)} x={0} y={60} w={W} size={46} color="#FFB4B4">(PARAPHRASED · NOT REAL QUOTES)</Pop>}
    </AbsoluteFill>
  );
};

// ================================================================== VOYAGE MAP
const PTS = { southampton: [-1.4, 50.9], cherbourg: [-1.62, 49.63], queenstown: [-8.29, 51.85], sink: [-49.95, 41.73], ny: [-74.0, 40.7] } as const;
export const Voyage: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const proj = geoMercator().center([-38, 46]).scale(1180).translate([W / 2 + 80, H / 2 + 20]);
  const path = geoPath(proj);
  const P = (k: keyof typeof PTS) => proj(PTS[k] as any)!;
  const legs: [keyof typeof PTS, keyof typeof PTS][] = [["southampton", "cherbourg"], ["cherbourg", "queenstown"], ["queenstown", "sink"]];
  const prog = ramp(sec, b(1) + 1.5, b(4) + 1.2, 0, 3, Easing.inOut(Easing.sin));
  const pos = (() => {
    const i = Math.min(2, Math.floor(prog)), f = Math.min(1, prog - i);
    const a = P(legs[i][0]), c = P(legs[i][1]);
    return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];
  })();
  const ny = ramp(sec, b(4) + 2.2, b(4) + 3.6);
  return (
    <AbsoluteFill style={{ background: "#08223B" }}>
      <Cam dur={dur} z0={1} z1={1.06}>
        <svg width={W} height={H} style={{ position: "absolute" }}>
          {land.features.map((f: any, i: number) => <path key={i} d={path(f) ?? ""} fill="#C9B98F" stroke="#7A6A48" strokeWidth={1.5} />)}
          {legs.map(([a, c], i) => {
            const f = Math.max(0, Math.min(1, prog - i));
            const A = P(a), B = P(c);
            return <line key={i} x1={A[0]} y1={A[1]} x2={A[0] + (B[0] - A[0]) * f} y2={A[1] + (B[1] - A[1]) * f} stroke={C.red} strokeWidth={7} strokeLinecap="round" />;
          })}
          {ny > 0 && (() => { const A = P("sink"), B = P("ny"); return <line x1={A[0]} y1={A[1]} x2={A[0] + (B[0] - A[0]) * ny} y2={A[1] + (B[1] - A[1]) * ny} stroke="#fff" strokeWidth={5} strokeDasharray="14 12" opacity={0.7} />; })()}
          {(["southampton", "queenstown", "ny"] as const).map((k) => { const p = P(k); return <circle key={k} cx={p[0]} cy={p[1]} r={10} fill="#fff" stroke="#111" strokeWidth={3} />; })}
          {sec > b(1) && <g transform={`translate(${pos[0]} ${pos[1]})`}><circle r={18} fill={C.gold} stroke="#111" strokeWidth={4} /><text y={-28} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={30} fill="#fff">🚢</text></g>}
          {prog >= 2.98 && (() => { const p = P("sink"); return <g><circle cx={p[0]} cy={p[1]} r={30 + 14 * Math.sin(sec * 7)} fill="none" stroke={C.ice} strokeWidth={5} /><text x={p[0]} y={p[1] + 80} textAnchor="middle" fontSize={60}>🧊</text></g>; })()}
        </svg>
        {(() => { const p = P("southampton"); return <Pop at={b(1) + 0.4} x={p[0] - 260} y={p[1] - 100} w={300} size={30} color="#fff" align="right">SOUTHAMPTON</Pop>; })()}
        {(() => { const p = P("ny"); return <Pop at={b(1) + 1.6} x={p[0] - 140} y={p[1] + 26} w={300} size={30} color="#fff">NEW YORK</Pop>; })()}
        {(() => { const p = P("ny"); return <Pop at={b(4) + 3.4} x={p[0] - 200} y={p[1] + 70} w={420} size={34} color={C.red}>NEVER ARRIVED</Pop>; })()}
      </Cam>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(4,14,28,0.85) 0%, rgba(4,14,28,0) 32%)" }} />
      <Pop at={b(1)} x={60} y={60} w={900} size={80} color="#fff" align="left">APRIL 10, 1912</Pop>
      <Pop at={b(2)} x={60} y={170} w={1100} size={52} color={C.gold} align="left">LARGEST SHIP IN THE WORLD</Pop>
      <Pop at={b(2) + 1.8} x={60} y={240} w={1100} size={52} color="#fff" align="left">“UNSINKABLE”</Pop>
      {sec > b(3) && sec < b(4) && (
        <div style={{ position: "absolute", left: 60, top: 760, display: "flex", gap: 30 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} style={{ position: "relative", width: 90, height: 230 }}><Stick x={45} y={220} s={0.9} hat={i < 3 ? "top" : i === 4 ? "hair" : "flat"} hatColor={i < 3 ? C.gold : "#8D6E63"} prop={i >= 3 ? "briefcase" : "none"} bob={3 + i} /></div>)}
        </div>
      )}
      <Pop at={b(3) + 0.5} x={60} y={680} w={900} size={40} color="#fff" align="left">THE VERY RICH · FAMILIES STARTING OVER</Pop>
      <Pop at={b(4)} x={1100} y={60} w={760} size={80} color={C.ice} align="right">APRIL 14 · LATE NIGHT</Pop>
    </AbsoluteFill>
  );
};

// ================================================================== LIFEBOATS
export const Lifeboats: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const N = 100, seats = 53; // 2,224 aboard vs ~1,178 seats → ~53%
  const move = ramp(sec, b(1) + 1.2, b(1) + 3.2);
  const half = ramp(sec, b(3), b(3) + 1.0);
  return (
    <AbsoluteFill>
      <Grad top="#0C1B33" bottom="#060C18" />
      <Cam dur={dur} z0={1} z1={1.05}>
        <svg width={W} height={H} style={{ position: "absolute" }}>
          {/* boats */}
          {sec > b(1) && [...Array(20)].map((_, i) => {
            const x = 140 + (i % 10) * 168, y = 760 + Math.floor(i / 10) * 130;
            const k = ramp(sec, b(1) + i * 0.04, b(1) + 0.3 + i * 0.04);
            return <path key={i} transform={`translate(${x} ${y}) scale(${k})`} d="M-70,-20 L70,-20 L52,20 L-52,20 Z" fill="#E8DCC0" stroke="#111" strokeWidth={4} />;
          })}
          {[...Array(N)].map((_, i) => {
            const gx = 180 + (i % 25) * 62, gy = 210 + Math.floor(i / 25) * 92;
            const inBoat = i < seats;
            const bi = i % 20, slot = Math.floor(i / 20);
            const bx = 140 + (bi % 10) * 168 - 40 + slot * 22, by = 760 + Math.floor(bi / 10) * 130 - 40;
            const x = inBoat ? gx + (bx - gx) * move : gx, y = inBoat ? gy + (by - gy) * move : gy;
            const appear = ramp(sec, i * 0.012, 0.3 + i * 0.012);
            const empty = inBoat && i % 2 === 1 ? 1 - half * 0.85 : 1;
            const col = !inBoat && move > 0.9 ? C.red : "#F5EFE2";
            return (
              <g key={i} transform={`translate(${x} ${y}) scale(${appear * (inBoat ? 1 - move * 0.45 : 1)})`} opacity={empty}>
                <circle cx={0} cy={-26} r={11} fill={col} />
                <path d="M-14,-12 L14,-12 L10,24 L-10,24 Z" fill={col} />
              </g>
            );
          })}
        </svg>
      </Cam>
      <Counter from={0} to={2224} a={0.2} b={2.4} fmt={(n) => `~${Math.round(n).toLocaleString("en-US")} ON BOARD`} x={0} y={60} w={W} size={84} color="#fff" />
      <Pop at={b(0) + 2.6} x={1380} y={150} w={500} size={30} color="#9DB4D8" align="right">1 ICON ≈ 22 PEOPLE</Pop>
      <Pop at={b(1) + 0.4} x={0} y={160} w={W} size={60} color={C.gold}>20 LIFEBOATS · ~1,178 SEATS</Pop>
      <Pop at={b(2) + 1} x={0} y={590} w={W} size={74} color={C.red} sw={3}>1,000+ WITH NO SEAT</Pop>
      <Pop at={b(3) + 0.6} x={0} y={680} w={W} size={56} color="#fff" out={b(4)}>MANY BOATS LEFT HALF EMPTY</Pop>
      <Stamp at={b(4) + 1.0} text="BAD PLANNING" x={960} y={380} size={110} />
    </AbsoluteFill>
  );
};

// ================================================================== SINKING
export const Sinking: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const hit = b(0) + 0.6;
  const berg = interpolate(sec, [0, hit], [2200, 1500], { ...clamp, easing: Easing.out(Easing.quad) });
  const flash = interpolate(sec, [hit - 0.05, hit + 0.05, hit + 0.6], [0, 0.8, 0], clamp);
  const shake = sec > hit && sec < hit + 0.8 ? Math.sin(sec * 80) * 10 * (1 - (sec - hit) / 0.8) : 0;
  const tilt = ramp(sec, b(1), b(3), 0, 1);
  const split = sec > b(3) + 0.3;
  const crack = ramp(sec, b(3) - 0.2, b(3) + 0.3);
  const after = ramp(sec, b(3) + 0.3, b(4) + 3.5, 0, 1, Easing.in(Easing.quad));
  const dawn = ramp(sec, b(5) - 0.5, b(5) + 2);
  const flood = ramp(sec, b(1), b(2) + 1);
  const clock = sec < b(4) ? "11:40 PM" : "2:20 AM";
  return (
    <AbsoluteFill>
      <Grad top={dawn > 0 ? "#2C3E66" : "#03060F"} bottom="#0D2240" />
      <AbsoluteFill style={{ background: "linear-gradient(180deg,#F6B48A 0%,#5E7BB3 60%,#0D2240 100%)", opacity: dawn * 0.8 }} />
      <Stars n={70} maxY={500} />
      <Cam dur={dur} z0={1.05} z1={1.12} x0={shake}>
        {!split ? (
          <Ship x={760} y={700 + tilt * 60} s={1.15} rot={tilt * 14} lights={sec < b(3)} crack={crack} id="sk" />
        ) : (
          <Ship x={760} y={760 + after * 520} s={1.15} rot={0} split lights={false} id="sk"
            sternRot={-14 * (1 - after) - 70 * Math.min(1, after * 1.4)} sternDx={0} sternDy={-40 * (1 - after)}
            bowRot={22 + 30 * after} bowDy={60 + 400 * after} />
        )}
        {/* flooding compartments overlay (before split) */}
        {!split && flood > 0 && (
          <svg width={W} height={H} style={{ position: "absolute" }}>
            <g transform={`translate(760 ${700 + tilt * 60}) scale(1.15) rotate(${tilt * 14} 0 0)`}>
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const k = ramp(sec, b(1) + i * 0.6, b(1) + 0.6 + i * 0.6);
                return <rect key={i} x={440 - i * 70 - 60} y={-60 + 100 * (1 - k)} width={60} height={100 * k} fill="#3DA5FF" opacity={0.75} />;
              })}
            </g>
          </svg>
        )}
        <div style={{ opacity: 1 - ramp(sec, b(2), b(3)) }}><Iceberg x={berg} y={720} s={1.4} /></div>
        <Ocean y={735} color="#0E2E52" color2="#030A15" amp={12} />
        {dawn > 0 && (
          <svg width={W} height={H} style={{ position: "absolute", opacity: dawn }}>
            <g transform="translate(1500 730) scale(0.35)"><rect x={0} y={-70} width={1000} height={110} fill="#1A1A1A" /><rect x={300} y={-160} width={400} height={90} fill="#EEE" /><rect x={480} y={-300} width={60} height={140} fill="#C0392B" /></g>
          </svg>
        )}
      </Cam>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      <div style={{ position: "absolute", left: 60, top: 50, fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 90, ...stroke(4) }}>🕰 {clock}</div>
      <Pop at={b(1) + 0.3} x={60} y={170} w={900} size={44} color="#9FD3FF" align="left" out={b(3)}>FRONT COMPARTMENTS FLOODING</Pop>
      <Pop at={b(3)} x={0} y={180} w={W} size={110} color={C.ice} sw={5} out={b(4)}>IT BREAKS IN TWO</Pop>
      <Pop at={b(4) + 2.4} x={0} y={300} w={W} size={84} color="#fff" out={b(5) - 0.2}>~1,500 LIVES LOST</Pop>
      <Pop at={b(5) + 1.5} x={0} y={300} w={W} size={70} color="#fff" out={b(6) - 0.1}>RESCUE SHIP CARPATHIA · ~700 SURVIVORS</Pop>
      {sec > b(6) && (
        <div style={{ position: "absolute", left: 360, top: 330, width: 1200 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 56, textAlign: "center", marginBottom: 16 }}>IMPACT → FINAL PLUNGE: 2 h 40 min</div>
          <div style={{ height: 30, background: "#ffffff33", borderRadius: 15 }}><div style={{ height: 30, width: `${ramp(sec, b(6), b(6) + 2.5) * 100}%`, background: C.red, borderRadius: 15 }} /></div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ================================================================== COMPARE: SHIP vs MOVIE
export const Compare: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const shipBar = ramp(sec, b(1), b(1) + 1) * (sec > b(2) + 1 ? interpolate(ramp(sec, b(2) + 1, b(2) + 2.5), [0, 1], [7.5, 120]) : 7.5);
  const movieBar = ramp(sec, b(3), b(3) + 1.6) * 200;
  const scale = 2.7;
  return (
    <AbsoluteFill>
      <Grad top="#2A1F3D" bottom="#120D1C" />
      <Cam dur={dur} z0={1} z1={1.05}>
        <svg width={W} height={H} style={{ position: "absolute" }}>
          <line x1={300} y1={840} x2={1620} y2={840} stroke="#fff" strokeWidth={5} />
          <rect x={480} y={840 - shipBar * scale} width={300} height={shipBar * scale} fill="#5E7A86" stroke="#111" strokeWidth={5} />
          <rect x={1140} y={840 - movieBar * scale} width={300} height={movieBar * scale} fill={C.gold} stroke="#111" strokeWidth={5} />
        </svg>
        <div style={{ position: "absolute", left: 380, top: 852, width: 500, textAlign: "center", fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 40 }}>THE REAL SHIP</div>
        <div style={{ position: "absolute", left: 1040, top: 852, width: 500, textAlign: "center", fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 40, opacity: ramp(sec, b(3), b(3) + 0.4) }}>THE MOVIE</div>
        <Pop at={b(1) + 0.6} x={380} y={840 - 7.5 * scale - 110} w={500} size={64} color="#fff" out={b(2) + 1}>$7.5M (1912)</Pop>
        <Pop at={b(2) + 2.4} x={380} y={840 - 120 * scale - 100} w={500} size={60} color="#fff">≈ $120M (1997 $)</Pop>
        <Pop at={b(3) + 1.6} x={1040} y={840 - 200 * scale - 100} w={500} size={70} color={C.gold} sw={3}>$200M</Pop>
      </Cam>
      <Pop at={b(0)} x={0} y={50} w={W} size={70} color="#fff" out={b(1)}>A STRANGE DETAIL…</Pop>
      <Stamp at={b(3) + 2.4} text="MOVIE > SHIP" x={760} y={330} color={C.gold} size={80} />
      <Words at={b(4) + 0.2} y={40} size={52} text="HOLLYWOOD REBUILT HISTORY FOR MORE THAN HISTORY COST" hot={{ MORE: C.gold }} />
      <Pop at={b(2)} x={1460} y={900} w={440} size={24} color="#B9A9D9" align="right">INFLATION ≈ ×16 (US CPI, ROUGH)</Pop>
    </AbsoluteFill>
  );
};

// ================================================================== BOX OFFICE
export const BoxOffice: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec, frame, fps } = useT();
  // illustrative weekly curve: Titanic vs a typical film
  const weeksT = [28.6, 35.5, 34, 33, 30, 28, 26, 24, 22, 20, 18, 17, 15, 14, 13];
  const weeksTyp = [28.6, 15, 8, 4, 2, 1, 0.5, 0.3, 0.2, 0.1, 0, 0, 0, 0, 0];
  const show = ramp(sec, b(1), b(4) + 2, 0, 15);
  const chartX = 260, chartY = 800, bw = 52, k = 12;
  const total = sec < b(7) ? 0 : interpolate(sec, [b(7), b(7) + 3, b(8), b(8) + 1.5], [0.2, 1.0, 1.0, 1.84], clamp);
  return (
    <AbsoluteFill>
      <Grad top="#1A1030" bottom="#0B0716" />
      <Cam dur={dur} z0={1} z1={1.06}>
        {sec < b(1) && (
          <>
            <div style={{ position: "absolute", left: 560, top: 140, width: 800, height: 280, background: "#B71C1C", border: "10px solid #F2B33D", borderRadius: 20, boxShadow: `0 0 ${40 + 20 * Math.sin(sec * 6)}px #F2B33D` }}>
              <div style={{ textAlign: "center", fontFamily: FONT, fontWeight: 700, color: "#FFF3C4", fontSize: 54, marginTop: 30 }}>NOW SHOWING</div>
              <div style={{ textAlign: "center", fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 92 }}>DEC 19, 1997</div>
            </div>
            {[...Array(9)].map((_, i) => <Stick key={i} x={300 + i * 160} y={920} s={0.9} walk hat={i % 3 === 0 ? "cap" : i % 3 === 1 ? "hair" : "none"} hatColor={["#E5484D", "#8D6E63", "#4FC3F7"][i % 3]} />)}
          </>
        )}
        {sec >= b(1) && sec < b(5) && (
          <svg width={W} height={H} style={{ position: "absolute" }}>
            <line x1={chartX - 20} y1={chartY} x2={chartX + 15 * (bw + 24)} y2={chartY} stroke="#fff" strokeWidth={4} />
            {weeksT.map((v, i) => {
              const g = Math.max(0, Math.min(1, show - i));
              const vt = sec > b(3) ? weeksTyp[i] : 0;
              return (
                <g key={i}>
                  <rect x={chartX + i * (bw + 24)} y={chartY - v * k * g} width={bw} height={v * k * g} fill={C.gold} stroke="#111" strokeWidth={3} />
                  {sec > b(3) && <rect x={chartX + i * (bw + 24) + bw * 0.25} y={chartY - vt * k * ramp(sec, b(3) + i * 0.08, b(3) + 0.3 + i * 0.08)} width={bw * 0.5} height={vt * k * ramp(sec, b(3) + i * 0.08, b(3) + 0.3 + i * 0.08)} fill="#7E8AA0" />}
                  <text x={chartX + i * (bw + 24) + bw / 2} y={chartY + 40} textAnchor="middle" fontFamily={FONT} fontSize={24} fill="#aaa">W{i + 1}</text>
                </g>
              );
            })}
          </svg>
        )}
        {sec >= b(5) && sec < b(7) && (
          <div style={{ position: "absolute", left: 360, top: 260, width: 1200, display: "flex", flexWrap: "wrap", gap: 26, justifyContent: "center" }}>
            {[...Array(15)].map((_, i) => {
              const s = spr(frame, fps, b(6) + 0.6 + i * 0.22, { damping: 9, stiffness: 220 });
              return <div key={i} style={{ width: 200, height: 150, borderRadius: 24, background: s > 0.5 ? C.gold : "#ffffff15", border: "5px solid #111", transform: `scale(${0.6 + 0.4 * s})`,
                display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700, fontSize: 64, color: "#111" }}>#1</div>;
            })}
          </div>
        )}
        {sec >= b(5) && sec < b(6) + 0.4 && [...Array(14)].map((_, i) => (
          <Bubble key={i} at={b(5) + i * 0.12} out={b(6) + 0.2} x={180 + (i * 137) % 1560} y={300 + ((i * 211) % 560)} text={["SEE IT!", "AGAIN!", "WOW", "GO!", "😭", "AMAZING"][i % 6]} size={34} />
        ))}
      </Cam>
      <Pop at={b(1) + 0.3} x={120} y={60} w={1100} size={60} color="#fff" align="left" out={b(5)}>OPENING WEEKEND: ~$28.6M</Pop>
      <Stamp at={b(2) + 1.4} text="WEEK 2 WENT UP" x={1420} y={260} color={C.green} size={70} />
      <Pop at={b(3) + 0.5} x={1180} y={360} w={680} size={38} color="#C5CDDA" align="right" out={b(5)}>GREY = A TYPICAL MOVIE (ILLUSTRATIVE)</Pop>
      <Pop at={b(5)} x={0} y={110} w={W} size={84} color="#fff" out={b(6)}>WORD OF MOUTH</Pop>
      <Pop at={b(6)} x={0} y={110} w={W} size={70} color="#fff" out={b(7)}>#1 IN THE US · 15 WEEKENDS IN A ROW</Pop>
      {sec >= b(7) && (
        <>
          <AbsoluteFill style={{ background: "#0B0716" }} />
          {[...Array(26)].map((_, i) => {
            const l = sec - b(7) - 2.4 - (i % 6) * 0.25;
            if (l < 0 || l > 1.6) return null;
            const cx = 300 + ((i * 271) % 1320), cy = 300 + ((i * 113) % 300), a = (i * 47) % 360;
            return <div key={i} style={{ position: "absolute", left: cx + Math.cos(a) * l * 260, top: cy + Math.sin(a) * l * 260 + l * l * 120, width: 16, height: 16, borderRadius: 8, background: [C.gold, C.red, "#4FC3F7", "#fff"][i % 4], opacity: 1 - l / 1.6 }} />;
          })}
          <Counter from={0} to={1} a={-1} b={-0.5} fmt={() => total >= 1 ? `$${total.toFixed(total > 1.01 ? 2 : 0).replace(/\.00$/, "")} BILLION` : `$${Math.round(total * 1000)} MILLION`} x={0} y={380} w={W} size={170} color={total >= 1 ? C.gold : "#fff"} />
          <Pop at={b(7) + 3} x={0} y={600} w={W} size={70} color="#fff" out={b(8)}>FIRST MOVIE EVER TO PASS $1 BILLION</Pop>
          <Pop at={b(8) + 1.4} x={0} y={600} w={W} size={60} color="#fff">FIRST RUN · WORLDWIDE</Pop>
        </>
      )}
    </AbsoluteFill>
  );
};

// ================================================================== OSCARS
export const Oscars: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec, frame, fps } = useT();
  const spot = 0.5 + 0.5 * Math.sin(sec * 1.5);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 30%, #4A1020 0%, #1A0610 70%)" }} />
      {/* curtains */}
      <svg width={W} height={H} style={{ position: "absolute" }}>
        {[...Array(8)].map((_, i) => <path key={i} d={`M${i * 40},0 Q${i * 40 + 30},540 ${i * 40},1080`} stroke="#8E1029" strokeWidth={38} fill="none" />)}
        {[...Array(8)].map((_, i) => <path key={`r${i}`} d={`M${W - i * 40},0 Q${W - i * 40 - 30},540 ${W - i * 40},1080`} stroke="#8E1029" strokeWidth={38} fill="none" />)}
        <polygon points={`${760 + spot * 400},0 ${560 + spot * 400},1080 ${1100 + spot * 400},1080`} fill="#FFF6D0" opacity={0.08} />
      </svg>
      <Cam dur={dur} z0={1} z1={1.06}>
        {sec > b(1) && sec < b(3) && [...Array(14)].map((_, i) => {
          const win = i < 11;
          const s = spr(frame, fps, b(1) + 1.2 + i * 0.22, { damping: 9, stiffness: 220 });
          return <div key={i} style={{ position: "absolute", left: 0, top: 0, transform: `scale(${win ? s : 1})`, transformOrigin: `${250 + (i % 7) * 240}px ${560 + Math.floor(i / 7) * 280}px`, opacity: win ? 1 : ramp(sec, b(1) + 0.4, b(1) + 1) }}>
            <Trophy x={250 + (i % 7) * 240} y={560 + Math.floor(i / 7) * 280} s={1.15} dim={!win} />
          </div>;
        })}
        {sec >= b(2) && sec < b(3) && (
          <svg width={W} height={H} style={{ position: "absolute" }}>
            <g transform={`translate(960 900) rotate(${Math.sin(sec * 2) * 2})`}><line x1={-500} y1={0} x2={500} y2={0} stroke={C.gold} strokeWidth={12} /><polygon points="-30,70 30,70 0,0" fill={C.gold} /></g>
          </svg>
        )}
        {sec >= b(3) && (
          <svg width={W} height={H} style={{ position: "absolute" }}>
            <g transform={`translate(960 560) rotate(${sec * 120})`}>
              <circle r={260} fill="#111" /><circle r={250} fill="none" stroke="#333" strokeWidth={4} /><circle r={200} fill="none" stroke="#333" strokeWidth={4} /><circle r={150} fill="none" stroke="#333" strokeWidth={4} />
              <circle r={80} fill={C.red} /><circle r={10} fill="#111" />
            </g>
            {[...Array(8)].map((_, i) => { const l = ((sec * 0.6 + i / 8) % 1); return <text key={i} x={960 + Math.cos(i) * (300 + l * 300)} y={560 - l * 380} fontSize={70} fill="#fff" opacity={1 - l} textAnchor="middle">♪</text>; })}
          </svg>
        )}
      </Cam>
      <Pop at={b(0)} x={0} y={80} w={W} size={110} color={C.gold} sw={4} out={b(1)}>THE OSCARS</Pop>
      <Pop at={b(1)} x={0} y={70} w={W} size={84} color="#fff" out={b(2)}>14 NOMINATIONS → 11 WINS</Pop>
      <Pop at={b(1) + 3.8} x={0} y={180} w={W} size={46} color={C.gold} out={b(2)}>INCLUDING BEST PICTURE & BEST DIRECTOR</Pop>
      <Pop at={b(2) + 0.3} x={0} y={70} w={W} size={76} color="#fff" out={b(3)}>11 WINS = ALL-TIME RECORD (TIED)</Pop>
      <Pop at={b(2) + 1.4} x={0} y={170} w={W} size={50} color={C.gold} out={b(3)}>MATCHING BEN-HUR (1959)</Pop>
      <Pop at={b(3) + 0.6} x={0} y={60} w={W} size={60} color="#fff" out={b(4)}>ONE OF THE BEST-SELLING FILM SCORES EVER</Pop>
      <Pop at={b(4) + 0.4} x={0} y={820} w={W} size={96} color={C.gold} sw={4}>THE ULTIMATE COMEBACK</Pop>
    </AbsoluteFill>
  );
};

// ================================================================== WHY IT WORKED
export const Reasons: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const water = ramp(sec, b(4) + 2.5, b(4) + 6);
  const cards = [
    { at: b(1), n: "1", t: "YOU KNOW THE ENDING", c: "#3E6BBF" },
    { at: b(3), n: "2", t: "A MAP OF SOCIETY", c: "#8E44AD" },
    { at: b(5), n: "3", t: "A FAKE COUPLE, A REAL TRAGEDY", c: C.red },
  ];
  const active = sec < b(3) ? 0 : sec < b(5) ? 1 : sec < b(7) ? 2 : 3;
  return (
    <AbsoluteFill>
      <Grad top="#10233F" bottom="#081325" />
      <Pop at={b(0) + 0.2} x={0} y={50} w={W} size={84} color="#fff" sw={3} out={b(1)}>3 REASONS IT WORKED</Pop>
      {/* reason tabs */}
      <div style={{ position: "absolute", left: 0, top: 50, width: W, display: "flex", justifyContent: "center", gap: 30, opacity: sec > b(1) ? 1 : 0 }}>
        {cards.map((c, i) => (
          <div key={i} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, padding: "12px 26px", borderRadius: 20, border: "5px solid #111",
            background: sec > c.at ? (active === i || active === 3 ? c.c : "#ffffff22") : "#ffffff08", color: "#fff", transform: `scale(${active === i ? 1.12 : 0.92})` }}>{c.n}. {sec > c.at ? c.t : "?"}</div>
        ))}
      </div>
      <Cam dur={dur} z0={1} z1={1.04}>
        {active === 0 && sec > b(1) && (
          <>
            <Ship x={760 + ((sec - b(1)) * 40) % 300} y={700} s={0.8} lights />
            <Iceberg x={1650} y={700} s={1.1} />
            <Ocean y={705} />
            <div style={{ position: "absolute", left: 660, top: 200, width: 600, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 150, color: C.red, ...stroke(5) }}>
              ⏳ {Math.max(0, 10 - Math.floor((sec - b(2)) * 1.2)).toString().padStart(2, "0")}
            </div>
            <Pop at={b(2) + 3.2} x={0} y={860} w={W} size={60} color="#fff">EVERY HAPPY MOMENT = A COUNTDOWN</Pop>
          </>
        )}
        {active === 1 && (
          <svg width={W} height={H} style={{ position: "absolute" }}>
            {[["1ST CLASS", C.gold], ["2ND CLASS", "#9AA6B2"], ["3RD CLASS", "#4F6D8A"]].map(([t, col], i) => (
              <g key={i} opacity={ramp(sec, b(4) + i * 0.9, b(4) + 0.4 + i * 0.9)}>
                <rect x={360} y={280 + i * 190} width={1200} height={170} fill={col as string} stroke="#111" strokeWidth={6} rx={16} />
                <text x={420} y={385 + i * 190} fontFamily={FONT} fontWeight={700} fontSize={64} fill="#111">{t}</text>
                {[...Array(6)].map((_, j) => <g key={j} transform={`translate(${1000 + j * 80} ${420 + i * 190})`}><circle cx={0} cy={-80} r={14} fill="#111" /><rect x={-10} y={-64} width={20} height={44} fill="#111" /></g>)}
              </g>
            ))}
            <rect x={340} y={850 - water * 330} width={1240} height={water * 330} fill="#2E86C1" opacity={0.7} />
            <text x={960} y={1010} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={44} fill="#fff" opacity={water}>WHERE YOU SLEEP DECIDES WHETHER YOU LIVE</text>
          </svg>
        )}
        {active === 2 && (
          <>
            <div style={{ position: "absolute", left: 300, top: 300, fontFamily: FONT, fontWeight: 700, fontSize: 210, color: "#7E8AA0", opacity: ramp(sec, b(6), b(6) + 0.5) }}>1,500</div>
            <div style={{ position: "absolute", left: 300, top: 540, fontFamily: FONT, fontWeight: 700, fontSize: 60, color: "#7E8AA0", opacity: ramp(sec, b(6) + 0.6, b(6) + 1) }}>= A NUMBER</div>
            <Stick x={1300} y={820} s={1.4} hat="flat" hatColor="#8D6E63" pose="stand" />
            <Stick x={1480} y={820} s={1.35} hat="hair" hatColor="#C0392B" pose="stand" flip />
            <div style={{ position: "absolute", left: 1290, top: 260, fontSize: 200, transform: `scale(${1 + 0.08 * Math.sin(sec * 7)})`, opacity: ramp(sec, b(6) + 2.6, b(6) + 3) }}>❤️</div>
            <div style={{ position: "absolute", left: 1220, top: 860, fontFamily: FONT, fontWeight: 700, fontSize: 60, color: C.red, opacity: ramp(sec, b(6) + 3, b(6) + 3.4) }}>= A FEELING</div>
          </>
        )}
        {active === 3 && <Words at={b(7) + 0.2} y={430} size={96} text="PEOPLE DIDN'T JUST WATCH IT. THEY FELT IT." hot={{ FELT: C.red, "IT.": C.red }} />}
      </Cam>
    </AbsoluteFill>
  );
};

// ================================================================== FLAWS
export const Flaws: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const sub = Math.max(0, 1 - ramp(sec, b(2) + 1.2, b(2) + 2.2)) * 100;
  return (
    <AbsoluteFill>
      <Grad top="#3A1416" bottom="#150708" />
      <Pop at={b(0)} x={0} y={50} w={W} size={96} color="#fff" sw={3}>NOT A PERFECT MOVIE</Pop>
      <Cam dur={dur} z0={1} z1={1.04}>
        <Card at={b(1)} x={90} y={220} w={540} h={560} bg="#FFF3C9">
          <div style={{ fontSize: 170, textAlign: "center", marginTop: 40 }}>🧀</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 54, textAlign: "center", marginTop: 20 }}>CHEESY<br />DIALOGUE</div>
        </Card>
        <Card at={b(2)} x={690} y={220} w={540} h={560} bg="#E8EAF0">
          <div style={{ position: "relative", height: 330 }}><Stick x={270} y={320} s={1.1} hat="top" hatColor="#222" mustache face="frown" pose="think" color="#222" /></div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, textAlign: "center" }}>VILLAIN SUBTLETY</div>
          <div style={{ margin: "16px 40px", height: 34, background: "#ccc", borderRadius: 17, border: "4px solid #111" }}><div style={{ height: "100%", width: `${sub}%`, background: C.red, borderRadius: 13 }} /></div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 48, textAlign: "center", color: C.red }}>{Math.round(sub)}%</div>
        </Card>
        <Card at={b(3)} x={1290} y={220} w={540} h={560} bg="#DFF3FF">
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 140, textAlign: "center", marginTop: 60 }}>3:14</div>
          <div style={{ fontSize: 120, textAlign: "center" }}>🍿</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 46, textAlign: "center" }}>BRING SNACKS</div>
        </Card>
        {sec > b(4) && sec < b(5) && (
          <div style={{ position: "absolute", left: 0, top: 830, width: W, display: "flex", justifyContent: "center", gap: 60, fontFamily: FONT, fontWeight: 700, fontSize: 52, color: "#fff" }}>
            <span style={{ opacity: ramp(sec, b(4) + 0.6, b(4) + 1) }}>SPECTACLE 👍</span><span style={{ opacity: ramp(sec, b(4) + 2.6, b(4) + 3) }}>ROMANCE 🙄</span>
          </div>
        )}
        {sec > b(5) && [...Array(30)].map((_, i) => {
          const l = sec - b(5) - i * 0.08;
          if (l < 0) return null;
          return <div key={i} style={{ position: "absolute", left: ((i * 263) % 1800), top: -150 + l * 700 + ((i * 37) % 200), fontSize: 80, transform: `rotate(${l * 120 + i * 30}deg)` }}>🎟️</div>;
        })}
      </Cam>
    </AbsoluteFill>
  );
};

// ================================================================== THE DOOR
export const Door: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec, frame, fps } = useT();
  const both = sec > b(6) + 2.2 && sec < b(7);
  const sinkDoor = both ? ramp(sec, b(6) + 2.4, b(6) + 3.2) * 34 : 0;
  const fit = 50 + 18 * Math.sin(sec * 1.7) + 8 * Math.sin(sec * 4.3);
  const temp = ramp(sec, b(7), b(7) + 4.5);
  return (
    <AbsoluteFill>
      <Grad top="#02050D" bottom="#0B1E36" />
      <Stars n={60} maxY={420} />
      <Cam dur={dur} z0={1.0} z1={1.1} y1={-20}>
        <svg width={W} height={H} style={{ position: "absolute" }}>
          <g transform={`translate(960 ${742 + sinkDoor + Math.sin(sec * 2) * 4}) rotate(${Math.sin(sec * 1.3) * 2})`}>
            <rect x={-230} y={-26} width={460} height={52} rx={8} fill="#8D6E63" stroke="#4E342E" strokeWidth={6} />
            <rect x={-200} y={-16} width={180} height={32} fill="none" stroke="#6D4C41" strokeWidth={4} />
            <rect x={20} y={-16} width={180} height={32} fill="none" stroke="#6D4C41" strokeWidth={4} />
          </g>
        </svg>
        {/* Rose lying on the door */}
        <Stick x={1100} y={712 + sinkDoor} s={0.9} pose="lie" rot={-90} hat="hair" hatColor="#C0392B" face="flat" />
        {/* Jack in the water (or both on the door during the test) */}
        {!both ? <Stick x={1250} y={880} s={0.95} pose={sec > b(2) + 2.5 ? "stand" : "swim"} hat="flat" hatColor="#8D6E63" face={sec > b(2) + 3 ? "flat" : "smile"} /> :
          <Stick x={860} y={712 + sinkDoor} s={0.9} pose="lie" rot={-90} hat="flat" hatColor="#8D6E63" face="o" />}
        <Ocean y={760} color="#0E2E52" color2="#030A15" amp={9} opacity={0.93} />
        {sec > b(2) + 2.8 && sec < b(3) + 1 && <div style={{ position: "absolute", left: 1280, top: 640, fontSize: 70 }}>🥶</div>}
        {sec > b(4) - 0.2 && sec < b(5) && ["🖼️ MEMES", "📊 POLLS", "▶️ VIDEOS", "🧪 THEORIES"].map((t, i) => (
          <Bubble key={t} at={b(4) + i * 0.6} out={b(5)} x={300 + i * 440} y={360} text={t} size={44} />
        ))}
        {sec > b(5) && sec < b(6) && (
          <>
            <Bubble at={b(5)} out={b(6)} x={560} y={360} text="📺 TV MYTH TESTERS" size={46} />
            <Bubble at={b(5) + 1.6} out={b(6)} x={1360} y={360} text="🧮 SCIENTISTS" size={46} />
          </>
        )}
      </Cam>
      <Pop at={b(1)} x={0} y={70} w={W} size={130} color="#fff" sw={5} out={b(3)}>COULD JACK FIT?</Pop>
      {sec > b(3) && sec < b(6) && (
        <div style={{ position: "absolute", left: 460, top: 90, width: 1000 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, color: "#fff", fontSize: 44, marginBottom: 10, textAlign: "center" }}>THE INTERNET'S VOTE (DECADES OF ARGUING)</div>
          <div style={{ display: "flex", height: 70, borderRadius: 35, overflow: "hidden", border: "5px solid #111" }}>
            <div style={{ width: `${fit}%`, background: C.green, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 40, display: "flex", alignItems: "center", paddingLeft: 24 }}>FIT</div>
            <div style={{ flex: 1, background: C.red, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 40, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 24 }}>NO FIT</div>
          </div>
        </div>
      )}
      {sec > b(6) && sec < b(7) && (
        <div style={{ position: "absolute", left: 0, top: 90, width: W, display: "flex", justifyContent: "center", gap: 60, fontFamily: FONT, fontWeight: 700, fontSize: 64 }}>
          <span style={{ color: C.green, opacity: ramp(sec, b(6) + 0.3, b(6) + 0.6) }}>SIZE ✓</span>
          <span style={{ color: C.amber, opacity: ramp(sec, b(6) + 2.2, b(6) + 2.5) }}>BUOYANCY ?</span>
        </div>
      )}
      {sec > b(7) && sec < b(9) && (
        <>
          <Pop at={b(7)} x={0} y={70} w={W} size={70} color="#fff">2023 · HYPOTHERMIA EXPERIMENT</Pop>
          <div style={{ position: "absolute", left: 120, top: 220, width: 70, height: 360, borderRadius: 35, border: "6px solid #fff", background: "#0006", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${90 - temp * 60}%`, background: interpolate(temp, [0, 1], [0, 1]) > 0.5 ? "#4FC3F7" : C.red }} />
          </div>
          <Pop at={b(8) + 1.0} x={0} y={180} w={W} size={84} color={C.gold} sw={3}>“MIGHT HAVE SURVIVED…”</Pop>
          <Pop at={b(8) + 2.4} x={0} y={290} w={W} size={70} color="#fff">…MAYBE.</Pop>
        </>
      )}
      {sec > b(9) && (
        <div style={{ position: "absolute", left: 0, top: 160, width: W, textAlign: "center", transform: `scale(${spr(frame, fps, b(9), { damping: 9 })})` }}>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 90, background: "#fff", color: "#111", padding: "18px 50px", borderRadius: 40, border: "6px solid #111", boxShadow: "0 12px 0 #111" }}>💬 FIT or NO FIT?</span>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 54, color: "#fff", marginTop: 40 }}>TELL ME IN THE COMMENTS</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ================================================================== VERDICT
export const Verdict: React.FC<SceneProps> = ({ b, dur }) => {
  const { sec } = useT();
  const cost = ramp(sec, b(2), b(2) + 1) * 200;
  const gross = ramp(sec, b(3), b(3) + 2.2, 0, 1, Easing.out(Easing.cubic)) * 2264;
  const sc = 0.2;
  return (
    <AbsoluteFill>
      <Grad top="#0E1C2E" bottom="#060B14" />
      <Cam dur={dur} z0={1} z1={1.05}>
        {sec < b(6) && (
          <>
            <svg width={W} height={H} style={{ position: "absolute" }}>
              <line x1={240} y1={850} x2={1680} y2={850} stroke="#fff" strokeWidth={5} />
              <rect x={460} y={850 - cost * sc} width={320} height={cost * sc} fill={C.red} stroke="#111" strokeWidth={5} />
              <rect x={1140} y={850 - gross * sc} width={320} height={gross * sc} fill={C.green} stroke="#111" strokeWidth={5} />
            </svg>
            <div style={{ position: "absolute", left: 360, top: 862, width: 520, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 44, color: "#fff", opacity: ramp(sec, b(2), b(2) + 0.4) }}>COST</div>
            <div style={{ position: "absolute", left: 1040, top: 862, width: 520, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 44, color: "#fff", opacity: ramp(sec, b(3), b(3) + 0.4) }}>BOX OFFICE (ALL RUNS)</div>
            <Counter from={0} to={200} a={b(2)} b={b(2) + 1} fmt={(n) => moneyM(n)} x={370} y={850 - 200 * sc - 130} w={500} size={90} color="#fff" />
            <Counter from={0} to={2.2} a={b(3)} b={b(3) + 2.2} fmt={(n) => `$${n.toFixed(1)}B+`} x={1050} y={Math.max(300, 850 - gross * sc - 130)} w={500} size={100} color={C.gold} />
            <Stamp at={b(4) + 0.4} text="10×+" x={880} y={560} color={C.gold} size={130} rot={-6} />
            {sec > b(5) && sec < b(6) && (
              <div style={{ position: "absolute", left: 300, top: 160, width: 1320 }}>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 52, color: "#fff", textAlign: "center", marginBottom: 20 }}>👑 HIGHEST-GROSSING FILM EVER · 12 YEARS</div>
                <div style={{ position: "relative", height: 40, background: "#ffffff22", borderRadius: 20 }}>
                  <div style={{ height: 40, width: `${ramp(sec, b(5) + 0.4, b(5) + 3) * 100}%`, background: C.gold, borderRadius: 20 }} />
                  <div style={{ position: "absolute", left: 0, top: 50, fontFamily: FONT, fontWeight: 700, fontSize: 34, color: "#fff" }}>1998</div>
                  <div style={{ position: "absolute", right: 0, top: 50, fontFamily: FONT, fontWeight: 700, fontSize: 34, color: "#fff" }}>2010</div>
                </div>
              </div>
            )}
          </>
        )}
        {sec >= b(6) - 0.2 && sec < b(8) && <Gauge at={b(6) - 0.2} verdictAt={b(6) + 0.6} score={92} x={960} y={560} s={1.4} verdict="GOOD BET" />}
        {sec >= b(8) && sec < b(9) && (
          <>
            <Words at={b(8) + 0.4} y={330} size={84} text="EVERYONE KNEW HOW IT ENDED." hot={{ "ENDED.": C.gold }} />
            <Words at={b(8) + 2.4} y={470} size={84} text="NOBODY KNEW HOW IT WOULD FEEL." hot={{ "FEEL.": C.red }} />
          </>
        )}
        {sec >= b(9) && (
          <>
            <Ship x={960} y={640} s={0.7} rot={ramp(sec, b(9), b(9) + 4) * 25} />
            <Ocean y={650} />
            <Pop at={b(9) + 0.3} x={0} y={140} w={W} size={84} color="#fff" sw={3}>NEXT: A MOVIE THAT REALLY SANK</Pop>
            <Pop at={b(9) + 2.0} x={0} y={820} w={W} size={70} color="#fff"><span style={{ background: C.red, padding: "12px 44px", borderRadius: 24, border: "6px solid #111" }}>FOLLOW 🔔</span></Pop>
          </>
        )}
      </Cam>
      <Pop at={b(0)} x={0} y={60} w={W} size={84} color="#fff" sw={3} out={b(2)}>GOOD BET or BAD BET?</Pop>
      <Pop at={b(7)} x={0} y={60} w={W} size={56} color="#fff" out={b(8)}>A BIG, ORIGINAL, GROWN-UP MOVIE BEAT EVERYTHING</Pop>
    </AbsoluteFill>
  );
};

export const SCENES: Record<string, React.FC<SceneProps>> = {
  cold: Cold, title: Title, pitch: Pitch, dive: Dive, build: Build, money: Money, headlines: Headlines, voyage: Voyage,
  lifeboats: Lifeboats, sinking: Sinking, compare: Compare, boxoffice: BoxOffice, oscars: Oscars, reasons: Reasons,
  flaws: Flaws, door: Door, verdict: Verdict,
};
