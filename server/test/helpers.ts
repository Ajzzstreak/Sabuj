import { loadConfig, type Config } from '../src/config.js';
import type { ActivityEvent, Offer, RetailerId, UserProfile } from '../src/contract.js';
import { emptyProfile } from '../src/db.js';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({}), dbPath: ':memory:', profileDebounceMs: 5, ...overrides };
}

export function offer(retailerId: RetailerId, totalPrice: number, extra: Partial<Offer> = {}): Offer {
  return {
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
    ...extra,
  };
}

export function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...emptyProfile('device-test-0001', 40), source: 'heuristic', priceSensitivity: 0.3, ...overrides };
}

export const NOW = Date.UTC(2026, 10, 10, 12);

export function click(retailerId: RetailerId, extra: Partial<ActivityEvent> = {}): ActivityEvent {
  return { type: 'offer_click', ts: NOW - 60_000, retailerId, price: 100, ...extra };
}
