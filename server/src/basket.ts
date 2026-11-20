/**
 * Shopping-list totals. Pure functions: resolved products in, per-store totals,
 * best single store and best two-store split out. No I/O, no LLM.
 *
 * A store can supply an item when the item's product has an in-stock,
 * eligible, priced (not link-only) offer at that retailer — the exact item or
 * that store's equivalent.
 *
 * Pack sizing (see `packsFor`): the listed amount is quantity x the product's
 * size. When the offer's pack size is known and in the same dimension, the line
 * buys ceil(listed amount / pack size) packs; otherwise `quantity` packs. The
 * line costs landedPrice x packs — what is paid at the till — and
 * `valueCost` is the like-for-like cost of exactly the listed amount.
 *
 * Ranking (best single store, split assignment and savings) is on till totals,
 * never on valueCost: that is what the shopper spends today.
 */
import type { BasketLine, BasketSplit, BasketStoreTotal, Offer, PackageSize, Product, RetailerId } from './contract.js';
import { isRankable } from './shopper.js';
import { baseAmount, comparableSizes } from './size.js';

export interface BasketEntry {
  id: string;
  quantity: number;
  /** null when the item could not be resolved to a product. */
  product: Product | null;
}

export interface BasketTotals {
  perStore: BasketStoreTotal[];
  bestSingleStore: RetailerId | null;
  bestSplit: BasketSplit | null;
}

export interface BasketOptions {
  /** A split must save at least this many dollars over the best single store. */
  minSplitSavings: number;
}

/**
 * A free-text item resolves to the top search hit only when that hit is at
 * least this relevant (0..1). Mock search scores a head-noun match ~0.85,
 * an exact word in a modifier position ~0.7, a keyword-only match ~0.64, and
 * typo / description-only matches below 0.6; live providers score their
 * first hit 0.9 (position only).
 */
export const BASKET_MIN_RELEVANCE = 0.6;

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Sum in integer cents so totals never carry floating-point dust. */
const sum = (lines: readonly BasketLine[]) => lines.reduce((cents, l) => cents + Math.round(l.lineTotal * 100), 0) / 100;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const scale = (size: PackageSize | null, by: number): PackageSize | null => (size ? { amount: round3(size.amount * by), unit: size.unit } : null);

export interface Packs {
  packages: number;
  sizeBasis: BasketLine['sizeBasis'];
  requestedAmount: PackageSize | null;
  coveredAmount: PackageSize | null;
  overbuyRatio: number | null;
  /** Fraction of one pack's price the listed amount is worth; null with sizeBasis 'package'. */
  valueFactor: number | null;
}

/**
 * How many packs of `packSize` cover `quantity` x `productSize`. Pure.
 * Both sizes known, positive and in the same dimension -> packs to cover the
 * listed amount (at least 1; a tiny tolerance keeps 3 x 0.5 gal = 1.5 gal from
 * rounding up to an extra pack). Otherwise one pack per listed unit.
 */
export function packsFor(quantity: number, productSize: PackageSize | null, packSize: PackageSize | null): Packs {
  const requestedAmount = scale(productSize, quantity);
  if (!comparableSizes(productSize, packSize)) {
    return { packages: quantity, sizeBasis: 'package', requestedAmount, coveredAmount: scale(packSize, quantity), overbuyRatio: null, valueFactor: null };
  }
  const requested = baseAmount(productSize!) * quantity;
  const pack = baseAmount(packSize!);
  const packages = Math.max(1, Math.ceil(requested / pack - 1e-6));
  return {
    packages,
    sizeBasis: 'amount',
    requestedAmount,
    coveredAmount: scale(packSize, packages),
    overbuyRatio: Math.round(((packages * pack) / requested) * 100) / 100,
    valueFactor: requested / pack,
  };
}

/**
 * The line for one item at one retailer, or null when that store cannot supply it.
 * With several usable offers at the store, the one with the lowest till cost
 * for the listed amount (packs x landedPrice) wins; ties: lower pack price.
 */
export function lineFor(entry: BasketEntry, retailerId: RetailerId): { line: BasketLine; offer: Offer } | null {
  const product = entry.product;
  let best: { offer: Offer; packs: Packs; lineTotal: number } | null = null;
  for (const o of product?.offers ?? []) {
    if (o.retailerId !== retailerId || !isRankable(o)) continue;
    const packs = packsFor(entry.quantity, product!.size, o.size);
    const lineTotal = round2(o.landedPrice * packs.packages);
    if (!best || lineTotal < best.lineTotal || (lineTotal === best.lineTotal && o.landedPrice < best.offer.landedPrice)) best = { offer: o, packs, lineTotal };
  }
  if (!best) return null;
  const { offer, packs, lineTotal } = best;
  return {
    offer,
    line: {
      itemId: entry.id,
      offerId: offer.id,
      matchType: offer.matchType,
      offerTitle: offer.offerTitle,
      unitCost: offer.landedPrice,
      quantity: entry.quantity,
      packages: packs.packages,
      packSize: offer.size,
      sizeBasis: packs.sizeBasis,
      requestedAmount: packs.requestedAmount,
      coveredAmount: packs.coveredAmount,
      overbuyRatio: packs.overbuyRatio,
      lineTotal,
      valueCost: packs.valueFactor === null ? null : round2(offer.landedPrice * packs.valueFactor),
    },
  };
}

/** Sum of valueCost in cents; null as soon as one line has none. */
function valueSum(lines: readonly BasketLine[]): number | null {
  let cents = 0;
  for (const l of lines) {
    if (l.valueCost === null) return null;
    cents += Math.round(l.valueCost * 100);
  }
  return cents / 100;
}

interface StoreWork {
  total: BasketStoreTotal;
  /** itemId -> line, for the split maths. */
  byItem: Map<string, BasketLine>;
}

function priceStores(entries: readonly BasketEntry[]): StoreWork[] {
  const retailers = new Set<RetailerId>();
  for (const e of entries) for (const o of e.product?.offers ?? []) if (isRankable(o)) retailers.add(o.retailerId);
  const stores: StoreWork[] = [];
  for (const retailerId of retailers) {
    const lines: BasketLine[] = [];
    const missingItemIds: string[] = [];
    const byItem = new Map<string, BasketLine>();
    let storeId: string | null = null;
    for (const e of entries) {
      const found = lineFor(e, retailerId);
      if (!found) {
        missingItemIds.push(e.id);
        continue;
      }
      lines.push(found.line);
      byItem.set(e.id, found.line);
      storeId ??= found.offer.storeId;
    }
    stores.push({ byItem, total: { retailerId, storeId, lines, missingItemIds, total: sum(lines), valueTotal: valueSum(lines), complete: missingItemIds.length === 0 } });
  }
  // Most items covered first, then cheapest: so the list reads "best option
  // first" even when no store has everything, and [0] is the best single store.
  return stores.sort(
    (a, b) =>
      b.total.lines.length - a.total.lines.length ||
      a.total.total - b.total.total ||
      (a.total.retailerId < b.total.retailerId ? -1 : 1),
  );
}

/**
 * Best two-store split. Every pair of stores is evaluated; each item goes to
 * the cheaper store of the pair (ties: the store that ranks better on its
 * own). A pair qualifies only when
 *   - both stores actually get at least one item (otherwise it is not a split),
 *   - it covers exactly the items the best single store covers (so the two
 *     totals are for the same basket), and
 *   - it is cheaper than the best single store by at least `minSplitSavings`.
 * The qualifying pair with the largest saving wins; null when there is none.
 */
function bestSplitOf(entries: readonly BasketEntry[], stores: readonly StoreWork[], opts: BasketOptions): BasketSplit | null {
  const single = stores[0];
  if (!single || stores.length < 2) return null;
  const threshold = Math.max(0.01, opts.minSplitSavings);
  let best: BasketSplit | null = null;
  for (let i = 0; i < stores.length; i++) {
    for (let j = i + 1; j < stores.length; j++) {
      const a = stores[i]!;
      const b = stores[j]!;
      const assignments: BasketSplit['assignments'] = [];
      const missingItemIds: string[] = [];
      let fromA = 0;
      let fromB = 0;
      for (const e of entries) {
        const la = a.byItem.get(e.id);
        const lb = b.byItem.get(e.id);
        if (!la && !lb) {
          missingItemIds.push(e.id);
        } else if (la && (!lb || la.lineTotal <= lb.lineTotal)) {
          assignments.push({ itemId: e.id, retailerId: a.total.retailerId, line: la });
          fromA += 1;
        } else {
          assignments.push({ itemId: e.id, retailerId: b.total.retailerId, line: lb! });
          fromB += 1;
        }
      }
      if (fromA === 0 || fromB === 0) continue;
      // Same coverage as the best single store, item for item.
      if (missingItemIds.length !== single.total.missingItemIds.length) continue;
      if (missingItemIds.some((id) => single.byItem.has(id))) continue;
      const total = sum(assignments.map((x) => x.line));
      const savingsVsBestSingle = round2(single.total.total - total);
      if (savingsVsBestSingle < threshold - 1e-9) continue;
      if (!best || savingsVsBestSingle > best.savingsVsBestSingle) {
        best = {
          stores: [a, b].map((s) => ({ retailerId: s.total.retailerId, storeId: s.total.storeId })),
          assignments,
          missingItemIds,
          total,
          savingsVsBestSingle,
        };
      }
    }
  }
  return best;
}

export function computeBasket(entries: readonly BasketEntry[], opts: BasketOptions): BasketTotals {
  const stores = priceStores(entries);
  return {
    perStore: stores.map((s) => s.total),
    // Cheapest complete store by TILL total (bulk packs at full price, never
    // valueTotal); with none complete, the one covering the most items (ties:
    // lower total) — which is exactly the sort order above.
    bestSingleStore: stores[0]?.total.retailerId ?? null,
    bestSplit: bestSplitOf(entries, stores, opts),
  };
}
