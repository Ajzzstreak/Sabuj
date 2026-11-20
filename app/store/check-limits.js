#!/usr/bin/env node
/**
 * Checks every length-limited store field in app/store/*.md.
 *
 * A field is a ```text block directly after a marker comment:
 *   <!-- limit: <Store> · <Field> · <max characters> -->
 * Length is counted in Unicode code points (what App Store Connect and the Play Console count),
 * with the block's surrounding newlines removed. Exits 1 if any field is over its limit.
 *
 * Usage (from app/): node store/check-limits.js
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const MARKER = /<!-- limit: (.+?) · (.+?) · (\d+) -->\s*\n```text\n([\s\S]*?)\n```/g;

let failures = 0;
let fields = 0;
const rows = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
  const md = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const m of md.matchAll(MARKER)) {
    const [, store, field, maxText, body] = m;
    const max = Number(maxText);
    const length = [...body].length;
    const over = length > max;
    fields += 1;
    if (over) failures += 1;
    rows.push({ file, store, field, length, max, status: over ? 'OVER' : 'ok' });
    if (field === 'Keywords' && /,\s/.test(body)) {
      failures += 1;
      rows.push({ file, store, field: 'Keywords (space after comma wastes characters)', length: '', max: '', status: 'FIX' });
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('Store', 12)} ${pad('Field', 20)} ${pad('Chars', 6)} ${pad('Max', 6)} Status  File`);
for (const r of rows) console.log(`${pad(r.store, 12)} ${pad(r.field, 20)} ${pad(r.length, 6)} ${pad(r.max, 6)} ${pad(r.status, 7)} ${r.file}`);
console.log(`\n${fields} fields checked, ${failures} problem(s).`);
if (fields === 0) {
  console.error('No limit markers found.');
  process.exit(1);
}
process.exit(failures ? 1 : 0);
