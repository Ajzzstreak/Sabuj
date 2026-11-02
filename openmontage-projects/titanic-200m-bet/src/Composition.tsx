import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useVideoConfig } from "remotion";
import timing from "./timing.json";
import { SCENES } from "./scenes";
import { FONT, clamp, stroke, useT } from "./prims";

type Word = { text: string; start: number; end: number; seg: string };
const SEGS = timing.segments as any[];
const WORDS = timing.words as Word[];
const LEAD = 0.45; // each scene starts this long before its first line

const useFonts = () => {
  const [h] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const f = [
      new FontFace("SpaceGrotesk", `url(${staticFile("SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }),
      new FontFace("Playfair", `url(${staticFile("PlayfairDisplay-latin.woff2")})`, { weight: "400 900" }),
    ];
    Promise.all(f.map((x) => x.load().then((l) => document.fonts.add(l)))).then(() => continueRender(h)).catch(() => continueRender(h));
  }, [h]);
};

type Group = { words: Word[]; start: number; end: number };
const GROUPS: Group[] = (() => {
  const out: Group[] = []; let cur: Word[] = [];
  WORDS.forEach((w, i) => {
    cur.push(w);
    const n = WORDS[i + 1];
    if (/[.?!:]$/.test(w.text) || (/,$/.test(w.text) && cur.length >= 3) || cur.length >= 6 || !n || n.seg !== w.seg) {
      out.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = [];
    }
  });
  return out;
})();

const Captions: React.FC = () => {
  const { sec } = useT();
  const g = GROUPS.find((x, i) => sec >= x.start - 0.05 && sec < Math.min((GROUPS[i + 1]?.start ?? 1e9) - 0.05, x.end + 0.5));
  if (!g) return null;
  const pop = interpolate(sec, [g.start - 0.05, g.start + 0.08], [0.9, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 0, top: 955, width: 1920, textAlign: "center", transform: `scale(${pop})` }}>
      <span style={{ display: "inline-block", background: "rgba(5,8,18,0.72)", borderRadius: 22, padding: "10px 26px 4px" }}>
        {g.words.map((w, i) => {
          const active = sec >= w.start && sec < w.end + 0.02;
          return <span key={i} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 50, color: active ? "#F2B33D" : "#fff", marginRight: 14, display: "inline-block", ...stroke(2) }}>{w.text.toUpperCase()}</span>;
        })}
      </span>
    </div>
  );
};

export const TitanicReview: React.FC = () => {
  useFonts();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#070D1F" }}>
      {SEGS.map((seg, i) => {
        const startT = i === 0 ? 0 : seg.start - LEAD;
        const next = SEGS[i + 1];
        const endT = next ? next.start - LEAD : timing.durationInFrames / fps;
        const from = Math.round(startT * fps);
        const dur = Math.max(1, Math.round(endT * fps) - from);
        const Scene = SCENES[seg.kind];
        const off = seg.start - startT;
        const b = (k: number) => seg.sentences[Math.min(k, seg.sentences.length - 1)].start - seg.start + off;
        return (
          <Sequence key={seg.id} from={from} durationInFrames={dur} name={seg.id}>
            <SceneWrap dur={dur / fps}><Scene b={b} dur={dur / fps} seg={seg} /></SceneWrap>
          </Sequence>
        );
      })}
      <Captions />
      <Audio src={staticFile("mix.wav")} />
    </AbsoluteFill>
  );
};

// quick flash-in from black + slight zoom settle for every scene cut
const SceneWrap: React.FC<{ dur: number; children: React.ReactNode }> = ({ children }) => {
  const { sec } = useT();
  const k = interpolate(sec, [0, 0.35], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: 0.3 + 0.7 * k, transform: `scale(${1.04 - 0.04 * k})` }}>{children}</AbsoluteFill>
  );
};
