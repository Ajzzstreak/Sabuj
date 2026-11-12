/**
 * Small in-memory search engine for the mock catalog: tokenized, with exact /
 * prefix / typo-tolerant matching over title, brand, category and keywords.
 */
import type { ProviderProduct } from '../types.js';

const STOPWORDS = new Set(['the', 'a', 'an', 'for', 'with', 'and', 'of', 'in', 'to', 'best', 'cheap', 'cheapest', 'new', 'buy', 'deal', 'deals', 'price']);

const SYNONYMS: Record<string, string> = {
  television: 'tv',
  televisions: 'tv',
  earbud: 'earbuds',
  earphones: 'earbuds',
  headphone: 'headphones',
  notebook: 'laptop',
  hoover: 'vacuum',
  cancelling: 'canceling',
};

export function normalizeToken(raw: string): string {
  let t = raw.toLowerCase();
  t = SYNONYMS[t] ?? t;
  // Light plural folding: cookers -> cooker, but keep short tokens and "ss".
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) {
    const singular = t.slice(0, -1);
    t = SYNONYMS[singular] ?? singular;
  }
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 0)
    .map(normalizeToken);
}

export function queryTokens(query: string): string[] {
  const all = tokenize(query);
  const kept = all.filter((t) => !STOPWORDS.has(t));
  return (kept.length ? kept : all).slice(0, 8);
}

/** Damerau-Levenshtein distance with an early exit above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** 0..1 similarity of a query token against one indexed token. */
export function tokenMatch(q: string, t: string): number {
  if (q === t) return 1;
  if (q.length >= 2 && t.startsWith(q)) return 0.75 + 0.2 * (q.length / t.length);
  if (/\d/.test(q) || /\d/.test(t)) return 0; // never fuzz model numbers / sizes
  const allowed = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0;
  if (allowed === 0) return 0;
  const d = editDistance(q, t, allowed);
  if (d <= allowed) return d === 1 ? 0.65 : 0.5;
  // Typo inside a prefix: "zojir" + typo vs "zojirushi".
  if (q.length >= 5 && t.length > q.length && editDistance(q, t.slice(0, q.length), 1) <= 1) return 0.5;
  return 0;
}

interface IndexedField {
  tokens: string[];
  weight: number;
}

interface IndexedProduct {
  product: ProviderProduct;
  fields: IndexedField[];
  phrase: string;
  popularity: number;
  boost: number;
}

export interface SearchExtras {
  keywords?: string[];
  categoryNoun?: string;
  /**
   * Index only the noun, not the category name. Grocery aisles are compound
   * names ("Dairy & Eggs"): indexing them would make every yogurt match "eggs".
   */
  nounOnly?: boolean;
  /** Small additive relevance bonus (0..0.05) for staple items, applied to matches only. */
  boost?: number;
}

export class SearchIndex {
  private readonly docs: IndexedProduct[];

  constructor(products: ProviderProduct[], extras: (p: ProviderProduct) => SearchExtras) {
    const maxReviews = Math.max(1, ...products.map((p) => p.offers.reduce((n, o) => n + (o.reviewCount ?? 0), 0)));
    this.docs = products.map((product) => {
      const x = extras(product);
      const reviews = product.offers.reduce((n, o) => n + (o.reviewCount ?? 0), 0);
      const title = tokenize(product.title);
      const category = tokenize(x.nounOnly ? (x.categoryNoun ?? '') : `${product.category} ${x.categoryNoun ?? ''}`);
      return {
        product,
        fields: [
          { tokens: title, weight: 1 },
          { tokens: tokenize(product.brand), weight: 0.95 },
          { tokens: category, weight: 0.9 },
          { tokens: tokenize((x.keywords ?? []).join(' ')), weight: 0.8 },
          { tokens: tokenize(product.highlights.join(' ')), weight: 0.5 },
        ],
        phrase: ` ${[...title, ...category].join(' ')} `,
        popularity: Math.log10(reviews + 1) / Math.log10(maxReviews + 1),
        boost: x.boost ?? 0,
      };
    });
  }

  search(query: string, limit: number): Array<{ product: ProviderProduct; relevance: number }> {
    const tokens = queryTokens(query);
    if (tokens.length === 0) return [];
    const phrase = ` ${tokens.join(' ')} `;
    const results: Array<{ product: ProviderProduct; relevance: number }> = [];
    for (const doc of this.docs) {
      let sum = 0;
      let matched = 0;
      for (const q of tokens) {
        let best = 0;
        for (const field of doc.fields) {
          for (const t of field.tokens) {
            const s = tokenMatch(q, t) * field.weight;
            if (s > best) best = s;
          }
          if (best >= 1) break;
        }
        if (best > 0) matched += 1;
        sum += best;
      }
      const coverage = matched / tokens.length;
      // Single-token queries must match; longer ones may miss at most half.
      if (matched === 0 || coverage < 0.5) continue;
      let score = (sum / tokens.length) * coverage * coverage;
      if (tokens.length > 1 && doc.phrase.includes(phrase)) score += 0.15;
      score = score * 0.9 + doc.popularity * 0.05 + doc.boost;
      results.push({ product: doc.product, relevance: Math.min(1, Math.round(score * 10000) / 10000) });
    }
    results.sort((a, b) => b.relevance - a.relevance || (a.product.id < b.product.id ? -1 : 1));
    return results.slice(0, limit);
  }
}
