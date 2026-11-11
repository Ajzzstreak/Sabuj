/**
 * Fixture-based tests for the real provider adapters. The fixtures are
 * hand-written from memory of the public API docs (see their "_note"), so
 * these tests prove the mapping is internally consistent — NOT that it matches
 * the live APIs.
 */
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Catalog } from '../src/catalog.js';
import { loadConfig } from '../src/config.js';
import { BestBuyProvider, mapBestBuyProduct } from '../src/providers/bestbuy.js';
import type { FetchLike } from '../src/providers/http.js';
import { createProviders } from '../src/providers/index.js';
import { mapWalmartItem, walmartAuthHeaders, WalmartProvider } from '../src/providers/walmart.js';
import { personalizeProduct } from '../src/ranking.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as Record<string, unknown>;
const bestbuy = fixture('bestbuy-products.json') as { products: unknown[] };
const walmart = fixture('walmart-search.json') as { items: unknown[] };
const AT = '2026-11-11T00:00:00.000Z';
const now = () => new Date(AT);
const fetchOf = (body: unknown, status = 200) => vi.fn<FetchLike>(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });

describe('Best Buy mapping (fixture)', () => {
  it('maps a full product to a live offer', () => {
    const p = mapBestBuyProduct(bestbuy.products[0], AT)!;
    expect(p).toMatchObject({
      id: 'bby-6505727',
      title: 'Sony - WH-1000XM5 Wireless Noise-Canceling Over-the-Ear Headphones - Black',
      brand: 'Sony',
      category: 'Over-Ear Headphones',
      gtin: '00027242923232',
      imageUrl: 'https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6505/6505727_sd.jpg',
      priceHistory: [],
      reviewSummary: null,
    });
    expect(p.description).toBe('The WH-1000XM5 headphones rewrite the rules for distraction-free listening. Two processors control 8 microphones.');
    expect(p.highlights).toEqual(['Industry-leading noise cancellation Two processors control e', 'Up to 30-hour battery life']);
    expect(p.offers).toEqual([
      {
        id: 'bby-6505727:bestbuy',
        productId: 'bby-6505727',
        retailerId: 'bestbuy',
        price: 329.99,
        listPrice: 399.99,
        shipping: 0,
        totalPrice: 329.99,
        inStock: true,
        membershipRequired: false,
        rating: 4.7,
        reviewCount: 12894,
        delivery: null,
        url: 'https://api.bestbuy.com/click/-/6505727/pdp',
        observedAt: AT,
        priceSource: 'live',
      },
    ]);
  });

  it('handles unknown shipping, missing reviews, out of stock, and refuses a non-Best-Buy link', () => {
    const p = mapBestBuyProduct(bestbuy.products[1], AT, ['rice cookers'])!;
    const o = p.offers[0]!;
    expect(p.category).toBe('Rice Cookers');
    expect(o).toMatchObject({ price: 19.99, listPrice: null, shipping: null, totalPrice: 19.99, inStock: false, rating: null, reviewCount: null, priceSource: 'live' });
    expect(o.url).toBe('https://www.bestbuy.com/site/searchpage.jsp?st=Insignia%20-%202.6%20Qt.%20Rice%20Cooker%20-%20Stainless%20Steel');
    expect(p.imageUrl).toBeNull();
    expect(p.description).toBe('');
    // Category scoping picks the configured path element, wherever it sits.
    expect(mapBestBuyProduct(bestbuy.products[1], AT, ['appliances'])!.category).toBe('Appliances');
  });

  it('drops items without a usable sku, name or price', () => {
    expect(mapBestBuyProduct(bestbuy.products[2], AT)).toBeNull();
    for (const bad of [null, 'x', {}, { sku: 1, name: 'x', salePrice: 0 }, { sku: 'a/b', name: 'x', salePrice: 5 }, { sku: 1, salePrice: 5 }]) {
      expect(mapBestBuyProduct(bad, AT)).toBeNull();
    }
  });
});

describe('BestBuyProvider (fake HTTP)', () => {
  it('search builds a keyed request and maps the product list', async () => {
    const fetch = fetchOf(bestbuy);
    const provider = new BestBuyProvider({ apiKey: 'KEY123', fetch, now });
    const hits = await provider.search('sony wh-1000xm5 (black)', { limit: 50 });
    expect(hits.map((h) => h.product.id)).toEqual(['bby-6505727', 'bby-6418599']);
    expect(hits[0]!.relevance).toBeGreaterThan(hits[1]!.relevance);
    const url = fetch.mock.calls[0]![0];
    expect(url.startsWith('https://api.bestbuy.com/v1/products((search=sony&search=wh-1000xm5&search=black)?')).toBe(false);
    expect(url.startsWith('https://api.bestbuy.com/v1/products(search=sony&search=wh-1000xm5&search=black)?')).toBe(true);
    expect(url).toContain('apiKey=KEY123');
    expect(url).toContain('format=json');
    expect(url).toContain('pageSize=50');
    expect(await provider.search('   ', { limit: 5 })).toEqual([]);
  });

  it('getProduct only answers its own ids; lookupGtin uses the 12-digit UPC', async () => {
    const fetch = fetchOf({ products: [bestbuy.products[0]] });
    const provider = new BestBuyProvider({ apiKey: 'K', fetch, now });
    expect(await provider.getProduct('dash-mini-2-cup-rice-cooker')).toBeNull();
    expect(await provider.getProduct('wmt-123')).toBeNull();
    expect(await provider.getProduct('bby-12;drop')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect((await provider.getProduct('bby-6505727'))!.id).toBe('bby-6505727');
    expect(fetch.mock.calls[0]![0]).toContain('/v1/products(sku=6505727)?');
    expect((await provider.lookupGtin('00027242923232'))!.gtin).toBe('00027242923232');
    expect(fetch.mock.calls[1]![0]).toContain('/v1/products(upc=027242923232)?');
    expect(await provider.lookupGtin('04006381333931')).toBeNull(); // 13 significant digits: not a UPC-A
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('HTTP errors never leak the API key', async () => {
    const provider = new BestBuyProvider({ apiKey: 'SECRETKEY', fetch: fetchOf({}, 403), now });
    await expect(provider.search('tv', { limit: 5 })).rejects.toThrow('bestbuy API responded with HTTP 403');
    const throwing = new BestBuyProvider({ apiKey: 'SECRETKEY', fetch: (async (url: string) => Promise.reject(new Error(`fetch failed for ${url}`))) as FetchLike, now });
    const err = await throwing.search('tv', { limit: 5 }).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain('SECRETKEY');
    // ...and the catalog logs that sanitized message only.
    const errors: string[] = [];
    const catalog = new Catalog([throwing], { providerTimeoutMs: 100, cacheMaxEntries: 10, cacheTtlMs: 1000, cacheSwrMs: 1000, onProviderError: (_p, _op, e) => errors.push(String(e)) });
    await expect(catalog.search('tv')).rejects.toThrow();
    expect(errors.join()).not.toContain('SECRETKEY');
  });
});

describe('Walmart mapping (fixture)', () => {
  it('maps a full item to a live offer', () => {
    const p = mapWalmartItem(walmart.items[0], AT)!;
    expect(p).toMatchObject({ id: 'wmt-782016027', brand: 'Sony', category: 'Over-Ear Headphones', gtin: '00027242923232', imageUrl: 'https://i5.walmartimages.com/asr/large.jpeg', highlights: [] });
    expect(p.offers).toEqual([
      {
        id: 'wmt-782016027:walmart',
        productId: 'wmt-782016027',
        retailerId: 'walmart',
        price: 318,
        listPrice: 399.99,
        shipping: 0,
        totalPrice: 318,
        inStock: true,
        membershipRequired: false,
        rating: 4.6,
        reviewCount: 2231,
        delivery: null,
        url: 'https://goto.walmart.com/c/123/456/9383?veh=aff&sourceid=imp_000011112222333344&u=https%3A%2F%2Fwww.walmart.com%2Fip%2F782016027',
        observedAt: AT,
        priceSource: 'live',
      },
    ]);
  });

  it('applies shipping below the free-shipping threshold, stock and category scope', () => {
    const p = mapWalmartItem(walmart.items[1], AT, ['rice cookers'])!;
    expect(p.category).toBe('Rice Cookers');
    expect(p.offers[0]).toMatchObject({ price: 24.96, shipping: 6.99, totalPrice: 31.95, inStock: false, listPrice: null, rating: null, reviewCount: null, url: 'https://www.walmart.com/ip/55501234' });
    expect(mapWalmartItem(walmart.items[2], AT)).toBeNull();
    expect(mapWalmartItem({ itemId: 1, name: 'x', salePrice: '12.50', stock: 'Available' }, AT)!.offers[0]).toMatchObject({ price: 12.5, shipping: null, totalPrice: 12.5, inStock: true });
  });

  it('signs requests with RSA-SHA256 over consumerId, timestamp and key version', () => {
    const h = walmartAuthHeaders('consumer-1', privateKey, '2', 1_700_000_000_000);
    expect(h).toMatchObject({ 'WM_CONSUMER.ID': 'consumer-1', 'WM_CONSUMER.INTIMESTAMP': '1700000000000', 'WM_SEC.KEY_VERSION': '2' });
    const verify = createVerify('RSA-SHA256');
    verify.update('consumer-1\n1700000000000\n2\n');
    expect(verify.verify(publicKey, h['WM_SEC.AUTH_SIGNATURE']!, 'base64')).toBe(true);
  });
});

describe('WalmartProvider (fake HTTP)', () => {
  const make = (fetch: FetchLike) => new WalmartProvider({ consumerId: 'c', privateKey: privateKey.replace(/\n/g, '\\n'), keyVersion: '1', publisherId: 'pub', fetch, now });

  it('search, getProduct and lookupGtin hit the expected paths with auth headers', async () => {
    const fetch = fetchOf(walmart);
    const provider = make(fetch);
    const hits = await provider.search('sony wh-1000xm5', { limit: 50 });
    expect(hits.map((h) => h.product.id)).toEqual(['wmt-782016027', 'wmt-55501234']);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?query=sony%20wh-1000xm5&numItems=25&publisherId=pub');
    expect(Object.keys(init.headers)).toEqual(expect.arrayContaining(['WM_CONSUMER.ID', 'WM_CONSUMER.INTIMESTAMP', 'WM_SEC.KEY_VERSION', 'WM_SEC.AUTH_SIGNATURE']));

    expect(await provider.getProduct('bby-1')).toBeNull();
    const single = make(fetchOf(walmart.items[0]));
    expect((await single.getProduct('wmt-782016027'))!.id).toBe('wmt-782016027');
    await provider.lookupGtin('00027242923232');
    expect(fetch.mock.calls.at(-1)![0]).toContain('/items?upc=027242923232');
    expect(await provider.lookupGtin('04006381333931')).toBeNull();
  });

  it('treats 404/400 as not found and surfaces other failures', async () => {
    expect(await make(fetchOf({}, 404)).getProduct('wmt-1')).toBeNull();
    expect(await make(fetchOf({}, 400)).lookupGtin('00027242923232')).toBeNull();
    await expect(make(fetchOf({}, 500)).search('tv', { limit: 5 })).rejects.toThrow('walmart API responded with HTTP 500');
  });
});

describe('provider registry', () => {
  it('real providers are off by default and refuse to start without credentials', () => {
    expect(createProviders(loadConfig({})).map((p) => p.name)).toEqual(['mock']);
    expect(() => createProviders(loadConfig({ PRICE_PROVIDERS: 'bestbuy' }))).toThrow(/BESTBUY_API_KEY/);
    expect(() => createProviders(loadConfig({ PRICE_PROVIDERS: 'walmart' }))).toThrow(/WALMART_CONSUMER_ID/);
    expect(() => createProviders(loadConfig({ PRICE_PROVIDERS: 'nope' }))).toThrow(/Unknown price provider/);
    const both = createProviders(loadConfig({ PRICE_PROVIDERS: 'bestbuy,walmart', BESTBUY_API_KEY: 'k', WALMART_CONSUMER_ID: 'c', WALMART_PRIVATE_KEY: privateKey }));
    expect(both.map((p) => p.name)).toEqual(['bestbuy', 'walmart']);
    expect(loadConfig({ CATALOG_CATEGORIES: ' Rice Cookers, TVs ' }).catalogCategories).toEqual(['rice cookers', 'tvs']);
    expect(createProviders(loadConfig({ CATALOG_CATEGORIES: 'Rice Cookers', MOCK_PRICE_OVERRIDES: 'dash-mini-2-cup-rice-cooker:amazon=5' }))).toHaveLength(1);
    expect(() => createProviders(loadConfig({ MOCK_PRICE_OVERRIDES: 'bad' }))).toThrow(/MOCK_PRICE_OVERRIDES/);
  });

  it('end to end with both adapters: one product, two live prices, four "check price" links', async () => {
    const catalog = new Catalog(
      [new BestBuyProvider({ apiKey: 'k', fetch: fetchOf(bestbuy), now }), new WalmartProvider({ consumerId: 'c', privateKey, keyVersion: '1', fetch: fetchOf(walmart), now })],
      { providerTimeoutMs: 500, cacheMaxEntries: 10, cacheTtlMs: 1000, cacheSwrMs: 1000, linkOnlyFallback: true, now },
    );
    const { value: hits } = await catalog.search('sony wh-1000xm5');
    // Same UPC -> merged; the two rice cookers have different UPCs -> separate, despite similar names.
    expect(hits.map((h) => h.product.id)).toEqual(['bby-6505727', 'bby-6418599', 'wmt-55501234']);
    const sony = personalizeProduct(hits[0]!.product);
    expect(sony.offers.map((o) => `${o.retailerId}:${o.priceSource}`)).toEqual([
      'walmart:live', 'bestbuy:live', 'amazon:link_only', 'costco:link_only', 'samsclub:link_only', 'target:link_only',
    ]);
    expect(sony.cheapestOfferId).toBe('bby-6505727:walmart');
    expect(sony.recommendedOfferId).toBe('bby-6505727:walmart');
    expect(sony.maxSavings).toBe(11.99);
    // Nothing in stock with a live price: no cheapest, and a link-only offer is never recommended.
    const cooker = personalizeProduct(hits[1]!.product);
    expect(cooker.cheapestOfferId).toBeNull();
    expect(cooker.recommendedOfferId).toBeNull();
    expect(cooker.offers.at(-1)!.priceSource).toBe('link_only');
    expect(cooker.offers[0]!.retailerId).toBe('bestbuy'); // out of stock still sorts before link-only
  });
});
