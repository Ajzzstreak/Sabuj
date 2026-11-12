import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { type BasketEntry, computeBasket, lineFor } from '../src/basket.js';
import type { Config } from '../src/config.js';
import type { BasketResponse, Offer, Product, RegisterDeviceResponse, RetailerId, SearchResponse } from '../src/contract.js';
import { Store } from '../src/db.js';
import { MockProvider } from '../src/providers/mock/index.js';
import { offer, testConfig } from './helpers.js';

/** A product with one offer per [retailer, price] pair. */
function product(id: string, prices: Partial<Record<RetailerId, number>>, extra: Partial<Record<RetailerId, Partial<Offer>>> = {}): Product {
  const offers = (Object.entries(prices) as Array<[RetailerId, number]>).map(([r, price]) => offer(r, price, { id: `${id}:${r}`, productId: id, ...extra[r] }));
  return {
    id, title: id, brand: 'B', category: 'Pantry', size: null, isStoreBrand: false, imageUrl: null, gtin: null, highlights: [], rating: null, reviewCount: 0,
    offers, cheapestOfferId: null, recommendedOfferId: null, recommendationReason: null, maxSavings: 0,
  };
}
const entry = (id: string, prices: Partial<Record<RetailerId, number>> | null, quantity = 1, extra = {}): BasketEntry => ({
  id, quantity, product: prices ? product(id, prices, extra) : null,
});
const opts = { minSplitSavings: 1 };
const totals = (r: ReturnType<typeof computeBasket>) => Object.fromEntries(r.perStore.map((s) => [s.retailerId, s.total]));

describe('computeBasket (pure)', () => {
  it('totals per store, cheapest complete store first', () => {
    const r = computeBasket([entry('milk', { walmart: 3, kroger: 3.5 }), entry('eggs', { walmart: 2.5, kroger: 2 }), entry('rice', { walmart: 4, kroger: 4.4 })], opts);
    expect(totals(r)).toEqual({ walmart: 9.5, kroger: 9.9 });
    expect(r.perStore.map((s) => s.retailerId)).toEqual(['walmart', 'kroger']);
    expect(r.perStore.every((s) => s.complete && s.missingItemIds.length === 0 && s.lines.length === 3)).toBe(true);
    expect(r.bestSingleStore).toBe('walmart');
    expect(r.perStore[0]!.lines[0]).toEqual({ itemId: 'milk', offerId: 'milk:walmart', matchType: 'exact', offerTitle: null, unitCost: 3, quantity: 1, lineTotal: 3 });
  });

  it('multiplies by quantity and sums in cents', () => {
    const r = computeBasket([entry('a', { walmart: 0.1, kroger: 0.2 }, 3), entry('b', { walmart: 1.15, kroger: 1.05 }, 99)], opts);
    expect(r.perStore.find((s) => s.retailerId === 'walmart')!.lines.map((l) => l.lineTotal)).toEqual([0.3, 113.85]);
    expect(totals(r)).toEqual({ walmart: 114.15, kroger: 104.55 });
    expect(r.bestSingleStore).toBe('kroger');
  });

  it('uses landedPrice (tax included) and the equivalent offer of a store', () => {
    const e = entry('milk', { walmart: 3, kroger: 3.2 }, 2, {
      walmart: { estimatedTax: 0.25, landedPrice: 3.25 },
      kroger: { matchType: 'equivalent', offerTitle: 'Kroger Whole Milk, 1 gal', storeId: 'kr-1' },
    });
    const r = computeBasket([e], opts);
    expect(r.perStore.find((s) => s.retailerId === 'walmart')!.lines[0]).toMatchObject({ unitCost: 3.25, lineTotal: 6.5 });
    const kroger = r.perStore.find((s) => s.retailerId === 'kroger')!;
    expect(kroger.lines[0]).toMatchObject({ matchType: 'equivalent', offerTitle: 'Kroger Whole Milk, 1 gal', unitCost: 3.2, lineTotal: 6.4 });
    expect(kroger.storeId).toBe('kr-1');
    expect(r.bestSingleStore).toBe('kroger');
  });

  it('ignores offers that are out of stock, ineligible or link-only', () => {
    const e = entry('x', { walmart: 5, kroger: 1, costco: 1, target: 0 }, 1, {
      kroger: { inStock: false },
      costco: { eligible: false },
      target: { priceSource: 'link_only', landedPrice: 0 },
    });
    expect(lineFor(e, 'kroger')).toBeNull();
    expect(lineFor(e, 'costco')).toBeNull();
    expect(lineFor(e, 'target')).toBeNull();
    const r = computeBasket([e], opts);
    expect(r.perStore.map((s) => s.retailerId)).toEqual(['walmart']);
    expect(r.bestSplit).toBeNull();
  });

  it('missing items: a store is incomplete, and coverage beats price for the best single store', () => {
    const r = computeBasket(
      [entry('a', { walmart: 10, kroger: 12 }), entry('b', { walmart: 10, kroger: 12 }), entry('c', { kroger: 1 }), entry('d', { target: 1 })],
      opts,
    );
    const by = Object.fromEntries(r.perStore.map((s) => [s.retailerId, s]));
    expect(by.kroger).toMatchObject({ total: 25, complete: false, missingItemIds: ['d'] });
    expect(by.walmart).toMatchObject({ total: 20, complete: false, missingItemIds: ['c', 'd'] });
    expect(by.target).toMatchObject({ total: 1, complete: false, missingItemIds: ['a', 'b', 'c'] });
    // Nobody is complete: the store covering the most items wins, not the lowest total.
    expect(r.bestSingleStore).toBe('kroger');
    expect(r.perStore.map((s) => s.retailerId)).toEqual(['kroger', 'walmart', 'target']);
  });

  it('a complete store beats a cheaper incomplete one; coverage ties break on total', () => {
    const r = computeBasket([entry('a', { walmart: 5, kroger: 9 }), entry('b', { kroger: 9 })], opts);
    expect(r.bestSingleStore).toBe('kroger');
    const tie = computeBasket([entry('a', { walmart: 5, kroger: 5 }), entry('b', { walmart: 2, target: 1 }), entry('c', { kroger: 1.5, target: 9 })], opts);
    // walmart {a,b}=7, kroger {a,c}=6.5, target {b,c}=10: all cover two items -> lowest total.
    expect(tie.bestSingleStore).toBe('kroger');
    // Exact tie on everything: deterministic by retailer id.
    expect(computeBasket([entry('a', { walmart: 5, kroger: 5 })], opts).bestSingleStore).toBe('kroger');
  });

  it('all items missing, an unresolved item, and an empty list', () => {
    const none = computeBasket([entry('a', null), entry('b', {})], opts);
    expect(none).toEqual({ perStore: [], bestSingleStore: null, bestSplit: null });
    expect(computeBasket([], opts)).toEqual({ perStore: [], bestSingleStore: null, bestSplit: null });
    const partial = computeBasket([entry('a', { walmart: 2 }), entry('ghost', null)], opts);
    expect(partial.perStore[0]).toMatchObject({ retailerId: 'walmart', complete: false, missingItemIds: ['ghost'], total: 2 });
    expect(partial.bestSingleStore).toBe('walmart');
  });

  describe('bestSplit', () => {
    const basket = [entry('a', { walmart: 10, kroger: 6 }), entry('b', { walmart: 4, kroger: 9 }), entry('c', { walmart: 5, kroger: 5 })];

    it('assigns each item to the cheaper of the two stores and reports the saving', () => {
      const r = computeBasket(basket, opts);
      expect(totals(r)).toEqual({ walmart: 19, kroger: 20 });
      expect(r.bestSingleStore).toBe('walmart');
      expect(r.bestSplit).toEqual({
        stores: [{ retailerId: 'walmart', storeId: null }, { retailerId: 'kroger', storeId: null }],
        assignments: [
          { itemId: 'a', retailerId: 'kroger', line: expect.objectContaining({ offerId: 'a:kroger', lineTotal: 6 }) },
          { itemId: 'b', retailerId: 'walmart', line: expect.objectContaining({ offerId: 'b:walmart', lineTotal: 4 }) },
          // A tie goes to the store that is better on its own (one fewer stop is implied nowhere else).
          { itemId: 'c', retailerId: 'walmart', line: expect.objectContaining({ offerId: 'c:walmart', lineTotal: 5 }) },
        ],
        missingItemIds: [],
        total: 15,
        savingsVsBestSingle: 4,
      });
    });

    it('is null when one store is cheapest for everything (a "split" with one store is not a split)', () => {
      const r = computeBasket([entry('a', { walmart: 1, kroger: 2 }), entry('b', { walmart: 1, kroger: 2 })], opts);
      expect(r.bestSplit).toBeNull();
      // ...including exact ties on every item.
      expect(computeBasket([entry('a', { walmart: 1, kroger: 1 }), entry('b', { walmart: 2, kroger: 2 })], opts).bestSplit).toBeNull();
    });

    it('is null below the minimum saving and returned at or above it', () => {
      const small = [entry('a', { walmart: 10, kroger: 9.5 }), entry('b', { walmart: 4, kroger: 9 })]; // split saves $0.50
      expect(computeBasket(small, { minSplitSavings: 1 }).bestSplit).toBeNull();
      expect(computeBasket(small, { minSplitSavings: 0.5 }).bestSplit).toMatchObject({ total: 13.5, savingsVsBestSingle: 0.5 });
      expect(computeBasket(small, { minSplitSavings: 0 }).bestSplit).toMatchObject({ savingsVsBestSingle: 0.5 });
      // A zero threshold still requires a strictly positive saving.
      const even = [entry('a', { walmart: 10, kroger: 10 }), entry('b', { walmart: 4, kroger: 4 })];
      expect(computeBasket(even, { minSplitSavings: 0 }).bestSplit).toBeNull();
    });

    it('needs two priced stores', () => {
      expect(computeBasket([entry('a', { walmart: 1 }), entry('b', { walmart: 1 })], opts).bestSplit).toBeNull();
    });

    it('evaluates every pair and keeps the one with the largest saving', () => {
      const r = computeBasket(
        [entry('a', { walmart: 10, kroger: 10, target: 2 }), entry('b', { walmart: 10, kroger: 3, target: 10 }), entry('c', { walmart: 1, kroger: 9, target: 9 })],
        opts,
      );
      // Singles: walmart 21, kroger 22, target 21. Pairs: W+K = 10+3+1 = 14, W+T = 2+10+1 = 13, K+T = 2+3+9 = 14.
      expect(r.bestSingleStore).toBe('target');
      expect(r.bestSplit!.stores.map((s) => s.retailerId).sort()).toEqual(['target', 'walmart']);
      expect(r.bestSplit).toMatchObject({ total: 13, savingsVsBestSingle: 8 });
    });

    it('is compared on equal coverage only: same missing items as the best single store', () => {
      // Walmart has a and b (complete). Kroger has only a, much cheaper.
      const r = computeBasket([entry('a', { walmart: 10, kroger: 2 }), entry('b', { walmart: 5 })], opts);
      expect(r.bestSingleStore).toBe('walmart');
      expect(r.bestSplit).toMatchObject({ total: 7, savingsVsBestSingle: 8, missingItemIds: [] });

      // Nobody has "ghost": the best single store misses it, and so does the split — still comparable.
      const withGhost = computeBasket([entry('a', { walmart: 10, kroger: 6 }), entry('b', { walmart: 4, kroger: 9 }), entry('ghost', null)], opts);
      expect(withGhost.bestSingleStore).toBe('walmart');
      expect(withGhost.bestSplit).toMatchObject({ total: 10, savingsVsBestSingle: 4, missingItemIds: ['ghost'] });

      // A pair that covers MORE than the best single store is not a like-for-like comparison: not returned.
      const more = computeBasket([entry('a', { walmart: 10, kroger: 6 }), entry('b', { walmart: 4 }), entry('c', { kroger: 1 }), entry('d', { walmart: 1 })], opts);
      expect(more.bestSingleStore).toBe('walmart'); // covers a, b, d
      expect(more.bestSplit).toBeNull(); // walmart+kroger covers a, b, c, d
      // A pair that covers LESS is never returned either.
      const less = computeBasket(
        [entry('a', { walmart: 9, kroger: 1, target: 1 }), entry('b', { walmart: 9 }), entry('c', { kroger: 5, target: 1 }), entry('d', { walmart: 1 })],
        opts,
      );
      expect(less.bestSingleStore).toBe('walmart'); // covers a, b, d for $19
      expect(less.bestSplit).toBeNull(); // kroger+target is far cheaper but only covers a and c
    });

    it('quantities weigh the assignment', () => {
      const r = computeBasket([entry('a', { walmart: 1, kroger: 1.5 }, 10), entry('b', { walmart: 9, kroger: 5 }, 1)], opts);
      // walmart 19, kroger 20; split = 10 at walmart + 5 at kroger = 15.
      expect(r.bestSplit).toMatchObject({ total: 15, savingsVsBestSingle: 4 });
      expect(r.bestSplit!.assignments.map((x) => [x.itemId, x.retailerId, x.line.quantity])).toEqual([['a', 'walmart', 10], ['b', 'kroger', 1]]);
    });
  });
});

describe('POST /v1/basket', () => {
  let app: App;
  let store: Store;
  const start = async (overrides: Partial<Config> = {}) => {
    store = new Store(':memory:');
    app = await buildApp({ config: testConfig(overrides), store, providers: [new MockProvider()] });
  };
  const basket = (payload: unknown, token?: string) =>
    app.fastify.inject({ method: 'POST', url: '/v1/basket', payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const firstId = async (q: string) =>
    ((await app.fastify.inject({ method: 'GET', url: `/v1/search?q=${encodeURIComponent(q)}` })).json() as SearchResponse).products[0]!.id;
  beforeEach(() => start());
  afterEach(async () => {
    await app.fastify.close();
    store.close();
  });

  it('prices a mixed list of productIds and free text, with quantities', async () => {
    const milk = await firstId('whole milk');
    const res = await basket({
      zip: '45202',
      items: [
        { id: 'i1', productId: milk, quantity: 2 },
        { id: 'i2', query: 'eggs', quantity: 1 },
        { id: 'i3', query: 'long grain white rice', quantity: 1 },
        { id: 'i4', query: 'zzzz no such thing', quantity: 1 },
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as BasketResponse;
    expect(body.items.map((i) => [i.id, i.quantity, i.resolvedFromQuery, i.product !== null])).toEqual([
      ['i1', 2, false, true], ['i2', 1, true, true], ['i3', 1, true, true], ['i4', 1, false, false],
    ]);
    expect(body.items[0]!.product!.id).toBe(milk);
    expect(body.items[1]!.product!.title).toMatch(/Eggs/);
    expect(body.retailers).toHaveLength(7);
    expect(typeof body.tookMs).toBe('number');

    const retailers = body.perStore.map((s) => s.retailerId);
    expect(retailers).toContain('walmart');
    expect(retailers).toContain('kroger');
    expect(retailers).not.toContain('bestbuy');
    for (const s of body.perStore) {
      // Nobody stocks i4; every total is the sum of its lines; lines are quantity x landed price.
      expect(s.missingItemIds).toContain('i4');
      expect(s.complete).toBe(false);
      expect(s.total).toBeCloseTo(s.lines.reduce((n, l) => n + l.lineTotal, 0), 2);
      // Store retailers are priced at their nearest location; Amazon is online only.
      if (s.retailerId === 'amazon') expect(s.storeId).toBeNull();
      else expect(s.storeId).toMatch(/^[a-z]{2}-45202-1$/);
      for (const l of s.lines) {
        const item = body.items.find((i) => i.id === l.itemId)!;
        const o = item.product!.offers.find((x) => x.id === l.offerId)!;
        expect(o.retailerId).toBe(s.retailerId);
        expect(o.storeId).toBe(s.storeId);
        expect(o.inStock && o.eligible && o.priceSource !== 'link_only').toBe(true);
        expect(l.unitCost).toBe(o.landedPrice);
        expect(l.quantity).toBe(item.quantity);
        expect(l.lineTotal).toBeCloseTo(o.landedPrice * item.quantity, 2);
        expect(l.matchType).toBe(o.matchType);
        expect(l.offerTitle).toBe(o.offerTitle);
      }
    }
    // Ordered best first: most items covered, then lowest total.
    for (let i = 1; i < body.perStore.length; i++) {
      const a = body.perStore[i - 1]!;
      const b = body.perStore[i]!;
      expect(a.lines.length > b.lines.length || (a.lines.length === b.lines.length && a.total <= b.total)).toBe(true);
    }
    expect(body.bestSingleStore).toBe(body.perStore[0]!.retailerId);
    // The milk is a store brand: at the other grocer the line is that store's own equivalent.
    const milkLines = body.perStore.flatMap((s) => s.lines.filter((l) => l.itemId === 'i1').map((l) => [s.retailerId, l.matchType] as const));
    expect(milkLines).toContainEqual(['walmart', 'exact']);
    expect(milkLines).toContainEqual(['kroger', 'equivalent']);
  });

  it('honours memberships (clubs excluded) and explicit storeIds', async () => {
    const items = [{ id: 'a', query: 'whole milk', quantity: 1 }, { id: 'b', query: 'long grain white rice', quantity: 1 }, { id: 'c', query: 'paper towels', quantity: 1 }];
    const open = (await basket({ items, zip: '45202' })).json() as BasketResponse;
    const clubs = open.perStore.filter((s) => s.retailerId === 'costco' || s.retailerId === 'samsclub');
    expect(clubs.length).toBeGreaterThan(0);
    const none = (await basket({ items, zip: '45202', memberships: [] })).json() as BasketResponse;
    expect(none.perStore.some((s) => s.retailerId === 'costco' || s.retailerId === 'samsclub')).toBe(false);
    expect(none.bestSplit?.stores.some((s) => s.retailerId === 'costco' || s.retailerId === 'samsclub') ?? false).toBe(false);
    const member = (await basket({ items, zip: '45202', memberships: ['costco'] })).json() as BasketResponse;
    expect(member.perStore.some((s) => s.retailerId === 'samsclub')).toBe(false);
    expect(member.perStore.some((s) => s.retailerId === 'costco')).toBe(clubs.some((s) => s.retailerId === 'costco'));

    // A different Walmart location: different storeId on the lines, different prices.
    const other = (await basket({ items, zip: '45202', storeIds: ['wm-45202-2'] })).json() as BasketResponse;
    const w1 = open.perStore.find((s) => s.retailerId === 'walmart')!;
    const w2 = other.perStore.find((s) => s.retailerId === 'walmart')!;
    expect(w1.storeId).toBe('wm-45202-1');
    expect(w2.storeId).toBe('wm-45202-2');
    expect(w2.total).not.toBe(w1.total);
    // Kroger was not overridden: still its nearest store, same total.
    expect(other.perStore.find((s) => s.retailerId === 'kroger')!.total).toBe(open.perStore.find((s) => s.retailerId === 'kroger')!.total);
    // Without zip or stores: national demo prices, no store ids.
    const national = (await basket({ items })).json() as BasketResponse;
    expect(national.perStore.every((s) => s.storeId === null)).toBe(true);
  });

  it('returns a split only when it really saves at least the threshold', async () => {
    const queries = ['whole milk', 'eggs', 'salted butter', 'white bread', 'spaghetti', 'rice', 'chicken breast', 'bacon', 'coffee', 'orange juice', 'cereal', 'paper towels'];
    const items = queries.map((query, i) => ({ id: `i${i}`, query, quantity: 1 }));
    const body = (await basket({ items, zip: '45202', memberships: [] })).json() as BasketResponse;
    const single = body.perStore[0]!;
    expect(body.bestSplit).not.toBeNull();
    const split = body.bestSplit!;
    expect(split.stores).toHaveLength(2);
    expect(split.savingsVsBestSingle).toBeGreaterThanOrEqual(1);
    expect(split.savingsVsBestSingle).toBeCloseTo(single.total - split.total, 2);
    expect(split.total).toBeCloseTo(split.assignments.reduce((n, a) => n + a.line.lineTotal, 0), 2);
    expect([...split.missingItemIds].sort()).toEqual([...single.missingItemIds].sort());
    const pair = split.stores.map((s) => s.retailerId);
    for (const a of split.assignments) {
      expect(pair).toContain(a.retailerId);
      // Each item is bought at the cheaper of the two stores.
      const lines = pair.map((r) => body.perStore.find((s) => s.retailerId === r)!.lines.find((l) => l.itemId === a.itemId)).filter((l) => l !== undefined);
      expect(a.line.lineTotal).toBe(Math.min(...lines.map((l) => l.lineTotal)));
    }
    expect(new Set(split.assignments.map((a) => a.retailerId)).size).toBe(2);

    // The same list with an absurd threshold: no split is suggested.
    await app.fastify.close();
    store.close();
    await start({ basketSplitMinSavings: 500 });
    expect(((await basket({ items, zip: '45202', memberships: [] })).json() as BasketResponse).bestSplit).toBeNull();
    // A one-item list can never be split.
    expect(((await basket({ items: [items[0]], zip: '45202' })).json() as BasketResponse).bestSplit).toBeNull();
  });

  it('validates the request', async () => {
    const ok = { id: 'a', query: 'milk', quantity: 1 };
    const bad: unknown[] = [
      {},
      { items: [] },
      { items: [{ id: 'a', quantity: 1 }] },
      { items: [{ ...ok, quantity: 0 }] },
      { items: [{ ...ok, quantity: 100 }] },
      { items: [{ ...ok, quantity: 1.5 }] },
      { items: [{ ...ok, query: 'x'.repeat(101) }] },
      { items: [{ ...ok, id: '' }] },
      { items: [{ ...ok, productId: 'bad id!' }] },
      { items: [ok, ok] },
      { items: Array.from({ length: 61 }, (_, i) => ({ ...ok, id: `i${i}` })) },
      { items: [ok], zip: '12' },
      { items: [ok], memberships: ['ebay'] },
      { items: [ok], storeIds: ['bad id!'] },
      { items: [ok], storeIds: 'wm-45202-1' },
    ];
    for (const payload of bad) {
      const res = await basket(payload);
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect((res.json() as { error: { code: string } }).error.code).toBe('invalid_request');
    }
    expect((await basket({ items: Array.from({ length: 60 }, (_, i) => ({ ...ok, id: `i${i}`, quantity: 99 })) })).statusCode).toBe(200);
    // An unknown productId falls back to the query, else stays unresolved.
    const fallback = (await basket({ items: [{ id: 'a', productId: 'no-such-product', query: 'eggs', quantity: 1 }, { id: 'b', productId: 'no-such-product', quantity: 1 }] })).json() as BasketResponse;
    expect(fallback.items.map((i) => [i.product !== null, i.resolvedFromQuery])).toEqual([[true, true], [false, false]]);
  });

  it('works with or without a token, rejects a bad one, and is rate limited', async () => {
    await app.fastify.close();
    store.close();
    await start({ basketRateLimitMax: 2 });
    const payload = { items: [{ id: 'a', query: 'milk', quantity: 1 }] };
    const { token } = (await app.fastify.inject({ method: 'POST', url: '/v1/devices' })).json() as RegisterDeviceResponse;
    expect((await basket(payload, 'dl_' + 'x'.repeat(43))).statusCode).toBe(401);
    expect((await basket(payload)).statusCode).toBe(200);
    expect((await basket(payload)).statusCode).toBe(200);
    expect((await basket(payload)).statusCode).toBe(429); // anonymous: per IP
    expect((await basket(payload, token)).statusCode).toBe(200); // a device has its own allowance
    expect((await basket(payload, token)).statusCode).toBe(200);
    expect((await basket(payload, token)).statusCode).toBe(429);
  });
});
