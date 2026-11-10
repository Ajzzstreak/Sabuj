/**
 * Catalog service: fans out to every configured provider with a per-provider
 * timeout, merges results, and caches the UNPERSONALIZED result so the cache
 * is shared across all users. Personalization happens after this layer.
 */
import { SwrCache } from './cache.js';
import type { Offer } from './contract.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderProduct,
  ProviderProductDetail,
  ProviderSearchHit,
} from './providers/types.js';

export class UpstreamError extends Error {}

export interface CatalogOptions {
  providerTimeoutMs: number;
  cacheMaxEntries: number;
  cacheTtlMs: number;
  cacheSwrMs: number;
  onProviderError?: (provider: string, op: string, err: unknown) => void;
}

export interface Cached<T> {
  value: T;
  cached: boolean;
}

/** How many hits to request per query; the per-request `limit` slices this. */
export const SEARCH_FETCH_LIMIT = 50;

async function withTimeout<T>(ms: number, run: (opts: ProviderCallOptions) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([run({ signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function mergeOffers(a: Offer[], b: Offer[]): Offer[] {
  const byRetailer = new Map<string, Offer>();
  for (const o of [...a, ...b]) {
    const existing = byRetailer.get(o.retailerId);
    // Same retailer from two sources: keep the in-stock / cheaper observation.
    if (!existing || (o.inStock && !existing.inStock) || (o.inStock === existing.inStock && o.totalPrice < existing.totalPrice)) {
      byRetailer.set(o.retailerId, { ...o, productId: (existing ?? a[0] ?? o).productId });
    }
  }
  return [...byRetailer.values()];
}

/** Merge hits from several providers; products with the same GTIN are combined. */
export function mergeHits(lists: ProviderSearchHit[][]): ProviderSearchHit[] {
  const merged = new Map<string, ProviderSearchHit>();
  lists.forEach((hits, providerIndex) => {
    for (const hit of hits) {
      const key = hit.product.gtin ? `gtin:${hit.product.gtin}` : `p${providerIndex}:${hit.product.id}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, hit);
      } else {
        merged.set(key, {
          relevance: Math.max(existing.relevance, hit.relevance),
          product: { ...existing.product, offers: mergeOffers(existing.product.offers, hit.product.offers) },
        });
      }
    }
  });
  return [...merged.values()].sort((a, b) => b.relevance - a.relevance);
}

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

export class Catalog {
  private readonly searchCache: SwrCache<ProviderSearchHit[]>;
  private readonly productCache: SwrCache<ProviderProductDetail | null>;
  private readonly browseCache: SwrCache<ProviderProduct[]>;
  private readonly suggestCache: SwrCache<string[]>;

  constructor(
    private readonly providers: PriceProvider[],
    private readonly opts: CatalogOptions,
  ) {
    const cache = { maxEntries: opts.cacheMaxEntries, ttlMs: opts.cacheTtlMs, swrMs: opts.cacheSwrMs };
    this.searchCache = new SwrCache(cache);
    this.productCache = new SwrCache(cache);
    this.browseCache = new SwrCache({ ...cache, maxEntries: 4 });
    this.suggestCache = new SwrCache(cache);
  }

  async search(query: string): Promise<Cached<ProviderSearchHit[]>> {
    const q = normalizeQuery(query);
    return this.searchCache.get(q, async () => {
      const lists = await this.fanOut('search', (p, o) => p.search(q, { ...o, limit: SEARCH_FETCH_LIMIT }));
      return mergeHits(lists).slice(0, SEARCH_FETCH_LIMIT);
    });
  }

  async product(id: string): Promise<Cached<ProviderProductDetail | null>> {
    return this.productCache.get(id, async () => {
      const results = await this.fanOut('getProduct', (p, o) => p.getProduct(id, o));
      const found = results.filter((r): r is ProviderProductDetail => r !== null);
      if (found.length === 0) return null;
      const [first, ...rest] = found;
      return rest.reduce<ProviderProductDetail>(
        (acc, d) => ({
          ...acc,
          offers: mergeOffers(acc.offers, d.offers),
          priceHistory: acc.priceHistory.length ? acc.priceHistory : d.priceHistory,
          reviewSummary: acc.reviewSummary ?? d.reviewSummary,
        }),
        first!,
      );
    });
  }

  /** Browsable catalog slice for /v1/home. */
  async browse(fallbackQueries: string[]): Promise<Cached<ProviderProduct[]>> {
    return this.browseCache.get('browse', async () => {
      const browsable = this.providers.filter((p) => p.browse);
      if (browsable.length > 0) {
        const lists = await this.fanOut('browse', (p, o) => (p.browse ? p.browse(o) : Promise.resolve([])));
        return mergeHits(lists.map((l) => l.map((product) => ({ product, relevance: 0 })))).map((h) => h.product);
      }
      // Providers without a browse API: build the home catalog from popular searches.
      const lists = await Promise.all(fallbackQueries.map((q) => this.search(q).then((r) => r.value, () => [])));
      return mergeHits(lists).map((h) => h.product);
    });
  }

  async suggest(prefix: string, limit: number): Promise<string[]> {
    const key = `${limit}:${prefix.toLowerCase()}`;
    const { value } = await this.suggestCache.get(key, async () => {
      const capable = this.providers.filter((p) => p.suggest);
      if (capable.length === 0) return [];
      const settled = await Promise.allSettled(
        capable.map((p) => withTimeout(this.opts.providerTimeoutMs, (o) => p.suggest!(prefix, limit, o))),
      );
      const out: string[] = [];
      for (const s of settled) {
        if (s.status !== 'fulfilled') continue;
        for (const v of s.value) if (!out.includes(v)) out.push(v);
      }
      return out.slice(0, limit);
    });
    return value;
  }

  /** Run `call` on every provider in parallel; fail only if ALL providers fail. */
  private async fanOut<T>(op: string, call: (p: PriceProvider, o: ProviderCallOptions) => Promise<T>): Promise<T[]> {
    const settled = await Promise.allSettled(
      this.providers.map((p) => withTimeout(this.opts.providerTimeoutMs, (o) => call(p, o))),
    );
    const ok: T[] = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') ok.push(s.value);
      else this.opts.onProviderError?.(this.providers[i]!.name, op, s.reason);
    });
    if (ok.length === 0) throw new UpstreamError(`all price providers failed for ${op}`);
    return ok;
  }
}
