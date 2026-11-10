import { describe, expect, it } from 'vitest';
import { Catalog, mergeHits, UpstreamError } from '../src/catalog.js';
import { MockProvider } from '../src/providers/mock/index.js';
import { SEEDS } from '../src/providers/mock/catalog.js';
import type { PriceProvider } from '../src/providers/types.js';
import { buildOutboundUrl, RETAILER_IDS } from '../src/retailers.js';

const mock = new MockProvider();
const titles = async (q: string, limit = 10) => (await mock.search(q, { limit })).map((h) => h.product.title);
const catalogOpts = { providerTimeoutMs: 50, cacheMaxEntries: 100, cacheTtlMs: 60_000, cacheSwrMs: 60_000 };

describe('mock catalog', () => {
  it('has at least 60 products across at least 10 categories', async () => {
    const all = await mock.browse();
    expect(all.length).toBeGreaterThanOrEqual(60);
    expect(new Set(all.map((p) => p.category)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(all.map((p) => p.id)).size).toBe(SEEDS.length);
    expect(all.filter((p) => p.category === 'Rice Cookers').length).toBeGreaterThanOrEqual(5);
  });

  it('gives every product 3-6 well-formed offers', async () => {
    const seen = new Set<string>();
    for (const p of await mock.browse()) {
      expect(p.imageUrl).toBeNull();
      expect(p.offers.length).toBeGreaterThanOrEqual(3);
      expect(p.offers.length).toBeLessThanOrEqual(6);
      expect(new Set(p.offers.map((o) => o.retailerId)).size).toBe(p.offers.length);
      for (const o of p.offers) {
        seen.add(o.retailerId);
        expect(RETAILER_IDS).toContain(o.retailerId);
        expect(o.totalPrice).toBeCloseTo(o.price + (o.shipping ?? 0), 2);
        expect(o.price).toBeGreaterThan(0);
        expect(o.membershipRequired).toBe(o.retailerId === 'costco' || o.retailerId === 'samsclub');
        expect(o.url).toBe(buildOutboundUrl(o.retailerId, p.title));
        expect(o.url).not.toMatch(/tag=|affiliate|ref=/);
      }
    }
    expect(seen.size).toBe(6);
  });

  it('is deterministic across instances', async () => {
    const a = await new MockProvider().browse();
    const b = await new MockProvider().browse();
    expect(a.map((p) => p.offers.map((o) => [o.id, o.price, o.inStock]))).toEqual(
      b.map((p) => p.offers.map((o) => [o.id, o.price, o.inStock])),
    );
  });

  it('returns detail with 90 days of history per retailer ending at the live price', async () => {
    const id = (await mock.search('zojirushi', { limit: 1 }))[0]!.product.id;
    const d = (await mock.getProduct(id))!;
    expect(d.description.length).toBeGreaterThan(40);
    expect(d.reviewSummary!.pros.length).toBeGreaterThan(0);
    expect(d.reviewSummary!.cons.length).toBeGreaterThan(0);
    expect(d.priceHistory.length).toBe(d.offers.length * 90);
    for (const o of d.offers) {
      const series = d.priceHistory.filter((p) => p.retailerId === o.retailerId);
      expect(series.length).toBe(90);
      expect(series.at(-1)!.price).toBe(o.price);
      expect(new Set(series.map((p) => p.date)).size).toBe(90);
      for (const p of series) expect(p.price).toBeGreaterThan(o.price * 0.5);
    }
    expect((await mock.getProduct(id))!.priceHistory).toEqual(d.priceHistory);
    expect(await mock.getProduct('nope')).toBeNull();
  });
});

describe('mock search', () => {
  it('ranks rice cookers first for "rice cooker"', async () => {
    const hits = await mock.search('rice cooker', { limit: 50 });
    const cookers = hits.filter((h) => h.product.category === 'Rice Cookers');
    expect(cookers.length).toBe(8);
    expect(hits.slice(0, 8).every((h) => h.product.category === 'Rice Cookers')).toBe(true);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.relevance).toBeGreaterThanOrEqual(hits[i]!.relevance);
  });

  it('matches prefixes, plurals, brands and typos', async () => {
    expect((await titles('zoji'))[0]).toContain('Zojirushi');
    expect((await titles('rice cookers'))[0]).toContain('Rice Cooker');
    expect((await titles('zojirushi rice cooker')).slice(0, 2).every((t) => t.includes('Zojirushi'))).toBe(true);
    expect((await titles('zojirushy'))[0]).toContain('Zojirushi');
    expect((await titles('headphnes'))[0]).toMatch(/Headphones/);
    expect((await titles('airpods'))[0]).toContain('AirPods');
    expect((await titles('television')).every((t) => t.includes('TV'))).toBe(true);
    expect((await titles('robot vacuum'))[0]).toMatch(/Robot/);
  });

  it('returns nothing for gibberish and respects limit', async () => {
    expect(await titles('qqqqzzzzxxxx')).toEqual([]);
    expect((await titles('a', 3)).length).toBeLessThanOrEqual(3);
  });

  it('suggests completions', async () => {
    expect(await mock.suggest('rice', 8)).toContain('rice cooker');
    expect((await mock.suggest('zoj', 8))[0]).toContain('zojirushi');
    expect((await mock.suggest('', 8)).length).toBeGreaterThan(0);
  });
});

describe('Catalog fan-out', () => {
  const hanging: PriceProvider = {
    name: 'hanging',
    search: () => new Promise(() => undefined),
    getProduct: () => new Promise(() => undefined),
  };
  const failing: PriceProvider = {
    name: 'failing',
    search: async () => {
      throw new Error('boom');
    },
    getProduct: async () => {
      throw new Error('boom');
    },
  };

  it('caches the provider result and reports cached', async () => {
    const catalog = new Catalog([mock], catalogOpts);
    const first = await catalog.search('Rice   Cooker');
    const second = await catalog.search('rice cooker');
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.value).toBe(first.value);
  });

  it('survives a slow provider via the per-provider timeout', async () => {
    const errors: string[] = [];
    const catalog = new Catalog([hanging, mock], { ...catalogOpts, onProviderError: (p) => errors.push(p) });
    const started = Date.now();
    const { value } = await catalog.search('air fryer');
    expect(value.length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(errors).toEqual(['hanging']);
  });

  it('fails with UpstreamError when every provider fails, and does not cache it', async () => {
    const catalog = new Catalog([failing, hanging], catalogOpts);
    await expect(catalog.search('tv')).rejects.toBeInstanceOf(UpstreamError);
    await expect(catalog.search('tv')).rejects.toBeInstanceOf(UpstreamError);
  });

  it('merges the same GTIN from two providers, keeping the cheaper offer per retailer', async () => {
    const [hit] = await mock.search('zojirushi', { limit: 1 });
    const cheaper = {
      relevance: 0.2,
      product: { ...hit!.product, id: 'other-id', offers: hit!.product.offers.map((o) => ({ ...o, price: 1, totalPrice: 1, inStock: true })) },
    };
    const merged = mergeHits([[hit!], [cheaper]]);
    expect(merged.length).toBe(1);
    expect(merged[0]!.product.id).toBe(hit!.product.id);
    expect(merged[0]!.relevance).toBe(hit!.relevance);
    expect(merged[0]!.product.offers.every((o) => o.totalPrice === 1 && o.productId === hit!.product.id)).toBe(true);
  });
});
