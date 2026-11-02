import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { FRUITS } from "./fruits";

// Series-level thumbnail system for "GOOD or BAD?".
// Constant across every episode (channel-grid recognition):
//   - yellow 14px frame, - split GOOD/BAD series badge + episode no. top-left,
//   - one hero fruit with a cartoon face, - max 3 words of headline, black-stroked.
// Variable per episode: background color field, headline, sticker.

const FONT = "SpaceGrotesk, sans-serif";
const useFonts = () => {
  const [h] = useState(() => delayRender("fonts"));
  useEffect(() => {
    new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" })
      .load().then((f) => { document.fonts.add(f); continueRender(h); }).catch(() => continueRender(h));
  }, [h]);
};

const stroke = (w: number, c = "#111") => ({ WebkitTextStroke: `${w}px ${c}`, paintOrder: "stroke fill" as const });

const Frame: React.FC<{ children: React.ReactNode; bg: string }> = ({ children, bg }) => (
  <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
    {children}
    <AbsoluteFill style={{ border: "14px solid #FFE03D", boxSizing: "border-box" }} />
  </AbsoluteFill>
);

const Rays: React.FC<{ c1: string; c2: string; cx?: string; cy?: string }> = ({ c1, c2, cx = "50%", cy = "50%" }) => (
  <AbsoluteFill style={{
    background: `repeating-conic-gradient(from 0deg at ${cx} ${cy}, ${c1} 0deg 10deg, ${c2} 10deg 20deg)`,
    maskImage: `radial-gradient(circle at ${cx} ${cy}, #000 0%, #000 35%, transparent 75%)`,
    WebkitMaskImage: `radial-gradient(circle at ${cx} ${cy}, #000 0%, #000 35%, transparent 75%)`,
  }} />
);

export const SeriesBadge: React.FC<{ ep: number; x?: number; y?: number; s?: number }> = ({ ep, x = 60, y = 230, s = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `scale(${s})`, transformOrigin: "left top", display: "flex", alignItems: "center", gap: 14,
    fontFamily: FONT, fontWeight: 700, filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.35))" }}>
    <div style={{ display: "flex", borderRadius: 22, overflow: "hidden", border: "5px solid #111", fontSize: 46, letterSpacing: 1 }}>
      <span style={{ background: "#2BB673", color: "#fff", padding: "8px 18px" }}>GOOD</span>
      <span style={{ background: "#fff", color: "#111", padding: "8px 12px", fontStyle: "italic" }}>or</span>
      <span style={{ background: "#E5484D", color: "#fff", padding: "8px 18px" }}>BAD?</span>
    </div>
    <div style={{ background: "#111", color: "#FFE03D", fontSize: 40, padding: "10px 18px", borderRadius: 18 }}>#{ep}</div>
  </div>
);

// Cartoon face drawn in the fruit's 400x400 space.
type Mood = "shock" | "smug" | "happy" | "worried";
const Face: React.FC<{ x: number; y: number; s?: number; mood: Mood }> = ({ x, y, s = 1, mood }) => {
  const eye = (ex: number, look = 0) => (
    <g transform={`translate(${ex} 0)`}>
      <ellipse rx={mood === "shock" ? 26 : 22} ry={mood === "shock" ? 32 : mood === "smug" ? 12 : 26} fill="#fff" stroke="#111" strokeWidth={5} />
      <circle cx={look} cy={mood === "smug" ? 2 : 4} r={mood === "shock" ? 9 : 11} fill="#111" />
      <circle cx={look + 4} cy={-2} r={3.5} fill="#fff" />
    </g>
  );
  const brows = {
    shock: <><path d="M-62,-52 Q-40,-72 -18,-56" /><path d="M18,-56 Q40,-72 62,-52" /></>,
    smug: <><path d="M-62,-30 L-18,-24" /><path d="M18,-34 Q40,-50 62,-40" /></>,
    happy: <><path d="M-60,-46 Q-40,-58 -20,-46" /><path d="M20,-46 Q40,-58 60,-46" /></>,
    worried: <><path d="M-62,-40 L-20,-54" /><path d="M20,-54 L62,-40" /></>,
  }[mood];
  const mouth = {
    shock: <ellipse cx={0} cy={58} rx={22} ry={30} fill="#5A0F14" stroke="#111" strokeWidth={5} />,
    smug: <path d="M-30,52 Q5,70 34,40" fill="none" stroke="#111" strokeWidth={7} strokeLinecap="round" />,
    happy: <path d="M-34,40 Q0,90 34,40 Z" fill="#5A0F14" stroke="#111" strokeWidth={5} />,
    worried: <path d="M-28,62 Q0,44 28,62" fill="none" stroke="#111" strokeWidth={7} strokeLinecap="round" />,
  }[mood];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {eye(-40, mood === "smug" ? 8 : 0)}{eye(40, mood === "smug" ? 8 : 0)}
      <g fill="none" stroke="#111" strokeWidth={8} strokeLinecap="round">{brows}</g>
      {mouth}
      {(mood === "shock" || mood === "worried") && (
        <path d="M78,-60 Q92,-34 78,-24 Q64,-34 78,-60 Z" fill="#9FE3FF" stroke="#111" strokeWidth={4} />
      )}
      {mood !== "smug" && <><ellipse cx={-66} cy={22} rx={16} ry={9} fill="#FF6B8A" opacity={0.55} /><ellipse cx={66} cy={22} rx={16} ry={9} fill="#FF6B8A" opacity={0.55} /></>}
    </g>
  );
};

const FruitArt: React.FC<{ id: string; size: number; x: number; y: number; p?: number; rot?: number; face?: { x: number; y: number; s?: number; mood: Mood } }> =
  ({ id, size, x, y, p = 0, rot = 0, face }) => {
    const F = FRUITS[id];
    return (
      <svg style={{ position: "absolute", left: x, top: y, overflow: "visible", transform: `rotate(${rot}deg)`, filter: "drop-shadow(0 24px 30px rgba(0,0,0,0.35))" }}
        width={size} height={size} viewBox="0 0 400 400">
        <F p={p} t={0} />
        {face && <Face {...face} />}
      </svg>
    );
  };

const Sticker: React.FC<{ x: number; y: number; rot: number; bg: string; color?: string; size?: number; children: React.ReactNode }> =
  ({ x, y, rot, bg, color = "#fff", size = 70, children }) => (
    <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, background: bg, color, fontFamily: FONT, fontWeight: 700,
      fontSize: size, padding: "10px 28px", borderRadius: 26, border: "6px solid #111", boxShadow: "0 12px 0 #111", whiteSpace: "nowrap" }}>
      {children}
    </div>
  );

const Slash: React.FC<{ x1: number; y1: number; x2: number; y2: number; juice: string }> = ({ x1, y1, x2, y2, juice }) => {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={10} height={10}>
      <defs><linearGradient id={`sl${x1}`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity={0} /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
      <g transform={`translate(${x1} ${y1}) rotate(${a})`}>
        <polygon points={`0,0 ${L},-16 ${L + 22},0 ${L},16`} fill={`url(#sl${x1})`} style={{ filter: "drop-shadow(0 0 18px #fff)" }} />
        {[...Array(18)].map((_, i) => (
          <circle key={i} cx={L * (0.25 + ((i * 37) % 60) / 100)} cy={(i % 2 ? 1 : -1) * (30 + ((i * 53) % 120))} r={8 + ((i * 13) % 16)} fill={juice} stroke="#0004" strokeWidth={3} />
        ))}
        <g transform={`translate(${L + 30} 0) scale(2.6)`}>
          <path d="M14,-4 L-150,-24 L-160,-4 L-150,6 Z" fill="#E8EEF2" stroke="#7E8A92" strokeWidth={3} />
          <path d="M14,-4 L-150,-24 L-150,-14 Z" fill="#fff" opacity={0.85} />
          <rect x={-250} y={-16} width={92} height={26} rx={10} fill="#3B2A20" stroke="#111" strokeWidth={2} />
        </g>
      </g>
    </svg>
  );
};

// ================================================================ A: SUGAR BOMB (curiosity + conflict)
export const ThumbSugarBomb: React.FC = () => {
  useFonts();
  return (
    <Frame bg="radial-gradient(circle at 50% 55%, #9B3A86 0%, #5E2350 45%, #2A0B24 100%)">
      <Rays c1="#ffffff14" c2="#ffffff00" cy="58%" />
      <SeriesBadge ep={1} />
      <div style={{ position: "absolute", top: 360, width: 1080, textAlign: "center", fontFamily: FONT, fontWeight: 700, lineHeight: 0.88, transform: "rotate(-4deg)" }}>
        <div style={{ fontSize: 250, color: "#FFE03D", letterSpacing: -10, ...stroke(16), textShadow: "0 16px 0 #111" }}>SUGAR</div>
        <div style={{ fontSize: 250, color: "#fff", letterSpacing: -10, ...stroke(16), textShadow: "0 16px 0 #E5484D" }}>BOMB?</div>
      </div>
      <FruitArt id="mango" size={860} x={110} y={820} rot={-8} face={{ x: 205, y: 215, s: 1.15, mood: "shock" }} />
      <Slash x1={-60} y1={1720} x2={760} y2={1500} juice="#FFB300" />
      <Sticker x={360} y={1690} rot={-5} bg="#E5484D" size={80}>🥭 45g SUGAR</Sticker>
    </Frame>
  );
};

// ================================================================ B: PRICE VS HEALTH (debate)
export const ThumbVersus: React.FC = () => {
  useFonts();
  return (
    <Frame bg="#0F5257">
      <AbsoluteFill style={{ background: "#FFC6DA", clipPath: "polygon(62% 0, 100% 0, 100% 100%, 38% 100%)" }} />
      <SeriesBadge ep={1} />
      <div style={{ position: "absolute", top: 360, width: 1080, textAlign: "center", fontFamily: FONT, fontWeight: 700, lineHeight: 0.9 }}>
        <div style={{ fontSize: 150, color: "#fff", letterSpacing: -5, ...stroke(12), textShadow: "0 12px 0 #111" }}>WHICH IS</div>
        <div style={{ fontSize: 196, color: "#FFE03D", letterSpacing: -8, ...stroke(14), textShadow: "0 14px 0 #111" }}>HEALTHIER?</div>
      </div>
      <FruitArt id="banana" size={560} x={10} y={820} rot={-12} face={{ x: 200, y: 175, s: 0.62, mood: "smug" }} />
      <FruitArt id="blueberries" size={560} x={520} y={860} rot={8} face={{ x: 200, y: 245, s: 0.7, mood: "happy" }} />
      <div style={{ position: "absolute", left: 400, top: 1000, width: 280, height: 280, borderRadius: 140, background: "#E5484D", border: "10px solid #111",
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700, fontSize: 130, color: "#fff", ...stroke(6), transform: "rotate(-10deg)", boxShadow: "0 14px 0 #111" }}>VS</div>
      <Sticker x={70} y={1430} rot={-6} bg="#FFF3C9" color="#111" size={100}>$0.25</Sticker>
      <Sticker x={650} y={1430} rot={6} bg="#FFF3C9" color="#111" size={100}>$4.00</Sticker>
    </Frame>
  );
};

// ================================================================ C: TIER LIST (trending format + mystery)
const TIERS: { tier: string; color: string; fruits: string[] }[] = [
  { tier: "S", color: "#FF5A5F", fruits: ["blueberries"] },
  { tier: "A", color: "#FFB02E", fruits: ["orange", "apple"] },
  { tier: "B", color: "#FFE03D", fruits: ["banana", "avocado"] },
  { tier: "C", color: "#7BD389", fruits: ["?"] },
];
export const ThumbTier: React.FC = () => {
  useFonts();
  return (
    <Frame bg="#17162B">
      <Rays c1="#ffffff0c" c2="#ffffff00" cy="60%" />
      <SeriesBadge ep={1} />
      <div style={{ position: "absolute", top: 350, width: 1080, textAlign: "center", fontFamily: FONT, fontWeight: 700, lineHeight: 0.9 }}>
        <div style={{ fontSize: 120, color: "#fff", letterSpacing: -3, ...stroke(10) }}>FRUITS</div>
        <div style={{ fontSize: 240, color: "#FFE03D", letterSpacing: -10, ...stroke(16), textShadow: "0 16px 0 #E5484D" }}>RANKED</div>
      </div>
      {TIERS.map((t, r) => (
        <div key={t.tier} style={{ position: "absolute", left: 60, top: 760 + r * 190, width: 960, height: 175, display: "flex", border: "6px solid #111", borderRadius: 18, overflow: "hidden", background: "#2B2950" }}>
          <div style={{ width: 175, background: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700, fontSize: 120, color: "#111", borderRight: "6px solid #111" }}>{t.tier}</div>
          <div style={{ flex: 1, position: "relative" }}>
            {t.fruits.map((f, i) => f === "?" ? (
              <div key={i} style={{ position: "absolute", left: 20, top: 8, width: 150, height: 150, borderRadius: 75, background: "#111", border: "6px dashed #FFE03D",
                display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 700, fontSize: 110, color: "#FFE03D" }}>?</div>
            ) : (
              <FruitArt key={i} id={f} size={170} x={10 + i * 190} y={-2} />
            ))}
          </div>
        </div>
      ))}
      <Sticker x={250} y={1560} rot={-4} bg="#E5484D" size={76}>WHO CAME LAST? 😳</Sticker>
    </Frame>
  );
};

// ================================================================ Landscape 1280x720 (long-form / community / Shorts shelf crop-safe)
export const ThumbSugarBombWide: React.FC = () => {
  useFonts();
  return (
    <Frame bg="radial-gradient(circle at 70% 50%, #9B3A86 0%, #5E2350 45%, #2A0B24 100%)">
      <Rays c1="#ffffff14" c2="#ffffff00" cx="70%" />
      <SeriesBadge ep={1} x={40} y={36} s={0.8} />
      <div style={{ position: "absolute", left: 50, top: 150, fontFamily: FONT, fontWeight: 700, lineHeight: 0.86, transform: "rotate(-4deg)" }}>
        <div style={{ fontSize: 190, color: "#FFE03D", letterSpacing: -8, ...stroke(12), textShadow: "0 12px 0 #111" }}>SUGAR</div>
        <div style={{ fontSize: 190, color: "#fff", letterSpacing: -8, ...stroke(12), textShadow: "0 12px 0 #E5484D" }}>BOMB?</div>
      </div>
      <FruitArt id="mango" size={620} x={650} y={70} rot={-8} face={{ x: 205, y: 215, s: 1.15, mood: "shock" }} />
      <Sticker x={90} y={560} rot={-4} bg="#E5484D" size={64}>45g SUGAR 🍬</Sticker>
    </Frame>
  );
};
