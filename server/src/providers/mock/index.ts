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
}

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
  private readonly index: SearchIndex;
  private readonly phrases: string[];

  constructor(opts: MockProviderOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 0;
    this.now = opts.now ?? (() => new Date());
    // Prices are "observed" at the top of the current hour.
    const observed = this.now();
    observed.setUTCMinutes(0, 0, 0);
    const observedAt = observed.toISOString();
    for (const seed of SEEDS) {
      const product = buildProduct(seed, observedAt);
      if (this.products.has(product.id)) throw new Error(`duplicate mock product id: ${product.id}`);
      this.products.set(product.id, product);
      this.seeds.set(product.id, seed);
    }
    this.index = new SearchIndex([...this.products.values()], (p) => ({
      keywords: this.seeds.get(p.id)?.keywords,
      categoryNoun: CATEGORY_NOUN[p.category],
    }));
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

  async browse(opts: ProviderCallOptions = {}): Promise<ProviderProduct[]> {
    await sleep(this.latencyMs, opts.signal);
    return [...this.products.values()];
  }

  async suggest(prefix: string, limit: number, opts: ProviderCallOptions = {}): Promise<string[]> {
    await sleep(Math.min(this.latencyMs, 50), opts.signal);
    const needle = prefix.toLowerCase().replace(/\s+/g, ' ').trimStart();
    if (!needle.trim()) return TRENDING_QUERIES.slice(0, limit);
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
    const phrases = new Set<string>(TRENDING_QUERIES);
    for (const noun of Object.values(CATEGORY_NOUN)) phrases.add(noun);
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
