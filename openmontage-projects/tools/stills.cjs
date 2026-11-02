// usage: node stills.cjs <entry.tsx> <compId> <publicDir> <outDir> <scale> <frame...>
const path = require("path");
const { bundle } = require(path.join(process.cwd(), "node_modules/@remotion/bundler"));
const { renderStill, selectComposition } = require(path.join(process.cwd(), "node_modules/@remotion/renderer"));
(async () => {
  const [entry, id, publicDir, outDir, scale, ...frames] = process.argv.slice(2);
  const serveUrl = await bundle({ entryPoint: path.resolve(entry), publicDir: path.resolve(publicDir) });
  const browserExecutable = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
  const composition = await selectComposition({ serveUrl, id, browserExecutable });
  for (const f of frames) {
    const out = path.join(outDir, `f${String(f).padStart(5, "0")}.png`);
    await renderStill({ composition, serveUrl, output: out, frame: Number(f), scale: Number(scale), browserExecutable });
  }
  console.log("done", frames.length);
})().catch((e) => { console.error(e); process.exit(1); });
