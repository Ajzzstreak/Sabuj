import type { Offer, Product, RetailerId } from '@/api/contract';

export type SortKey = 'best' | 'price' | 'rating';

export interface OfferFilters {
  /** Empty means every retailer. */
  retailers: RetailerId[];
  inStockOnly: boolean;
}

export const NO_FILTERS: OfferFilters = { retailers: [], inStockOnly: false };

export interface OfferView {
  offers: Offer[];
  cheapestId: string | null;
  recommendedId: string | null;
  /** Why the recommended offer was picked, only when it is not the cheapest. */
  reason: string | null;
  savings: number;
  bestTotal: number | null;
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
  const inStock = offers.filter((o) => o.inStock);
  if (filtered || (cheapestId != null && !offers.some((o) => o.id === cheapestId))) {
    const totals = inStock.map((o) => o.totalPrice);
    const min = totals.length ? Math.min(...totals) : null;
    cheapestId = min == null ? null : (inStock.find((o) => o.totalPrice === min)?.id ?? null);
    savings = totals.length > 1 ? Math.max(...totals) - (min ?? 0) : 0;
  }
  const cheapest = offers.find((o) => o.id === cheapestId) ?? null;

  const recommended = offers.find((o) => o.id === product.recommendedOfferId) ?? null;
  const differs = recommended != null && recommended.inStock && recommended.id !== cheapestId;
  return {
    offers,
    cheapestId,
    recommendedId: differs ? recommended.id : null,
    reason: differs ? product.recommendationReason : null,
    savings: Math.max(0, savings),
    bestTotal: cheapest ? cheapest.totalPrice : null,
  };
}

export function applyResultsView(products: Product[], sort: SortKey, filters: OfferFilters): Product[] {
  const filtered = filters.retailers.length > 0 || filters.inStockOnly;
  let list = products;
  if (filtered) list = list.filter((p) => viewOffers(p, filters).offers.length > 0);
  if (sort === 'best') return list;
  const keyed = list.map((p, index) => ({ p, index, best: viewOffers(p, filters).bestTotal }));
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
