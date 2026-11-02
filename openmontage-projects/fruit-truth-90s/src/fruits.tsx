import React from "react";
import { interpolate } from "remotion";

// Every fruit is drawn in a 400x400 box. `p` = deconstruction progress 0..1.
// `t` = seconds since scene start (for idle motion). All motion is deterministic.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type FruitProps = { p: number; t: number };

const Shadow: React.FC<{ w?: number; y?: number; o?: number }> = ({ w = 150, y = 375, o = 0.22 }) => (
  <ellipse cx={200} cy={y} rx={w} ry={w * 0.12} fill="#000" opacity={o} />
);

// ---------------------------------------------------------------- Banana
export const Banana: React.FC<FruitProps> = ({ p }) => {
  const a = interpolate(p, [0, 1], [0, 1], clamp);
  const anchorY = 300;
  return (
    <g>
      <Shadow w={110} />
      <defs>
        <linearGradient id="banFlesh" x1="0" x2="1">
          <stop offset="0" stopColor="#FFF3C4" />
          <stop offset="1" stopColor="#F6E19A" />
        </linearGradient>
        <linearGradient id="banPeel" x1="0" x2="1">
          <stop offset="0" stopColor="#FFE03D" />
          <stop offset="1" stopColor="#F2B705" />
        </linearGradient>
      </defs>
      {/* flesh */}
      <path d="M200,70 C236,86 246,190 236,300 L164,300 C154,190 164,86 200,70 Z" fill="url(#banFlesh)" />
      <path d="M200,70 C214,90 220,190 214,300" stroke="#E9CF7A" strokeWidth={4} fill="none" opacity={0.7} />
      {/* back strip folds down behind (drawn first) */}
      <g transform={`translate(200 ${anchorY}) scale(1 ${interpolate(a, [0, 1], [1, -0.55])}) translate(-200 ${-anchorY})`}>
        <path d="M200,52 C226,70 232,190 222,302 L178,302 C168,190 174,70 200,52 Z" fill="#E8B10A" />
      </g>
      {/* left strip */}
      <g transform={`rotate(${-150 * a} 172 ${anchorY})`}>
        <path d="M200,52 C168,64 146,190 156,304 L200,304 C188,190 186,80 200,52 Z" fill="url(#banPeel)" stroke="#C99400" strokeWidth={3} />
      </g>
      {/* right strip */}
      <g transform={`rotate(${150 * a} 228 ${anchorY})`}>
        <path d="M200,52 C232,64 254,190 244,304 L200,304 C212,190 214,80 200,52 Z" fill="url(#banPeel)" stroke="#C99400" strokeWidth={3} />
      </g>
      {/* front strip (fades as it folds forward) */}
      <g opacity={interpolate(a, [0, 0.5], [1, 0], clamp)}
        transform={`translate(200 ${anchorY}) scale(1 ${interpolate(a, [0, 0.5], [1, 0.2], clamp)}) translate(-200 ${-anchorY})`}>
        <path d="M200,50 C220,68 226,190 218,304 L182,304 C174,190 180,68 200,50 Z" fill="#FFD21F" stroke="#C99400" strokeWidth={3} />
      </g>
      {/* stem (on top while closed) */}
      <g opacity={interpolate(a, [0, 0.3], [1, 0], clamp)}>
        <path d="M193,30 L207,30 L210,58 L190,58 Z" fill="#6B4A1E" />
      </g>
      {/* base */}
      <path d="M152,298 L248,298 C246,336 226,360 206,368 L194,368 C174,360 154,336 152,298 Z" fill="url(#banPeel)" stroke="#C99400" strokeWidth={3} />
      <circle cx={200} cy={366} r={7} fill="#4A3214" />
    </g>
  );
};

// ---------------------------------------------------------------- Apple
const APPLE = "M200,118 C150,76 62,104 66,208 C70,306 140,366 200,344 C260,366 330,306 334,208 C338,104 250,76 200,118 Z";
export const Apple: React.FC<FruitProps> = ({ p }) => {
  const a = interpolate(p, [0, 1], [0, 1], clamp);
  const cut = 226;
  const lift = -66 * a;
  const tilt = -14 * a;
  const drop = 34 * a;
  const faceRy = 46 * a;
  const seeds = [0, 72, 144, 216, 288];
  return (
    <g>
      <Shadow w={130} />
      <defs>
        <radialGradient id="appBody" cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FF6B5E" />
          <stop offset="0.6" stopColor="#E0242E" />
          <stop offset="1" stopColor="#A3111C" />
        </radialGradient>
        <clipPath id="appTop"><rect x={0} y={0} width={400} height={cut} /></clipPath>
        <clipPath id="appBot"><rect x={0} y={cut} width={400} height={400 - cut} /></clipPath>
      </defs>
      {/* bottom half */}
      <g transform={`translate(0 ${drop})`}>
        <path d={APPLE} fill="url(#appBody)" clipPath="url(#appBot)" />
        {a > 0.01 && (
          <g>
            <ellipse cx={200} cy={cut} rx={132} ry={faceRy} fill="#FFF1CF" stroke="#E0242E" strokeWidth={6} />
            <g transform={`translate(200 ${cut}) scale(1 ${Math.max(0.01, faceRy / 46) * 0.36})`}>
              <path d="M0,-58 L16,-18 L58,-14 L24,10 L36,52 L0,28 L-36,52 L-24,10 L-58,-14 L-16,-18 Z" fill="#F2DDA8" stroke="#D9BE7A" strokeWidth={3} />
              {seeds.map((r) => (
                <ellipse key={r} cx={0} cy={-26} rx={7} ry={13} fill="#5A3416" transform={`rotate(${r})`} />
              ))}
            </g>
          </g>
        )}
      </g>
      {/* top half */}
      <g transform={`translate(0 ${lift}) rotate(${tilt} 200 ${cut})`}>
        <path d={APPLE} fill="url(#appBody)" clipPath="url(#appTop)" />
        {a > 0.01 && <ellipse cx={200} cy={cut} rx={132} ry={faceRy * 0.5} fill="#F7E3B5" stroke="#B5161F" strokeWidth={5} />}
        <ellipse cx={140} cy={150} rx={22} ry={34} fill="#fff" opacity={0.28} transform="rotate(-25 140 150)" />
        <path d="M198,118 C196,96 200,78 210,62" stroke="#5A3A1A" strokeWidth={9} strokeLinecap="round" fill="none" />
        <path d="M212,78 C238,54 282,58 292,72 C270,92 236,94 212,78 Z" fill="#4CAF50" stroke="#2E7D32" strokeWidth={3} />
      </g>
    </g>
  );
};

// ---------------------------------------------------------------- Avocado
const AVO = "M200,48 C246,48 262,118 278,166 C318,250 302,352 200,356 C98,352 82,250 122,166 C138,118 154,48 200,48 Z";
const AvoHalf: React.FC<{ pit: boolean; pitY: number; pitS: number }> = ({ pit, pitY, pitS }) => (
  <g>
    <path d={AVO} fill="#2F4A1C" />
    <path d={AVO} fill="url(#avoFlesh)" transform="translate(200 205) scale(0.9) translate(-200 -205)" />
    {pit ? (
      <g transform={`translate(200 ${255 + pitY}) scale(${pitS})`}>
        <circle r={58} fill="url(#avoPit)" />
        <ellipse cx={-18} cy={-20} rx={14} ry={9} fill="#fff" opacity={0.25} />
      </g>
    ) : (
      <circle cx={200} cy={255} r={58} fill="#D8E79A" stroke="#BFD27A" strokeWidth={5} />
    )}
  </g>
);
export const Avocado: React.FC<FruitProps> = ({ p, t }) => {
  const split = interpolate(p, [0.15, 0.6], [0, 1], clamp);
  const wholeO = interpolate(p, [0.1, 0.25], [1, 0], clamp);
  const pop = interpolate(p, [0.6, 1], [0, 1], clamp);
  const pitY = -Math.sin(pop * Math.PI) * 90;
  const wobble = p < 0.15 ? Math.sin(t * 30) * 4 * (p / 0.15) : 0;
  return (
    <g>
      <Shadow w={150} />
      <defs>
        <radialGradient id="avoFlesh" cx="0.5" cy="0.62" r="0.6">
          <stop offset="0" stopColor="#F4F7B8" />
          <stop offset="0.7" stopColor="#C8E07E" />
          <stop offset="1" stopColor="#8DB84A" />
        </radialGradient>
        <radialGradient id="avoPit" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#B7773F" />
          <stop offset="1" stopColor="#6B3D17" />
        </radialGradient>
        <linearGradient id="avoSkin" x1="0" x2="1">
          <stop offset="0" stopColor="#4F6B2A" />
          <stop offset="1" stopColor="#253A12" />
        </linearGradient>
      </defs>
      {split > 0 && (
        <>
          <g transform={`translate(${-96 * split} 0) translate(200 205) scale(${0.72 + 0.06 * split}) rotate(${-8 * split}) translate(-200 -205)`}>
            <AvoHalf pit={false} pitY={0} pitS={1} />
          </g>
          <g transform={`translate(${96 * split} 0) translate(200 205) scale(${0.72 + 0.06 * split}) rotate(${8 * split}) translate(-200 -205)`}>
            <AvoHalf pit pitY={pitY} pitS={1 + 0.12 * Math.sin(pop * Math.PI)} />
          </g>
        </>
      )}
      <g opacity={wholeO} transform={`rotate(${wobble} 200 350)`}>
        <path d={AVO} fill="url(#avoSkin)" />
        {[...Array(14)].map((_, i) => (
          <circle key={i} cx={150 + ((i * 37) % 100)} cy={110 + ((i * 53) % 220)} r={3} fill="#1B2B0B" opacity={0.4} />
        ))}
        <ellipse cx={168} cy={150} rx={14} ry={40} fill="#fff" opacity={0.12} transform="rotate(15 168 150)" />
      </g>
    </g>
  );
};

// ---------------------------------------------------------------- Blueberries
const Berry: React.FC<{ x: number; y: number; r: number; sliced?: number }> = ({ x, y, r, sliced = 0 }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={r} fill="url(#berry)" />
    <ellipse cx={-r * 0.35} cy={-r * 0.38} rx={r * 0.22} ry={r * 0.14} fill="#fff" opacity={0.35} />
    <g transform={`translate(0 ${-r * 0.72})`} opacity={1 - sliced}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path key={a} d={`M0,0 L${r * 0.07},${-r * 0.2} L${-r * 0.07},${-r * 0.2} Z`} fill="#1A1C4D" transform={`rotate(${a})`} />
      ))}
    </g>
    {sliced > 0 && (
      <g opacity={sliced}>
        <circle r={r * 0.86} fill="url(#berryIn)" />
        {[...Array(9)].map((_, i) => {
          const ang = (i / 9) * Math.PI * 2;
          return <ellipse key={i} cx={Math.cos(ang) * r * 0.42} cy={Math.sin(ang) * r * 0.42} rx={r * 0.04} ry={r * 0.08}
            fill="#5B2B6E" transform={`rotate(${(ang * 180) / Math.PI + 90} ${Math.cos(ang) * r * 0.42} ${Math.sin(ang) * r * 0.42})`} />;
        })}
      </g>
    )}
  </g>
);
const BERRIES = [
  [200, 250, 52], [140, 270, 46], [262, 272, 46], [170, 200, 44], [236, 198, 44],
  [110, 215, 38], [292, 220, 38], [200, 150, 40], [200, 320, 40],
] as const;
export const Blueberries: React.FC<FruitProps> = ({ p, t }) => {
  const s = interpolate(p, [0, 0.6], [0, 1], clamp);
  const cut = interpolate(p, [0.5, 1], [0, 1], clamp);
  return (
    <g>
      <Shadow w={150} />
      <defs>
        <radialGradient id="berry" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#6E7FE6" />
          <stop offset="0.65" stopColor="#3A47B5" />
          <stop offset="1" stopColor="#232A73" />
        </radialGradient>
        <radialGradient id="berryIn" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#E8F2C8" />
          <stop offset="0.7" stopColor="#B9C987" />
          <stop offset="1" stopColor="#7A3E8F" />
        </radialGradient>
      </defs>
      {BERRIES.map(([x, y, r], i) => {
        if (i === 0) return null;
        const ang = Math.atan2(y - 240, x - 200) || i;
        const dist = 82 * s;
        const bob = Math.sin(t * 2 + i) * 3;
        return <Berry key={i} x={x + Math.cos(ang) * dist} y={y + Math.sin(ang) * dist + bob} r={r * (1 - 0.15 * s)} />;
      })}
      <Berry x={200} y={250 - 10 * s} r={52 * (1 + 0.9 * s)} sliced={cut} />
    </g>
  );
};

// ---------------------------------------------------------------- Orange
export const Orange: React.FC<FruitProps> = ({ p }) => {
  const swap = interpolate(p, [0.05, 0.3], [0, 1], clamp);
  const fan = interpolate(p, [0.3, 1], [0, 1], clamp);
  const N = 10;
  return (
    <g>
      <Shadow w={140} />
      <defs>
        <radialGradient id="orSkin" cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FFB04A" />
          <stop offset="0.7" stopColor="#FF8A00" />
          <stop offset="1" stopColor="#D96500" />
        </radialGradient>
        <linearGradient id="orSeg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FFC24D" />
          <stop offset="1" stopColor="#FF9A1F" />
        </linearGradient>
      </defs>
      {/* cross section */}
      <g opacity={swap} transform={`translate(200 215) scale(${0.85 + 0.15 * swap})`}>
        <circle r={150} fill="#FF8A00" opacity={1 - fan} />
        <circle r={138} fill="#FFF3DC" opacity={1 - fan} />
        {[...Array(N)].map((_, i) => {
          const a0 = (i / N) * 360;
          const mid = ((a0 + 18) * Math.PI) / 180;
          const off = 34 * fan;
          return (
            <g key={i} transform={`translate(${Math.cos(mid) * off} ${Math.sin(mid) * off}) rotate(${a0})`}>
              <path d="M8,4 L128,14 A128,128 0 0 1 104,76 Z" fill="url(#orSeg)" stroke="#FFE4B0" strokeWidth={4} strokeLinejoin="round" />
              <path d="M30,14 L96,30" stroke="#FFE7B8" strokeWidth={3} opacity={0.7} />
            </g>
          );
        })}
        <circle r={10} fill="#FFF3DC" />
      </g>
      {/* whole */}
      <g opacity={1 - swap}>
        <circle cx={200} cy={215} r={150} fill="url(#orSkin)" />
        {[...Array(26)].map((_, i) => (
          <circle key={i} cx={200 + Math.cos(i * 2.4) * (30 + ((i * 17) % 110))} cy={215 + Math.sin(i * 2.4) * (30 + ((i * 17) % 110))} r={2.5} fill="#C85A00" opacity={0.35} />
        ))}
        <ellipse cx={150} cy={160} rx={26} ry={40} fill="#fff" opacity={0.22} transform="rotate(-30 150 160)" />
        <path d="M200,68 C224,40 268,40 284,52 C262,78 226,82 200,68 Z" fill="#3F9142" />
        <circle cx={200} cy={68} r={7} fill="#5A3A1A" />
      </g>
    </g>
  );
};

// ---------------------------------------------------------------- Mango
const MANGO = "M150,70 C250,40 350,110 336,230 C324,330 230,372 160,350 C86,328 54,250 72,170 C84,116 110,82 150,70 Z";
export const Mango: React.FC<FruitProps> = ({ p, t }) => {
  const swap = interpolate(p, [0.05, 0.3], [0, 1], clamp);
  const cols = 4, rows = 5;
  return (
    <g>
      <Shadow w={140} />
      <defs>
        <linearGradient id="mgSkin" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4CAF50" />
          <stop offset="0.45" stopColor="#FFC107" />
          <stop offset="1" stopColor="#F4511E" />
        </linearGradient>
        <radialGradient id="mgFlesh" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#FFD54F" />
          <stop offset="1" stopColor="#FFA000" />
        </radialGradient>
        <clipPath id="mgClip"><path d={MANGO} /></clipPath>
      </defs>
      {/* hedgehog half */}
      <g opacity={swap} transform={`translate(200 215) scale(${0.8 + 0.2 * swap}) translate(-200 -215)`}>
        <path d={MANGO} fill="#7CB342" transform="translate(200 215) scale(1.04) translate(-200 -215)" />
        <path d={MANGO} fill="#FFB300" />
        <g clipPath="url(#mgClip)">
          {[...Array(cols * rows)].map((_, i) => {
            const c = i % cols, r = Math.floor(i / cols);
            const x = 82 + c * 64, y = 72 + r * 60;
            const k = interpolate(p, [0.3 + i * 0.022, 0.55 + i * 0.022], [0, 1], clamp);
            const cx = x + 30, cy = y + 28;
            const dx = (cx - 205) * 0.22 * k, dy = (cy - 215) * 0.22 * k;
            return (
              <g key={i} transform={`translate(${dx} ${dy}) translate(${cx} ${cy}) scale(${1 + 0.08 * k}) translate(${-cx} ${-cy})`}>
                <rect x={x + 2} y={y + 8 * k + 2} width={58} height={54} rx={10} fill="#E08600" />
                <rect x={x} y={y} width={58} height={54} rx={10} fill="url(#mgFlesh)" stroke="#FFE082" strokeWidth={2} />
              </g>
            );
          })}
        </g>
      </g>
      {/* whole */}
      <g opacity={1 - swap} transform={`rotate(${Math.sin(t * 1.5) * 2} 200 340)`}>
        <path d={MANGO} fill="url(#mgSkin)" />
        <ellipse cx={250} cy={130} rx={30} ry={18} fill="#fff" opacity={0.25} transform="rotate(30 250 130)" />
        <path d="M148,72 C140,50 146,36 156,28" stroke="#5A3A1A" strokeWidth={8} strokeLinecap="round" fill="none" />
        <path d="M156,40 C120,10 80,18 66,30 C94,52 130,54 156,40 Z" fill="#2E7D32" />
      </g>
    </g>
  );
};

export const FRUITS: Record<string, React.FC<FruitProps>> = {
  banana: Banana,
  apple: Apple,
  avocado: Avocado,
  blueberries: Blueberries,
  orange: Orange,
  mango: Mango,
};

// ---------------------------------------------------------------- Orange juice (the villain)
// Deconstruction: juice drains while 5 sugar cubes (~21 g) rise out and stack beside the glass.
export const Juice: React.FC<FruitProps> = ({ p, t }) => {
  const level = interpolate(p, [0.1, 0.9], [0, 1], clamp);
  const top = 120 + 150 * level; // juice surface y
  const cubes = [0, 1, 2, 3, 4];
  return (
    <g>
      <Shadow w={150} />
      <defs>
        <linearGradient id="ojLiquid" x1="0" x2="1">
          <stop offset="0" stopColor="#FFB21E" />
          <stop offset="0.5" stopColor="#FF9800" />
          <stop offset="1" stopColor="#F57C00" />
        </linearGradient>
        <clipPath id="ojGlass"><path d="M110,70 L290,70 L268,360 L132,360 Z" /></clipPath>
      </defs>
      {/* straw */}
      <path d="M232,30 L262,-10 L272,-2 L244,36 L230,330" stroke="#E5484D" strokeWidth={14} fill="none" strokeLinecap="round" />
      {/* liquid */}
      <g clipPath="url(#ojGlass)">
        <rect x={100} y={top} width={200} height={300} fill="url(#ojLiquid)" />
        <ellipse cx={200} cy={top} rx={95} ry={10} fill="#FFC75A" />
        {[...Array(7)].map((_, i) => (
          <circle key={i} cx={140 + ((i * 41) % 120)} cy={top + 40 + ((i * 67 + t * 60) % 180)} r={4 + (i % 3)} fill="#FFE0A0" opacity={0.6} />
        ))}
      </g>
      {/* glass */}
      <path d="M110,70 L290,70 L268,360 L132,360 Z" fill="#ffffff22" stroke="#ffffff" strokeWidth={8} strokeLinejoin="round" />
      <path d="M128,90 L146,340" stroke="#fff" strokeWidth={8} opacity={0.5} strokeLinecap="round" />
      {/* orange wheel on rim */}
      <g transform={`translate(110 74) rotate(${-20 - 25 * level})`} opacity={1 - level * 0.6}>
        <circle r={44} fill="#FF8A00" /><circle r={38} fill="#FFF3DC" /><circle r={33} fill="#FFB547" />
        {[0, 45, 90, 135].map((a) => <line key={a} x1={0} y1={-33} x2={0} y2={33} stroke="#FFF3DC" strokeWidth={3} transform={`rotate(${a})`} />)}
      </g>
      {/* sugar cubes rising out and stacking to the right */}
      {cubes.map((i) => {
        const k = interpolate(p, [0.15 + i * 0.13, 0.4 + i * 0.13], [0, 1], clamp);
        if (k <= 0) return null;
        const sx = 200, sy = top - 30;
        const ex = 330 + (i % 2) * 18, ey = 330 - i * 52;
        const x = sx + (ex - sx) * k;
        const y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 120;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${(1 - k) * 200 + (i % 2 ? 4 : -3)})`}>
            <rect x={-26} y={-24} width={52} height={48} rx={6} fill="#FFFFFF" stroke="#C9CED6" strokeWidth={4} />
            <rect x={-26} y={-24} width={52} height={12} rx={6} fill="#EEF1F5" />
            {[[-12, -2], [8, 6], [-4, 12], [12, -8]].map(([a, b], j) => <circle key={j} cx={a} cy={b} r={2.5} fill="#D7DCE3" />)}
          </g>
        );
      })}
    </g>
  );
};
FRUITS.juice = Juice;
