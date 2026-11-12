import type { RetailerId, Store } from '../../contract.js';
import { normalizeGtin } from '../../gtin.js';
import { isRetailerId } from '../../retailers.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderOffer,
  ProviderProduct,
  ProviderProductDetail,
  ProviderSearchHit,
  ProviderSearchOptions,
} from '../types.js';
import { CATEGORY_NOUN, SEEDS, TRENDING_QUERIES, type CatalogSeed } from './catalog.js';
import { buildDetail, buildProduct, generatePriceHistory, slugify } from './generate.js';
import { buildGroceryCatalog, type GroceryMeta } from './grocery.js';
import { GROCERY_CATEGORY_NOUN, GROCERY_TRENDING } from './groceryData.js';
import { queryTokens, SearchIndex, tokenize } from './search.js';
import { mockStoreRetailer, mockStores, storePriceFactor } from './stores.js';

/** Which demo data set to serve. */
export type MockCatalogKind = 'grocery' | 'general' | 'all';

export interface MockProviderOptions {
  /** Artificial delay per call, to simulate a real upstream. */
  latencyMs?: number;
  now?: () => Date;
  /**
   * grocery (default): ~300 grocery items with store brands, sizes and stores.
   * general: the original electronics/appliances catalog. all: both.
   */
  catalog?: MockCatalogKind;
  /** Lower-cased category names to load; empty/unset = the whole catalog. */
  categories?: readonly string[];
  /** Initial price overrides, see `parsePriceOverrides`. */
  priceOverrides?: ReadonlyMap<string, number>;
}

/**
 * Parse MOCK_PRICE_OVERRIDES: "productId:retailerId=price[,productId:retailerId=price...]".
 * Mock prices never change on their own, so this is the dev/test hook that
 * makes a price drop (and therefore a price alert) reproducible.
 */
export function parsePriceOverrides(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const m = /^([A-Za-z0-9._~-]+):([a-z]+)=(\d+(?:\.\d{1,2})?)$/.exec(entry);
    if (!m || !isRetailerId(m[2])) throw new Error(`Invalid MOCK_PRICE_OVERRIDES entry "${entry}" (expected productId:retailerId=price)`);
    out.set(`${m[1]}:${m[2]}`, Number(m[3]));
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const NOUNS: Record<string, string> = { ...CATEGORY_NOUN, ...GROCERY_CATEGORY_NOUN };

const GROCERY_REVIEWS = {
  pros: ['Good value for the size', 'Consistent quality', 'Fresh when picked up', 'Easy to find in store'],
  cons: ['Packaging changes often', 'Sometimes out of stock', 'Price varies by store'],
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

/** Deterministic in-memory catalog. Stands in for a real price source. */
export class MockProvider implements PriceProvider {
  readonly name = 'mock';
  private readonly latencyMs: number;
  private readonly now: () => Date;
  /** General-catalog seeds by product id. */
  private readonly seeds = new Map<string, CatalogSeed>();
  /** Grocery metadata by product id. */
  private readonly grocery = new Map<string, GroceryMeta>();
  /** Grocery offer id -> the listing it prices (the per-store price key). */
  private readonly listingOf = new Map<string, string>();
  private readonly products = new Map<string, ProviderProduct>();
  private readonly byGtin = new Map<string, string>();
  private readonly index: SearchIndex;
  private readonly phrases: string[];
  private readonly trendingQueries: string[];

  constructor(opts: MockProviderOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 0;
    this.now = opts.now ?? (() => new Date());
    const kind = opts.catalog ?? 'grocery';
    // Prices are "observed" at the top of the current hour.
    const observed = this.now();
    observed.setUTCMinutes(0, 0, 0);
    const observedAt = observed.toISOString();
    const categories = opts.categories ?? [];
    const inScope = (category: string) => categories.length === 0 || categories.includes(category.toLowerCase());
    const add = (product: ProviderProduct) => {
      if (this.products.has(product.id)) throw new Error(`duplicate mock product id: ${product.id}`);
      this.products.set(product.id, product);
      const gtin = normalizeGtin(product.gtin);
      if (gtin) this.byGtin.set(gtin, product.id);
    };

    if (kind !== 'general') {
      const built = buildGroceryCatalog(observedAt);
      for (const product of built.products) {
        if (!inScope(product.category)) continue;
        add(product);
        this.grocery.set(product.id, built.meta.get(product.id)!);
        for (const o of product.offers) this.listingOf.set(o.id, built.listingOf.get(o.id)!);
      }
    }
    if (kind !== 'grocery') {
      for (const seed of SEEDS) {
        if (!inScope(seed.category)) continue;
        const product = buildProduct(seed, observedAt);
        add(product);
        this.seeds.set(product.id, seed);
      }
    }
    for (const [key, price] of opts.priceOverrides ?? []) {
      const i = key.lastIndexOf(':');
      this.setPriceOverride(key.slice(0, i), key.slice(i + 1) as RetailerId, price);
    }
    this.index = new SearchIndex([...this.products.values()], (p) => ({
      keywords: this.seeds.get(p.id)?.keywords ?? this.grocery.get(p.id)?.keywords,
      categoryNoun: NOUNS[p.category],
    }));
    // Only trending queries that find something in what was actually loaded.
    const candidates = kind === 'grocery' ? GROCERY_TRENDING : kind === 'general' ? TRENDING_QUERIES : [...GROCERY_TRENDING, ...TRENDING_QUERIES];
    this.trendingQueries = kind === 'general' && categories.length === 0 ? candidates : candidates.filter((q) => this.index.search(q, 1).length > 0);
    this.phrases = this.buildPhrases();
  }

  trending(): string[] {
    return this.trendingQueries;
  }

  async search(query: string, opts: ProviderSearchOptions): Promise<ProviderSearchHit[]> {
    await sleep(this.latencyMs, opts.signal);
    if (this.grocery.size === 0) return this.index.search(query, opts.limit);
    return this.collapse(this.index.search(query, opts.limit * 5)).slice(0, opts.limit);
  }

  /**
   * One hit per store-brand kind. "Great Value Whole Milk" and "Kroger Whole
   * Milk" are each other's equivalent offers, so listing both (and Target's,
   * Costco's, ...) would repeat the same comparison five times. The best-scoring
   * sibling wins — naming a brand in the query lifts that brand — and ties go
   * to the first retailer that carries the kind (Walmart, then Kroger, ...).
   */
  private collapse(hits: ProviderSearchHit[]): ProviderSearchHit[] {
    const best = new Map<string, ProviderSearchHit>();
    for (const hit of hits) {
      const m = this.grocery.get(hit.product.id);
      if (!m?.group) continue;
      const current = best.get(m.group);
      const currentRank = current ? this.grocery.get(current.product.id)!.groupRank : Infinity;
      if (!current || hit.relevance > current.relevance + 0.02 || (Math.abs(hit.relevance - current.relevance) <= 0.02 && m.groupRank < currentRank)) {
        best.set(m.group, hit);
      }
    }
    return hits.filter((hit) => {
      const group = this.grocery.get(hit.product.id)?.group;
      return !group || best.get(group) === hit;
    });
  }

  async getProduct(id: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    await sleep(this.latencyMs, opts.signal);
    const product = this.products.get(id);
    if (!product) return null;
    const seed = this.seeds.get(id);
    if (seed) return buildDetail(product, seed, this.now());
    const m = this.grocery.get(id);
    if (!m) return null;
    const stores = new Set(product.offers.map((o) => o.retailerId)).size;
    return {
      ...product,
      description:
        `${m.title} — demo listing in ${m.category}. ` +
        (product.isStoreBrand
          ? `This is a store brand: other stores are compared through their own equivalent item, per unit. `
          : `The same item is compared at ${stores} store${stores === 1 ? '' : 's'}. `) +
        `Prices are in-store / pickup prices and are synthetic demo data.`,
      // History hovers around each offer's own current price (sizes differ between stores).
      priceHistory: generatePriceHistory(product, product.offers[0]?.price ?? 1, this.now(), (o) => o.listPrice ?? o.price),
      reviewSummary: GROCERY_REVIEWS,
    };
  }

  async lookupGtin(gtin: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    const id = this.byGtin.get(gtin);
    return id ? this.getProduct(id, opts) : null;
  }

  /** Synthetic store locations for a ZIP (grocery catalog only). */
  async stores(zip: string, opts: ProviderCallOptions = {}): Promise<Store[]> {
    await sleep(Math.min(this.latencyMs, 50), opts.signal);
    return this.grocery.size > 0 ? mockStores(zip) : [];
  }

  storeRetailer(storeId: string): RetailerId | null {
    return this.grocery.size > 0 ? mockStoreRetailer(storeId) : null;
  }

  /**
   * Price one of this catalog's grocery offers at a store: a deterministic
   * +/-4% keyed by store and listing, so an item costs the same at a given
   * store whether it appears as an exact or an equivalent offer.
   */
  localizeOffer(offer: ProviderOffer, storeId: string): ProviderOffer | null {
    if (offer.priceSource !== 'demo' || mockStoreRetailer(storeId) !== offer.retailerId) return null;
    const listing = this.listingOf.get(offer.id);
    if (!listing) return null;
    const factor = storePriceFactor(storeId, listing);
    const price = round2(offer.price * factor);
    return {
      ...offer,
      price,
      listPrice: offer.listPrice === null ? null : Math.max(price, round2(offer.listPrice * factor)),
      totalPrice: round2(price + (offer.shipping ?? 0)),
      storeId,
    };
  }

  /**
   * Dev/test hook: pin one offer's item price (shipping is kept). The offer is
   * replaced in place, so search, browse and detail all see the new price.
   * Returns false when the product or retailer offer does not exist.
   * Callers that hold a Catalog must clear its cache to see the change at once.
   */
  setPriceOverride(productId: string, retailerId: RetailerId, price: number): boolean {
    const product = this.products.get(productId);
    const index = product?.offers.findIndex((o) => o.retailerId === retailerId) ?? -1;
    if (!product || index < 0 || !Number.isFinite(price) || price <= 0) return false;
    const pin = (offers: ProviderOffer[], i: number) => {
      const old = offers[i]!;
      offers[i] = { ...old, price: round2(price), listPrice: null, totalPrice: round2(price + (old.shipping ?? 0)), inStock: true };
    };
    // A grocery listing also appears as an 'equivalent' offer inside other
    // stores' products: keep every appearance at the same price.
    const listing = this.listingOf.get(product.offers[index]!.id);
    if (!listing) {
      pin(product.offers, index);
      return true;
    }
    for (const p of this.products.values()) {
      p.offers.forEach((o, i) => {
        if (o.retailerId === retailerId && this.listingOf.get(o.id) === listing) pin(p.offers, i);
      });
    }
    return true;
  }

  async browse(opts: ProviderCallOptions = {}): Promise<ProviderProduct[]> {
    await sleep(this.latencyMs, opts.signal);
    // One representative per store-brand kind, as in search.
    return [...this.products.values()].filter((p) => (this.grocery.get(p.id)?.groupRank ?? 0) === 0);
  }

  async suggest(prefix: string, limit: number, opts: ProviderCallOptions = {}): Promise<string[]> {
    await sleep(Math.min(this.latencyMs, 50), opts.signal);
    const needle = prefix.toLowerCase().replace(/\s+/g, ' ').trimStart();
    if (!needle.trim()) return this.trendingQueries.slice(0, limit);
    const out: string[] = [];
    const push = (s: string) => {
      if (!out.includes(s) && out.length < limit) out.push(s);
    };
    for (const p of this.phrases) if (p.startsWith(needle)) push(p);
    for (const p of this.phrases) if (p.includes(` ${needle}`)) push(p);
    if (out.length < limit && queryTokens(needle).length > 0) {
      // Typo-tolerant fallback: suggest what the search engine would find.
      for (const hit of this.index.search(needle, limit)) {
        const g = this.grocery.get(hit.product.id);
        if (g) push(this.groceryPhrase(g));
        else push(`${hit.product.brand.toLowerCase()} ${NOUNS[hit.product.category] ?? hit.product.category.toLowerCase()}`);
      }
    }
    return out;
  }

  /** "Great Value Whole Milk, 1 gal" -> "whole milk"; "Barilla Spaghetti Pasta, 16 oz" -> "barilla spaghetti pasta". */
  private groceryPhrase(m: GroceryMeta): string {
    const name = m.title.split(',')[0]!.toLowerCase();
    const brand = m.brand.toLowerCase();
    return m.group && name.startsWith(`${brand} `) ? name.slice(brand.length + 1) : name;
  }

  /** Suggestion phrases, most general first. */
  private buildPhrases(): string[] {
    const phrases = new Set<string>(this.trendingQueries);
    const loaded = new Set([...this.products.values()].map((p) => p.category));
    for (const [category, noun] of Object.entries(NOUNS)) if (loaded.has(category)) phrases.add(noun);
    for (const m of this.grocery.values()) phrases.add(this.groceryPhrase(m));
    for (const m of [...this.seeds.values(), ...this.grocery.values()]) for (const k of m.keywords ?? []) if (k.includes(' ')) phrases.add(k);
    for (const seed of this.seeds.values()) {
      phrases.add(`${seed.brand.toLowerCase()} ${CATEGORY_NOUN[seed.category] ?? seed.category.toLowerCase()}`);
    }
    for (const seed of this.seeds.values()) {
      // Short product name: first few title words, e.g. "sony wh-1000xm5 wireless noise".
      phrases.add(seed.title.toLowerCase().split(/\s+/).slice(0, 4).join(' '));
    }
    return [...phrases];
  }

  /** Test helper. */
  static idFor(title: string): string {
    return slugify(title);
  }
}

export { tokenize };
