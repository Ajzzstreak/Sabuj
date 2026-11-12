/**
 * Shopper context: the per-request facts (ZIP, stated memberships) that turn a
 * provider offer into the API `Offer`. Applied AFTER the shared catalog cache,
 * so cached provider results stay identical for every user.
 */
import type { Offer, RetailerId } from './contract.js';
import type { ProviderOffer, StoreSelection } from './providers/types.js';
import { unitPriceOf } from './size.js';
import { estimatedTaxRateForZip } from './tax.js';

export interface ShopperContext {
  /** Estimated sales-tax rate as a fraction; null = no ZIP given (or unmapped). */
  taxRate: number | null;
  /** Memberships the shopper STATED they hold; null = not answered. */
  memberships: readonly RetailerId[] | null;
  /** Store the shopper buys from at each retailer; absent retailers get the national price. */
  stores?: StoreSelection;
  /**
   * Re-prices an offer for a store (Catalog.localizeOffer). Applied here, after
   * the shared cache, so one cache entry serves every store selection.
   */
  localize?: (offer: ProviderOffer, storeId: string) => ProviderOffer;
}

export const NO_CONTEXT: ShopperContext = { taxRate: null, memberships: null };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function shopperContext(
  zip: string | null | undefined,
  memberships: readonly RetailerId[] | null | undefined,
  stores?: StoreSelection,
  localize?: ShopperContext['localize'],
): ShopperContext {
  return { taxRate: zip ? estimatedTaxRateForZip(zip) : null, memberships: memberships ?? null, stores, localize };
}

export function isLinkOnly(o: { priceSource: Offer['priceSource'] }): boolean {
  return o.priceSource === 'link_only';
}

/** An offer that may be called cheapest / recommended / used for savings. */
export function isRankable(o: Offer): boolean {
  return o.inStock && o.eligible && !isLinkOnly(o);
}

/**
 * Turn provider offers into API offers for one shopper:
 *   1. price each offer at the shopper's store for that retailer (when selected),
 *   2. fill estimatedTax, landedPrice and eligible,
 *   3. derive unitPrice / unitLabel from the item price and size.
 * Tax is estimated on the item price only (shipping taxability varies by state).
 */
export function applyContext(offers: readonly ProviderOffer[], ctx: ShopperContext = NO_CONTEXT): Offer[] {
  return offers.map((raw) => {
    const storeId = raw.storeId === null ? ctx.stores?.[raw.retailerId] : undefined;
    const o = storeId && ctx.localize ? ctx.localize(raw, storeId) : raw;
    if (isLinkOnly(o)) {
      // No price is known: nothing to tax, nothing to compare.
      return {
        ...o, price: 0, listPrice: null, shipping: null, totalPrice: 0, estimatedTax: null, landedPrice: 0,
        eligible: eligibleFor(o, ctx), unitPrice: null, unitLabel: null,
      };
    }
    const estimatedTax = ctx.taxRate === null ? null : round2(o.price * ctx.taxRate);
    const unit = unitPriceOf(o.price, o.size);
    return {
      ...o,
      estimatedTax,
      landedPrice: round2(o.totalPrice + (estimatedTax ?? 0)),
      eligible: eligibleFor(o, ctx),
      unitPrice: unit?.unitPrice ?? null,
      unitLabel: unit?.unitLabel ?? null,
    };
  });
}

function eligibleFor(o: ProviderOffer, ctx: ShopperContext): boolean {
  if (!o.membershipRequired || ctx.memberships === null) return true;
  return ctx.memberships.includes(o.retailerId);
}

/** Cheapest rankable offer by landedPrice (ties: retailer id), or null. */
export function cheapestRankable(offers: readonly Offer[]): Offer | null {
  let best: Offer | null = null;
  for (const o of offers) {
    if (!isRankable(o)) continue;
    if (!best || o.landedPrice < best.landedPrice || (o.landedPrice === best.landedPrice && o.retailerId < best.retailerId)) best = o;
  }
  return best;
}
