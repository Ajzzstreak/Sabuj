import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, hashToken, type App } from '../src/app.js';
import type { Config } from '../src/config.js';
import type {
  ActivityEvent,
  HomeResponse,
  Product,
  ProductResponse,
  ProfileResponse,
  RegisterDeviceResponse,
  SearchResponse,
  SuggestResponse,
} from '../src/contract.js';
import { Store } from '../src/db.js';
import { MockProvider } from '../src/providers/mock/index.js';
import type { PriceProvider } from '../src/providers/types.js';
import { testConfig } from './helpers.js';

let app: App;
let store: Store;

async function start(overrides: Partial<Config> = {}, providers: PriceProvider[] = [new MockProvider({ catalog: 'general' })]) {
  store = new Store(':memory:');
  app = await buildApp({ config: testConfig(overrides), store, providers });
}
async function restart(overrides: Partial<Config> = {}, providers?: PriceProvider[]) {
  await app.fastify.close();
  store.close();
  await start(overrides, providers);
}
const bearer = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});
const get = (url: string, token?: string) => app.fastify.inject({ method: 'GET', url, headers: bearer(token) });
const del = (url: string, token?: string) => app.fastify.inject({ method: 'DELETE', url, headers: bearer(token) });
const postEvents = (payload: unknown, token?: string) =>
  app.fastify.inject({ method: 'POST', url: '/v1/events', payload: payload as object, headers: bearer(token) });
async function register(): Promise<RegisterDeviceResponse> {
  const res = await app.fastify.inject({ method: 'POST', url: '/v1/devices' });
  expect(res.statusCode).toBe(200);
  return res.json() as RegisterDeviceResponse;
}
const expectError = (res: { statusCode: number; json: () => unknown }, status: number, code: string) => {
  expect(res.statusCode).toBe(status);
  const body = res.json() as { error: { code: string; message: string } };
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
};

beforeEach(() => start());
afterEach(async () => {
  await app.fastify.close();
  store.close();
});

describe('basic endpoints (anonymous)', () => {
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
    expect(first.retailers).toHaveLength(7);
    expect(typeof first.tookMs).toBe('number');
    expect(first.products[0]!.category).toBe('Rice Cookers');
    for (const p of first.products) {
      const inStock = p.offers.filter((o) => o.inStock);
      const totals = inStock.map((o) => o.landedPrice);
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
      expect(p.recommendationReason).toBeNull();
      for (const o of p.offers) {
        // No zip, no memberships: no tax, everything eligible, demo prices.
        expect(o.estimatedTax).toBeNull();
        expect(o.landedPrice).toBe(o.totalPrice);
        expect(o.eligible).toBe(true);
        expect(o.priceSource).toBe('demo');
      }
      if (inStock.length) {
        expect(p.recommendedOfferId).toBe(p.offers[0]!.id);
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
    expect(res.retailers).toHaveLength(7);
    const kinds = res.sections.map((s) => s.kind);
    expect(kinds).toContain('top_deals');
    expect(kinds).toContain('category');
    expect(kinds).not.toContain('for_you');
    const deals = res.sections.find((s) => s.kind === 'top_deals')!;
    const pct = (p: Product) => p.maxSavings / Math.max(...p.offers.filter((o) => o.inStock).map((o) => o.landedPrice));
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
    expect(retailers).toHaveLength(7);
  });

  it('sets CORS headers and allows PUT + Authorization in preflight', async () => {
    const res = await app.fastify.inject({ method: 'GET', url: '/v1/health', headers: { origin: 'https://example.com' } });
    expect(res.headers['access-control-allow-origin']).toBe('*');
    const pre = await app.fastify.inject({
      method: 'OPTIONS',
      url: '/v1/push-token',
      headers: { origin: 'https://example.com', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization,content-type' },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toContain('PUT');
    expect(String(pre.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization');
  });
});

describe('device tokens', () => {
  it('POST /v1/devices issues a random id and a long secret, and stores only its hash', async () => {
    const a = await register();
    const b = await register();
    expect(a.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.token).not.toBe(b.token);
    expect(a.deviceId).not.toBe(b.deviceId);
    expect(store.deviceByTokenHash(hashToken(a.token))!.deviceId).toBe(a.deviceId);
    expect(store.deviceByTokenHash(a.token)).toBeNull();
    // The raw token is nowhere in the database file.
    const dump = JSON.stringify((store as unknown as { db: { prepare(sql: string): { all(): unknown[] } } }).db.prepare('SELECT * FROM devices').all());
    expect(dump).not.toContain(a.token);
    expect(dump).toContain(hashToken(a.token));
  });

  it('device-scoped routes need a token: 401 without one, 401 with a bad one', async () => {
    const routes: Array<[string, string, object?]> = [
      ['GET', '/v1/profile'],
      ['DELETE', '/v1/profile'],
      ['POST', '/v1/events', { events: [{ type: 'search', ts: Date.now(), query: 'tv' }] }],
      ['GET', '/v1/alerts'],
      ['POST', '/v1/alerts', { productId: 'x', targetPrice: 5 }],
      ['DELETE', '/v1/alerts/12345678'],
      ['POST', '/v1/ask', { text: 'tv' }],
      ['PUT', '/v1/push-token', { token: null }],
    ];
    for (const [method, url, payload] of routes) {
      const none = await app.fastify.inject({ method: method as 'GET', url, payload });
      expectError(none, 401, 'unauthorized');
      expect(none.headers['www-authenticate']).toBe('Bearer');
      const bad = await app.fastify.inject({ method: method as 'GET', url, payload, headers: bearer('dl_' + 'x'.repeat(43)) });
      expectError(bad, 401, 'unauthorized');
    }
  });

  it('catalog routes work anonymously but reject an invalid token', async () => {
    const { token } = await register();
    for (const url of ['/v1/search?q=tv', '/v1/suggest?q=t', '/v1/home', '/v1/products/dash-mini-2-cup-rice-cooker']) {
      expect((await get(url)).statusCode).toBe(200);
      expect((await get(url, token)).statusCode).toBe(200);
      expectError(await get(url, 'dl_' + 'y'.repeat(43)), 401, 'unauthorized');
      expectError(await app.fastify.inject({ method: 'GET', url, headers: { authorization: 'Basic abc' } }), 401, 'unauthorized');
      expectError(await app.fastify.inject({ method: 'GET', url, headers: { authorization: 'Bearer short' } }), 401, 'unauthorized');
    }
  });

  it('deviceId is not a credential any more: query and body ids are ignored', async () => {
    const a = await register();
    const b = await register();
    await postEvents({ deviceId: b.deviceId, events: [{ type: 'search', ts: Date.now(), query: 'tv' }] }, a.token);
    expect(store.storedEventCount(a.deviceId)).toBe(1);
    expect(store.storedEventCount(b.deviceId)).toBe(0);
    expectError(await get(`/v1/profile?deviceId=${a.deviceId}`), 401, 'unauthorized');
    const mine = (await get(`/v1/profile?deviceId=${b.deviceId}`, a.token)).json() as ProfileResponse;
    expect(mine.profile.eventCount).toBe(1);
    expect(mine.profile).not.toHaveProperty('deviceId');
  });

  it('rate-limits registration per IP (short window and daily cap)', async () => {
    await restart({ deviceRegistrationRateMax: 2 });
    await register();
    await register();
    expectError(await app.fastify.inject({ method: 'POST', url: '/v1/devices' }), 429, 'rate_limited');
    // Another address is unaffected.
    expect((await app.fastify.inject({ method: 'POST', url: '/v1/devices', remoteAddress: '198.51.100.9' })).statusCode).toBe(200);

    await restart({ deviceRegistrationRateMax: 100, deviceRegistrationsPerIpPerDay: 3 });
    for (let i = 0; i < 3; i++) await register();
    const blocked = await app.fastify.inject({ method: 'POST', url: '/v1/devices' });
    expectError(blocked, 429, 'rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(3600); // the daily window, not the minute one
    expect(store.countDevices()).toBe(3);
  });

  it('refuses registration at the global device ceiling', async () => {
    await restart({ maxDevices: 2 });
    await register();
    await register();
    expectError(await app.fastify.inject({ method: 'POST', url: '/v1/devices' }), 503, 'capacity_exceeded');
  });

  it('retention: devices with no activity for N days are erased with all their data', async () => {
    await restart({ deviceRetentionDays: 30 });
    const old = await register();
    const fresh = await register();
    await postEvents({ events: [{ type: 'search', ts: Date.now(), query: 'tv' }] }, old.token);
    await postEvents({ events: [{ type: 'search', ts: Date.now(), query: 'tv' }] }, fresh.token);
    await app.learner.flush();
    store.insertEvents('legacy-unauthenticated-device', [{ type: 'search', ts: Date.now(), query: 'x' }]); // pre-token-era orphan
    expect(app.purgeInactiveDevices()).toBe(0);
    expect(store.storedEventCount('legacy-unauthenticated-device')).toBe(0);

    store.touchDevice(old.deviceId, Date.now() - 31 * 86_400_000);
    expect(app.purgeInactiveDevices()).toBe(1);
    expect(store.storedEventCount(old.deviceId)).toBe(0);
    expect(store.getRow(old.deviceId)).toBeNull();
    expectError(await get('/v1/profile', old.token), 401, 'unauthorized');
    expect((await get('/v1/profile', fresh.token)).statusCode).toBe(200);
    expect(store.storedEventCount(fresh.deviceId)).toBe(1);
  });

  it('an authenticated request refreshes last-seen, at most hourly', async () => {
    const { deviceId, token } = await register();
    const stale = Date.now() - 2 * 3_600_000;
    store.touchDevice(deviceId, stale);
    await get('/v1/search?q=tv', token);
    const seen = store.deviceByTokenHash(hashToken(token))!.lastSeenAt;
    expect(seen).toBeGreaterThan(stale);
    await get('/v1/search?q=tv', token);
    expect(store.deviceByTokenHash(hashToken(token))!.lastSeenAt).toBe(seen);
  });
});

describe('errors use the ApiError shape', () => {
  it('validation, 404s and bad JSON', async () => {
    const { token } = await register();
    expectError(await get('/v1/search'), 400, 'invalid_request');
    expectError(await get('/v1/search?q=tv&limit=999'), 400, 'invalid_request');
    expectError(await get(`/v1/search?q=${'x'.repeat(200)}`), 400, 'invalid_request');
    expectError(await get('/v1/search?q=tv&zip=abcde'), 400, 'invalid_request');
    expectError(await get('/v1/search?q=tv&zip=1234'), 400, 'invalid_request');
    expectError(await get('/v1/search?q=tv&memberships=ebay'), 400, 'invalid_request');
    expectError(await get('/v1/home?zip=nope'), 400, 'invalid_request');
    expectError(await get('/v1/products/does-not-exist'), 404, 'product_not_found');
    expectError(await get('/v1/nope'), 404, 'not_found');
    expectError(
      await app.fastify.inject({
        method: 'POST',
        url: '/v1/events',
        payload: '{nope',
        headers: { 'content-type': 'application/json', ...bearer(token) },
      }),
      400,
      'invalid_request',
    );
  });

  it('rejects bad event batches', async () => {
    const { deviceId, token } = await register();
    const ok: ActivityEvent = { type: 'search', ts: Date.now(), query: 'tv' };
    expectError(await postEvents({ events: [] }, token), 400, 'invalid_request');
    expectError(await postEvents({}, token), 400, 'invalid_request');
    expectError(await postEvents({ events: Array(101).fill(ok) }, token), 400, 'invalid_request');
    expectError(await postEvents({ events: [{ ...ok, query: 'q'.repeat(201) }] }, token), 400, 'invalid_request');
    expectError(await postEvents({ events: [{ ...ok, type: 'hack' }] }, token), 400, 'invalid_request');
    expectError(await postEvents({ events: [{ ...ok, retailerId: 'ebay' }] }, token), 400, 'invalid_request');
    expectError(await postEvents({ events: [{ ...ok, price: -5 }] }, token), 400, 'invalid_request');
    expectError(await postEvents({ events: [{ ...ok, ts: 12 }] }, token), 400, 'invalid_request');
    expect(store.storedEventCount(deviceId)).toBe(0);
  });

  it('rejects oversized bodies with 413', async () => {
    const { token } = await register();
    const big = { events: [{ type: 'search', ts: Date.now(), query: 'x'.repeat(70_000) }] };
    expectError(await postEvents(big, token), 413, 'payload_too_large');
  });

  it('rate limits per device on /v1/events', async () => {
    await restart({ rateLimitEventsMax: 2 });
    const a = await register();
    const b = await register();
    const body = { events: [{ type: 'search', ts: Date.now(), query: 'tv' }] };
    expect((await postEvents(body, a.token)).statusCode).toBe(200);
    expect((await postEvents(body, a.token)).statusCode).toBe(200);
    const blocked = await postEvents(body, a.token);
    expectError(blocked, 429, 'rate_limited');
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await postEvents(body, b.token)).statusCode).toBe(200);
  });

  it('rate limits per IP', async () => {
    await restart({ rateLimitMax: 3 });
    for (let i = 0; i < 3; i++) expect((await get('/v1/health')).statusCode).toBe(200);
    expectError(await get('/v1/health'), 429, 'rate_limited');
  });

  it('returns 502 when every provider fails', async () => {
    const down: PriceProvider = {
      name: 'down',
      search: async () => Promise.reject(new Error('x')),
      getProduct: async () => Promise.reject(new Error('x')),
      lookupGtin: async () => Promise.reject(new Error('x')),
    };
    await restart({}, [down]);
    expectError(await get('/v1/search?q=tv'), 502, 'upstream_unavailable');
    expectError(await get('/v1/lookup?gtin=012345678905'), 502, 'upstream_unavailable');
  });
});

describe('abuse and privacy hardening', () => {
  it('a client-supplied X-Forwarded-For cannot dodge the per-IP limit behind a trusted proxy', async () => {
    await restart({ trustProxy: 1, rateLimitMax: 3 });
    // The proxy appends the real client address (203.0.113.7); the client forges the rest.
    const hit = (forged: string) =>
      app.fastify.inject({ method: 'GET', url: '/v1/health', headers: { 'x-forwarded-for': `${forged}, 203.0.113.7` } });
    for (let i = 0; i < 3; i++) expect((await hit(`10.0.0.${i}`)).statusCode).toBe(200);
    expect((await hit('10.0.0.99')).statusCode).toBe(429);
    // A different real client is unaffected.
    const other = await app.fastify.inject({ method: 'GET', url: '/v1/health', headers: { 'x-forwarded-for': '198.51.100.1' } });
    expect(other.statusCode).toBe(200);
  });

  it('ignores X-Forwarded-For entirely when no proxy is trusted', async () => {
    await restart({ rateLimitMax: 2 });
    const hit = (ip: string) => app.fastify.inject({ method: 'GET', url: '/v1/health', headers: { 'x-forwarded-for': ip } });
    expect((await hit('1.1.1.1')).statusCode).toBe(200);
    expect((await hit('2.2.2.2')).statusCode).toBe(200);
    expect((await hit('3.3.3.3')).statusCode).toBe(429);
  });

  it('request logs never contain the search text, zip, barcode, token or device id', async () => {
    await app.fastify.close();
    store.close();
    const lines: string[] = [];
    store = new Store(':memory:');
    app = await buildApp({
      config: testConfig(),
      store,
      providers: [new MockProvider({ catalog: 'general' })],
      logger: { level: 'info', stream: { write: (l: string) => void lines.push(l) } } as { level: string },
    });
    const { deviceId, token } = await register();
    await get('/v1/search?q=very-private-query&zip=94105', token);
    await get('/v1/lookup?gtin=036000291452', token);
    await get('/v1/profile', token);
    await get('/v1/profile', 'dl_' + 'z'.repeat(43));
    const log = lines.join('');
    expect(log).toContain('/v1/search');
    expect(log).not.toContain('very-private-query');
    expect(log).not.toContain('94105');
    expect(log).not.toContain('036000291452');
    expect(log).not.toContain(token);
    expect(log).not.toContain('zzzzzzzz');
    expect(log).not.toContain(deviceId);
  });
});

describe('shopper context: zip and memberships', () => {
  /** A product whose cheapest offer is a warehouse club, with a non-club alternative. */
  async function clubCheapest(): Promise<Product> {
    const { products } = (await get('/v1/home')).json<HomeResponse>().sections.reduce(
      (acc, s) => ({ products: [...acc.products, ...s.products] }),
      { products: [] as Product[] },
    );
    const found = products.find((p) => {
      const cheapest = p.offers.find((o) => o.id === p.cheapestOfferId);
      return cheapest?.membershipRequired && p.offers.some((o) => o.inStock && !o.membershipRequired);
    });
    if (!found) throw new Error('no club-cheapest product in the mock catalog');
    return found;
  }

  it('zip fills estimatedTax and landedPrice from the state table; no-sales-tax states are 0', async () => {
    const id = 'dash-mini-2-cup-rice-cooker';
    const plain = (await get(`/v1/products/${id}`)).json<ProductResponse>().product;
    const ca = (await get(`/v1/products/${id}?zip=94105`)).json<ProductResponse>().product; // California 8.85%
    const or = (await get(`/v1/products/${id}?zip=97201`)).json<ProductResponse>().product; // Oregon: none
    const zip4 = (await get(`/v1/products/${id}?zip=94105-1234`)).json<ProductResponse>().product;
    const military = (await get(`/v1/products/${id}?zip=09012`)).json<ProductResponse>().product; // maps to no state
    for (const o of plain.offers) {
      const taxed = ca.offers.find((x) => x.id === o.id)!;
      expect(taxed.estimatedTax).toBeCloseTo(o.price * 0.0885, 2);
      expect(taxed.landedPrice).toBeCloseTo(o.totalPrice + taxed.estimatedTax!, 2);
      expect(taxed.totalPrice).toBe(o.totalPrice);
      const untaxed = or.offers.find((x) => x.id === o.id)!;
      expect(untaxed.estimatedTax).toBe(0);
      expect(untaxed.landedPrice).toBe(o.totalPrice);
      expect(military.offers.find((x) => x.id === o.id)!.estimatedTax).toBeNull();
    }
    expect(zip4.offers).toEqual(ca.offers);
    const landed = ca.offers.filter((o) => o.inStock).map((o) => o.landedPrice);
    expect(ca.maxSavings).toBeCloseTo(Math.max(...landed) - Math.min(...landed), 2);
    expect(ca.offers.find((o) => o.id === ca.cheapestOfferId)!.landedPrice).toBe(Math.min(...landed));
  });

  it('memberships: stated non-membership makes club offers ineligible and changes cheapest', async () => {
    const product = await clubCheapest();
    const url = `/v1/products/${product.id}`;
    const unknown = (await get(url)).json<ProductResponse>().product;
    expect(unknown.offers.every((o) => o.eligible)).toBe(true);
    const clubOffer = unknown.offers.find((o) => o.id === unknown.cheapestOfferId)!;
    expect(clubOffer.membershipRequired).toBe(true);

    // "" = the shopper said they hold no memberships.
    const none = (await get(`${url}?memberships=`)).json<ProductResponse>().product;
    for (const o of none.offers) expect(o.eligible).toBe(!o.membershipRequired);
    const cheapest = none.offers.find((o) => o.id === none.cheapestOfferId)!;
    expect(cheapest.membershipRequired).toBe(false);
    expect(none.recommendedOfferId).toBe(cheapest.id);
    expect(none.offers[0]!.id).toBe(cheapest.id);
    // Ineligible offers sit after every eligible in-stock offer and before out-of-stock ones.
    const order = none.offers.map((o) => (!o.inStock ? 2 : o.eligible ? 0 : 1));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const eligibleLanded = none.offers.filter((o) => o.inStock && o.eligible).map((o) => o.landedPrice);
    expect(none.maxSavings).toBeCloseTo(Math.max(...eligibleLanded) - Math.min(...eligibleLanded), 2);

    // Holding that club's membership restores it.
    const member = (await get(`${url}?memberships=${clubOffer.retailerId}`)).json<ProductResponse>().product;
    expect(member.cheapestOfferId).toBe(clubOffer.id);
    expect(member.recommendedOfferId).toBe(clubOffer.id);
    expect(member.offers.find((o) => o.id === clubOffer.id)!.eligible).toBe(true);

    // Same behaviour through search and home.
    const viaSearch = (await get(`/v1/search?q=${encodeURIComponent(product.title)}&memberships=`)).json<SearchResponse>();
    expect(viaSearch.products.find((p) => p.id === product.id)!.cheapestOfferId).toBe(cheapest.id);
    const viaHome = (await get('/v1/home?memberships=')).json<HomeResponse>();
    for (const s of viaHome.sections) for (const p of s.products) for (const o of p.offers) expect(o.eligible).toBe(!o.membershipRequired);
  });

  it('the shared cache stays unpersonalized: context is applied after it', async () => {
    const a = (await get('/v1/search?q=rice%20cooker&zip=94105&memberships=')).json<SearchResponse>();
    const b = (await get('/v1/search?q=rice%20cooker')).json<SearchResponse>();
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true); // same cache entry, different context
    expect(a.products[0]!.offers.some((o) => o.estimatedTax !== null)).toBe(true);
    expect(b.products.every((p) => p.offers.every((o) => o.estimatedTax === null && o.eligible))).toBe(true);
  });
});

describe('GET /v1/lookup (barcode)', () => {
  it('finds a product by UPC in any common spelling, including dropped leading zeros', async () => {
    const { product } = (await get('/v1/products/dash-mini-2-cup-rice-cooker')).json() as ProductResponse;
    const upc = product.gtin!;
    expect(upc).toMatch(/^0\d{11}$/); // mock UPC-A codes start with 0
    const spellings = [upc, upc.replace(/^0+/, ''), `0${upc}`, `00${upc}`, `${upc.slice(0, 1)} ${upc.slice(1, 6)}-${upc.slice(6, 11)} ${upc.slice(11)}`];
    for (const gtin of spellings) {
      const res = await get(`/v1/lookup?gtin=${encodeURIComponent(gtin)}&zip=94105`);
      expect(res.statusCode).toBe(200);
      const body = res.json() as ProductResponse;
      expect(body.product.id).toBe(product.id);
      expect(body.product.priceHistory.length).toBeGreaterThan(0);
      expect(body.product.offers[0]!.estimatedTax).not.toBeNull();
      expect(body.retailers).toHaveLength(7);
    }
  });

  it('404 for an unknown barcode, 400 for a malformed one', async () => {
    expectError(await get('/v1/lookup?gtin=036000291452'), 404, 'not_found'); // valid check digit, not in the catalog
    expectError(await get('/v1/lookup?gtin=036000291453'), 400, 'invalid_request'); // bad check digit
    expectError(await get('/v1/lookup?gtin=12345'), 400, 'invalid_request');
    expectError(await get('/v1/lookup?gtin=abc'), 400, 'invalid_request');
    expectError(await get('/v1/lookup'), 400, 'invalid_request');
    expectError(await get(`/v1/lookup?gtin=${'1'.repeat(15)}`), 400, 'invalid_request');
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
      if (alt && cheapest.inStock && alt.totalPrice > cheapest.totalPrice) return { product: p, cheapest, alt };
    }
    throw new Error('no suitable product in the mock catalog');
  }
  const clicks = (n: number, product: Product, alt: Product['offers'][number], premiumPaid: number): ActivityEvent[] =>
    Array.from({ length: n }, () => ({
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
      premiumPaid,
    }));

  it('events -> heuristic profile -> personalized ranking -> erase kills the token', async () => {
    const { deviceId, token } = await register();
    const { product, cheapest, alt } = await pickTarget();
    const premium = Math.round((alt.totalPrice - cheapest.totalPrice) * 100) / 100;
    const events: ActivityEvent[] = [{ type: 'search', ts: Date.now(), query: 'rice cooker' }, ...clicks(29, product, alt, premium)];
    const res = await postEvents({ events }, token);
    expect(res.json()).toEqual({ accepted: 30 });

    await app.learner.flush();
    const { profile } = (await get('/v1/profile', token)).json() as ProfileResponse;
    expect(profile.source).toBe('heuristic');
    expect(profile.eventCount).toBe(30);
    expect(profile.retailerAffinity[alt.retailerId]).toBeGreaterThan(0.7);
    expect(profile.priceSensitivity).toBeLessThan(0.6);
    expect(profile.maxObservedPremiumPct).toBeCloseTo(premium / cheapest.totalPrice, 3);
    expect(profile.categoryAffinity['Rice Cookers']).toBe(1);
    expect(profile.suggestedQueries).toContain('rice cooker');
    expect(profile.updatedAt).not.toBeNull();

    const personal = (await get('/v1/search?q=rice%20cooker', token)).json() as SearchResponse;
    expect(personal.cached).toBe(true); // provider result is shared; personalization is applied after the cache
    expect(personal.personalized).toBe(true);
    const mine = personal.products.find((p) => p.id === product.id)!;
    expect(mine.recommendedOfferId).toBe(alt.id);
    expect(mine.offers[0]!.id).toBe(alt.id);
    expect(mine.cheapestOfferId).toBe(cheapest.id);
    // The stated figure is the real gap between the two offers.
    const stated = /is \$([\d.]+) more — a store you often choose/.exec(mine.recommendationReason ?? '');
    expect(stated).not.toBeNull();
    expect(Number(stated![1])).toBeCloseTo(alt.totalPrice - cheapest.totalPrice, 2);

    // The premium bound holds on EVERY product: nothing recommended costs more
    // than the cheapest eligible landed price plus the largest premium ever paid.
    const home = (await get('/v1/home', token)).json() as HomeResponse;
    let checked = 0;
    for (const p of [...personal.products, ...home.sections.flatMap((s) => s.products)]) {
      const low = p.offers.find((o) => o.id === p.cheapestOfferId);
      const top = p.offers.find((o) => o.id === p.recommendedOfferId);
      if (!low || !top) continue;
      checked += 1;
      expect(top.landedPrice).toBeLessThanOrEqual(low.landedPrice * (1 + profile.maxObservedPremiumPct) + 0.011);
    }
    expect(checked).toBeGreaterThan(20);

    // Another device (and anonymous requests) still get the neutral ordering.
    const anon = (await get('/v1/search?q=rice%20cooker')).json() as SearchResponse;
    expect(anon.personalized).toBe(false);
    expect(anon.products.find((p) => p.id === product.id)!.recommendedOfferId).toBe(cheapest.id);
    const other = await register();
    expect(((await get('/v1/search?q=rice%20cooker', other.token)).json() as SearchResponse).personalized).toBe(false);

    const detail = (await get(`/v1/products/${product.id}`, token)).json() as ProductResponse;
    expect(detail.product.recommendedOfferId).toBe(alt.id);

    expect(home.sections[0]!.kind).toBe('for_you');
    expect(home.sections[0]!.products[0]!.category).toBe('Rice Cookers');
    expect(home.sections.find((s) => s.kind === 'recent')!.products[0]!.id).toBe(product.id);
    expect(home.sections.find((s) => s.kind === 'category')!.title).toBe('Rice Cookers');

    const suggest = (await get('/v1/suggest?q=', token)).json() as SuggestResponse;
    expect(suggest.suggestions[0]).toBe('rice cooker');

    // Erase: events, profile, alerts, push token AND the device/token.
    await app.fastify.inject({ method: 'PUT', url: '/v1/push-token', payload: { token: 'ExponentPushToken[abcdefghijklmnop]' }, headers: bearer(token) });
    await app.fastify.inject({ method: 'POST', url: '/v1/alerts', payload: { productId: product.id, targetPrice: 1 }, headers: bearer(token) });
    expect(store.countAlerts(deviceId)).toBe(1);
    const erased = await del('/v1/profile', token);
    expect(erased.json()).toEqual({ deleted: true });
    expect(store.storedEventCount(deviceId)).toBe(0);
    expect(store.getRow(deviceId)).toBeNull();
    expect(store.countAlerts(deviceId)).toBe(0);
    expect(store.getPushToken(deviceId)).toBeNull();
    expect(store.deviceByTokenHash(hashToken(token))).toBeNull();
    expectError(await get('/v1/profile', token), 401, 'unauthorized');
    expectError(await get('/v1/search?q=rice%20cooker', token), 401, 'unauthorized');
    expectError(await postEvents({ events }, token), 401, 'unauthorized');
    // The other device is untouched.
    expect((await get('/v1/profile', other.token)).statusCode).toBe(200);
  });

  it('paying a small premium never unlocks a large one (end to end)', async () => {
    const { token } = await register();
    const { product, alt } = await pickTarget();
    // 30 clicks at this store, each paying about $1 over a $100 cheapest price (1%).
    const events = clicks(30, product, alt, 1).map((e) => ({ ...e, price: 101 }));
    await postEvents({ events }, token);
    await app.learner.flush();
    const { profile } = (await get('/v1/profile', token)).json() as ProfileResponse;
    expect(profile.maxObservedPremiumPct).toBeCloseTo(0.01, 4);
    expect(profile.retailerAffinity[alt.retailerId]).toBeGreaterThan(0.7);

    const home = (await get('/v1/home', token)).json() as HomeResponse;
    const search = (await get('/v1/search?q=tv&limit=50', token)).json() as SearchResponse;
    let checked = 0;
    for (const p of [...search.products, ...home.sections.flatMap((s) => s.products)]) {
      const low = p.offers.find((o) => o.id === p.cheapestOfferId);
      const top = p.offers.find((o) => o.id === p.recommendedOfferId);
      if (!low || !top) continue;
      checked += 1;
      expect(top.landedPrice - low.landedPrice).toBeLessThanOrEqual(low.landedPrice * 0.01 + 0.011);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('explicitly stated memberships override the memberships inferred by the profile', async () => {
    const { token } = await register();
    // Three club clicks: the profile infers a Costco membership.
    const events: ActivityEvent[] = Array.from({ length: 3 }, () => ({ type: 'offer_click', ts: Date.now(), retailerId: 'costco', price: 50, wasCheapest: true }));
    await postEvents({ events }, token);
    await app.learner.flush();
    expect(((await get('/v1/profile', token)).json() as ProfileResponse).profile.memberships).toEqual(['costco']);
    const home = (await get('/v1/home?memberships=', token)).json() as HomeResponse;
    let clubOffers = 0;
    for (const p of home.sections.flatMap((s) => s.products)) {
      for (const o of p.offers) if (o.retailerId === 'costco') {
        clubOffers += 1;
        expect(o.eligible).toBe(false);
        expect(p.recommendedOfferId).not.toBe(o.id);
        expect(p.cheapestOfferId).not.toBe(o.id);
      }
    }
    expect(clubOffers).toBeGreaterThan(0);
  });

  it('does not block the response on profile learning, and erasing cancels pending work', async () => {
    await restart({ profileDebounceMs: 60_000 });
    const { deviceId, token } = await register();
    const res = await postEvents({ events: [{ type: 'offer_click', ts: Date.now(), retailerId: 'target' }] }, token);
    expect(res.statusCode).toBe(200);
    // Stored immediately, but no profile has been computed yet.
    expect(store.storedEventCount(deviceId)).toBe(1);
    expect(((await get('/v1/profile', token)).json() as ProfileResponse).profile).toMatchObject({ source: 'none', eventCount: 1 });
    await del('/v1/profile', token);
    await app.learner.flush();
    expect(store.getRow(deviceId)).toBeNull();
  });

  it('GET /v1/profile for a new device is empty with source none', async () => {
    const { token } = await register();
    const { profile } = (await get('/v1/profile', token)).json() as ProfileResponse;
    expect(profile).toMatchObject({ eventCount: 0, source: 'none', updatedAt: null, retailerAffinity: {}, memberships: [], maxObservedPremiumPct: 0 });
  });

  it('prunes the oldest events beyond the per-device cap but keeps the lifetime count', () => {
    const s = new Store(':memory:', 100);
    const id = 'device-prune-0001';
    for (let i = 0; i < 3; i++) s.insertEvents(id, Array.from({ length: 60 }, (_, j) => ({ type: 'search', ts: 1e12 + i * 100 + j, query: `q${i}-${j}` })));
    expect(s.storedEventCount(id)).toBe(100);
    expect(s.getRow(id)!.totalEvents).toBe(180);
    expect(s.recentEvents(id, 1)[0]!.query).toBe('q2-59');
    s.close();
  });
});
