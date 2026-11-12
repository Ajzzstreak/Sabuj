/**
 * Shopping-list totals. Pure functions: resolved products in, per-store totals,
 * best single store and best two-store split out. No I/O, no LLM.
 *
 * A store can supply an item when the item's product has an in-stock,
 * eligible, priced (not link-only) offer at that retailer — the exact item or
 * that store's equivalent. The line costs the offer's landedPrice x quantity.
 */
import type { BasketLine, BasketSplit, BasketStoreTotal, Offer, Product, RetailerId } from './contract.js';
import { isRankable } from './shopper.js';

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

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Sum in integer cents so totals never carry floating-point dust. */
const sum = (lines: readonly BasketLine[]) => lines.reduce((cents, l) => cents + Math.round(l.lineTotal * 100), 0) / 100;

/** The line for one item at one retailer, or null when that store cannot supply it. */
export function lineFor(entry: BasketEntry, retailerId: RetailerId): { line: BasketLine; offer: Offer } | null {
  let best: Offer | null = null;
  for (const o of entry.product?.offers ?? []) {
    if (o.retailerId !== retailerId || !isRankable(o)) continue;
    if (!best || o.landedPrice < best.landedPrice) best = o;
  }
  if (!best) return null;
  return {
    offer: best,
    line: {
      itemId: entry.id,
      offerId: best.id,
      matchType: best.matchType,
      offerTitle: best.offerTitle,
      unitCost: best.landedPrice,
      quantity: entry.quantity,
      lineTotal: round2(best.landedPrice * entry.quantity),
    },
  };
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
    stores.push({ byItem, total: { retailerId, storeId, lines, missingItemIds, total: sum(lines), complete: missingItemIds.length === 0 } });
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
    // Cheapest complete store; with none complete, the one covering the most
    // items (ties: lower total) — which is exactly the sort order above.
    bestSingleStore: stores[0]?.total.retailerId ?? null,
    bestSplit: bestSplitOf(entries, stores, opts),
  };
}
