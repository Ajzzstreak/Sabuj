import { describe, expect, it } from 'vitest';
import { NEUTRAL_RANKING_PROFILE, orderHits, personalizeProduct, preferenceBudget, rankOffers } from '../src/ranking.js';
import type { ProviderProduct } from '../src/providers/types.js';
import { offer, profile } from './helpers.js';

const base = (offers: ReturnType<typeof offer>[]): ProviderProduct => ({
  id: 'p1', title: 'Thing', brand: 'Acme', category: 'Rice Cookers', imageUrl: null, gtin: null, size: null, isStoreBrand: false, highlights: [], offers,
});

describe('rankOffers', () => {
  const offers = [offer('target', 103), offer('amazon', 100), offer('walmart', 100), offer('bestbuy', 99, { inStock: false }), offer('costco', 96)];

  it('is strictly cheapest-total-first with an empty profile, out-of-stock last', () => {
    const ranked = rankOffers(offers);
    expect(ranked.map((o) => o.retailerId)).toEqual(['costco', 'amazon', 'walmart', 'target', 'bestbuy']);
    expect(rankOffers(offers, NEUTRAL_RANKING_PROFILE).map((o) => o.id)).toEqual(ranked.map((o) => o.id));
  });

  it('ignores affinities entirely when priceSensitivity is 1', () => {
    const p = profile({ priceSensitivity: 1, retailerAffinity: { target: 1 }, speedPreference: 1, qualityPreference: 1 });
    expect(rankOffers(offers, p).map((o) => o.retailerId)).toEqual(['costco', 'amazon', 'walmart', 'target', 'bestbuy']);
  });

  it('does not mutate its input', () => {
    const copy = offers.map((o) => o.id);
    rankOffers(offers, profile({ retailerAffinity: { target: 1 } }));
    expect(offers.map((o) => o.id)).toEqual(copy);
  });

  it('promotes a preferred retailer that is within the preference budget', () => {
    const p = profile({ priceSensitivity: 0.3, retailerAffinity: { target: 0.9 } });
    const ranked = rankOffers(offers, p);
    expect(ranked[0]!.retailerId).toBe('target');
    expect(ranked.at(-1)!.retailerId).toBe('bestbuy'); // still out of stock, still last
  });

  it('does not promote a preferred retailer that is far more expensive', () => {
    const p = profile({ priceSensitivity: 0.3, retailerAffinity: { target: 0.9 }, memberships: ['costco'] });
    const ranked = rankOffers([offer('target', 140), offer('amazon', 100)], p);
    expect(ranked[0]!.retailerId).toBe('amazon');
  });

  it('never ranks an out-of-stock offer above an in-stock one', () => {
    const p = profile({ priceSensitivity: 0, retailerAffinity: { bestbuy: 1 } });
    const ranked = rankOffers(offers, p);
    expect(ranked.findIndex((o) => !o.inStock)).toBe(ranked.length - 1);
  });

  it('demotes a membership-only offer for a non-member and not for a member', () => {
    const two = [offer('costco', 98), offer('amazon', 100)];
    expect(rankOffers(two, profile({ priceSensitivity: 0.3 }))[0]!.retailerId).toBe('amazon');
    expect(rankOffers(two, profile({ priceSensitivity: 0.3, memberships: ['costco'] }))[0]!.retailerId).toBe('costco');
  });

  it('uses speed and quality preferences', () => {
    const two = [offer('amazon', 100, { delivery: '5-7 days' }), offer('walmart', 101, { delivery: 'Pickup today' })];
    expect(rankOffers(two, profile({ priceSensitivity: 0.2, speedPreference: 1 }))[0]!.retailerId).toBe('walmart');
    const q = [offer('amazon', 100, { rating: 3.6, reviewCount: 20 }), offer('walmart', 101, { rating: 4.9, reviewCount: 9000 })];
    expect(rankOffers(q, profile({ priceSensitivity: 0.2, qualityPreference: 1 }))[0]!.retailerId).toBe('walmart');
  });

  it('budget is zero for a fully price-sensitive shopper and bounded otherwise', () => {
    expect(preferenceBudget(100, NEUTRAL_RANKING_PROFILE)).toBe(0);
    expect(preferenceBudget(100000, profile({ priceSensitivity: 0 }))).toBe(40);
  });
});

describe('personalizeProduct', () => {
  const offers = [offer('target', 103), offer('amazon', 100), offer('walmart', 110), offer('bestbuy', 90, { inStock: false })];

  it('sets cheapest/recommended/maxSavings without a profile', () => {
    const p = personalizeProduct(base(offers));
    expect(p.cheapestOfferId).toBe('p1:amazon');
    expect(p.recommendedOfferId).toBe('p1:amazon');
    expect(p.recommendationReason).toBeNull();
    expect(p.maxSavings).toBe(10); // in-stock only: 110 - 100
    expect(p.reviewCount).toBe(4000);
    expect(p.rating).toBe(4.5);
  });

  it('explains a recommendation that is not the cheapest', () => {
    const p = personalizeProduct(base(offers), profile({ priceSensitivity: 0.3, retailerAffinity: { target: 0.9 } }));
    expect(p.cheapestOfferId).toBe('p1:amazon');
    expect(p.recommendedOfferId).toBe('p1:target');
    expect(p.offers[0]!.id).toBe('p1:target');
    expect(p.recommendationReason).toBe('Target is $3 more — a store you often choose over the lowest price');
  });

  it('states the real price gap, never a figure derived from profile weights', () => {
    const cents = [offer('target', 100.5), offer('amazon', 99.99)];
    const p = profile({ priceSensitivity: 0, retailerAffinity: { target: 1 } });
    expect(personalizeProduct(base(cents), p).recommendationReason).toMatch(/^Target is \$0\.51 more /);
    const tie = [offer('target', 100), offer('amazon', 100)];
    expect(personalizeProduct(base(tie), p).recommendationReason).toMatch(/^Target is the same price /);
    // Recommended only because the cheapest store is disliked: do not claim a liking for it.
    const avoid = profile({ priceSensitivity: 0, retailerAffinity: { amazon: -1 } });
    expect(personalizeProduct(base(cents), avoid).recommendationReason).toBe('Target is $0.51 more — you tend to skip Amazon');
  });

  it('says so when the recommended offer needs a membership the shopper has not shown', () => {
    const two = [offer('costco', 101), offer('amazon', 100)];
    const loves = { priceSensitivity: 0, retailerAffinity: { costco: 1 } };
    expect(personalizeProduct(base(two), profile(loves)).recommendationReason).toMatch(/\(Costco membership required\)$/);
    expect(personalizeProduct(base(two), profile({ ...loves, memberships: ['costco'] })).recommendationReason).not.toMatch(/required/);
  });

  it('cheapestOfferId is the lowest in-stock total for every mock product under any profile', async () => {
    const { MockProvider } = await import('../src/providers/mock/index.js');
    const p = profile({ priceSensitivity: 0, retailerAffinity: { bestbuy: 1, costco: 1 }, speedPreference: 1, qualityPreference: 1 });
    for (const product of await new MockProvider({ catalog: 'general' }).browse()) {
      const r = personalizeProduct(product, p);
      const inStock = r.offers.filter((o) => o.inStock);
      const min = Math.min(...inStock.map((o) => o.totalPrice));
      if (inStock.length === 0) expect(r.cheapestOfferId).toBeNull();
      else expect(r.offers.find((o) => o.id === r.cheapestOfferId)!.totalPrice).toBe(min);
      if (inStock.length > 0) expect(r.offers[0]!.inStock).toBe(true);
      const top = r.offers[0]!;
      const gap = /\$([\d.]+) more/.exec(r.recommendationReason ?? '');
      if (gap) expect(Number(gap[1])).toBeCloseTo(top.totalPrice - min, 2);
      if (r.recommendationReason && top.membershipRequired) expect(r.recommendationReason).toMatch(/membership/);
    }
  });

  it('handles a product with nothing in stock', () => {
    const p = personalizeProduct(base([offer('amazon', 100, { inStock: false })]));
    expect(p.cheapestOfferId).toBeNull();
    expect(p.maxSavings).toBe(0);
    expect(p.recommendationReason).toBeNull();
  });
});

describe('orderHits', () => {
  const hit = (id: string, category: string, relevance: number) => ({ product: { ...base([]), id, category }, relevance });

  it('lets affinity break near-ties but keeps relevance dominant', () => {
    const hits = [hit('a', 'TVs', 0.9), hit('b', 'Toys', 0.85), hit('c', 'Toys', 0.4)];
    const p = profile({ categoryAffinity: { Toys: 1 } });
    expect(orderHits(hits, p).map((h) => h.product.id)).toEqual(['b', 'a', 'c']);
    expect(orderHits(hits, null).map((h) => h.product.id)).toEqual(['a', 'b', 'c']);
  });
});
