import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../src/contract.js';
import { buildHeuristicProfile } from '../src/profile/heuristic.js';
import { rankOffers } from '../src/ranking.js';
import { click, NOW, offer } from './helpers.js';

const build = (events: ActivityEvent[], extra = {}) => buildHeuristicProfile(events, { now: NOW, ...extra });

describe('buildHeuristicProfile', () => {
  it('returns a ranking-neutral profile for no events', () => {
    const p = build([]);
    expect(p.source).toBe('heuristic');
    expect(p.eventCount).toBe(0);
    expect(p.priceSensitivity).toBe(1);
    expect(p.speedPreference).toBe(0);
    expect(p.retailerAffinity).toEqual({});
    expect(p.memberships).toEqual([]);
  });

  it('does not reorder offers on browsing alone', () => {
    const p = build([
      { type: 'search', ts: NOW, query: 'rice cooker' },
      { type: 'product_view', ts: NOW, productId: 'x', category: 'Rice Cookers', brand: 'Tiger' },
    ]);
    const offers = [offer('target', 101, { delivery: 'Pickup today' }), offer('amazon', 100, { delivery: '5-7 days' })];
    expect(rankOffers(offers, p)[0]!.retailerId).toBe('amazon');
  });

  it('learns a strong non-cheapest retailer preference', () => {
    const events = Array.from({ length: 20 }, () => click('target', { wasCheapest: false, premiumPaid: 3, price: 100 }));
    const p = build(events);
    expect(p.retailerAffinity.target).toBeGreaterThan(0.7);
    expect(p.priceSensitivity).toBeLessThan(0.5);
    expect(p.insights[0]).toBe("You usually pick Target when it's within $3 of the lowest price");
    expect(p.summary).toContain('Target');
    // ...and that profile flips the ranking for a small premium.
    expect(rankOffers([offer('amazon', 100), offer('target', 103)], p)[0]!.retailerId).toBe('target');
  });

  it('states a premium bound that covers every observed pick, not the average', () => {
    const p = build([
      ...Array.from({ length: 10 }, () => click('target', { wasCheapest: false, premiumPaid: 1, price: 100 })),
      ...Array.from({ length: 10 }, () => click('target', { wasCheapest: false, premiumPaid: 14.5, price: 100 })),
    ]);
    expect(p.insights[0]).toBe("You usually pick Target when it's within $15 of the lowest price");
  });

  it('keeps a price-first shopper price-first', () => {
    const events = [
      ...Array.from({ length: 6 }, () => click('amazon', { wasCheapest: true })),
      ...Array.from({ length: 6 }, () => click('walmart', { wasCheapest: true })),
    ];
    const p = build(events);
    expect(p.priceSensitivity).toBe(1);
    expect(p.retailerAffinity.amazon ?? 0).toBeLessThan(0.3);
    expect(p.insights).toContain('You chose the lowest price 100% of the time');
  });

  it('lowers priceSensitivity more for larger premiums', () => {
    const small = build(Array.from({ length: 10 }, () => click('target', { wasCheapest: false, premiumPaid: 1, price: 100 })));
    const large = build(Array.from({ length: 10 }, () => click('target', { wasCheapest: false, premiumPaid: 15, price: 100 })));
    expect(large.priceSensitivity).toBeLessThan(small.priceSensitivity);
  });

  it('infers memberships from clicks on membership retailers', () => {
    expect(build([click('costco'), click('costco'), click('costco')]).memberships).toEqual(['costco']);
    // One click — even a non-cheapest one — or two is curiosity, not a membership.
    expect(build([click('samsclub', { wasCheapest: false })]).memberships).toEqual([]);
    expect(build([click('costco')]).memberships).toEqual([]);
    expect(build([click('costco'), click('costco')]).memberships).toEqual([]);
    expect(build([click('amazon'), click('amazon'), click('amazon')]).memberships).toEqual([]);
  });

  it('records the largest premium actually paid, relative to the cheapest price', () => {
    expect(build([]).maxObservedPremiumPct).toBe(0);
    expect(build([click('target', { wasCheapest: true, price: 100 })]).maxObservedPremiumPct).toBe(0);
    // Paid $101 when the cheapest was $100 -> 1%.
    const one = build(Array.from({ length: 30 }, () => click('target', { wasCheapest: false, premiumPaid: 1, price: 101 })));
    expect(one.maxObservedPremiumPct).toBeCloseTo(0.01, 4);
    // The maximum wins, not the average or the count.
    const mixed = build([
      click('target', { wasCheapest: false, premiumPaid: 1, price: 101 }),
      click('target', { wasCheapest: false, premiumPaid: 10, price: 110 }),
    ]);
    expect(mixed.maxObservedPremiumPct).toBeCloseTo(0.1, 4);
    // Missing or nonsensical figures never raise the bound; absurd ones are capped.
    expect(build([click('target', { wasCheapest: false })]).maxObservedPremiumPct).toBe(0);
    expect(build([click('target', { wasCheapest: false, premiumPaid: 500, price: 100 })]).maxObservedPremiumPct).toBe(0);
    expect(build([click('target', { wasCheapest: false, premiumPaid: 99, price: 100 })]).maxObservedPremiumPct).toBe(1);
  });

  it('30 clicks paying $1 extra never lead to recommending $30 extra (reviewer finding)', () => {
    const p = build(Array.from({ length: 30 }, () => click('target', { wasCheapest: false, premiumPaid: 1, price: 101 })));
    expect(p.retailerAffinity.target).toBeGreaterThan(0.7);
    // $2 more on $300 is under 1%: allowed. $30 more is 10%: never.
    expect(rankOffers([offer('target', 302), offer('amazon', 300)], p)[0]!.retailerId).toBe('target');
    expect(rankOffers([offer('target', 330), offer('amazon', 300)], p)[0]!.retailerId).toBe('amazon');
    expect(rankOffers([offer('target', 304), offer('amazon', 300)], p)[0]!.retailerId).toBe('amazon');
  });

  it('gives negative affinity to a retailer that is seen but never chosen', () => {
    const events: ActivityEvent[] = [
      ...Array.from({ length: 20 }, () => ({ type: 'offer_impression' as const, ts: NOW, retailerId: 'walmart' as const })),
      ...Array.from({ length: 8 }, () => click('amazon', { wasCheapest: false, premiumPaid: 2 })),
    ];
    expect(build(events).retailerAffinity.walmart).toBeLessThan(0);
  });

  it('weights offer_click above views and searches, and decays old activity', () => {
    const events: ActivityEvent[] = [
      { type: 'offer_click', ts: NOW, category: 'TVs', brand: 'LG', retailerId: 'bestbuy' },
      { type: 'product_view', ts: NOW, category: 'Toys', brand: 'LEGO' },
      { type: 'product_view', ts: NOW, category: 'Toys', brand: 'LEGO' },
      { type: 'offer_click', ts: NOW - 120 * 86_400_000, category: 'Laptops', brand: 'Dell', retailerId: 'bestbuy' },
    ];
    const p = build(events);
    expect(Object.keys(p.categoryAffinity)[0]).toBe('TVs');
    expect(p.categoryAffinity.TVs).toBe(1);
    expect(p.categoryAffinity.Toys).toBeCloseTo(0.6, 5);
    expect(p.categoryAffinity.Laptops ?? 0).toBeLessThan(0.05);
  });

  it('derives speed and quality preference from offer facts', () => {
    const facts = new Map([['o1', { speed: 1, cheapestSpeed: 0.3, quality: 0.9, cheapestQuality: 0.4 }]]);
    const events = Array.from({ length: 10 }, () => click('target', { offerId: 'o1', wasCheapest: false, premiumPaid: 2 }));
    const withFacts = build(events, { offerFacts: facts });
    expect(withFacts.speedPreference).toBeGreaterThan(0.6);
    expect(withFacts.qualityPreference).toBeGreaterThan(0.6);
    expect(build(events).speedPreference).toBe(0);
  });

  it('suggests queries from searches and affinities, bounded and lowercase', () => {
    const events: ActivityEvent[] = [
      { type: 'search', ts: NOW, query: 'Rice  Cooker' },
      { type: 'search', ts: NOW, query: 'rice cooker' },
      { type: 'search', ts: NOW - 1000, query: 'air fryer' },
      { type: 'offer_click', ts: NOW, category: 'Rice Cookers', brand: 'Zojirushi', retailerId: 'amazon' },
    ];
    const p = build(events);
    expect(p.suggestedQueries[0]).toBe('rice cooker');
    expect(p.suggestedQueries).toContain('air fryer');
    expect(p.suggestedQueries.length).toBeLessThanOrEqual(8);
  });

  it('keeps every numeric field in range and reports lifetime event count', () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      click(i % 2 ? 'target' : 'costco', { wasCheapest: i % 3 === 0, premiumPaid: i, price: 10 }),
    );
    const p = build(events, { totalEvents: 900 });
    expect(p.eventCount).toBe(900);
    for (const v of [p.priceSensitivity, p.speedPreference, p.qualityPreference]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const v of Object.values(p.retailerAffinity)) expect(Math.abs(v!)).toBeLessThanOrEqual(1);
  });

  it('is deterministic', () => {
    const events = [click('target', { wasCheapest: false }), click('amazon', { wasCheapest: true })];
    expect(build(events)).toEqual(build(events));
  });
});
