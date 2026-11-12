/**
 * Catalog service: fans out to every configured provider with a per-provider
 * timeout, merges results, and caches the UNPERSONALIZED result so the cache
 * is shared across all users. Personalization happens after this layer.
 */
import { SwrCache } from './cache.js';
import type { RetailerId, Store } from './contract.js';
import { normalizeGtin } from './gtin.js';
import { buildOutboundUrl, isMembershipRetailer, RETAILER_IDS } from './retailers.js';
import { type ShopperContext, shopperContext } from './shopper.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderOffer,
  ProviderProduct,
  ProviderProductDetail,
  ProviderSearchHit,
  StoreSelection,
} from './providers/types.js';

export class UpstreamError extends Error {}

export interface CatalogOptions {
  providerTimeoutMs: number;
  cacheMaxEntries: number;
  cacheTtlMs: number;
  cacheSwrMs: number;
  onProviderError?: (provider: string, op: string, err: unknown) => void;
  /**
   * Lower-cased category names to keep (CATALOG_CATEGORIES); empty/unset = all.
   * Enforced here for every provider, whatever the upstream returned.
   */
  categories?: readonly string[];
  /**
   * When true (real providers are active), a product that carries a live price
   * also gets a 'link_only' offer for every retailer nobody priced, so the UI
   * can show "Check price" instead of silently omitting the store.
   */
  linkOnlyFallback?: boolean;
  now?: () => Date;
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

const isLinkOnly = (o: ProviderOffer) => o.priceSource === 'link_only';

function mergeOffers(a: ProviderOffer[], b: ProviderOffer[]): ProviderOffer[] {
  const byRetailer = new Map<string, ProviderOffer>();
  for (const o of [...a, ...b]) {
    const existing = byRetailer.get(o.retailerId);
    // Same retailer from two sources: a real price beats a link-only stub, then
    // keep the in-stock / cheaper observation.
    const better =
      !existing ||
      (isLinkOnly(existing) && !isLinkOnly(o)) ||
      (isLinkOnly(existing) === isLinkOnly(o) &&
        ((o.inStock && !existing.inStock) || (o.inStock === existing.inStock && o.totalPrice < existing.totalPrice)));
    if (!better) continue;
    // Offers adopted from another provider's copy of the product are re-keyed
    // to the surviving product, so offer ids stay unique and consistent.
    const productId = (existing ?? a[0] ?? o).productId;
    byRetailer.set(o.retailerId, productId === o.productId ? o : { ...o, productId, id: `${productId}:${o.retailerId}` });
  }
  return [...byRetailer.values()];
}

/**
 * Merge hits from several providers. Two products are the same product ONLY
 * when their normalized GTINs are equal — never by title similarity.
 */
export function mergeHits(lists: ProviderSearchHit[][]): ProviderSearchHit[] {
  const merged = new Map<string, ProviderSearchHit>();
  lists.forEach((hits, providerIndex) => {
    for (const hit of hits) {
      const gtin = normalizeGtin(hit.product.gtin);
      const key = gtin ? `gtin:${gtin}` : `p${providerIndex}:${hit.product.id}`;
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

function mergeDetails(found: ProviderProductDetail[]): ProviderProductDetail | null {
  const [first, ...rest] = found;
  if (!first) return null;
  return rest.reduce<ProviderProductDetail>(
    (acc, d) => ({
      ...acc,
      offers: mergeOffers(acc.offers, d.offers),
      priceHistory: acc.priceHistory.length ? acc.priceHistory : d.priceHistory,
      reviewSummary: acc.reviewSummary ?? d.reviewSummary,
    }),
    first,
  );
}

/** A "check price" stub for a retailer no provider priced. */
export function linkOnlyOffer(product: Pick<ProviderProduct, 'id' | 'title'>, retailerId: RetailerId, observedAt: string): ProviderOffer {
  return {
    id: `${product.id}:${retailerId}`,
    productId: product.id,
    retailerId,
    price: 0,
    listPrice: null,
    shipping: null,
    totalPrice: 0,
    inStock: true,
    membershipRequired: isMembershipRetailer(retailerId),
    rating: null,
    reviewCount: null,
    delivery: null,
    url: buildOutboundUrl(retailerId, product.title),
    observedAt,
    priceSource: 'link_only',
    matchType: 'exact',
    offerTitle: null,
    size: null,
    storeId: null,
  };
}

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

export class Catalog {
  private readonly searchCache: SwrCache<ProviderSearchHit[]>;
  private readonly productCache: SwrCache<ProviderProductDetail | null>;
  private readonly browseCache: SwrCache<ProviderProduct[]>;
  private readonly suggestCache: SwrCache<string[]>;
  private readonly lookupCache: SwrCache<ProviderProductDetail | null>;
  private readonly storesCache: SwrCache<Store[]>;
  /** Retailers whose prices some provider must fetch per store (part of the cache key). */
  private readonly storeScoped: RetailerId[];
  private readonly localizers: PriceProvider[];

  constructor(
    private readonly providers: PriceProvider[],
    private readonly opts: CatalogOptions,
  ) {
    const cache = { maxEntries: opts.cacheMaxEntries, ttlMs: opts.cacheTtlMs, swrMs: opts.cacheSwrMs };
    this.searchCache = new SwrCache(cache);
    this.productCache = new SwrCache(cache);
    this.browseCache = new SwrCache({ ...cache, maxEntries: 4 });
    this.suggestCache = new SwrCache(cache);
    this.lookupCache = new SwrCache(cache);
    // Store lists change rarely: keep them at least an hour.
    this.storesCache = new SwrCache({ ...cache, ttlMs: Math.max(cache.ttlMs, 3_600_000) });
    this.storeScoped = [...new Set(providers.flatMap((p) => [...(p.storeScopedRetailers ?? [])]))].sort();
    this.localizers = providers.filter((p) => p.localizeOffer);
  }

  /** Drop every cached provider result (tests, price-override hook). */
  clearCache(): void {
    this.searchCache.clear();
    this.productCache.clear();
    this.browseCache.clear();
    this.lookupCache.clear();
    this.storesCache.clear();
  }

  // ---- stores ----------------------------------------------------------------

  /** Store locations near a ZIP from every provider that has them, nearest first. */
  async stores(zip: string): Promise<Store[]> {
    const { value } = await this.storesCache.get(zip, async () => {
      const capable = this.providers.filter((p) => p.stores);
      if (capable.length === 0) return [];
      const lists = await this.fanOutTo(capable, 'stores', (p, o) => p.stores!(zip, o), true);
      const seen = new Set<string>();
      return lists
        .flat()
        .filter((s) => !seen.has(s.id) && seen.add(s.id))
        .sort((a, b) => a.distanceMiles - b.distanceMiles);
    });
    return value;
  }

  /**
   * Which store to price at for each retailer: explicit `storeIds` win (first
   * per retailer; ids no provider recognizes are ignored), then, when a ZIP is
   * given, the nearest store of every other retailer. A failing store lookup
   * degrades to national prices rather than failing the request.
   */
  async resolveStores(zip: string | null | undefined, storeIds: readonly string[] | null | undefined): Promise<StoreSelection> {
    const selection: StoreSelection = {};
    for (const id of storeIds ?? []) {
      let retailer: RetailerId | null = null;
      for (const p of this.providers) if ((retailer = p.storeRetailer?.(id) ?? null)) break;
      if (retailer && !selection[retailer]) selection[retailer] = id;
    }
    if (zip) {
      const nearby = await this.stores(zip).catch(() => []);
      for (const s of nearby) selection[s.retailerId] ??= s.id; // already nearest-first
    }
    return selection;
  }

  /**
   * Re-price one offer for a store. Used AFTER the cache (via ShopperContext),
   * so providers that can localize on the fly share one cache entry across all
   * store selections. Synchronous and cheap by contract.
   */
  readonly localizeOffer = (offer: ProviderOffer, storeId: string): ProviderOffer => {
    for (const p of this.localizers) {
      const priced = p.localizeOffer!(offer, storeId);
      if (priced) return priced;
    }
    return offer;
  };

  /**
   * The shopper context for a request: tax from the ZIP, stated memberships,
   * and the store to price at per retailer (explicit ids, else nearest by ZIP).
   * Without a ZIP or store ids no store lookup happens at all.
   */
  async contextFor(
    zip: string | null | undefined,
    memberships: readonly RetailerId[] | null | undefined,
    storeIds?: readonly string[] | null,
  ): Promise<ShopperContext> {
    const stores = zip || storeIds?.length ? await this.resolveStores(zip, storeIds) : undefined;
    return shopperContext(zip, memberships, stores, this.localizeOffer);
  }

  /** Trending queries of the first provider that has an opinion. */
  trending(): string[] {
    for (const p of this.providers) {
      const t = p.trending?.();
      if (t && t.length > 0) return t;
    }
    return [];
  }

  /**
   * Cache-key suffix for store-scoped providers only: the selected store of
   * each retailer whose upstream price depends on it. Empty when no provider
   * is store-scoped, so the mock keeps one shared entry per query.
   */
  private storeKey(stores: StoreSelection | undefined): string {
    if (!stores || this.storeScoped.length === 0) return '';
    const parts = this.storeScoped.filter((r) => stores[r]).map((r) => `${r}=${stores[r]}`);
    return parts.length ? `|${parts.join(',')}` : '';
  }

  private inScope(p: ProviderProduct): boolean {
    const cats = this.opts.categories;
    return !cats || cats.length === 0 || cats.includes(p.category.toLowerCase());
  }

  /** Add link-only stubs for unpriced retailers to products that have a live price. */
  private finish<T extends ProviderProduct>(p: T): T {
    if (!this.opts.linkOnlyFallback || !p.offers.some((o) => o.priceSource === 'live')) return p;
    const have = new Set(p.offers.map((o) => o.retailerId));
    const missing = RETAILER_IDS.filter((r) => !have.has(r));
    if (missing.length === 0) return p;
    const observedAt = (this.opts.now?.() ?? new Date()).toISOString();
    return { ...p, offers: [...p.offers, ...missing.map((r) => linkOnlyOffer(p, r, observedAt))] };
  }

  async search(query: string, stores?: StoreSelection): Promise<Cached<ProviderSearchHit[]>> {
    const q = normalizeQuery(query);
    return this.searchCache.get(q + this.storeKey(stores), async () => {
      const lists = await this.fanOut('search', (p, o) => p.search(q, { ...o, stores, limit: SEARCH_FETCH_LIMIT }));
      return mergeHits(lists)
        .filter((h) => this.inScope(h.product))
        .slice(0, SEARCH_FETCH_LIMIT)
        .map((h) => ({ ...h, product: this.finish(h.product) }));
    });
  }

  async product(id: string, stores?: StoreSelection): Promise<Cached<ProviderProductDetail | null>> {
    return this.productCache.get(id + this.storeKey(stores), async () => {
      const results = await this.fanOut('getProduct', (p, o) => p.getProduct(id, { ...o, stores }).then((detail) => ({ p, detail })));
      const found = results.filter((r) => r.detail !== null).map((r) => r.detail!);
      let merged = mergeDetails(found);
      if (!merged || !this.inScope(merged)) return null;
      // Providers that do not own this id may still sell the same GTIN.
      const gtin = normalizeGtin(merged.gtin);
      const others = results.filter((r) => r.detail === null).map((r) => r.p);
      if (gtin && others.length > 0) {
        const extra = await this.fanOutTo(others, 'lookupGtin', (p, o) => p.lookupGtin(gtin, { ...o, stores }), true);
        merged = mergeDetails([merged, ...extra.filter((d): d is ProviderProductDetail => d !== null)]) ?? merged;
      }
      return this.finish(merged);
    });
  }

  /** Barcode lookup. `gtin` must already be canonical (normalizeGtin). */
  async lookup(gtin: string, stores?: StoreSelection): Promise<Cached<ProviderProductDetail | null>> {
    return this.lookupCache.get(gtin + this.storeKey(stores), async () => {
      const results = await this.fanOut('lookupGtin', (p, o) => p.lookupGtin(gtin, { ...o, stores }));
      const merged = mergeDetails(results.filter((r): r is ProviderProductDetail => r !== null));
      return merged && this.inScope(merged) ? this.finish(merged) : null;
    });
  }

  /** Browsable catalog slice for /v1/home. */
  async browse(fallbackQueries: string[]): Promise<Cached<ProviderProduct[]>> {
    return this.browseCache.get('browse', async () => {
      const browsable = this.providers.filter((p) => p.browse);
      if (browsable.length > 0) {
        const lists = await this.fanOut('browse', (p, o) => (p.browse ? p.browse(o) : Promise.resolve([])));
        return mergeHits(lists.map((l) => l.map((product) => ({ product, relevance: 0 }))))
          .map((h) => h.product)
          .filter((p) => this.inScope(p))
          .map((p) => this.finish(p));
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
  private fanOut<T>(op: string, call: (p: PriceProvider, o: ProviderCallOptions) => Promise<T>): Promise<T[]> {
    return this.fanOutTo(this.providers, op, call, false);
  }

  private async fanOutTo<T>(
    providers: readonly PriceProvider[],
    op: string,
    call: (p: PriceProvider, o: ProviderCallOptions) => Promise<T>,
    tolerateTotalFailure: boolean,
  ): Promise<T[]> {
    const settled = await Promise.allSettled(providers.map((p) => withTimeout(this.opts.providerTimeoutMs, (o) => call(p, o))));
    const ok: T[] = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') ok.push(s.value);
      else this.opts.onProviderError?.(providers[i]!.name, op, s.reason);
    });
    if (ok.length === 0 && !tolerateTotalFailure) throw new UpstreamError(`all price providers failed for ${op}`);
    return ok;
  }
}
