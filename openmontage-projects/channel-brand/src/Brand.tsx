import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { FRUITS } from "../../fruit-truth-90s/src/fruits";
import { Ship, Iceberg, Trophy } from "../../titanic-200m-bet/src/prims";

const F = "SpaceGrotesk, sans-serif";
const NAVY = "#0B1630", GOLD = "#FFE03D", GREEN = "#2BB673", RED = "#E5484D", AMBER = "#F2A33A";
const useFont = () => {
  const [h] = useState(() => delayRender("f"));
  useEffect(() => { new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }).load().then((f) => { document.fonts.add(f); continueRender(h); }).catch(() => continueRender(h)); }, [h]);
};
const stroke = (w: number) => ({ WebkitTextStroke: `${w}px #111`, paintOrder: "stroke fill" as const });

// The channel mark: a verdict gauge with the needle on GOOD.
export const GaugeMark: React.FC<{ size: number; ring?: boolean }> = ({ size, ring = true }) => {
  const R = 150, sw = 64;
  const p = (a: number) => [Math.cos(((a - 180) * Math.PI) / 180) * R, Math.sin(((a - 180) * Math.PI) / 180) * R];
  const arc = (a0: number, a1: number) => { const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`; };
  return (
    <svg width={size} height={size} viewBox={ring ? "-265 -265 530 530" : "-250 -250 500 500"}>
      {ring && <circle r={238} fill={NAVY} stroke={GOLD} strokeWidth={22} />}
      <g transform="translate(0 55)">
        <path d={arc(2, 58)} stroke={RED} strokeWidth={sw} fill="none" />
        <path d={arc(62, 118)} stroke={AMBER} strokeWidth={sw} fill="none" />
        <path d={arc(122, 178)} stroke={GREEN} strokeWidth={sw} fill="none" />
        <g transform="rotate(52)"><path d="M-20,0 L0,-170 L20,0 Z" fill="#fff" stroke="#111" strokeWidth={6} /></g>
        <circle r={36} fill="#fff" stroke="#111" strokeWidth={8} />
        <circle r={12} fill={GREEN} />
      </g>
    </svg>
  );
};

export const Avatar: React.FC = () => {
  useFont();
  return (
    <AbsoluteFill style={{ background: NAVY, alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 45%, #1E3A6E 0%, #0B1630 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}><GaugeMark size={800} /></AbsoluteFill>
    </AbsoluteFill>
  );
};

const FruitIcon: React.FC<{ id: string; x: number; y: number; s: number; rot?: number }> = ({ id, x, y, s, rot = 0 }) => {
  const C = FRUITS[id];
  return <svg style={{ position: "absolute", left: x, top: y, overflow: "visible", transform: `rotate(${rot}deg)`, filter: "drop-shadow(0 18px 20px rgba(0,0,0,0.4))" }} width={s} height={s} viewBox="0 0 400 400"><C p={0} t={0} /></svg>;
};

// 2560x1440. Safe area (all devices): x 507–2053, y 508–931.
export const Banner: React.FC = () => {
  useFont();
  return (
    <AbsoluteFill style={{ background: NAVY, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, #1E3A6E 0%, #0B1630 60%, #060C1C 100%)" }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(#ffffff0a 2px, transparent 2px), linear-gradient(90deg, #ffffff0a 2px, transparent 2px)", backgroundSize: "80px 80px" }} />
      {/* decorative, outside the safe area (desktop / TV) */}
      <FruitIcon id="banana" x={60} y={430} s={300} rot={-14} />
      <FruitIcon id="mango" x={250} y={720} s={280} rot={10} />
      <FruitIcon id="blueberries" x={60} y={900} s={260} />
      <FruitIcon id="juice" x={300} y={330} s={230} rot={8} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 2560, height: 1440 }}>
        <div style={{ position: "absolute", left: 1750, top: 0, width: 1920, height: 1080, transform: "scale(0.55)", transformOrigin: "0 0" }}>
          <Ship x={1360} y={1560} s={1.0} rot={10} lights />
          <Iceberg x={1860} y={1590} s={1.0} />
        </div>
        <Trophy x={2420} y={640} s={1.5} />
        <Trophy x={2300} y={560} s={1.1} />
      </div>
      {/* safe area content */}
      <div style={{ position: "absolute", left: 507, top: 508, width: 1546, height: 423, display: "flex", alignItems: "center", gap: 50 }}>
        <div style={{ width: 400, height: 400, flex: "0 0 auto" }}><GaugeMark size={400} /></div>
        <div style={{ fontFamily: F, fontWeight: 700, color: "#fff" }}>
          <div style={{ fontSize: 100, letterSpacing: -3, lineHeight: 1, whiteSpace: "nowrap", ...stroke(6), textShadow: "0 10px 0 #000" }}>SABUJ <span style={{ color: GOLD }}>THE ANALYST</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34 }}>
            <div style={{ display: "flex", borderRadius: 18, overflow: "hidden", border: "5px solid #111", fontSize: 50 }}>
              <span style={{ background: GREEN, padding: "6px 20px" }}>GOOD</span>
              <span style={{ background: "#fff", color: "#111", padding: "6px 14px", fontStyle: "italic" }}>or</span>
              <span style={{ background: RED, padding: "6px 20px" }}>BAD?</span>
            </div>
            <div style={{ fontSize: 54, color: GOLD }}>FOOD · MOVIES · HISTORY</div>
          </div>
          <div style={{ fontSize: 42, marginTop: 30, opacity: 0.9, letterSpacing: 2 }}>NEW VIDEOS EVERY <span style={{ color: GOLD }}>MON · WED · FRI · SAT</span></div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Preview: banner with safe-area guides (not for upload).
export const BannerGuide: React.FC = () => (
  <AbsoluteFill>
    <Banner />
    <div style={{ position: "absolute", left: 507, top: 508, width: 1546, height: 423, border: "6px dashed #ff00ff" }} />
    <div style={{ position: "absolute", left: 0, top: 508, width: 2560, height: 423, border: "4px dashed #00ffff" }} />
  </AbsoluteFill>
);
