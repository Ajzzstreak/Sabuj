import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import type { Config } from '../src/config.js';
import type {
  ActivityEvent,
  HomeResponse,
  ProductResponse,
  ProfileResponse,
  SearchResponse,
  SuggestResponse,
} from '../src/contract.js';
import { Store } from '../src/db.js';
import { MockProvider } from '../src/providers/mock/index.js';
import type { PriceProvider } from '../src/providers/types.js';
import { testConfig } from './helpers.js';

const DEVICE = 'device-api-test-0001';
let app: App;
let store: Store;

async function start(overrides: Partial<Config> = {}, providers: PriceProvider[] = [new MockProvider()]) {
  store = new Store(':memory:');
  app = await buildApp({ config: testConfig(overrides), store, providers });
}
const get = (url: string) => app.fastify.inject({ method: 'GET', url });
const post = (payload: unknown) => app.fastify.inject({ method: 'POST', url: '/v1/events', payload: payload as object });

beforeEach(() => start());
afterEach(async () => {
  await app.fastify.close();
  store.close();
});

describe('basic endpoints', () => {
  it('GET /v1/health', async () => {
    const res = await get('/v1/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('GET /v1/search returns cheapest-first products and reports cache state', async () => {
    const first = (await get('/v1/search?q=rice%20cooker')).json() as SearchResponse;
    expect(first.query).toBe('rice cooker');
    expect(first.cached).toBe(false);
    expect(first.personalized).toBe(false);
    expect(first.retailers).toHaveLength(6);
    expect(typeof first.tookMs).toBe('number');
    expect(first.products[0]!.category).toBe('Rice Cookers');
    for (const p of first.products) {
      const inStock = p.offers.filter((o) => o.inStock);
      const totals = inStock.map((o) => o.totalPrice);
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
      expect(p.recommendedOfferId).toBe(p.offers[0]!.id);
      expect(p.recommendationReason).toBeNull();
      if (inStock.length) {
        expect(p.cheapestOfferId).toBe(inStock[0]!.id);
        expect(p.maxSavings).toBeCloseTo(Math.max(...totals) - Math.min(...totals), 2);
      }
      expect(p).not.toHaveProperty('priceHistory');
    }
    const second = (await get('/v1/search?q=RICE%20%20cooker&limit=3')).json() as SearchResponse;
    expect(second.cached).toBe(true);
    expect(second.products).toHaveLength(3);
  });

  it('GET /v1/suggest', async () => {
    const res = (await get('/v1/suggest?q=ric')).json() as SuggestResponse;
    expect(res.query).toBe('ric');
    expect(res.suggestions).toContain('rice cooker');
    expect(((await get('/v1/suggest')).json() as SuggestResponse).suggestions.length).toBeGreaterThan(0);
  });

  it('GET /v1/home without a profile', async () => {
    const res = (await get('/v1/home')).json() as HomeResponse;
    expect(res.trendingQueries.length).toBeGreaterThan(0);
    expect(res.retailers).toHaveLength(6);
    const kinds = res.sections.map((s) => s.kind);
    expect(kinds).toContain('top_deals');
    expect(kinds).toContain('category');
    expect(kinds).not.toContain('for_you');
    const deals = res.sections.find((s) => s.kind === 'top_deals')!;
    const pct = (p: (typeof deals.products)[number]) =>
      p.maxSavings / Math.max(...p.offers.filter((o) => o.inStock).map((o) => o.totalPrice));
    for (let i = 1; i < deals.products.length; i++) expect(pct(deals.products[i - 1]!)).toBeGreaterThanOrEqual(pct(deals.products[i]!));
  });

  it('GET /v1/products/:id', async () => {
    const search = (await get('/v1/search?q=zojirushi')).json() as SearchResponse;
    const id = search.products[0]!.id;
    const res = await get(`/v1/products/${id}`);
    expect(res.statusCode).toBe(200);
    const { product, retailers } = res.json() as ProductResponse;
    expect(product.id).toBe(id);
    expect(product.priceHistory.length).toBe(product.offers.length * 90);
    expect(product.description).toBeTruthy();
    expect(retailers).toHaveLength(6);
  });

  it('GET /v1/profile for an unknown device is empty with source none', async () => {
    const { profile } = (await get(`/v1/profile?deviceId=${DEVICE}`)).json() as ProfileResponse;
    expect(profile).toMatchObject({ deviceId: DEVICE, eventCount: 0, source: 'none', updatedAt: null, retailerAffinity: {}, memberships: [] });
  });

  it('sets CORS headers', async () => {
    const res = await app.fastify.inject({ method: 'GET', url: '/v1/health', headers: { origin: 'https://example.com' } });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('errors use the ApiError shape', () => {
  const expectError = (res: { statusCode: number; json: () => unknown }, status: number, code: string) => {
    expect(res.statusCode).toBe(status);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe(code);
    expect(typeof body.error.message).toBe('string');
  };

  it('validation, 404s and bad JSON', async () => {
    expectError(await get('/v1/search'), 400, 'invalid_request');
    expectError(await get('/v1/search?q=tv&limit=999'), 400, 'invalid_request');
    expectError(await get(`/v1/search?q=${'x'.repeat(200)}`), 400, 'invalid_request');
    expectError(await get('/v1/search?q=tv&deviceId=bad%20id!'), 400, 'invalid_request');
    expectError(await get('/v1/profile'), 400, 'invalid_request');
    expectError(await get('/v1/profile?deviceId=short'), 400, 'invalid_request');
    expectError(await get('/v1/products/does-not-exist'), 404, 'product_not_found');
    expectError(await get('/v1/nope'), 404, 'not_found');
    expectError(
      await app.fastify.inject({ method: 'POST', url: '/v1/events', payload: '{nope', headers: { 'content-type': 'application/json' } }),
      400,
      'invalid_request',
    );
  });

  it('rejects bad event batches', async () => {
    const ok: ActivityEvent = { type: 'search', ts: Date.now(), query: 'tv' };
    expectError(await post({ deviceId: DEVICE, events: [] }), 400, 'invalid_request');
    expectError(await post({ deviceId: 'x', events: [ok] }), 400, 'invalid_request');
    expectError(await post({ deviceId: DEVICE, events: Array(101).fill(ok) }), 400, 'invalid_request');
    expectError(await post({ deviceId: DEVICE, events: [{ ...ok, query: 'q'.repeat(201) }] }), 400, 'invalid_request');
    expectError(await post({ deviceId: DEVICE, events: [{ ...ok, type: 'hack' }] }), 400, 'invalid_request');
    expectError(await post({ deviceId: DEVICE, events: [{ ...ok, retailerId: 'ebay' }] }), 400, 'invalid_request');
    expectError(await post({ deviceId: DEVICE, events: [{ ...ok, price: -5 }] }), 400, 'invalid_request');
    expectError(await post({ deviceId: DEVICE, events: [{ ...ok, ts: 12 }] }), 400, 'invalid_request');
    expect(store.storedEventCount(DEVICE)).toBe(0);
  });

  it('rejects oversized bodies with 413', async () => {
    const big = { deviceId: DEVICE, events: [{ type: 'search', ts: Date.now(), query: 'x'.repeat(70_000) }] };
    expectError(await post(big), 413, 'payload_too_large');
  });

  it('rate limits per device on /v1/events', async () => {
    await app.fastify.close();
    store.close();
    await start({ rateLimitEventsMax: 2 });
    const body = { deviceId: DEVICE, events: [{ type: 'search', ts: Date.now(), query: 'tv' }] };
    expect((await post(body)).statusCode).toBe(200);
    expect((await post(body)).statusCode).toBe(200);
    const blocked = await post(body);
    expectError(blocked, 429, 'rate_limited');
    expect((blocked as unknown as { headers: Record<string, string> }).headers['retry-after']).toBeDefined();
    expect((await post({ ...body, deviceId: 'another-device-0002' })).statusCode).toBe(200);
  });

  it('rate limits per IP', async () => {
    await app.fastify.close();
    store.close();
    await start({ rateLimitMax: 3 });
    for (let i = 0; i < 3; i++) expect((await get('/v1/health')).statusCode).toBe(200);
    expectError(await get('/v1/health'), 429, 'rate_limited');
  });

  it('returns 502 when every provider fails', async () => {
    await app.fastify.close();
    store.close();
    const down: PriceProvider = {
      name: 'down',
      search: async () => Promise.reject(new Error('x')),
      getProduct: async () => Promise.reject(new Error('x')),
    };
    await start({}, [down]);
    expectError(await get('/v1/search?q=tv'), 502, 'upstream_unavailable');
  });
});

describe('learning loop', () => {
  /** Find a rice cooker where some retailer is in stock, not cheapest, and close in price. */
  async function pickTarget() {
    const { products } = (await get('/v1/search?q=rice%20cooker')).json() as SearchResponse;
    for (const p of products) {
      const cheapest = p.offers[0]!;
      const alt = p.offers.find(
        (o) => o.inStock && o.id !== cheapest.id && !o.membershipRequired && o.totalPrice - cheapest.totalPrice < cheapest.totalPrice * 0.04,
      );
      if (alt && cheapest.inStock) return { product: p, cheapest, alt };
    }
    throw new Error('no suitable product in the mock catalog');
  }

  it('events -> heuristic profile -> personalized ranking -> erase', async () => {
    const { product, cheapest, alt } = await pickTarget();
    const events: ActivityEvent[] = [
      { type: 'search', ts: Date.now(), query: 'rice cooker' },
      ...Array.from({ length: 29 }, (): ActivityEvent => ({
        type: 'offer_click',
        ts: Date.now(),
        productId: product.id,
        offerId: alt.id,
        retailerId: alt.retailerId,
        category: product.category,
        brand: product.brand,
        price: alt.totalPrice,
        rank: 1,
        wasCheapest: false,
        premiumPaid: Math.round((alt.totalPrice - cheapest.totalPrice) * 100) / 100,
      })),
    ];
    const res = await post({ deviceId: DEVICE, events });
    expect(res.json()).toEqual({ accepted: 30 });

    await app.learner.flush();
    const { profile } = (await get(`/v1/profile?deviceId=${DEVICE}`)).json() as ProfileResponse;
    expect(profile.source).toBe('heuristic');
    expect(profile.eventCount).toBe(30);
    expect(profile.retailerAffinity[alt.retailerId]).toBeGreaterThan(0.7);
    expect(profile.priceSensitivity).toBeLessThan(0.6);
    expect(profile.categoryAffinity['Rice Cookers']).toBe(1);
    expect(profile.suggestedQueries).toContain('rice cooker');
    expect(profile.updatedAt).not.toBeNull();

    const personal = (await get(`/v1/search?q=rice%20cooker&deviceId=${DEVICE}`)).json() as SearchResponse;
    expect(personal.cached).toBe(true); // provider result is shared; personalization is applied after the cache
    expect(personal.personalized).toBe(true);
    const mine = personal.products.find((p) => p.id === product.id)!;
    expect(mine.recommendedOfferId).toBe(alt.id);
    expect(mine.offers[0]!.id).toBe(alt.id);
    expect(mine.cheapestOfferId).toBe(cheapest.id);
    expect(mine.recommendationReason).toMatch(/^You usually choose .+ when it's within \$\d+$/);

    // Another device (and anonymous requests) still get the neutral ordering.
    const anon = (await get('/v1/search?q=rice%20cooker')).json() as SearchResponse;
    expect(anon.personalized).toBe(false);
    expect(anon.products.find((p) => p.id === product.id)!.recommendedOfferId).toBe(cheapest.id);

    const detail = (await get(`/v1/products/${product.id}?deviceId=${DEVICE}`)).json() as ProductResponse;
    expect(detail.product.recommendedOfferId).toBe(alt.id);

    const home = (await get(`/v1/home?deviceId=${DEVICE}`)).json() as HomeResponse;
    expect(home.sections[0]!.kind).toBe('for_you');
    expect(home.sections[0]!.products[0]!.category).toBe('Rice Cookers');
    expect(home.sections.find((s) => s.kind === 'recent')!.products[0]!.id).toBe(product.id);
    expect(home.sections.find((s) => s.kind === 'category')!.title).toBe('Rice Cookers');

    const suggest = (await get(`/v1/suggest?q=&deviceId=${DEVICE}`)).json() as SuggestResponse;
    expect(suggest.suggestions[0]).toBe('rice cooker');

    const del = await app.fastify.inject({ method: 'DELETE', url: `/v1/profile?deviceId=${DEVICE}` });
    expect(del.json()).toEqual({ deleted: true });
    expect(store.storedEventCount(DEVICE)).toBe(0);
    expect(store.getRow(DEVICE)).toBeNull();
    const after = (await get(`/v1/profile?deviceId=${DEVICE}`)).json() as ProfileResponse;
    expect(after.profile).toMatchObject({ source: 'none', eventCount: 0 });
    const reset = (await get(`/v1/search?q=rice%20cooker&deviceId=${DEVICE}`)).json() as SearchResponse;
    expect(reset.personalized).toBe(false);
  });

  it('does not block the response on profile learning, and erasing cancels pending work', async () => {
    await app.fastify.close();
    store.close();
    await start({ profileDebounceMs: 60_000 });
    const res = await post({ deviceId: DEVICE, events: [{ type: 'offer_click', ts: Date.now(), retailerId: 'target' }] });
    expect(res.statusCode).toBe(200);
    // Stored immediately, but no profile has been computed yet.
    expect(store.storedEventCount(DEVICE)).toBe(1);
    expect(((await get(`/v1/profile?deviceId=${DEVICE}`)).json() as ProfileResponse).profile).toMatchObject({ source: 'none', eventCount: 1 });
    await app.fastify.inject({ method: 'DELETE', url: `/v1/profile?deviceId=${DEVICE}` });
    await app.learner.flush();
    expect(store.getRow(DEVICE)).toBeNull();
  });

  it('prunes the oldest events beyond the per-device cap but keeps the lifetime count', () => {
    const s = new Store(':memory:', 100);
    for (let i = 0; i < 3; i++) s.insertEvents(DEVICE, Array.from({ length: 60 }, (_, j) => ({ type: 'search', ts: 1e12 + i * 100 + j, query: `q${i}-${j}` })));
    expect(s.storedEventCount(DEVICE)).toBe(100);
    expect(s.getRow(DEVICE)!.totalEvents).toBe(180);
    expect(s.recentEvents(DEVICE, 1)[0]!.query).toBe('q2-59');
    s.close();
  });
});
