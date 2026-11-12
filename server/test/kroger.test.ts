/**
 * Fixture-based tests for the Kroger adapter and the Walmart grocery fields.
 * The fixtures are hand-written from memory of the public API docs (see their
 * "_note"): these tests prove the mapping and the token handling are
 * internally consistent — NOT that they match the live API.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Catalog } from '../src/catalog.js';
import { loadConfig } from '../src/config.js';
import { normalizeGtin } from '../src/gtin.js';
import type { FetchLike } from '../src/providers/http.js';
import { createProviders, LIVE_PROVIDERS } from '../src/providers/index.js';
import { gtinToKrogerUpc, KrogerProvider, krogerUpcToGtin, mapKrogerLocation, mapKrogerProduct } from '../src/providers/kroger.js';
import { mapWalmartItem } from '../src/providers/walmart.js';
import { personalizeProduct } from '../src/ranking.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as { data: unknown[] };
const products = fixture('kroger-products.json');
const locations = fixture('kroger-locations.json');
const AT = '2026-11-12T00:00:00.000Z';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
/** Fake Kroger: a token endpoint plus canned data responses; records every call. */
function fakeKroger(opts: { expiresIn?: number; rejectFirstData?: boolean; status?: number } = {}) {
  const calls: Call[] = [];
  let issued = 0;
  let rejected = false;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body });
    const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (url.endsWith('/connect/oauth2/token')) return json({ access_token: `token-${++issued}`, expires_in: opts.expiresIn ?? 1800, token_type: 'bearer' });
    if (opts.rejectFirstData && !rejected) {
      rejected = true;
      return json({}, 401);
    }
    if (opts.status) return json({}, opts.status);
    if (url.includes('/locations')) return json(locations);
    if (/\/products\/[^?]+/.test(url)) return json({ data: products.data[0] });
    return json(products);
  };
  return { fetch, calls, tokenCalls: () => calls.filter((c) => c.url.endsWith('/token')).length, dataCalls: () => calls.filter((c) => !c.url.endsWith('/token')) };
}
const make = (fake: ReturnType<typeof fakeKroger>, now: () => Date = () => new Date(AT)) =>
  new KrogerProvider({ clientId: 'my-client', clientSecret: 'my-secret', fetch: fake.fetch, now });

describe('Kroger mapping (fixture)', () => {
  it('maps a priced product at a location to a live, store-scoped offer with size', () => {
    const p = mapKrogerProduct(products.data[0], AT, 'kroger-01400943')!;
    expect(p).toMatchObject({
      id: 'kro-0001111041700',
      title: 'Kroger Vitamin D Whole Milk',
      brand: 'Kroger',
      category: 'Dairy',
      size: { amount: 1, unit: 'gal' },
      isStoreBrand: true,
      imageUrl: 'https://www.kroger.com/product/images/medium/front/0001111041700',
      highlights: ['1 gal'],
      priceHistory: [],
    });
    expect(p.offers).toEqual([
      {
        id: 'kro-0001111041700:kroger',
        productId: 'kro-0001111041700',
        retailerId: 'kroger',
        price: 2.99, // promo
        listPrice: 3.59, // regular
        shipping: 0,
        totalPrice: 2.99,
        inStock: true,
        membershipRequired: false,
        rating: null,
        reviewCount: null,
        delivery: 'Pickup',
        url: 'https://www.kroger.com/search?query=Kroger%20Vitamin%20D%20Whole%20Milk',
        observedAt: AT,
        priceSource: 'live',
        matchType: 'exact',
        offerTitle: null,
        size: { amount: 1, unit: 'gal' },
        storeId: 'kroger-01400943',
      },
    ]);
    // Through the normal pipeline it gets a unit price.
    expect(personalizeProduct(p).offers[0]).toMatchObject({ unitPrice: 0.0234, unitLabel: 'per fl oz', landedPrice: 2.99 });
  });

  it('promo 0 means no promotion; out of stock; national brand; category scope', () => {
    const p = mapKrogerProduct(products.data[1], AT, 'kroger-01400943', ['pasta, sauces, grain'])!;
    expect(p).toMatchObject({ brand: 'Barilla', isStoreBrand: false, category: 'Pasta, Sauces, Grain', imageUrl: null, size: { amount: 16, unit: 'oz' } });
    expect(p.offers[0]).toMatchObject({ price: 1.99, listPrice: null, inStock: false, delivery: 'In store', priceSource: 'live' });
  });

  it('no price (no location sent): a link-only offer, never a made-up price; size falls back to the title', () => {
    const p = mapKrogerProduct(products.data[2], AT, null)!;
    expect(p.offers[0]).toMatchObject({ priceSource: 'link_only', price: 0, totalPrice: 0, listPrice: null, shipping: null, storeId: null, delivery: null });
    expect(p.size).toEqual({ amount: 9.3, unit: 'oz' }); // "6 ct, 1.55 oz each" -> heuristic multipack
    const ranked = personalizeProduct(p);
    expect(ranked.cheapestOfferId).toBeNull();
    expect(ranked.recommendedOfferId).toBeNull();
    // Even with a location, a product Kroger returned without a price stays link-only and unscoped.
    expect(mapKrogerProduct(products.data[2], AT, 'kroger-01400943')!.offers[0]).toMatchObject({ priceSource: 'link_only', storeId: null });
  });

  it('drops unusable entries', () => {
    for (const bad of [products.data[3], null, 'x', {}, { productId: 'a b', description: 'x' }, { productId: '1' }]) expect(mapKrogerProduct(bad, AT, null)).toBeNull();
  });

  it('UPC handling (heuristic): 13 digits without a check digit <-> canonical GTIN-14', () => {
    const gtin = krogerUpcToGtin('0001111041700')!;
    expect(gtin).toHaveLength(14);
    expect(normalizeGtin(gtin)).toBe(gtin); // valid check digit after conversion
    expect(gtin.slice(0, 13)).toBe('0001111041700');
    expect(gtinToKrogerUpc(gtin)).toBe('0001111041700');
    // A code that already is a valid GTIN is kept as is.
    expect(krogerUpcToGtin('036000291452')).toBe('00036000291452');
    expect(krogerUpcToGtin('abc')).toBeNull();
    expect(krogerUpcToGtin(null)).toBeNull();
    expect(mapKrogerProduct(products.data[0], AT, null)!.gtin).toBe(gtin);
  });

  it('maps locations; distance is a documented placeholder', () => {
    expect(mapKrogerLocation(locations.data[0])).toEqual({
      id: 'kroger-01400943',
      retailerId: 'kroger',
      name: 'Kroger - Downtown',
      address: '100 E Court St, Cincinnati, OH 45202',
      distanceMiles: 0,
    });
    expect(mapKrogerLocation(locations.data[2])).toBeNull();
    expect(mapKrogerLocation(null)).toBeNull();
  });
});

describe('KrogerProvider (fake HTTP)', () => {
  it('gets a client-credentials token once and reuses it', async () => {
    const fake = fakeKroger();
    const kroger = make(fake);
    await Promise.all([kroger.search('milk', { limit: 10 }), kroger.search('pasta', { limit: 10 }), kroger.stores('45202')]);
    await kroger.search('eggs', { limit: 10 });
    expect(fake.tokenCalls()).toBe(1); // concurrent callers share one token request
    const token = fake.calls.find((c) => c.url.endsWith('/token'))!;
    expect(token.url).toBe('https://api.kroger.com/v1/connect/oauth2/token');
    expect(token.method).toBe('POST');
    expect(token.headers.authorization).toBe(`Basic ${Buffer.from('my-client:my-secret').toString('base64')}`);
    expect(token.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(token.body).toBe('grant_type=client_credentials&scope=product.compact');
    for (const c of fake.dataCalls()) {
      expect(c.headers.authorization).toBe('Bearer token-1');
      expect(c.method).toBe('GET');
      expect(c.url).not.toContain('my-secret');
    }
  });

  it('refreshes the token before it expires, and once after a 401', async () => {
    let now = Date.parse(AT);
    const fake = fakeKroger({ expiresIn: 600 });
    const kroger = make(fake, () => new Date(now));
    await kroger.search('milk', { limit: 5 });
    now += 500_000; // 8m20s: still inside expires_in minus the 60 s margin
    await kroger.search('milk', { limit: 5 });
    expect(fake.tokenCalls()).toBe(1);
    now += 50_000; // past the margin
    await kroger.search('milk', { limit: 5 });
    expect(fake.tokenCalls()).toBe(2);
    expect(fake.dataCalls().at(-1)!.headers.authorization).toBe('Bearer token-2');

    const rejecting = fakeKroger({ rejectFirstData: true });
    const hits = await make(rejecting).search('milk', { limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(rejecting.tokenCalls()).toBe(2);
    expect(rejecting.dataCalls().map((c) => c.headers.authorization)).toEqual(['Bearer token-1', 'Bearer token-2']);
    // A persistent 401 is surfaced, not retried forever.
    const dead = fakeKroger({ status: 401 });
    await expect(make(dead).search('milk', { limit: 5 })).rejects.toThrow('kroger API responded with HTTP 401');
    expect(dead.dataCalls()).toHaveLength(2);
  });

  it('search is location-scoped when a Kroger store is selected, link-only otherwise', async () => {
    const fake = fakeKroger();
    const kroger = make(fake);
    const scoped = await kroger.search('whole milk', { limit: 500, stores: { kroger: 'kroger-01400943', walmart: 'wm-45202-1' } });
    expect(fake.dataCalls()[0]!.url).toBe('https://api.kroger.com/v1/products?filter.term=whole%20milk&filter.limit=50&filter.locationId=01400943');
    expect(scoped.map((h) => h.product.id)).toEqual(['kro-0001111041700', 'kro-0007680800011', 'kro-0003400029005']);
    expect(scoped[0]!.product.offers[0]).toMatchObject({ storeId: 'kroger-01400943', priceSource: 'live' });
    expect(scoped[0]!.relevance).toBeGreaterThan(scoped[1]!.relevance);

    await kroger.search('whole milk', { limit: 10 });
    expect(fake.dataCalls()[1]!.url).toBe('https://api.kroger.com/v1/products?filter.term=whole%20milk&filter.limit=10');
    // A store id that is not a Kroger id is never sent upstream.
    await kroger.search('whole milk', { limit: 10, stores: { kroger: 'kr-45202-1' } });
    expect(fake.dataCalls()[2]!.url).not.toContain('locationId');
    // Kroger rejects terms shorter than 3 characters: no call at all.
    expect(await kroger.search('tv', { limit: 10 })).toEqual([]);
    expect(fake.dataCalls()).toHaveLength(3);
  });

  it('getProduct only answers its own ids; lookupGtin converts the barcode; 404 is "not found"', async () => {
    const fake = fakeKroger();
    const kroger = make(fake);
    expect(await kroger.getProduct('great-value-whole-milk-1-gal')).toBeNull();
    expect(await kroger.getProduct('wmt-123')).toBeNull();
    expect(await kroger.getProduct('kro-../etc')).toBeNull();
    expect(fake.dataCalls()).toHaveLength(0);
    expect((await kroger.getProduct('kro-0001111041700', { stores: { kroger: 'kroger-01400943' } }))!.id).toBe('kro-0001111041700');
    expect(fake.dataCalls()[0]!.url).toBe('https://api.kroger.com/v1/products/0001111041700?filter.locationId=01400943');
    const gtin = krogerUpcToGtin('0001111041700')!;
    expect((await kroger.lookupGtin(gtin))!.gtin).toBe(gtin);
    expect(fake.dataCalls()[1]!.url).toBe('https://api.kroger.com/v1/products/0001111041700');
    expect(await make(fakeKroger({ status: 404 })).getProduct('kro-1')).toBeNull();
    await expect(make(fakeKroger({ status: 500 })).getProduct('kro-1')).rejects.toThrow('kroger API responded with HTTP 500');
  });

  it('stores: locations near a zip, ids recognised by storeRetailer', async () => {
    const fake = fakeKroger();
    const kroger = make(fake);
    const stores = await kroger.stores('45202');
    expect(fake.dataCalls()[0]!.url).toBe('https://api.kroger.com/v1/locations?filter.zipCode.near=45202&filter.limit=3&filter.radiusInMiles=25');
    expect(stores.map((s) => s.id)).toEqual(['kroger-01400943', 'kroger-01400376']);
    expect(await kroger.stores('abc')).toEqual([]);
    expect(kroger.storeRetailer('kroger-01400943')).toBe('kroger');
    expect(kroger.storeRetailer('kr-45202-1')).toBeNull();
    expect(kroger.storeRetailer('wm-45202-1')).toBeNull();
    expect(kroger.storeScopedRetailers).toEqual(['kroger']);
  });

  it('through the catalog: nearest Kroger from the zip, cache keyed by that store, other stores as "check price"', async () => {
    const fake = fakeKroger();
    const catalog = new Catalog([make(fake)], { providerTimeoutMs: 500, cacheMaxEntries: 50, cacheTtlMs: 60_000, cacheSwrMs: 60_000, linkOnlyFallback: true });
    const ctx = await catalog.contextFor('45202', null);
    expect(ctx.stores).toEqual({ kroger: 'kroger-01400943' });
    const first = await catalog.search('whole milk', ctx.stores);
    const again = await catalog.search('whole milk', ctx.stores);
    const elsewhere = await catalog.search('whole milk', { kroger: 'kroger-01400376' });
    const national = await catalog.search('whole milk');
    expect([first.cached, again.cached, elsewhere.cached, national.cached]).toEqual([false, true, false, false]);
    expect(fake.dataCalls().filter((c) => c.url.includes('/products')).map((c) => /locationId=(\d+)/.exec(c.url)?.[1])).toEqual(['01400943', '01400376', undefined]);
    const milk = personalizeProduct(first.value[0]!.product, undefined, ctx);
    expect(milk.offers.map((o) => `${o.retailerId}:${o.priceSource}`)).toEqual([
      'kroger:live', 'amazon:link_only', 'bestbuy:link_only', 'costco:link_only', 'samsclub:link_only', 'target:link_only', 'walmart:link_only',
    ]);
    expect(milk.cheapestOfferId).toBe('kro-0001111041700:kroger');
    expect(milk.offers[0]).toMatchObject({ storeId: 'kroger-01400943', unitLabel: 'per fl oz' });
  });

  it('is off by default and refuses to start without credentials', () => {
    expect(createProviders(loadConfig({})).map((p) => p.name)).toEqual(['mock']);
    expect(() => createProviders(loadConfig({ PRICE_PROVIDERS: 'kroger' }))).toThrow(/KROGER_CLIENT_ID/);
    expect(() => createProviders(loadConfig({ PRICE_PROVIDERS: 'kroger', KROGER_CLIENT_ID: 'id' }))).toThrow(/KROGER_CLIENT_SECRET/);
    expect(createProviders(loadConfig({ PRICE_PROVIDERS: 'kroger', KROGER_CLIENT_ID: 'id', KROGER_CLIENT_SECRET: 's' }))[0]!.name).toBe('kroger');
    expect(LIVE_PROVIDERS).toContain('kroger');
    expect(() => new KrogerProvider({ clientId: '', clientSecret: 'x' })).toThrow();
  });

  it('errors never contain the client secret or the token', async () => {
    const throwing = new KrogerProvider({
      clientId: 'my-client',
      clientSecret: 'my-secret',
      fetch: (async (url: string, init: { headers: Record<string, string> }) => Promise.reject(new Error(`boom ${url} ${JSON.stringify(init.headers)}`))) as FetchLike,
    });
    const err = (await throwing.search('milk', { limit: 5 }).catch((e: Error) => e)) as Error;
    expect(err.message).toBe('kroger API request failed (Error)');
    const log = vi.fn();
    const catalog = new Catalog([throwing], { providerTimeoutMs: 200, cacheMaxEntries: 5, cacheTtlMs: 1000, cacheSwrMs: 1000, onProviderError: (_p, _o, e) => log(String(e)) });
    await expect(catalog.search('milk')).rejects.toThrow();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/my-secret|bXktY2xpZW50/);
  });
});

describe('Walmart adapter: grocery fields (heuristic)', () => {
  const item = (name: string, extra: Record<string, unknown> = {}) => mapWalmartItem({ itemId: 1, name, salePrice: 3.12, stock: 'Available', ...extra }, AT)!;

  it('parses the package size out of the title and derives a unit price downstream', () => {
    const milk = item('Great Value Whole Vitamin D Milk, Gallon, 128 fl oz', { brandName: 'Great Value' });
    expect(milk.size).toEqual({ amount: 128, unit: 'fl_oz' });
    expect(milk.offers[0]!.size).toEqual({ amount: 128, unit: 'fl_oz' });
    expect(milk.isStoreBrand).toBe(true);
    expect(milk.offers[0]).toMatchObject({ matchType: 'exact', offerTitle: null, storeId: null });
    expect(personalizeProduct(milk).offers[0]).toMatchObject({ unitPrice: 0.0244, unitLabel: 'per fl oz' });
    expect(item('Coca-Cola Soda Pop, 12 fl oz, 12 Pack Cans', { brandName: 'Coca-Cola' })).toMatchObject({ size: { amount: 144, unit: 'fl_oz' }, isStoreBrand: false });
    expect(item("Eggland's Best Classic Large White Eggs, 12 Count").size).toEqual({ amount: 12, unit: 'ct' });
    expect(item('Barilla Gluten Free Penne Pasta, 12 oz').size).toEqual({ amount: 12, unit: 'oz' });
    // An explicit size field, if the API has one, wins over the title.
    expect(item('Rice 5 lb bag', { size: '80 oz' }).size).toEqual({ amount: 80, unit: 'oz' });
  });

  it('leaves size null when the title has none (no unit price is invented)', () => {
    const tv = item('Sony WH-1000XM5 Wireless Noise Canceling Headphones, Black');
    expect(tv.size).toBeNull();
    expect(personalizeProduct(tv).offers[0]).toMatchObject({ unitPrice: null, unitLabel: null });
  });
});
