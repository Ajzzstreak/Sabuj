/**
 * Package sizes and unit prices. Pure helpers, no I/O.
 *
 * Sizes are normalized WITHIN a dimension only:
 *   weight -> ounces, volume -> fluid ounces, count -> each.
 * A weight is never converted to a volume or a count (an ounce of chips and a
 * fluid ounce of soda are not comparable), so unit prices from different
 * dimensions must never be compared — see `comparableSizes`.
 */
import type { PackageSize, SizeUnit } from './contract.js';

export type Dimension = 'weight' | 'volume' | 'count';

const DIMENSION: Record<SizeUnit, Dimension> = { oz: 'weight', lb: 'weight', fl_oz: 'volume', gal: 'volume', ct: 'count', each: 'count' };
/** Multiplier to the dimension's base unit (oz, fl oz, each). */
const TO_BASE: Record<SizeUnit, number> = { oz: 1, lb: 16, fl_oz: 1, gal: 128, ct: 1, each: 1 };
const UNIT_LABEL: Record<Dimension, string> = { weight: 'per oz', volume: 'per fl oz', count: 'each' };

export function dimensionOf(size: PackageSize): Dimension {
  return DIMENSION[size.unit];
}

/** Amount in the dimension's base unit: oz, fl oz, or each. */
export function baseAmount(size: PackageSize): number {
  return size.amount * TO_BASE[size.unit];
}

export function sameSize(a: PackageSize | null, b: PackageSize | null): boolean {
  if (a === null || b === null) return a === b;
  return dimensionOf(a) === dimensionOf(b) && Math.abs(baseAmount(a) - baseAmount(b)) < 1e-6;
}

/** True when unit prices of the two sizes may be compared (same dimension, both known and positive). */
export function comparableSizes(a: PackageSize | null, b: PackageSize | null): boolean {
  return a !== null && b !== null && baseAmount(a) > 0 && baseAmount(b) > 0 && dimensionOf(a) === dimensionOf(b);
}

export interface UnitPrice {
  /** USD per oz / per fl oz / each, rounded to 4 decimals. */
  unitPrice: number;
  unitLabel: string;
}

/** price / size in the normalized unit, or null when the size is unknown or not positive. */
export function unitPriceOf(price: number, size: PackageSize | null): UnitPrice | null {
  if (!size || !(size.amount > 0) || !Number.isFinite(price)) return null;
  return { unitPrice: Math.round((price / baseAmount(size)) * 10000) / 10000, unitLabel: UNIT_LABEL[dimensionOf(size)] };
}

/** "16 oz", "1 gal", "12 ct", "2.5 lb". */
export function formatSize(size: PackageSize): string {
  const unit = size.unit === 'fl_oz' ? 'fl oz' : size.unit === 'each' ? (size.amount === 1 ? 'each' : 'ct') : size.unit;
  const amount = Number.isInteger(size.amount) ? String(size.amount) : String(Math.round(size.amount * 100) / 100);
  return unit === 'each' ? 'each' : `${amount} ${unit}`;
}

interface UnitSpec {
  unit: SizeUnit;
  /** Multiplier applied to the parsed number to get `unit`. */
  factor: number;
}

// Order matters: "fl oz" must be tried before "oz", "lb" before "l".
const UNIT_PATTERNS: Array<[RegExp, UnitSpec]> = [
  [/^(?:fl\.?\s*oz\.?|fluid\s+ounces?|floz)/, { unit: 'fl_oz', factor: 1 }],
  [/^(?:gal(?:lons?)?\.?)(?![a-z])/, { unit: 'gal', factor: 1 }],
  [/^(?:qts?\.?|quarts?)(?![a-z])/, { unit: 'fl_oz', factor: 32 }],
  [/^(?:pts?\.?|pints?)(?![a-z])/, { unit: 'fl_oz', factor: 16 }],
  [/^(?:ml|milliliters?)(?![a-z])/, { unit: 'fl_oz', factor: 1 / 29.5735 }],
  [/^(?:l|lt|liters?|litres?)(?![a-z])/, { unit: 'fl_oz', factor: 33.814 }],
  [/^(?:lbs?\.?|pounds?)(?![a-z])/, { unit: 'lb', factor: 1 }],
  [/^(?:oz\.?|ounces?)(?![a-z])/, { unit: 'oz', factor: 1 }],
  [/^(?:kg|kilograms?)(?![a-z])/, { unit: 'oz', factor: 35.274 }],
  [/^(?:g|grams?)(?![a-z])/, { unit: 'oz', factor: 1 / 28.3495 }],
  [/^(?:ct\.?|count|pk|pack|packs|pcs?|pieces?|rolls?|bags?|pods?|cans?|bottles?|sheets|wipes|diapers|eggs|each|ea)(?![a-z])/, { unit: 'ct', factor: 1 }],
];

const NUMBER = /^(\d+(?:\.\d+)?|\.\d+)/;
const WORD_NUMBERS: Array<[RegExp, string]> = [
  [/\bhalf[\s-]+gallon\b/g, '0.5 gal'],
  [/\bhalf[\s-]+dozen\b/g, '6 ct'],
  [/\b(?:one|a)\s+dozen\b|\bdozen\b/g, '12 ct'],
  [/\b(\d+)\s*-\s*(?=(?:fl|oz|ounce|lb|pound|ct|count|pack|gal|qt|pt|l\b|ml|g\b|kg))/g, '$1 '],
];

function readUnit(s: string): { spec: UnitSpec; rest: string } | null {
  for (const [re, spec] of UNIT_PATTERNS) {
    const m = re.exec(s);
    if (m) return { spec, rest: s.slice(m[0].length) };
  }
  return null;
}

function readQuantity(s: string): { amount: number; spec: UnitSpec; rest: string } | null {
  const n = NUMBER.exec(s);
  if (!n) return null;
  const unit = readUnit(s.slice(n[0].length).trimStart());
  if (!unit) return null;
  return { amount: Number(n[0]), spec: unit.spec, rest: unit.rest };
}

function toSize(amount: number, spec: UnitSpec): PackageSize | null {
  const value = amount * spec.factor;
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  return { amount: Math.round(value * 1000) / 1000, unit: spec.unit };
}

/**
 * Parse a package size from free text such as a size field or a product title.
 * Handles "16 oz", "5 lb", "64 fl oz", "1 gal", "half gallon", "12 ct",
 * "dozen", "2 L", "500 ml", and multipacks: "12 x 12 fl oz", "6 pack, 16.9 fl oz",
 * "12 fl oz, 12 count" (-> 144 fl oz). When a title holds several sizes, a
 * multipack wins, then the LAST plain size (titles usually end with it).
 * Returns null when nothing size-like is found. Heuristic by nature: a title
 * such as "Formula 409 Cleaner 32 oz" parses fine, "7 Up 12 pack" reads as 12 ct.
 */
export function parseSize(text: string | null | undefined): PackageSize | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 400) return null;
  let s = text.toLowerCase().replace(/[,;()/]/g, ' ').replace(/\s+/g, ' ');
  for (const [re, to] of WORD_NUMBERS) s = s.replace(re, to);

  // Multipack "N x SIZE" / "N pack SIZE" / "SIZE N count|pack".
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && /[\d.a-z]/.test(s[i - 1]!)) continue;
    const head = NUMBER.exec(s.slice(i));
    if (!head) continue;
    const afterNumber = s.slice(i + head[0].length);
    const times = /^\s*(?:x|×|-?\s*(?:pack|pk|ct|count)\b(?:\s*(?:of|x|×))?)\s*/.exec(afterNumber);
    if (times) {
      const each = readQuantity(afterNumber.slice(times[0].length));
      if (each && each.spec.unit !== 'ct') return toSize(Number(head[0]) * each.amount, each.spec);
    }
    const first = readQuantity(s.slice(i));
    if (first && first.spec.unit !== 'ct') {
      const count = /^\s*(?:x\s*)?(\d+)\s*-?\s*(?:ct|count|pack|pk|cans?|bottles?)\b/.exec(first.rest);
      if (count) return toSize(first.amount * Number(count[1]), first.spec);
    }
  }

  // Plain sizes: prefer a weight/volume over a bare count, and the last one found.
  let measured: PackageSize | null = null;
  let counted: PackageSize | null = null;
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && /[\d.a-z]/.test(s[i - 1]!)) continue;
    const q = readQuantity(s.slice(i));
    if (!q) continue;
    const size = toSize(q.amount, q.spec);
    if (!size) continue;
    if (size.unit === 'ct') counted = size;
    else measured = size;
  }
  return measured ?? counted;
}
