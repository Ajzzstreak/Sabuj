/**
 * PLACEHOLDER BRAND ASSETS. Regenerates every image in app/assets/ from one SVG mark
 * (a price tag whose hole is a lens). Replace the mark when the product name is final.
 *
 * Usage (from app/):  node assets/brand/generate-placeholder-assets.js
 * Needs Playwright with Chromium. It is not an app dependency: install it wherever you
 * like and make it resolvable (e.g. NODE_PATH=$(npm root -g)).
 *
 * Outputs (all PNG):
 *   icon.png                       1024x1024, opaque RGB (App Store rejects alpha)
 *   android-icon-foreground.png    1024x1024, transparent, mark inside the 66/108 safe zone
 *   android-icon-background.png    1024x1024, opaque accent gradient
 *   android-icon-monochrome.png    1024x1024, white mark on transparent (Android 13 themed icons)
 *   splash-icon.png                1024x1024, transparent, app tile for the splash screen
 *   notification-icon.png          96x96, white mark on transparent (Android status bar)
 *   favicon.png                    64x64
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not resolvable. Install it (not as an app dependency) and set NODE_PATH.');
  process.exit(1);
}

const OUT = path.resolve(__dirname, '..');
// Accent from src/theme/tokens.ts (light palette): accent #5B43F0, accentText #4A32D4.
const TOP = '#6A55F7';
const BOTTOM = '#4A32D4';

/**
 * The mark on a 1024 canvas: a price tag pointing up-left, its hole drawn as a lens
 * ring (the "lens" in DealLens). `scale` shrinks it around the centre.
 */
function mark(fill, scale = 1) {
  return `
  <defs>
    <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <circle cx="400" cy="512" r="98" fill="#000"/>
    </mask>
  </defs>
  <g transform="translate(512 512) scale(${scale}) rotate(45) translate(-512 -512)">
    <path d="M212 512 L380 336 L820 336 L820 688 L380 688 Z" fill="${fill}" stroke="${fill}"
      stroke-width="72" stroke-linejoin="round" mask="url(#m)"/>
    <circle cx="400" cy="512" r="46" fill="${fill}"/>
  </g>`;
}

const svg = (body, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;

const gradient = `
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${TOP}"/><stop offset="1" stop-color="${BOTTOM}"/>
  </linearGradient></defs>`;

const assets = [
  // Full-bleed square: iOS and Android apply their own corner masks.
  { file: 'icon.png', size: 1024, opaque: true, body: `${gradient}<rect width="1024" height="1024" fill="url(#g)"/>${mark("#fff", 0.8)}` },
  // Adaptive icon: 108dp canvas, only the central 66dp circle is guaranteed visible.
  { file: 'android-icon-foreground.png', size: 1024, body: mark('#fff', 0.56) },
  { file: 'android-icon-background.png', size: 1024, opaque: true, body: `${gradient}<rect width="1024" height="1024" fill="url(#g)"/>` },
  { file: 'android-icon-monochrome.png', size: 1024, body: mark('#fff', 0.56) },
  // Splash: the app tile, so it reads on both the light and the dark splash background.
  {
    file: 'splash-icon.png',
    size: 1024,
    body: `${gradient}<rect x="112" y="112" width="800" height="800" rx="184" fill="url(#g)"/>${mark('#fff', 0.6)}`,
  },
  // Status-bar icon: Android draws it as a white silhouette, so fill the canvas.
  { file: 'notification-icon.png', size: 96, body: mark('#fff', 0.98) },
  { file: 'favicon.png', size: 64, body: `${gradient}<rect width="1024" height="1024" rx="232" fill="url(#g)"/>${mark('#fff', 0.84)}` },
];

// ---- minimal PNG re-encoder: RGBA (from Chromium) -> RGB, for the opaque files ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function decodeRgba(png) {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || !channels || interlace) throw new Error('unexpected PNG format');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let p;
      if (f === 0) p = 0;
      else if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = (v + p) & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}
function toOpaqueRgbPng(png) {
  const { width, height, channels, pixels } = decodeRgba(png);
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * channels;
      const d = y * (width * 3 + 1) + 1 + x * 3;
      if (channels === 4 && pixels[s + 3] !== 255) throw new Error('opaque asset has transparent pixels');
      raw[d] = pixels[s];
      raw[d + 1] = pixels[s + 1];
      raw[d + 2] = pixels[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const a of assets) {
      const page = await browser.newPage({ viewport: { width: a.size, height: a.size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<html><body style="margin:0;background:transparent">${svg(a.body, a.size)}</body></html>`,
      );
      let png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: a.size, height: a.size } });
      if (a.opaque) png = toOpaqueRgbPng(png);
      fs.writeFileSync(path.join(OUT, a.file), png);
      await page.close();
      console.log(`wrote assets/${a.file} (${a.size}x${a.size}${a.opaque ? ', RGB' : ', RGBA'})`);
    }
  } finally {
    await browser.close();
  }
})();
