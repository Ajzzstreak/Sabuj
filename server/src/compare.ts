/**
 * How the offers of one product are compared.
 *
 * Shelf mode (default): every offer is the same item in the same size, so the
 * comparison value is simply landedPrice.
 *
 * Unit mode: as soon as a product has an 'equivalent' offer (another store's
 * comparable item) or offers in different package sizes, shelf prices are not
 * comparable — a 5 lb bag is not "more expensive" than a 2 lb bag. Offers are
 * then compared on landed price per unit, expressed as dollars for the
 * reference package ("what this much of it costs at each store"):
 *
 *     value = landedPrice / offerSize * referenceSize
 *
 * so budgets, bounds and savings stay in dollars. An offer whose size is
 * unknown, or measured in another dimension than the reference (oz vs ct), has
 * NO comparison value: it is never cheapest and never recommended.
 */
import type { Offer, PackageSize } from './contract.js';
import { isLinkOnly, isRankable } from './shopper.js';
import { baseAmount, comparableSizes, dimensionOf, sameSize } from './size.js';

export interface Comparison {
  unitMode: boolean;
  /** Reference package in unit mode, else null. */
  reference: PackageSize | null;
  /** "per oz" | "per fl oz" | "each" in unit mode, else null. */
  unitLabel: string | null;
  /** Dollars for the reference quantity; null when the offer cannot be compared. */
  value(o: Offer): number | null;
  /** Landed dollars per base unit (unit mode only), else null. */
  perUnit(o: Offer): number | null;
}

const SHELF: Comparison = { unitMode: false, reference: null, unitLabel: null, value: (o) => o.landedPrice, perUnit: () => null };
const LABEL = { weight: 'per oz', volume: 'per fl oz', count: 'each' } as const;

export function buildComparison(offers: readonly Offer[], productSize: PackageSize | null): Comparison {
  const priced = offers.filter((o) => !isLinkOnly(o));
  const first = priced[0];
  if (!first) return SHELF;
  const needsUnit = priced.some((o) => o.matchType === 'equivalent' || !sameSize(o.size, first.size));
  if (!needsUnit) return SHELF;
  // Reference: the product's own package, else the first exact offer's, else any sized offer's.
  const reference = productSize ?? priced.find((o) => o.matchType === 'exact' && o.size)?.size ?? priced.find((o) => o.size)?.size ?? null;
  if (!reference || !(baseAmount(reference) > 0) || !priced.some((o) => comparableSizes(o.size, reference))) return SHELF;
  const refAmount = baseAmount(reference);
  const perUnit = (o: Offer) => (comparableSizes(o.size, reference) ? o.landedPrice / baseAmount(o.size!) : null);
  return {
    unitMode: true,
    reference,
    unitLabel: LABEL[dimensionOf(reference)],
    perUnit,
    value: (o) => {
      const u = perUnit(o);
      return u === null ? null : u * refAmount;
    },
  };
}

/** Rankable AND comparable: the only offers that may be cheapest or recommended. */
export function isContender(o: Offer, cmp: Comparison): boolean {
  return isRankable(o) && cmp.value(o) !== null;
}

/** Lowest comparison value among contenders (ties: retailer id), or null. */
export function cheapestContender(offers: readonly Offer[], cmp: Comparison): Offer | null {
  let best: Offer | null = null;
  let bestValue = Infinity;
  for (const o of offers) {
    if (!isRankable(o)) continue;
    const v = cmp.value(o);
    if (v === null) continue;
    // 1e-9: per-unit maths is floating point; equal prices must tie, not flip on noise.
    if (!best || v < bestValue - 1e-9 || (Math.abs(v - bestValue) <= 1e-9 && o.retailerId < best.retailerId)) {
      best = o;
      bestValue = v;
    }
  }
  return best;
}
