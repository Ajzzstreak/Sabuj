import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { FRUITS } from "../../fruit-truth-90s/src/fruits";
import { Ocean, Stars, Stick } from "../../titanic-200m-bet/src/prims";
import { SodaCan } from "../../oj-vs-soda/src/OJShort";

const F = "SpaceGrotesk, sans-serif";
const GREEN = "#2BB673", RED = "#E5484D", GOLD = "#FFE03D";
const stroke = (w: number) => ({ WebkitTextStroke: `${w}px #111`, paintOrder: "stroke fill" as const });
const useFont = () => {
  const [h] = useState(() => delayRender("f"));
  useEffect(() => { new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }).load().then((f) => { document.fonts.add(f); continueRender(h); }).catch(() => continueRender(h)); }, [h]);
};
const Badge: React.FC<{ tag: string }> = ({ tag }) => (
  <div style={{ position: "absolute", left: 60, top: 230, display: "flex", gap: 14, fontFamily: F, fontWeight: 700, filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.35))" }}>
    <div style={{ display: "flex", borderRadius: 22, overflow: "hidden", border: "5px solid #111", fontSize: 46 }}>
      <span style={{ background: GREEN, color: "#fff", padding: "8px 18px" }}>GOOD</span><span style={{ background: "#fff", color: "#111", padding: "8px 12px", fontStyle: "italic" }}>or</span><span style={{ background: RED, color: "#fff", padding: "8px 18px" }}>BAD?</span>
    </div>
    <div style={{ background: "#111", color: GOLD, fontSize: 40, padding: "10px 18px", borderRadius: 18 }}>{tag}</div>
  </div>
);
const Frame: React.FC = () => <AbsoluteFill style={{ border: "14px solid #FFE03D", boxSizing: "border-box" }} />;
const Sticker: React.FC<{ x: number; y: number; rot: number; bg: string; size: number; children: React.ReactNode; color?: string }> = ({ x, y, rot, bg, size, children, color = "#fff" }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rot}deg)`, background: bg, color, fontFamily: F, fontWeight: 700, fontSize: size, padding: "10px 28px", borderRadius: 26, border: "6px solid #111", boxShadow: "0 12px 0 #111", whiteSpace: "nowrap" }}>{children}</div>
);

export const ThumbJack: React.FC = () => {
  useFont();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#02050D 0%,#0B1E36 55%,#071A30 100%)", overflow: "hidden" }}>
      <Stars n={70} maxY={1000} />
      <div style={{ position: "absolute", left: -930, top: 160, width: 1920, height: 1080, transform: "scale(1.45)", transformOrigin: "0 0" }}>
        <svg width={1920} height={1080} style={{ position: "absolute" }}>
          <g transform="translate(960 742) rotate(-2)"><rect x={-230} y={-26} width={460} height={52} rx={8} fill="#8D6E63" stroke="#4E342E" strokeWidth={6} /></g>
        </svg>
        <Stick x={1100} y={712} s={0.9} pose="lie" rot={-90} hat="hair" hatColor="#C0392B" face="flat" />
        <Stick x={1250} y={880} s={0.95} pose="panic" hat="flat" hatColor="#8D6E63" face="o" />
        <Ocean y={760} color="#0E2E52" color2="#071A30" amp={9} opacity={0.93} />
      </div>
      <Badge tag="🎬 TITANIC" />
      <div style={{ position: "absolute", top: 360, width: 1080, textAlign: "center", fontFamily: F, fontWeight: 700, lineHeight: 0.9, transform: "rotate(-3deg)" }}>
        <div style={{ fontSize: 190, color: GOLD, letterSpacing: -8, ...stroke(14), textShadow: "0 14px 0 #111" }}>COULD</div>
        <div style={{ fontSize: 190, color: "#fff", letterSpacing: -8, ...stroke(14), textShadow: "0 14px 0 #E5484D" }}>JACK FIT?</div>
      </div>
      <Sticker x={120} y={1380} rot={-5} bg="#fff" color="#111" size={80}>💬 FIT or NO FIT?</Sticker>
      <Frame />
    </AbsoluteFill>
  );
};

export const ThumbJuice: React.FC = () => {
  useFont();
  const J = FRUITS.juice;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 55%, #1F3B6B 0%, #0B1630 70%)", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: "repeating-conic-gradient(from 0deg at 50% 60%, #ffffff0e 0deg 10deg, #ffffff00 10deg 20deg)" }} />
      <Badge tag="🍎 FOOD #2" />
      <div style={{ position: "absolute", top: 370, width: 1080, textAlign: "center", fontFamily: F, fontWeight: 700, lineHeight: 0.9, transform: "rotate(-3deg)" }}>
        <div style={{ fontSize: 220, color: GOLD, letterSpacing: -8, ...stroke(14), textShadow: "0 14px 0 #111" }}>JUICE</div>
        <div style={{ fontSize: 220, color: "#fff", letterSpacing: -8, ...stroke(14), textShadow: "0 14px 0 #E5484D" }}>= SODA?</div>
      </div>
      <div style={{ position: "absolute", left: 30, top: 880, width: 500, height: 500 }}><svg width={500} height={500} viewBox="0 0 400 400" style={{ overflow: "visible" }}><J p={0} t={0} /></svg></div>
      <div style={{ position: "absolute", left: 520, top: 860, transform: "scale(1.3) rotate(6deg)", transformOrigin: "0 0" }}><SodaCan /></div>
      <Sticker x={160} y={1420} rot={-4} bg={RED} size={74}>🍬 21g vs 26g</Sticker>
      <Frame />
    </AbsoluteFill>
  );
};
