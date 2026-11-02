import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile } from "remotion";
import { Iceberg, Ocean, Ship, Stars, stroke } from "./prims";

const F = "SpaceGrotesk, sans-serif";
export const TitanicThumb: React.FC = () => {
  const [h] = useState(() => delayRender("f"));
  useEffect(() => { new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }).load().then((f) => { document.fonts.add(f); continueRender(h); }).catch(() => continueRender(h)); }, [h]);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#050915 0%,#13305A 100%)", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1920, height: 1080, transform: "scale(0.6667)", transformOrigin: "0 0" }}>
        <Stars n={60} maxY={500} />
        <AbsoluteFill style={{ background: "radial-gradient(circle at 72% 55%, rgba(242,179,61,0.35) 0%, rgba(0,0,0,0) 45%)" }} />
        <Ship x={1330} y={760} s={1.25} rot={18} lights />
        <Iceberg x={1800} y={770} s={1.3} />
        <Ocean y={780} color="#0C2E4C" color2="#04121F" amp={14} />
        {/* price tag */}
        <div style={{ position: "absolute", left: 1150, top: 80, transform: "rotate(6deg)", background: "#FFF3C9", border: "8px solid #C99A2E", borderRadius: 24, padding: "10px 34px", fontFamily: F, fontWeight: 700, fontSize: 76, color: "#2A1410", boxShadow: "0 14px 0 #111", whiteSpace: "nowrap" }}>🏆 11 OSCARS</div>
      </div>
      {/* badge */}
      <div style={{ position: "absolute", left: 34, top: 34, display: "flex", gap: 10, fontFamily: F, fontWeight: 700, filter: "drop-shadow(0 6px 0 rgba(0,0,0,0.4))" }}>
        <div style={{ display: "flex", borderRadius: 16, overflow: "hidden", border: "4px solid #111", fontSize: 32 }}>
          <span style={{ background: "#2BB673", color: "#fff", padding: "6px 14px" }}>GOOD</span>
          <span style={{ background: "#fff", color: "#111", padding: "6px 10px", fontStyle: "italic" }}>or</span>
          <span style={{ background: "#E5484D", color: "#fff", padding: "6px 14px" }}>BAD?</span>
        </div>
        <div style={{ background: "#111", color: "#FFE03D", fontSize: 28, padding: "8px 14px", borderRadius: 14 }}>🎬 MOVIES</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: 130, fontFamily: F, fontWeight: 700, lineHeight: 0.88, transform: "rotate(-3deg)" }}>
        <div style={{ fontSize: 150, color: "#FFE03D", letterSpacing: -6, ...stroke(12), textShadow: "0 12px 0 #111" }}>$200M</div>
        <div style={{ fontSize: 150, color: "#fff", letterSpacing: -6, ...stroke(12), textShadow: "0 12px 0 #E5484D" }}>BET</div>
      </div>
      <div style={{ position: "absolute", left: 44, top: 470, transform: "rotate(-3deg)", background: "#E5484D", color: "#fff", fontFamily: F, fontWeight: 700, fontSize: 48, padding: "8px 24px", borderRadius: 18, border: "5px solid #111", boxShadow: "0 10px 0 #111" }}>EVERYONE SAID IT'D SINK</div>
      <AbsoluteFill style={{ border: "12px solid #FFE03D", boxSizing: "border-box" }} />
    </AbsoluteFill>
  );
};
