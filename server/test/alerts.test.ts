import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAlerts } from '../src/alerts.js';
import { buildApp, type App } from '../src/app.js';
import type { Config } from '../src/config.js';
import type { AlertResponse, AlertsResponse, ProductResponse, RegisterDeviceResponse } from '../src/contract.js';
import { Store } from '../src/db.js';
import { MockProvider } from '../src/providers/mock/index.js';
import { EXPO_PUSH_URL, ExpoPushSender, NoopPushSender, type PushMessage, type PushSender } from '../src/push.js';
import { testConfig } from './helpers.js';

const PRODUCT = 'dash-mini-2-cup-rice-cooker';
const PUSH_TOKEN = 'ExponentPushToken[AbCdEfGhIjKlMnOpQrStUv]';

let app: App;
let store: Store;
let mock: MockProvider;
let sent: PushMessage[][];
let invalid: string[];
const push: PushSender = {
  send: async (messages) => {
    sent.push(messages);
    return { invalidTokens: invalid };
  },
};

async function start(overrides: Partial<Config> = {}) {
  store = new Store(':memory:');
  mock = new MockProvider({ catalog: 'general' });
  sent = [];
  invalid = [];
  app = await buildApp({ config: testConfig(overrides), store, providers: [mock], push });
}
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown) =>
  app.fastify.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
const register = async () => (await call('POST', '/v1/devices')).json() as RegisterDeviceResponse;
const best = async (query = '') => {
  const { product } = (await call('GET', `/v1/products/${PRODUCT}${query}`)).json() as ProductResponse;
  return product.offers.find((o) => o.id === product.cheapestOfferId)!;
};
/** Drop one retailer's price and make the catalog see it now. */
function dropPrice(retailerId: Parameters<MockProvider['setPriceOverride']>[1], price: number) {
  expect(mock.setPriceOverride(PRODUCT, retailerId, price)).toBe(true);
  app.catalog.clearCache();
}

beforeEach(() => start());
afterEach(async () => {
  await app.fastify.close();
  store.close();
});

describe('price alerts API', () => {
  it('create -> list -> delete, with fresh current prices', async () => {
    const { token } = await register();
    const cheapest = await best();
    const res = await call('POST', '/v1/alerts', token, { productId: PRODUCT, targetPrice: 5 });
    expect(res.statusCode).toBe(200);
    const { alert } = res.json() as AlertResponse;
    expect(alert).toMatchObject({
      productId: PRODUCT,
      productTitle: 'Dash Mini 2-Cup Rice Cooker',
      targetPrice: 5,
      priceAtCreation: cheapest.landedPrice,
      currentBestPrice: cheapest.landedPrice,
      currentBestRetailerId: cheapest.retailerId,
      status: 'active',
      triggeredAt: null,
    });
    expect(alert.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(alert.createdAt)).toBeGreaterThan(Date.now() - 5000);

    expect(((await call('GET', '/v1/alerts', token)).json() as AlertsResponse).alerts).toEqual([alert]);

    // GET reports the CURRENT best price, not the one at creation.
    const other = cheapest.retailerId;
    dropPrice(other, 7.5);
    const fresh = ((await call('GET', '/v1/alerts', token)).json() as AlertsResponse).alerts[0]!;
    expect(fresh.currentBestPrice).toBeCloseTo(7.5 + (cheapest.shipping ?? 0), 2);
    expect(fresh.priceAtCreation).toBe(cheapest.landedPrice);
    expect(fresh.status).toBe('active'); // only the checker triggers

    expect((await call('DELETE', `/v1/alerts/${alert.id}`, token)).json()).toEqual({ deleted: true });
    expect((await call('DELETE', `/v1/alerts/${alert.id}`, token)).statusCode).toBe(404);
    expect(((await call('GET', '/v1/alerts', token)).json() as AlertsResponse).alerts).toEqual([]);
  });

  it('validates input and scopes alerts to the device', async () => {
    const a = await register();
    const b = await register();
    expect((await call('POST', '/v1/alerts', a.token, { productId: 'nope', targetPrice: 5 })).statusCode).toBe(404);
    for (const bad of [{ productId: PRODUCT }, { productId: PRODUCT, targetPrice: 0 }, { productId: PRODUCT, targetPrice: -1 }, { productId: PRODUCT, targetPrice: 'x' },
      { productId: 'bad id!', targetPrice: 5 }, { productId: PRODUCT, targetPrice: 5, zip: '1' }, { productId: PRODUCT, targetPrice: 5, memberships: ['ebay'] }]) {
      expect((await call('POST', '/v1/alerts', a.token, bad)).statusCode).toBe(400);
    }
    const { alert } = (await call('POST', '/v1/alerts', a.token, { productId: PRODUCT, targetPrice: 5 })).json() as AlertResponse;
    expect(((await call('GET', '/v1/alerts', b.token)).json() as AlertsResponse).alerts).toEqual([]);
    expect((await call('DELETE', `/v1/alerts/${alert.id}`, b.token)).statusCode).toBe(404);
    expect((await call('DELETE', '/v1/alerts/!!', a.token)).statusCode).toBe(400);
    expect(store.countAlerts(a.deviceId)).toBe(1);
  });

  it('caps alerts per device; a second alert for the same product replaces the first', async () => {
    await app.fastify.close();
    store.close();
    await start({ maxAlertsPerDevice: 2 });
    const { token, deviceId } = await register();
    const ids = (await mock.browse()).filter((p) => p.offers.some((o) => o.inStock)).slice(0, 3).map((p) => p.id);
    expect((await call('POST', '/v1/alerts', token, { productId: ids[0], targetPrice: 5 })).statusCode).toBe(200);
    expect((await call('POST', '/v1/alerts', token, { productId: ids[1], targetPrice: 5 })).statusCode).toBe(200);
    const over = await call('POST', '/v1/alerts', token, { productId: ids[2], targetPrice: 5 });
    expect(over.statusCode).toBe(409);
    expect((over.json() as { error: { code: string } }).error.code).toBe('alert_limit_reached');
    // Re-targeting an existing product is still allowed at the cap and does not add a row.
    const again = await call('POST', '/v1/alerts', token, { productId: ids[0], targetPrice: 9 });
    expect(again.statusCode).toBe(200);
    expect(store.countAlerts(deviceId)).toBe(2);
    const list = ((await call('GET', '/v1/alerts', token)).json() as AlertsResponse).alerts;
    expect(list.find((a) => a.productId === ids[0])!.targetPrice).toBe(9);
  });

  it('prices an alert under its own zip and memberships', async () => {
    const { token } = await register();
    const taxed = await best('?zip=94105&memberships=');
    const { alert } = (await call('POST', '/v1/alerts', token, { productId: PRODUCT, targetPrice: 5, zip: '94105', memberships: [] })).json() as AlertResponse;
    expect(alert.priceAtCreation).toBe(taxed.landedPrice);
    expect(taxed.estimatedTax).toBeGreaterThan(0);
    expect(taxed.membershipRequired).toBe(false);
    const stored = store.alertsForDevice((await store.activeAlerts('', 10))[0]!.deviceId)[0]!;
    expect(stored).toMatchObject({ zip: '94105', memberships: [] });
  });

  it('PUT /v1/push-token validates the Expo token format, sets and clears', async () => {
    const { token, deviceId } = await register();
    for (const bad of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[has space]', 'fcm:AAAA', 'ExponentPushToken[abc', 12]) {
      expect((await call('PUT', '/v1/push-token', token, { token: bad })).statusCode).toBe(400);
    }
    expect((await call('PUT', '/v1/push-token', token, {})).statusCode).toBe(400);
    expect((await call('PUT', '/v1/push-token', token, { token: PUSH_TOKEN })).json()).toEqual({ ok: true });
    expect(store.getPushToken(deviceId)).toBe(PUSH_TOKEN);
    expect((await call('PUT', '/v1/push-token', token, { token: 'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })).statusCode).toBe(200);
    // The same push token registered by another install moves to it.
    const other = await register();
    await call('PUT', '/v1/push-token', other.token, { token: 'ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]' });
    expect(store.getPushToken(deviceId)).toBeNull();
    expect(store.getPushToken(other.deviceId)).toBe('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]');
    expect((await call('PUT', '/v1/push-token', other.token, { token: null })).statusCode).toBe(200);
    expect(store.getPushToken(other.deviceId)).toBeNull();
  });
});

describe('alert checker', () => {
  it('triggers when the best eligible landed price reaches the target, once, and pushes', async () => {
    const withPush = await register();
    const noPush = await register();
    await call('PUT', '/v1/push-token', withPush.token, { token: PUSH_TOKEN });
    const cheapest = await best();
    const target = Math.round((cheapest.landedPrice - 3) * 100) / 100;
    await call('POST', '/v1/alerts', withPush.token, { productId: PRODUCT, targetPrice: target });
    await call('POST', '/v1/alerts', noPush.token, { productId: PRODUCT, targetPrice: target });
    await call('POST', '/v1/alerts', noPush.token, { productId: 'aroma-arc-914sbd-8-cup-digital-rice-cooker-and-food-steamer', targetPrice: 1 });

    // Nothing has dropped yet.
    expect(await app.checkAlerts()).toEqual({ checked: 3, triggered: 0, pushed: 0 });
    expect(sent).toEqual([]);

    // Price override: the mock's static price drops below the target.
    const newPrice = Math.round((target - (cheapest.shipping ?? 0) - 1) * 100) / 100;
    dropPrice(cheapest.retailerId, newPrice);
    const before = Date.now();
    expect(await app.checkAlerts()).toEqual({ checked: 3, triggered: 2, pushed: 1 });

    const mine = ((await call('GET', '/v1/alerts', withPush.token)).json() as AlertsResponse).alerts[0]!;
    expect(mine.status).toBe('triggered');
    expect(Date.parse(mine.triggeredAt!)).toBeGreaterThanOrEqual(before - 1000);
    expect(mine.currentBestPrice).toBeLessThanOrEqual(target);
    expect(mine.currentBestRetailerId).toBe(cheapest.retailerId);
    const theirs = ((await call('GET', '/v1/alerts', noPush.token)).json() as AlertsResponse).alerts;
    expect(theirs.map((a) => a.status).sort()).toEqual(['active', 'triggered']);

    // Exactly one push, only to the device that registered a token.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({ to: PUSH_TOKEN, title: 'Price drop', data: { type: 'price_alert', alertId: mine.id, productId: PRODUCT } });
    expect(sent[0]![0]!.body).toContain('Dash Mini 2-Cup Rice Cooker');
    expect(sent[0]![0]!.body).toContain(`$${mine.currentBestPrice!.toFixed(2)}`);

    // A triggered alert does not fire again.
    expect(await app.checkAlerts()).toEqual({ checked: 1, triggered: 0, pushed: 0 });
    expect(sent).toHaveLength(1);
  });

  it('respects the alert context: an ineligible club price or a pre-tax price does not trigger', async () => {
    const { token } = await register();
    const { product } = (await call('GET', `/v1/products/${PRODUCT}`)).json() as ProductResponse;
    const nonClub = product.offers.find((o) => !o.membershipRequired && o.inStock)!;
    // Landed target of $20 in California (8.85%): an item price of $19 lands at 19 + 1.68 + shipping > 20.
    await call('POST', '/v1/alerts', token, { productId: PRODUCT, targetPrice: 20, zip: '94105', memberships: [] });
    dropPrice(nonClub.retailerId, 19);
    const landed = 19 + Math.round(19 * 0.0885 * 100) / 100 + (nonClub.shipping ?? 0);
    expect(landed).toBeGreaterThan(20);
    expect((await app.checkAlerts()).triggered).toBe(0);
    const club = product.offers.find((o) => o.membershipRequired);
    if (club) {
      dropPrice(club.retailerId, 1); // unbeatable, but the shopper said they hold no membership
      expect((await app.checkAlerts()).triggered).toBe(0);
    }
    dropPrice(nonClub.retailerId, 10);
    expect((await app.checkAlerts()).triggered).toBe(1);
  });

  it('survives a failing upstream and a throwing push sender, and forgets dead push tokens', async () => {
    const { token, deviceId } = await register();
    await call('PUT', '/v1/push-token', token, { token: PUSH_TOKEN });
    await call('POST', '/v1/alerts', token, { productId: PRODUCT, targetPrice: 10_000 });
    const down = { product: async () => Promise.reject(new Error('upstream down')) } as unknown as App['catalog'];
    expect(await checkAlerts({ store, catalog: down, push })).toEqual({ checked: 1, triggered: 0, pushed: 0 });

    const log = vi.fn();
    const throwing: PushSender = { send: async () => Promise.reject(new Error('boom')) };
    const r = await checkAlerts({ store, catalog: app.catalog, push: throwing, log });
    expect(r.triggered).toBe(1); // state is saved before the push is attempted
    expect(log).toHaveBeenCalledWith('alert check failed', expect.anything());

    await call('POST', '/v1/alerts', token, { productId: PRODUCT, targetPrice: 10_000 });
    invalid = [PUSH_TOKEN];
    await app.checkAlerts();
    expect(store.getPushToken(deviceId)).toBeNull();
  });

  it('pages through many alerts', async () => {
    const { deviceId } = await register();
    const ids = (await mock.browse()).slice(0, 7).map((p) => p.id);
    ids.forEach((productId, i) =>
      store.createAlert({ id: `alert-${String(i).padStart(4, '0')}`, deviceId, productId, productTitle: 't', targetPrice: 1_000_000, priceAtCreation: 1, zip: null, memberships: null, createdAt: Date.now() }),
    );
    const r = await checkAlerts({ store, catalog: app.catalog, push, pageSize: 3 });
    expect(r.checked).toBe(7);
    expect(r.triggered).toBe((await mock.browse()).slice(0, 7).filter((p) => p.offers.some((o) => o.inStock)).length);
  });

  it('the background checker runs on ALERT_CHECK_INTERVAL_MS and is off in tests by default', async () => {
    expect(testConfig().alertCheckIntervalMs).toBe(0);
    await app.fastify.close();
    store.close();
    await start({ alertCheckIntervalMs: 30 });
    const { token } = await register();
    await call('POST', '/v1/alerts', token, { productId: PRODUCT, targetPrice: 10_000 });
    await vi.waitFor(async () => {
      const { alerts } = (await call('GET', '/v1/alerts', token)).json() as AlertsResponse;
      expect(alerts[0]!.status).toBe('triggered');
    }, { timeout: 2000, interval: 20 });
  });
});

describe('ExpoPushSender', () => {
  const messages = (n: number): PushMessage[] => Array.from({ length: n }, (_, i) => ({ to: `ExponentPushToken[token-number-${i}]`, title: 'Price drop', body: `b${i}` }));
  const okResponse = (tickets: unknown[]) => ({ ok: true, status: 200, json: async () => ({ data: tickets }) }) as Response;

  it('POSTs batches of at most 100 to the Expo push endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => okResponse((JSON.parse(init!.body as string) as unknown[]).map(() => ({ status: 'ok' }))));
    const sender = new ExpoPushSender({ timeoutMs: 1000, accessToken: 'expo-secret', fetch: fetchMock as unknown as typeof fetch });
    expect(await sender.send(messages(230))).toEqual({ invalidTokens: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(([, init]) => (JSON.parse(init!.body as string) as unknown[]).length);
    expect(sizes).toEqual([100, 100, 30]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(EXPO_PUSH_URL);
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(init!.method).toBe('POST');
    expect(init!.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer expo-secret' });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect((JSON.parse(init!.body as string) as Array<Record<string, unknown>>)[0]).toMatchObject({ to: 'ExponentPushToken[token-number-0]', title: 'Price drop', body: 'b0' });
  });

  it('swallows errors, logs without tokens, and reports unregistered devices', async () => {
    const log = vi.fn();
    const failing = new ExpoPushSender({ timeoutMs: 1000, log, fetch: (async () => Promise.reject(new Error('ECONNRESET ExponentPushToken[token-number-0]'))) as unknown as typeof fetch });
    expect(await failing.send(messages(2))).toEqual({ invalidTokens: [] });
    const http500 = new ExpoPushSender({ timeoutMs: 1000, log, fetch: (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch });
    expect(await http500.send(messages(1))).toEqual({ invalidTokens: [] });
    const tickets = new ExpoPushSender({
      timeoutMs: 1000,
      log,
      fetch: (async () => okResponse([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'MessageRateExceeded' } }])) as unknown as typeof fetch,
    });
    expect(await tickets.send(messages(3))).toEqual({ invalidTokens: ['ExponentPushToken[token-number-1]'] });
    expect(log).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(log.mock.calls)).not.toContain('ExponentPushToken');
  });

  it('times out a hanging request', async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)))) as unknown as typeof fetch;
    const log = vi.fn();
    const started = Date.now();
    expect(await new ExpoPushSender({ timeoutMs: 30, fetch: hanging, log }).send(messages(1))).toEqual({ invalidTokens: [] });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('the no-op sender does nothing', async () => {
    expect(await new NoopPushSender().send()).toEqual({ invalidTokens: [] });
  });
});
