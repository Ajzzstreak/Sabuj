import type { Offer, Product, RetailerId } from '@/api/contract';

export type SortKey = 'best' | 'price' | 'rating';

export interface OfferFilters {
  /** Empty means every retailer. */
  retailers: RetailerId[];
  inStockOnly: boolean;
}

export const NO_FILTERS: OfferFilters = { retailers: [], inStockOnly: false };

/** 'link_only' offers carry no price: never show one, never rank one. */
export const hasPrice = (o: Offer): boolean => o.priceSource !== 'link_only';

/**
 * Can this offer be called "best price"? Only if the user can actually buy it
 * at a known price: in stock, eligible (membership) and not link-only.
 */
export const rankable = (o: Offer): boolean => o.inStock && o.eligible && hasPrice(o);

export interface OfferView {
  offers: Offer[];
  cheapestId: string | null;
  recommendedId: string | null;
  /** The server's reason for its pick, verbatim, only when that pick is not the cheapest. */
  reason: string | null;
  savings: number;
  /** Lowest landed price (item + shipping + estimated tax) among rankable offers. */
  bestPrice: number | null;
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

  let cheapestId = product.cheapestOfferId;
  let savings = product.maxSavings;
  const serverPick = offers.find((o) => o.id === cheapestId);
  // Trust the server's answer unless a filter hid it or it is not something this user can buy at a known price.
  if (filtered || cheapestId == null || !serverPick || !rankable(serverPick)) {
    const prices = offers.filter(rankable).map((o) => o.landedPrice);
    const min = prices.length ? Math.min(...prices) : null;
    cheapestId = min == null ? null : (offers.find((o) => rankable(o) && o.landedPrice === min)?.id ?? null);
    savings = prices.length > 1 ? Math.max(...prices) - (min ?? 0) : 0;
  }
  const cheapest = offers.find((o) => o.id === cheapestId) ?? null;

  const recommended = offers.find((o) => o.id === product.recommendedOfferId) ?? null;
  const differs = recommended != null && rankable(recommended) && recommended.id !== cheapestId;
  return {
    offers,
    cheapestId,
    recommendedId: differs ? recommended.id : null,
    reason: differs ? product.recommendationReason : null,
    savings: Math.max(0, savings),
    bestPrice: cheapest ? cheapest.landedPrice : null,
  };
}

/** Lowest landed price the user can actually get, or null. */
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
  const keyed = list.map((p, index) => ({ p, index, best: viewOffers(p, filters).bestPrice }));
  keyed.sort((a, b) => {
    if (sort === 'price') {
      const d = (a.best ?? Number.POSITIVE_INFINITY) - (b.best ?? Number.POSITIVE_INFINITY);
      return d !== 0 ? d : a.index - b.index;
    }
    const d = (b.p.rating ?? -1) - (a.p.rating ?? -1);
    return d !== 0 ? d : b.p.reviewCount - a.p.reviewCount || a.index - b.index;
  });
  return keyed.map((k) => k.p);
}
