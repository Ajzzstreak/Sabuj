import type { RetailerId } from '../../contract.js';
import { normalizeGtin } from '../../gtin.js';
import { isRetailerId } from '../../retailers.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderProduct,
  ProviderProductDetail,
  ProviderSearchHit,
  ProviderSearchOptions,
} from '../types.js';
import { CATEGORY_NOUN, SEEDS, TRENDING_QUERIES, type CatalogSeed } from './catalog.js';
import { buildDetail, buildProduct, slugify } from './generate.js';
import { queryTokens, SearchIndex, tokenize } from './search.js';

export interface MockProviderOptions {
  /** Artificial delay per call, to simulate a real upstream. */
  latencyMs?: number;
  now?: () => Date;
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
  private readonly seeds = new Map<string, CatalogSeed>();
  private readonly products = new Map<string, ProviderProduct>();
  private readonly byGtin = new Map<string, string>();
  private readonly index: SearchIndex;
  private readonly phrases: string[];
  private readonly trending: string[];

  constructor(opts: MockProviderOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 0;
    this.now = opts.now ?? (() => new Date());
    // Prices are "observed" at the top of the current hour.
    const observed = this.now();
    observed.setUTCMinutes(0, 0, 0);
    const observedAt = observed.toISOString();
    const categories = opts.categories ?? [];
    for (const seed of SEEDS) {
      if (categories.length > 0 && !categories.includes(seed.category.toLowerCase())) continue;
      const product = buildProduct(seed, observedAt);
      if (this.products.has(product.id)) throw new Error(`duplicate mock product id: ${product.id}`);
      this.products.set(product.id, product);
      this.seeds.set(product.id, seed);
      const gtin = normalizeGtin(product.gtin);
      if (gtin) this.byGtin.set(gtin, product.id);
    }
    for (const [key, price] of opts.priceOverrides ?? []) {
      const i = key.lastIndexOf(':');
      this.setPriceOverride(key.slice(0, i), key.slice(i + 1) as RetailerId, price);
    }
    this.index = new SearchIndex([...this.products.values()], (p) => ({
      keywords: this.seeds.get(p.id)?.keywords,
      categoryNoun: CATEGORY_NOUN[p.category],
    }));
    // With a category scope, only trending queries that still find something.
    this.trending = categories.length === 0 ? TRENDING_QUERIES : TRENDING_QUERIES.filter((q) => this.index.search(q, 1).length > 0);
    this.phrases = this.buildPhrases();
  }

  async search(query: string, opts: ProviderSearchOptions): Promise<ProviderSearchHit[]> {
    await sleep(this.latencyMs, opts.signal);
    return this.index.search(query, opts.limit);
  }

  async getProduct(id: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    await sleep(this.latencyMs, opts.signal);
    const product = this.products.get(id);
    const seed = this.seeds.get(id);
    if (!product || !seed) return null;
    return buildDetail(product, seed, this.now());
  }

  async lookupGtin(gtin: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    const id = this.byGtin.get(gtin);
    return id ? this.getProduct(id, opts) : null;
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
    const old = product.offers[index]!;
    product.offers[index] = { ...old, price: round2(price), totalPrice: round2(price + (old.shipping ?? 0)), inStock: true };
    return true;
  }

  async browse(opts: ProviderCallOptions = {}): Promise<ProviderProduct[]> {
    await sleep(this.latencyMs, opts.signal);
    return [...this.products.values()];
  }

  async suggest(prefix: string, limit: number, opts: ProviderCallOptions = {}): Promise<string[]> {
    await sleep(Math.min(this.latencyMs, 50), opts.signal);
    const needle = prefix.toLowerCase().replace(/\s+/g, ' ').trimStart();
    if (!needle.trim()) return this.trending.slice(0, limit);
    const out: string[] = [];
    const push = (s: string) => {
      if (!out.includes(s) && out.length < limit) out.push(s);
    };
    for (const p of this.phrases) if (p.startsWith(needle)) push(p);
    for (const p of this.phrases) if (p.includes(` ${needle}`)) push(p);
    if (out.length < limit && queryTokens(needle).length > 0) {
      // Typo-tolerant fallback: suggest what the search engine would find.
      for (const hit of this.index.search(needle, limit)) {
        const noun = CATEGORY_NOUN[hit.product.category] ?? hit.product.category.toLowerCase();
        push(`${hit.product.brand.toLowerCase()} ${noun}`);
      }
    }
    return out;
  }

  /** Suggestion phrases, most general first. */
  private buildPhrases(): string[] {
    const phrases = new Set<string>(this.trending);
    const loaded = new Set([...this.seeds.values()].map((seed) => seed.category));
    for (const [category, noun] of Object.entries(CATEGORY_NOUN)) if (loaded.has(category)) phrases.add(noun);
    for (const seed of this.seeds.values()) for (const k of seed.keywords ?? []) if (k.includes(' ')) phrases.add(k);
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
