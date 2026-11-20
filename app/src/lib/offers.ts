import type { Offer, Product, RetailerId } from '@/api/contract';
import { unitWord } from './format';

export type SortKey = 'best' | 'price' | 'unit' | 'rating';

export interface OfferFilters {
  /** Empty means every retailer. */
  retailers: RetailerId[];
  inStockOnly: boolean;
}

export const NO_FILTERS: OfferFilters = { retailers: [], inStockOnly: false };

/** 'link_only' offers carry no price: never show one, never rank one. */
export const hasPrice = (o: Offer): boolean => o.priceSource !== 'link_only';

/**
 * Can this offer be called "best"? Only if the user can actually buy it at a
 * known price: in stock, eligible (membership) and not link-only.
 */
export const rankable = (o: Offer): boolean => o.inStock && o.eligible && hasPrice(o);

/**
 * The server compares a product's offers PER UNIT as soon as one of them is a
 * comparable item rather than the same one ('equivalent'), or the packs differ
 * in size. A 25 lb bag is then "best" at a higher shelf price than a 5 lb bag,
 * and the UI must say "best value per oz", never "best price".
 */
export function isUnitMode(offers: readonly Offer[]): boolean {
  if (offers.some((o) => o.matchType === 'equivalent')) return true;
  const sizes = new Set(offers.filter((o) => o.size).map((o) => `${o.size?.amount} ${o.size?.unit}`));
  return sizes.size > 1;
}

export interface OfferView {
  offers: Offer[];
  /** The best offer: lowest landed price, or lowest price per unit in unit mode. */
  cheapestId: string | null;
  recommendedId: string | null;
  /** The server's reason for its pick, verbatim, only when that pick is not the cheapest. */
  reason: string | null;
  /** Dollar gap between the best and worst offer. 0 in unit mode (see savingsPct). */
  savings: number;
  /** Unit mode: how much less per unit the best offer is than the worst, 0-1. */
  savingsPct: number;
  /** Landed price (item + shipping + estimated tax) of the best offer. */
  bestPrice: number | null;
  unitMode: boolean;
  /** "oz", "fl oz", "ct"... of the best offer in unit mode. */
  unit: string | null;
  /** "Best price", or "Best value per oz" in unit mode. */
  bestLabel: string;
  /**
   * Unit mode only: the offer with the lowest shelf total when that is NOT the
   * best-value one, so the card can say so explicitly.
   */
  lowestShelf: Offer | null;
}

/** The offers of a product as they should be displayed under the given filters. */
export function viewOffers(product: Product, filters: OfferFilters = NO_FILTERS): OfferView {
  const filtered = filters.retailers.length > 0 || filters.inStockOnly;
  const offers = filtered
    ? product.offers.filter(
        (o) =>
          (filters.retailers.length === 0 || filters.retailers.includes(o.retailerId)) &&
          (!filters.inStockOnly || o.inStock),
      )
    : product.offers;

  // Decided on the product's full offer set, like the server does, so a filter does not flip the wording.
  const unitMode = isUnitMode(product.offers);
  const ranked = offers.filter(rankable);

  let cheapestId = product.cheapestOfferId;
  const serverPick = offers.find((o) => o.id === cheapestId);
  // Trust the server's answer unless a filter hid it or it is not something this user can buy at a known price.
  if (filtered || cheapestId == null || !serverPick || !rankable(serverPick)) {
    if (unitMode) {
      // Only offers priced per the same unit can be compared.
      const label = ranked.find((o) => o.unitPrice != null)?.unitLabel ?? null;
      const pool = ranked.filter((o) => o.unitPrice != null && o.unitLabel === label);
      const min = pool.length ? Math.min(...pool.map((o) => o.unitPrice ?? 0)) : null;
      cheapestId = min == null ? null : (pool.find((o) => o.unitPrice === min)?.id ?? null);
    } else {
      const min = ranked.length ? Math.min(...ranked.map((o) => o.landedPrice)) : null;
      cheapestId = min == null ? null : (ranked.find((o) => o.landedPrice === min)?.id ?? null);
    }
  }
  const cheapest = offers.find((o) => o.id === cheapestId) ?? null;

  let savings = 0;
  let savingsPct = 0;
  let lowestShelf: Offer | null = null;
  if (cheapest && unitMode) {
    const units = ranked.filter((o) => o.unitPrice != null && o.unitLabel === cheapest.unitLabel).map((o) => o.unitPrice ?? 0);
    const max = units.length ? Math.max(...units) : 0;
    if (cheapest.unitPrice != null && max > 0) savingsPct = Math.max(0, (max - cheapest.unitPrice) / max);
    const low = ranked.reduce<Offer | null>((best, o) => (best == null || o.landedPrice < best.landedPrice ? o : best), null);
    if (low && low.id !== cheapest.id && low.landedPrice < cheapest.landedPrice - 0.005) lowestShelf = low;
  } else if (cheapest) {
    const prices = ranked.map((o) => o.landedPrice);
    savings = filtered || !serverPick ? (prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0) : product.maxSavings;
  }

  const unit = unitMode && cheapest?.unitLabel ? unitWord(cheapest.unitLabel) : null;
  const recommended = offers.find((o) => o.id === product.recommendedOfferId) ?? null;
  const differs = recommended != null && rankable(recommended) && recommended.id !== cheapestId;
  return {
    offers,
    cheapestId,
    recommendedId: differs ? recommended.id : null,
    reason: differs ? product.recommendationReason : null,
    savings: Math.max(0, savings),
    savingsPct,
    bestPrice: cheapest ? cheapest.landedPrice : null,
    unitMode,
    unit,
    bestLabel: !unitMode ? 'Best price' : unit === 'each' ? 'Best value each' : unit ? `Best value per ${unit}` : 'Best value',
    lowestShelf,
  };
}

/** Landed price of the best offer the user can actually get (what price alerts watch), or null. */
export function bestPrice(product: Product): number | null {
  return viewOffers(product).bestPrice;
}

export function hasDemoPrices(products: readonly Product[]): boolean {
  return products.some((p) => p.offers.some((o) => o.priceSource === 'demo'));
}

export interface ResultConstraints {
  /** Keep products whose best price is at or under this. */
  maxPrice?: number | null;
  minRating?: number | null;
}

export function applyResultsView(products: Product[], sort: SortKey, filters: OfferFilters, limits: ResultConstraints = {}): Product[] {
  const filtered = filters.retailers.length > 0 || filters.inStockOnly;
  const { maxPrice, minRating } = limits;
  let list = products;
  if (filtered) list = list.filter((p) => viewOffers(p, filters).offers.length > 0);
  if (minRating != null) list = list.filter((p) => p.rating != null && p.rating >= minRating);
  if (maxPrice != null)
    list = list.filter((p) => {
      const best = viewOffers(p, filters).bestPrice;
      return best != null && best <= maxPrice;
    });
  if (sort === 'best') return list;
  const keyed = list.map((p, index) => {
    const view = viewOffers(p, filters);
    const best = view.offers.find((o) => o.id === view.cheapestId);
    return { p, index, best: view.bestPrice, unit: best?.unitPrice ?? null };
  });
  const asc = (a: number | null, b: number | null) => (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
  keyed.sort((a, b) => {
    if (sort === 'price') return asc(a.best, b.best) || a.index - b.index;
    // Unit prices across different units (per oz vs each) are not truly comparable; this is a plain numeric order.
    if (sort === 'unit') return asc(a.unit, b.unit) || a.index - b.index;
    const d = (b.p.rating ?? -1) - (a.p.rating ?? -1);
    return d !== 0 ? d : b.p.reviewCount - a.p.reviewCount || a.index - b.index;
  });
  return keyed.map((k) => k.p);
}
