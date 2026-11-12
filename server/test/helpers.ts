import { loadConfig, type Config } from '../src/config.js';
import type { ActivityEvent, Offer, RetailerId, UserProfile } from '../src/contract.js';
import { emptyProfile } from '../src/db.js';
import type { ProviderOffer } from '../src/providers/types.js';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({}), dbPath: ':memory:', profileDebounceMs: 5, alertCheckIntervalMs: 0, pushProvider: 'none', ...overrides };
}

/** A contextualized offer with no tax: landedPrice follows totalPrice unless overridden. */
export function offer(retailerId: RetailerId, totalPrice: number, extra: Partial<Offer> = {}): Offer {
  const o: Offer = {
    id: `p1:${retailerId}`,
    productId: 'p1',
    retailerId,
    price: totalPrice,
    listPrice: null,
    shipping: 0,
    totalPrice,
    inStock: true,
    membershipRequired: retailerId === 'costco' || retailerId === 'samsclub',
    rating: 4.5,
    reviewCount: 1000,
    delivery: '2-day',
    url: 'https://example.com',
    observedAt: '2026-01-01T00:00:00.000Z',
    priceSource: 'demo',
    matchType: 'exact',
    offerTitle: null,
    size: null,
    unitPrice: null,
    unitLabel: null,
    storeId: null,
    estimatedTax: null,
    landedPrice: totalPrice,
    eligible: true,
    ...extra,
  };
  if (extra.landedPrice === undefined) o.landedPrice = o.totalPrice + (o.estimatedTax ?? 0);
  return o;
}

/** The same offer as a provider reports it (no per-shopper fields). */
export function providerOffer(retailerId: RetailerId, totalPrice: number, extra: Partial<ProviderOffer> = {}): ProviderOffer {
  const { estimatedTax: _t, landedPrice: _l, eligible: _e, unitPrice: _u, unitLabel: _ul, ...rest } = offer(retailerId, totalPrice);
  return { ...rest, ...extra };
}

export function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  // A shopper who has paid up to 25% over the cheapest price before, unless a test says otherwise.
  return { ...emptyProfile(40), source: 'heuristic', priceSensitivity: 0.3, maxObservedPremiumPct: 0.25, ...overrides };
}

export const NOW = Date.UTC(2026, 10, 10, 12);

export function click(retailerId: RetailerId, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  return { type: 'offer_click', ts: NOW - 60_000, retailerId, price: 100, ...extra };
}
