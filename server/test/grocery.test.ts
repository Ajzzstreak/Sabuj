import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseAskRules } from '../src/ask/rules.js';
import { buildApp, type App } from '../src/app.js';
import { Catalog } from '../src/catalog.js';
import { loadConfig, type Config } from '../src/config.js';
import type {
  ActivityEvent,
  AlertResponse,
  AskResponse,
  HomeResponse,
  ProductResponse,
  ProfileResponse,
  RegisterDeviceResponse,
  RetailerId,
  SearchResponse,
  StoresResponse,
  SuggestResponse,
} from '../src/contract.js';
import { Store } from '../src/db.js';
import { normalizeGtin } from '../src/gtin.js';
import { buildHeuristicProfile } from '../src/profile/heuristic.js';
import { createProviders } from '../src/providers/index.js';
import { MockProvider } from '../src/providers/mock/index.js';
import { mockStoreRetailer, mockStores, storePriceFactor } from '../src/providers/mock/stores.js';
import type { PriceProvider, ProviderProduct } from '../src/providers/types.js';
import { personalizeProduct } from '../src/ranking.js';
import { RETAILER_IDS, RETAILERS } from '../src/retailers.js';
import { comparableSizes, dimensionOf, parseSize, sameSize } from '../src/size.js';
import { NOW, providerOffer, testConfig } from './helpers.js';

const catalogOpts = { providerTimeoutMs: 500, cacheMaxEntries: 200, cacheTtlMs: 60_000, cacheSwrMs: 60_000 };
const mock = new MockProvider();
/** Every grocery product, including store-brand siblings that search collapses. */
const allProducts = (m: MockProvider = mock): ProviderProduct[] => [...(m as unknown as { products: Map<string, ProviderProduct> }).products.values()];
const STORE_LABELS: Partial<Record<RetailerId, string[]>> = {
  walmart: ['Great Value', "Parent's Choice"],
  kroger: ['Kroger', 'Comforts'],
  target: ['Good & Gather', 'up & up'],
  costco: ['Kirkland Signature'],
  samsclub: ["Member's Mark"],
};

describe('Kroger as a retailer', () => {
  it('is enumerated everywhere retailers are', () => {
    expect(RETAILER_IDS).toContain('kroger');
    expect(RETAILERS.find((r) => r.id === 'kroger')).toEqual({ id: 'kroger', name: 'Kroger', color: '#084999', membershipRequired: false });
    expect(parseAskRules('milk at kroger')).toMatchObject({ retailers: ['kroger'], query: 'milk' });
    expect(parseAskRules("eggs from Kroger's or walmart").retailers).toEqual(['walmart', 'kroger']);
    expect(parseAskRules('bread not at kroger').retailers).not.toContain('kroger');
  });
});

describe('mock grocery catalog (default)', () => {
  it('is the default, with at least 120 products across the 12 grocery aisles', async () => {
    const all = allProducts();
    expect(all.length).toBeGreaterThanOrEqual(120);
    const categories = new Set(all.map((p) => p.category));
    expect([...categories].sort()).toEqual(
      ['Baby', 'Bakery', 'Beverages', 'Breakfast', 'Canned Goods', 'Dairy & Eggs', 'Frozen', 'Household', 'Meat & Seafood', 'Pantry', 'Produce', 'Snacks'],
    );
    for (const c of categories) expect(all.filter((p) => p.category === c).length, c).toBeGreaterThanOrEqual(5);
    // Staples the brief names.
    for (const q of ['rice', 'pasta', 'beans', 'flour', 'oil', 'milk', 'eggs', 'bread', 'chicken', 'diapers', 'paper towels', 'bananas', 'cereal', 'frozen pizza']) {
      expect((await mock.search(q, { limit: 5 })).length, q).toBeGreaterThan(0);
    }
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.gtin)).size).toBe(all.length);
  });

  it('every product and offer is well formed: size, unit dimension, demo source, in-store price', () => {
    for (const p of allProducts()) {
      expect(p.size, p.id).not.toBeNull();
      expect(normalizeGtin(p.gtin), p.id).not.toBeNull();
      expect(p.imageUrl).toBeNull();
      expect(p.offers.length, p.id).toBeGreaterThanOrEqual(1);
      expect(new Set(p.offers.map((o) => o.retailerId)).size).toBe(p.offers.length);
      for (const o of p.offers) {
        expect(o.retailerId).not.toBe('bestbuy'); // Best Buy sells no groceries
        expect(o.priceSource).toBe('demo');
        expect(o.price).toBeGreaterThan(0);
        expect(o.price).toBeLessThan(80);
        expect(o.shipping).toBe(0);
        expect(o.totalPrice).toBe(o.price);
        expect(o.storeId).toBeNull(); // national until a store is selected
        expect(o.size).not.toBeNull();
        expect(o.membershipRequired).toBe(o.retailerId === 'costco' || o.retailerId === 'samsclub');
        if (o.listPrice !== null) expect(o.listPrice).toBeGreaterThan(o.price);
        expect(o.productId).toBe(p.id);
        expect(o.id).toBe(`${p.id}:${o.retailerId}`);
      }
    }
  });

  it('national brands are the same item everywhere: exact offers, one size, no offerTitle', () => {
    const nationals = allProducts().filter((p) => !p.isStoreBrand);
    expect(nationals.length).toBeGreaterThanOrEqual(80);
    for (const p of nationals) {
      for (const o of p.offers) {
        expect(o.matchType, p.id).toBe('exact');
        expect(o.offerTitle).toBeNull();
        expect(sameSize(o.size, p.size)).toBe(true);
        expect(['walmart', 'kroger', 'target', 'amazon']).toContain(o.retailerId);
      }
      expect(p.offers.some((o) => o.retailerId === 'walmart' || o.retailerId === 'kroger')).toBe(true);
    }
    // Amazon only ships shelf-stable aisles.
    const fresh = new Set(['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Frozen']);
    for (const p of nationals) if (fresh.has(p.category)) expect(p.offers.some((o) => o.retailerId === 'amazon')).toBe(false);
  });

  it('store brands: one exact offer at their own retailer, equivalents pointing at the OTHER stores\' own counterpart', () => {
    const all = allProducts();
    const byTitle = new Map(all.map((p) => [p.title, p]));
    const storeBrands = all.filter((p) => p.isStoreBrand);
    expect(storeBrands.length).toBeGreaterThanOrEqual(120);
    let equivalents = 0;
    let differentSize = 0;
    for (const p of storeBrands) {
      const exact = p.offers.filter((o) => o.matchType === 'exact');
      expect(exact, p.id).toHaveLength(1);
      const home = exact[0]!.retailerId;
      expect(STORE_LABELS[home]).toContain(p.brand);
      expect(p.highlights).toContain('Store brand');
      for (const o of p.offers.filter((x) => x.matchType === 'equivalent')) {
        equivalents += 1;
        expect(o.retailerId).not.toBe(home);
        // It names a real product of that retailer's own label...
        const counterpart = byTitle.get(o.offerTitle!);
        expect(counterpart, `${p.id} -> ${o.offerTitle}`).toBeDefined();
        expect(counterpart!.isStoreBrand).toBe(true);
        expect(STORE_LABELS[o.retailerId]).toContain(counterpart!.brand);
        // ...of the same kind: same aisle, same unit dimension, same item name after the brand...
        expect(counterpart!.category).toBe(p.category);
        expect(comparableSizes(o.size, p.size)).toBe(true);
        const kind = (title: string, brand: string) => title.slice(brand.length + 1).split(',')[0];
        expect(kind(counterpart!.title, counterpart!.brand)).toBe(kind(p.title, p.brand));
        // ...sold at exactly the counterpart's own price, size and stock state.
        const own = counterpart!.offers.find((x) => x.matchType === 'exact')!;
        expect(own.retailerId).toBe(o.retailerId);
        expect([o.price, o.listPrice, o.inStock, o.rating]).toEqual([own.price, own.listPrice, own.inStock, own.rating]);
        expect(sameSize(o.size, own.size)).toBe(true);
        expect(parseSize(o.offerTitle!)).toEqual(o.size);
        if (!sameSize(o.size, p.size)) differentSize += 1;
      }
    }
    expect(equivalents).toBeGreaterThan(300);
    expect(differentSize).toBeGreaterThan(50); // club packs
  });

  it('Walmart and Kroger carry nearly everything; Target, the clubs and Amazon carry subsets; clubs sell bulk', () => {
    const all = allProducts();
    const share = (r: RetailerId) => all.filter((p) => p.offers.some((o) => o.retailerId === r)).length / all.length;
    expect(share('walmart')).toBeGreaterThan(0.9);
    expect(share('kroger')).toBeGreaterThan(0.9);
    for (const r of ['target', 'costco', 'samsclub', 'amazon'] as const) {
      expect(share(r), r).toBeGreaterThan(0.05);
      expect(share(r), r).toBeLessThan(0.85);
    }
    expect(share('bestbuy')).toBe(0);
    // A club's own product is always a bigger pack than the grocers' version of the same kind.
    for (const p of all.filter((x) => x.brand === 'Kirkland Signature' || x.brand === "Member's Mark")) {
      const grocer = p.offers.find((o) => o.retailerId === 'walmart' || o.retailerId === 'kroger')!;
      expect(grocer, p.id).toBeDefined();
      const amount = (s: ProviderProduct['size']) => (s!.unit === 'lb' ? 16 : s!.unit === 'gal' ? 128 : 1) * s!.amount;
      expect(dimensionOf(p.size!)).toBe(dimensionOf(grocer.size!));
      expect(amount(p.size)).toBeGreaterThan(amount(grocer.size));
    }
  });

  it('is deterministic, and search/browse show one product per store-brand kind', async () => {
    const again = allProducts(new MockProvider());
    expect(again.map((p) => p.offers.map((o) => [o.id, o.price, o.inStock]))).toEqual(allProducts().map((p) => p.offers.map((o) => [o.id, o.price, o.inStock])));

    const hits = await mock.search('whole milk', { limit: 20 });
    expect(hits[0]!.product.title).toBe('Great Value Whole Milk, 1 gal');
    expect(hits.filter((h) => / Whole Milk, /.test(h.product.title) && h.product.isStoreBrand)).toHaveLength(1);
    // Naming a brand selects that brand's product instead.
    expect((await mock.search('kroger whole milk', { limit: 5 }))[0]!.product.title).toBe('Kroger Whole Milk, 1 gal');
    expect((await mock.search('kirkland whole milk', { limit: 5 }))[0]!.product.title).toBe('Kirkland Signature Whole Milk, 2 x 1 gal');
    // Siblings stay reachable by id and barcode.
    const kroger = allProducts().find((p) => p.title === 'Kroger Whole Milk, 1 gal')!;
    expect((await mock.getProduct(kroger.id))!.id).toBe(kroger.id);
    expect((await mock.lookupGtin(normalizeGtin(kroger.gtin)!))!.id).toBe(kroger.id);
    const browse = await mock.browse();
    expect(browse.length).toBeGreaterThanOrEqual(120);
    expect(browse.length).toBeLessThan(allProducts().length);
    expect(browse.filter((p) => / Whole Milk, /.test(p.title) && p.isStoreBrand)).toHaveLength(1);
    // "eggs" finds eggs, not the whole dairy aisle.
    const eggs = await mock.search('eggs', { limit: 20 });
    expect(eggs[0]!.product.title).toBe('Great Value Large White Eggs, 12 ct');
    expect(eggs.some((h) => /Milk|Yogurt|Cheese/.test(h.product.title))).toBe(false);
  });

  it('detail has price history per offer and a truthful description', async () => {
    const d = (await mock.getProduct('great-value-whole-milk-1-gal'))!;
    expect(d.priceHistory).toHaveLength(d.offers.length * 90);
    for (const o of d.offers) expect(d.priceHistory.filter((x) => x.retailerId === o.retailerId).at(-1)!.price).toBe(o.price);
    expect(d.description).toMatch(/store brand/i);
    expect(d.description).toMatch(/demo/i);
    expect(d.reviewSummary).not.toBeNull();
  });

  it('trending queries and suggestions are grocery ones', async () => {
    expect(mock.trending()).toEqual(['milk', 'eggs', 'bread', 'rice', 'pasta', 'chicken breast', 'coffee', 'paper towels', 'bananas', 'cereal']);
    expect(await mock.suggest('', 5)).toEqual(['milk', 'eggs', 'bread', 'rice', 'pasta']);
    const s = await mock.suggest('pa', 8);
    expect(s).toContain('pasta');
    expect(s).toContain('paper towels');
    expect(s.join()).not.toMatch(/rice cooker|macbook/);
  });
});

describe('MOCK_CATALOG switch', () => {
  const titles = async (m: MockProvider, q: string) => (await m.search(q, { limit: 10 })).map((h) => h.product.title);

  it('general = the original catalog, untouched by the new retailer', async () => {
    const general = new MockProvider({ catalog: 'general' });
    const all = allProducts(general);
    expect(all.length).toBeGreaterThanOrEqual(60);
    expect(all.some((p) => p.offers.some((o) => o.retailerId === 'kroger'))).toBe(false);
    expect(all.every((p) => p.size === null && !p.isStoreBrand && p.offers.every((o) => o.matchType === 'exact' && o.size === null))).toBe(true);
    expect((await titles(general, 'rice cooker'))[0]).toMatch(/Rice Cooker/);
    expect((await titles(general, 'whole milk')).some((t) => /Milk/.test(t))).toBe(false);
    expect(general.trending()).toContain('rice cooker');
    expect(await general.stores('45202')).toEqual([]);
    expect(general.storeRetailer('wm-45202-1')).toBeNull();
  });

  it('grocery has no rice cookers; all has both', async () => {
    expect((await titles(mock, 'rice cooker')).some((t) => /Rice Cooker/.test(t))).toBe(false);
    const all = new MockProvider({ catalog: 'all' });
    expect((await titles(all, 'rice cooker')).some((t) => /Rice Cooker/.test(t))).toBe(true);
    expect((await titles(all, 'whole milk'))[0]).toBe('Great Value Whole Milk, 1 gal');
    expect(allProducts(all).length).toBe(allProducts().length + allProducts(new MockProvider({ catalog: 'general' })).length);
    expect(all.trending()).toEqual(expect.arrayContaining(['milk', 'rice cooker']));
  });

  it('is read from the environment, default grocery', async () => {
    expect(loadConfig({}).mockCatalog).toBe('grocery');
    expect(loadConfig({ MOCK_CATALOG: ' General ' }).mockCatalog).toBe('general');
    expect(() => loadConfig({ MOCK_CATALOG: 'toys' })).toThrow();
    const [general] = createProviders(loadConfig({ MOCK_CATALOG: 'general' }));
    expect((await general!.search('rice cooker', { limit: 1 }))[0]!.product.category).toBe('Rice Cookers');
    const [grocery] = createProviders(loadConfig({}));
    expect((await grocery!.search('milk', { limit: 1 }))[0]!.product.category).toBe('Dairy & Eggs');
    const [scoped] = createProviders(loadConfig({ CATALOG_CATEGORIES: 'Dairy & Eggs' }));
    expect((await scoped!.search('rice', { limit: 5 })).length).toBe(0);
    // Trending is limited to queries that still find something in the scoped aisle.
    expect(scoped!.trending!()).toEqual(expect.arrayContaining(['milk', 'eggs']));
    for (const q of ['rice', 'bananas', 'paper towels', 'chicken breast']) expect(scoped!.trending!()).not.toContain(q);
  });
});

describe('stores', () => {
  it('mock stores: 2-3 per grocery retailer, deterministic, clearly synthetic, nearest first', () => {
    const stores = mockStores('45202');
    expect(mockStores('45202')).toEqual(stores);
    expect(mockStores('94105')).not.toEqual(stores);
    const by = (r: RetailerId) => stores.filter((s) => s.retailerId === r);
    for (const r of ['walmart', 'kroger', 'target', 'costco', 'samsclub'] as const) {
      expect(by(r).length, r).toBeGreaterThanOrEqual(2);
      expect(by(r).length, r).toBeLessThanOrEqual(3);
    }
    expect(by('amazon')).toEqual([]);
    expect(by('bestbuy')).toEqual([]);
    expect(stores.map((s) => s.distanceMiles)).toEqual([...stores.map((s) => s.distanceMiles)].sort((a, b) => a - b));
    for (const s of stores) {
      expect(s.id).toMatch(/^(wm|kr|tg|co|sc)-45202-[1-3]$/);
      expect(mockStoreRetailer(s.id)).toBe(s.retailerId);
      expect(s.name).toMatch(/\(demo\)$/);
      expect(s.address).toMatch(/OH 45202 \(demo address\)$/);
      expect(s.distanceMiles).toBeGreaterThan(0);
      expect(s.distanceMiles).toBeLessThan(40);
    }
    // -1 is the nearest of its chain.
    for (const r of ['walmart', 'kroger'] as const) expect(by(r)[0]!.id).toMatch(/-1$/);
    expect(new Set(stores.map((s) => s.id)).size).toBe(stores.length);
    expect(mockStores('abc')).toEqual([]);
    expect(mockStoreRetailer('wm-45202-9')).toBeNull();
    expect(mockStoreRetailer('zz-45202-1')).toBeNull();
    expect(mockStoreRetailer('kroger-01400943')).toBeNull();
  });

  it('per-store prices: small, deterministic, and the same listing costs the same wherever it appears', () => {
    const f = storePriceFactor('wm-45202-1', 'great-value-whole-milk-1-gal');
    expect(storePriceFactor('wm-45202-1', 'great-value-whole-milk-1-gal')).toBe(f);
    expect(f).toBeGreaterThanOrEqual(0.96);
    expect(f).toBeLessThanOrEqual(1.04);
    const factors = new Set(['wm-45202-1', 'wm-45202-2', 'wm-45202-3', 'wm-94105-1'].map((s) => storePriceFactor(s, 'great-value-whole-milk-1-gal')));
    expect(factors.size).toBe(4);

    const gv = allProducts().find((p) => p.id === 'great-value-whole-milk-1-gal')!;
    const kr = allProducts().find((p) => p.title === 'Kroger Whole Milk, 1 gal')!;
    const national = gv.offers.find((o) => o.retailerId === 'walmart')!;
    const at1 = mock.localizeOffer(national, 'wm-45202-1')!;
    const at2 = mock.localizeOffer(national, 'wm-45202-2')!;
    expect(at1.storeId).toBe('wm-45202-1');
    expect(at1.price).not.toBe(at2.price);
    expect(Math.abs(at1.price / national.price - 1)).toBeLessThanOrEqual(0.045);
    expect(at1.totalPrice).toBe(at1.price);
    // Great Value milk seen from Kroger's product (an equivalent offer) is the same price at the same Walmart.
    const asEquivalent = mock.localizeOffer(kr.offers.find((o) => o.retailerId === 'walmart')!, 'wm-45202-1')!;
    expect(asEquivalent.price).toBe(at1.price);
    expect(asEquivalent.matchType).toBe('equivalent');
    // Wrong chain, foreign store ids and non-demo offers are left alone.
    expect(mock.localizeOffer(national, 'kr-45202-1')).toBeNull();
    expect(mock.localizeOffer(national, 'kroger-01400943')).toBeNull();
    expect(mock.localizeOffer({ ...national, priceSource: 'live' }, 'wm-45202-1')).toBeNull();
    expect(mock.localizeOffer(providerOffer('walmart', 5), 'wm-45202-1')).toBeNull();
  });

  it('catalog.contextFor: nearest store per retailer from zip, explicit ids override, unknown ids ignored', async () => {
    const catalog = new Catalog([mock], catalogOpts);
    expect((await catalog.contextFor(null, null)).stores).toBeUndefined();
    const nearest = (await catalog.contextFor('45202', null)).stores!;
    expect(nearest).toEqual({ walmart: 'wm-45202-1', kroger: 'kr-45202-1', target: 'tg-45202-1', costco: 'co-45202-1', samsclub: 'sc-45202-1' });
    const explicit = (await catalog.contextFor('45202', null, ['kr-45202-2', 'kr-45202-3', 'nope-1', 'wm-10001-2'])).stores!;
    expect(explicit).toEqual({ ...nearest, kroger: 'kr-45202-2', walmart: 'wm-10001-2' });
    // Store ids without a zip: only those retailers are store-priced.
    expect((await catalog.contextFor(null, null, ['kr-45202-2'])).stores).toEqual({ kroger: 'kr-45202-2' });
    expect((await catalog.stores('45202')).map((s) => s.id)).toEqual(mockStores('45202').map((s) => s.id));
  });

  it('the shared cache never leaks store-specific prices between store selections', async () => {
    const catalog = new Catalog([mock], catalogOpts);
    const price = async (zip: string | null, storeIds?: string[]) => {
      const ctx = await catalog.contextFor(zip, null, storeIds);
      const { value, cached } = await catalog.search('whole milk', ctx.stores);
      const p = personalizeProduct(value[0]!.product, undefined, ctx);
      return { cached, offers: Object.fromEntries(p.offers.map((o) => [o.retailerId, [o.price, o.storeId]])) };
    };
    const national = await price(null);
    const a = await price('45202');
    const b = await price('45202', ['wm-45202-2']);
    const c = await price('94105');
    const nationalAgain = await price(null);
    // One cache entry serves them all...
    expect([national.cached, a.cached, b.cached, c.cached, nationalAgain.cached]).toEqual([false, true, true, true, true]);
    // ...and each selection gets its own prices.
    expect(national.offers.walmart![1]).toBeNull();
    expect(a.offers.walmart![1]).toBe('wm-45202-1');
    expect(b.offers.walmart![1]).toBe('wm-45202-2');
    expect(c.offers.walmart![1]).toBe('wm-94105-1');
    expect(new Set([national, a, b, c].map((x) => x.offers.walmart![0])).size).toBe(4);
    expect(b.offers.kroger).toEqual(a.offers.kroger); // only Walmart was switched
    expect(nationalAgain.offers).toEqual(national.offers); // untouched by the store-priced requests
  });

  it('store-scoped providers (prices fetched per location) get the store in their cache key', async () => {
    const calls: Array<string | undefined> = [];
    const scoped: PriceProvider = {
      name: 'scoped',
      storeScopedRetailers: ['kroger'],
      storeRetailer: (id) => (id.startsWith('kroger-') ? 'kroger' : null),
      search: async (_q, o) => {
        calls.push(o.stores?.kroger);
        const product: ProviderProduct = {
          id: 'kro-1', title: 'Milk', brand: 'Kroger', category: 'Dairy', imageUrl: null, gtin: null, size: null, isStoreBrand: true, highlights: [],
          offers: [providerOffer('kroger', o.stores?.kroger === 'kroger-2' ? 4 : 3, { id: 'kro-1:kroger', productId: 'kro-1', priceSource: 'live', storeId: o.stores?.kroger ?? null })],
        };
        return [{ product, relevance: 1 }];
      },
      getProduct: async () => null,
      lookupGtin: async () => null,
    };
    const catalog = new Catalog([scoped], catalogOpts);
    const run = async (storeIds?: string[]) => {
      const ctx = await catalog.contextFor(null, null, storeIds);
      const { value, cached } = await catalog.search('milk', ctx.stores);
      return [cached, value[0]!.product.offers[0]!.price, value[0]!.product.offers[0]!.storeId];
    };
    expect(await run(['kroger-1'])).toEqual([false, 3, 'kroger-1']);
    expect(await run(['kroger-2'])).toEqual([false, 4, 'kroger-2']);
    expect(await run(['kroger-1'])).toEqual([true, 3, 'kroger-1']);
    expect(await run()).toEqual([false, 3, null]);
    // A Walmart store does not fragment a cache that only Kroger scopes.
    expect(await run(['wm-45202-1'])).toEqual([true, 3, null]);
    expect(calls).toEqual(['kroger-1', 'kroger-2', undefined]);
  });
});

describe('grocery API', () => {
  let app: App;
  let store: Store;
  let provider: MockProvider;
  const start = async (overrides: Partial<Config> = {}) => {
    store = new Store(':memory:');
    provider = new MockProvider();
    app = await buildApp({ config: testConfig(overrides), store, providers: [provider] });
  };
  const call = (method: 'GET' | 'POST', url: string, token?: string, payload?: unknown) =>
    app.fastify.inject({ method, url, payload: payload as object, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const register = async () => (await call('POST', '/v1/devices')).json() as RegisterDeviceResponse;
  beforeEach(() => start());
  afterEach(async () => {
    await app.fastify.close();
    store.close();
  });

  it('GET /v1/stores', async () => {
    const res = await call('GET', '/v1/stores?zip=45202-1234');
    expect(res.statusCode).toBe(200);
    const body = res.json() as StoresResponse;
    expect(body.zip).toBe('45202');
    expect(body.stores.map((s) => s.id)).toEqual(mockStores('45202').map((s) => s.id));
    expect(Object.keys(body.stores[0]!).sort()).toEqual(['address', 'distanceMiles', 'id', 'name', 'retailerId']);
    expect((await call('GET', '/v1/stores')).statusCode).toBe(400);
    expect((await call('GET', '/v1/stores?zip=abc')).statusCode).toBe(400);
    expect((await call('GET', '/v1/stores?zip=45202', 'dl_' + 'x'.repeat(43))).statusCode).toBe(401);
  });

  it('search returns sizes, unit prices, store ids and equivalent offers', async () => {
    const national = (await call('GET', '/v1/search?q=whole%20milk')).json() as SearchResponse;
    const milk = national.products[0]!;
    expect(milk).toMatchObject({ title: 'Great Value Whole Milk, 1 gal', size: { amount: 1, unit: 'gal' }, isStoreBrand: true, brand: 'Great Value' });
    expect(national.retailers.map((r) => r.id)).toContain('kroger');
    for (const o of milk.offers) {
      expect(o.storeId).toBeNull();
      expect(o.unitLabel).toBe('per fl oz');
      expect(o.unitPrice).toBeCloseTo(o.price / (o.size!.unit === 'gal' ? o.size!.amount * 128 : o.size!.amount), 3);
    }
    const walmart = milk.offers.find((o) => o.retailerId === 'walmart')!;
    const kroger = milk.offers.find((o) => o.retailerId === 'kroger')!;
    expect(walmart).toMatchObject({ matchType: 'exact', offerTitle: null });
    expect(kroger).toMatchObject({ matchType: 'equivalent', offerTitle: 'Kroger Whole Milk, 1 gal', size: { amount: 1, unit: 'gal' } });

    const local = ((await call('GET', '/v1/search?q=whole%20milk&zip=45202')).json() as SearchResponse).products[0]!;
    const picked = ((await call('GET', '/v1/search?q=whole%20milk&zip=45202&storeIds=kr-45202-2,wm-45202-3')).json() as SearchResponse).products[0]!;
    const of = (p: typeof milk, r: RetailerId) => p.offers.find((o) => o.retailerId === r)!;
    expect(of(local, 'walmart').storeId).toBe('wm-45202-1');
    expect(of(local, 'kroger').storeId).toBe('kr-45202-1');
    expect(of(picked, 'kroger').storeId).toBe('kr-45202-2');
    expect(of(picked, 'kroger').price).not.toBe(of(local, 'kroger').price);
    expect(of(local, 'kroger').price).not.toBe(kroger.price);
    expect(of(local, 'kroger').estimatedTax).not.toBeNull(); // zip also still drives the tax estimate
    expect(of(picked, 'target')).toEqual(of(local, 'target')); // not overridden: nearest Target either way
    // storeIds without zip.
    const only = ((await call('GET', '/v1/search?q=whole%20milk&storeIds=kr-45202-2')).json() as SearchResponse).products[0]!;
    expect(of(only, 'kroger').storeId).toBe('kr-45202-2');
    expect(of(only, 'walmart').storeId).toBeNull();
    expect(of(only, 'kroger').estimatedTax).toBeNull();
    expect((await call('GET', '/v1/search?q=milk&storeIds=bad%20id!')).statusCode).toBe(400);
    expect((await call('GET', '/v1/search?q=milk&storeIds=unknown-store-9')).statusCode).toBe(200); // well-formed but unknown: ignored
  });

  it('cheapest by unit price can differ from cheapest by shelf price, on every route', async () => {
    const { sections } = (await call('GET', '/v1/home?zip=45202')).json() as HomeResponse;
    const candidates = sections.flatMap((s) => s.products);
    const found = candidates.find((p) => {
      const cheapest = p.offers.find((o) => o.id === p.cheapestOfferId);
      const shelf = [...p.offers].filter((o) => o.inStock && o.eligible).sort((a, b) => a.landedPrice - b.landedPrice)[0];
      return cheapest && shelf && cheapest.id !== shelf.id;
    });
    expect(found).toBeDefined();
    const p = ((await call('GET', `/v1/products/${found!.id}?zip=45202`)).json() as ProductResponse).product;
    const rankable = p.offers.filter((o) => o.inStock && o.eligible);
    const perUnit = (o: (typeof rankable)[number]) => o.landedPrice / ((o.size!.unit === 'lb' ? 16 : o.size!.unit === 'gal' ? 128 : 1) * o.size!.amount);
    const cheapest = p.offers.find((o) => o.id === p.cheapestOfferId)!;
    expect(perUnit(cheapest)).toBe(Math.min(...rankable.map(perUnit)));
    expect(cheapest.landedPrice).toBeGreaterThan(Math.min(...rankable.map((o) => o.landedPrice)));
    expect(p.recommendedOfferId).toBe(cheapest.id);
    expect(p.offers[0]!.id).toBe(cheapest.id);
    expect(p.recommendationReason).toBeNull();
    // In-stock eligible offers are in unit-price order.
    const units = p.offers.filter((o) => o.inStock && o.eligible).map(perUnit);
    expect(units).toEqual([...units].sort((a, b) => a - b));
    // maxSavings is for the product's own package size, not a raw shelf-price gap.
    const ref = (p.size!.unit === 'lb' ? 16 : p.size!.unit === 'gal' ? 128 : 1) * p.size!.amount;
    expect(p.maxSavings).toBeCloseTo((Math.max(...units) - Math.min(...units)) * ref, 1);
  });

  it('home sections are grocery aisles with grocery trending queries', async () => {
    const home = (await call('GET', '/v1/home')).json() as HomeResponse;
    expect(home.trendingQueries).toEqual(provider.trending());
    const categories = home.sections.filter((s) => s.kind === 'category').map((s) => s.title);
    expect(categories).toEqual(['Produce', 'Dairy & Eggs', 'Meat & Seafood', 'Bakery', 'Pantry']);
    expect(home.sections.some((s) => s.kind === 'top_deals')).toBe(true);
    const suggest = (await call('GET', '/v1/suggest?q=')).json() as SuggestResponse;
    expect(suggest.suggestions[0]).toBe('milk');
  });

  it('ask works on groceries: "eggs under $4", "cheap gluten free pasta"', async () => {
    const { token } = await register();
    const eggs = (await call('POST', '/v1/ask', token, { text: 'eggs under $4', zip: '45202' })).json() as AskResponse;
    expect(eggs.source).toBe('rules');
    expect(eggs.interpretation).toMatchObject({ query: 'eggs', maxPrice: 4 });
    expect(eggs.products.length).toBeGreaterThan(0);
    for (const p of eggs.products) {
      expect(Math.min(...p.offers.filter((o) => o.inStock && o.eligible).map((o) => o.landedPrice))).toBeLessThanOrEqual(4);
    }
    expect(eggs.products[0]!.title).toMatch(/Eggs/);
    expect(eggs.topPickReason).toMatch(/within your \$4 limit/);
    const stated = Number(/is \$([\d.]+) at/.exec(eggs.topPickReason!)![1]);
    expect(stated).toBeLessThanOrEqual(4);
    expect(eggs.products[0]!.offers.map((o) => o.landedPrice)).toContain(stated);

    expect(parseAskRules('cheap gluten free pasta')).toEqual({ query: 'pasta', maxPrice: null, minRating: null, retailers: null, sort: 'lowest_price', mustHave: ['gluten free'] });
    const pasta = (await call('POST', '/v1/ask', token, { text: 'cheap gluten free pasta' })).json() as AskResponse;
    expect(pasta.products.length).toBeGreaterThan(2);
    const glutenFree = (t: { title: string; highlights: string[] }) => /gluten free/i.test(`${t.title} ${t.highlights.join(' ')}`);
    // Gluten-free ones first (cheapest of them first), the rest after.
    const flags = pasta.products.map(glutenFree);
    expect(flags[0]).toBe(true);
    expect(flags.lastIndexOf(true)).toBeLessThan(flags.indexOf(false) === -1 ? Infinity : flags.indexOf(false));
    const gfPrices = pasta.products.filter(glutenFree).map((p) => Math.min(...p.offers.filter((o) => o.inStock && o.eligible).map((o) => o.landedPrice)));
    expect(gfPrices).toEqual([...gfPrices].sort((a, b) => a - b));

    const organic = parseAskRules('organic whole milk at kroger under $7');
    expect(organic).toEqual({ query: 'whole milk', maxPrice: 7, minRating: null, retailers: ['kroger'], sort: 'best_match', mustHave: ['organic'] });
    const atKroger = (await call('POST', '/v1/ask', token, { text: 'organic whole milk at kroger under $7' })).json() as AskResponse;
    expect(atKroger.products[0]!.title).toBe('Horizon Organic Whole Milk, 64 fl oz');
    expect(atKroger.products.every((p) => p.offers.every((o) => o.retailerId === 'kroger'))).toBe(true);
  });

  it('alerts watch the shelf price of the exact item, at the nearest store when a zip is given', async () => {
    const { token } = await register();
    const id = 'great-value-long-grain-white-rice-5-lb';
    const p = ((await call('GET', `/v1/products/${id}?zip=45202`)).json() as ProductResponse).product;
    const walmart = p.offers.find((o) => o.retailerId === 'walmart')!;
    // The cheapest offer per unit is a 25 lb club bag: not what a $-target on this 5 lb bag means.
    expect(p.offers.find((o) => o.id === p.cheapestOfferId)!.size).not.toEqual(p.size);
    const created = (await call('POST', '/v1/alerts', token, { productId: id, targetPrice: 2.5, zip: '45202' })).json() as AlertResponse;
    expect(created.alert).toMatchObject({ priceAtCreation: walmart.landedPrice, currentBestPrice: walmart.landedPrice, currentBestRetailerId: 'walmart', status: 'active' });
    expect(await app.checkAlerts()).toMatchObject({ checked: 1, triggered: 0 });
    // A cheap Kroger equivalent does not trigger it; the exact item dropping does.
    provider.setPriceOverride('kroger-long-grain-white-rice-5-lb', 'kroger', 1);
    app.catalog.clearCache();
    expect(await app.checkAlerts()).toMatchObject({ triggered: 0 });
    provider.setPriceOverride(id, 'walmart', 2);
    app.catalog.clearCache();
    expect(await app.checkAlerts()).toMatchObject({ triggered: 1 });
    // The override reached the listing wherever it appears (as an equivalent in Kroger's product too).
    const kr = ((await call('GET', '/v1/products/kroger-long-grain-white-rice-5-lb')).json() as ProductResponse).product;
    expect(kr.offers.find((o) => o.retailerId === 'walmart')!.price).toBe(2);
    expect(kr.offers.find((o) => o.retailerId === 'kroger')!.price).toBe(1);
  });

  it('events accept list_add / list_remove and the profile learns from them', async () => {
    const { token } = await register();
    const events: ActivityEvent[] = [
      ...Array.from({ length: 5 }, (): ActivityEvent => ({ type: 'list_add', ts: Date.now(), productId: 'great-value-whole-milk-1-gal', category: 'Dairy & Eggs', brand: 'Great Value' })),
      { type: 'list_add', ts: Date.now(), productId: 'barilla-spaghetti-pasta-16-oz', category: 'Pantry', brand: 'Barilla' },
      { type: 'list_remove', ts: Date.now(), productId: 'barilla-spaghetti-pasta-16-oz', category: 'Pantry', brand: 'Barilla' },
    ];
    expect(((await call('POST', '/v1/events', token, { events })).json() as { accepted: number }).accepted).toBe(7);
    expect((await call('POST', '/v1/events', token, { events: [{ type: 'list_clear', ts: Date.now() }] })).statusCode).toBe(400);
    await app.learner.flush();
    const { profile } = (await call('GET', '/v1/profile', token)).json() as ProfileResponse;
    expect(profile.categoryAffinity['Dairy & Eggs']).toBe(1);
    expect(profile.brandAffinity['Great Value']).toBe(1);
    expect(profile.insights).toContain('You mostly choose store brands over name brands');
    const home = (await call('GET', '/v1/home', token)).json() as HomeResponse;
    expect(home.sections[0]!.kind).toBe('for_you');
    expect(home.sections.find((s) => s.kind === 'recent')!.products.map((p) => p.id)).toContain('great-value-whole-milk-1-gal');
    expect(home.sections.find((s) => s.kind === 'category')!.title).toBe('Dairy & Eggs');
  });
});

describe('heuristic profiler: shopping-list events', () => {
  const add = (extra: Partial<ActivityEvent>): ActivityEvent => ({ type: 'list_add', ts: NOW - 60_000, ...extra });
  const build = (events: ActivityEvent[]) => buildHeuristicProfile(events, { now: NOW });

  it('list_add builds category/brand interest; list_remove takes it back', () => {
    const p = build([add({ category: 'Pantry', brand: 'Barilla' }), add({ category: 'Pantry', brand: 'Barilla' }), add({ category: 'Snacks', brand: "Lay's" })]);
    expect(p.categoryAffinity).toEqual({ Pantry: 1, Snacks: 0.5 });
    expect(p.brandAffinity.Barilla).toBe(1);
    const removed = build([add({ category: 'Snacks', brand: "Lay's" }), { type: 'list_remove', ts: NOW - 1000, category: 'Snacks', brand: "Lay's" }, add({ category: 'Pantry', brand: 'Barilla' })]);
    expect(removed.categoryAffinity.Pantry).toBe(1);
    expect(removed.categoryAffinity.Snacks ?? 0).toBeLessThan(0.6);
    // A list add counts for more than a view or a search, less than a click-through.
    const mixed = build([add({ category: 'A' }), { type: 'product_view', ts: NOW - 60_000, category: 'B' }, { type: 'offer_click', ts: NOW - 60_000, category: 'C' }]);
    expect(mixed.categoryAffinity.C).toBe(1);
    expect(mixed.categoryAffinity.A).toBeGreaterThan(mixed.categoryAffinity.B!);
  });

  it('list events never change ranking weights on their own', () => {
    const p = build(Array.from({ length: 30 }, () => add({ category: 'Pantry', brand: 'Great Value', retailerId: 'walmart' })));
    expect(p).toMatchObject({ priceSensitivity: 1, maxObservedPremiumPct: 0, retailerAffinity: {}, memberships: [] });
  });

  it('store-brand vs name-brand preference is reported as an insight', () => {
    const storeBrand = build([...Array.from({ length: 4 }, () => add({ brand: 'Great Value' })), add({ brand: 'Kirkland Signature' }), add({ brand: 'Barilla' })]);
    expect(storeBrand.insights).toContain('You mostly choose store brands over name brands');
    const nameBrand = build(Array.from({ length: 5 }, () => add({ brand: 'Barilla' })));
    expect(nameBrand.insights).toContain('You mostly choose name brands over store brands');
    const mixed = build([add({ brand: 'Kroger' }), add({ brand: 'Kroger' }), add({ brand: 'Barilla' }), add({ brand: 'Jif' })]);
    expect(mixed.insights.join()).not.toMatch(/store brands/);
    expect(build([add({ brand: 'Kroger' })]).insights.join()).not.toMatch(/store brands/); // too little data
  });
});
