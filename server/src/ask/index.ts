/**
 * POST /v1/ask: interpret a plain-English request, then run the NORMAL search
 * path and apply the interpretation as filters. Prices only ever come from the
 * catalog; the model (when used at all) never supplies one.
 */
import type { Catalog } from '../catalog.js';
import type { AskInterpretation, AskResponse, Offer, Product } from '../contract.js';
import type { ClaudeBudget } from '../profile/budget.js';
import { NEUTRAL_RANKING_PROFILE, personalizeProduct, type RankingProfile } from '../ranking.js';
import { RETAILERS, retailerName } from '../retailers.js';
import { isRankable, NO_CONTEXT, type ShopperContext } from '../shopper.js';
import { type AskCandidate, type ClaudeAsk, type ClaudeAskResult, MAX_ASK_CANDIDATES } from './claude.js';
import { normalizeAskText, parseAskRules } from './rules.js';

export const ASK_RESULT_LIMIT = 20;
const MUST_HAVE_BOOST = 0.3;
const MAX_REASON_CHARS = 280;

export interface AskServiceOptions {
  catalog: Catalog;
  /** null = no API key: rules only. */
  claude: ClaudeAsk | null;
  budget: ClaudeBudget;
  /** Hard deadline for the Claude call. */
  timeoutMs: number;
  cacheMaxEntries?: number;
  cacheTtlMs?: number;
  now?: () => number;
}

export type AskResult = Omit<AskResponse, 'tookMs'>;

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const cents = (n: number) => Math.round(n * 100);

/** Share of `mustHave` words found in the product's title/highlights (0..1), and which. */
export function matchMustHave(product: Pick<Product, 'title' | 'highlights'>, mustHave: readonly string[]): string[] {
  if (mustHave.length === 0) return [];
  const haystack = ` ${[product.title, ...product.highlights].join(' ').toLowerCase()} `;
  return mustHave.filter((term) => {
    const t = term.toLowerCase();
    return haystack.includes(t) || (t.length > 3 && t.endsWith('s') && haystack.includes(t.slice(0, -1)));
  });
}

/**
 * The lowest SHELF price a shopper can pay for this product right now: the
 * cheapest in-stock, eligible, priced offer by landedPrice (the exact item
 * wins a tie over another store's equivalent). This is what "under $4" means —
 * unlike `cheapestOfferId`, which for mixed sizes is the best price PER UNIT
 * and may be a bulk pack costing more at the till.
 */
export function lowestShelfOffer(product: Pick<Product, 'offers'>): Offer | null {
  let best: Offer | null = null;
  for (const o of product.offers) {
    if (!isRankable(o)) continue;
    if (!best || o.landedPrice < best.landedPrice || (o.landedPrice === best.landedPrice && o.matchType === 'exact' && best.matchType !== 'exact')) best = o;
  }
  return best;
}

/**
 * Run the catalog search for an interpretation and apply its filters:
 * retailers (offers are limited to those stores), maxPrice (on the landedPrice
 * of the cheapest eligible offer by shelf price), minRating, mustHave (relevance
 * boost; with a price/rating sort, products matching more of it come first), sort.
 */
export async function searchWithInterpretation(
  catalog: Catalog,
  interpretation: AskInterpretation,
  ctx: ShopperContext,
  profile: RankingProfile | null,
  limit = ASK_RESULT_LIMIT,
): Promise<Product[]> {
  if (!interpretation.query.trim()) return [];
  const { value: hits } = await catalog.search(interpretation.query, ctx.stores);
  const allowed = interpretation.retailers;
  const rows: Array<{ product: Product; score: number; price: number; matched: number; index: number }> = [];
  hits.forEach((hit, index) => {
    const base = allowed ? { ...hit.product, offers: hit.product.offers.filter((o) => allowed.includes(o.retailerId)) } : hit.product;
    if (base.offers.length === 0) return;
    const product = personalizeProduct(base, profile ?? NEUTRAL_RANKING_PROFILE, ctx);
    const cheapest = lowestShelfOffer(product);
    if ((allowed || interpretation.maxPrice !== null) && !cheapest) return;
    if (interpretation.maxPrice !== null && cheapest && cheapest.landedPrice > interpretation.maxPrice) return;
    if (interpretation.minRating !== null && (product.rating === null || product.rating < interpretation.minRating)) return;
    const matched = matchMustHave(product, interpretation.mustHave).length;
    const boost = interpretation.mustHave.length > 0 ? (MUST_HAVE_BOOST * matched) / interpretation.mustHave.length : 0;
    rows.push({ product, score: hit.relevance * (1 + boost), price: cheapest ? cheapest.landedPrice : Number.POSITIVE_INFINITY, matched, index });
  });
  rows.sort((a, b) => {
    // "cheap gluten free pasta": the gluten-free ones first, cheapest among them.
    if (interpretation.sort !== 'best_match' && a.matched !== b.matched) return b.matched - a.matched;
    if (interpretation.sort === 'lowest_price' && a.price !== b.price) return a.price - b.price;
    if (interpretation.sort === 'top_rated') {
      const byRating = (b.product.rating ?? 0) - (a.product.rating ?? 0);
      if (byRating !== 0) return byRating;
      if (b.product.reviewCount !== a.product.reviewCount) return b.product.reviewCount - a.product.reviewCount;
    }
    return b.score - a.score || a.index - b.index;
  });
  return rows.slice(0, limit).map((r) => r.product);
}

/**
 * True when every dollar figure in `reason` equals a real price field of one
 * of the product's offers (item price, total, landed or list price). A reason
 * that fails is dropped: the model must never be the source of a price.
 */
export function reasonPricesValid(reason: string, product: Pick<Product, 'offers'>): boolean {
  const allowed = new Set<number>();
  for (const o of product.offers) {
    if (o.priceSource === 'link_only') continue;
    for (const v of [o.price, o.totalPrice, o.landedPrice, o.listPrice]) if (typeof v === 'number') allowed.add(cents(v));
  }
  const figures = [
    ...reason.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g),
    ...reason.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|bucks|usd)\b/gi),
  ];
  return figures.every((m) => allowed.has(cents(Number(m[1]!.replace(/,/g, '')))));
}

/** Server-side checks on a model-written note. Returns the note or null. */
export function vetModelReason(reason: string | undefined, product: Product): string | null {
  if (!reason) return null;
  const text = reason.replace(/\s+/g, ' ').trim();
  if (text.length < 8 || text.length > MAX_REASON_CHARS) return null;
  if (/https?:|www\.|[<>{}]/i.test(text)) return null;
  // The note is cached and shared between shoppers whose best store differs: no store names.
  if (RETAILERS.some((r) => text.toLowerCase().includes(r.name.toLowerCase()))) return null;
  if (/\d\s?%|\bsav(?:e|es|ing|ings)\b|\bdiscount/i.test(text)) return null;
  return reasonPricesValid(text, product) ? text : null;
}

/** Deterministic reason built only from fields the server holds. */
export function templateReason(product: Product | undefined, interpretation: AskInterpretation): string | null {
  if (!product) return null;
  const cheapest = lowestShelfOffer(product);
  const parts: string[] = [];
  if (cheapest) {
    // Another store's comparable item is named as such, never passed off as this product.
    const subject = cheapest.matchType === 'equivalent' && cheapest.offerTitle ? `${cheapest.offerTitle} (comparable to ${product.title})` : product.title;
    let s = `${subject} is ${money(cheapest.landedPrice)} at ${retailerName(cheapest.retailerId)}`;
    if (interpretation.maxPrice !== null) s += `, within your ${money(interpretation.maxPrice)} limit`;
    parts.push(s);
  } else {
    parts.push(`${product.title} is the closest match`);
  }
  if (product.rating !== null && product.reviewCount > 0) {
    parts.push(`rated ${product.rating.toFixed(1)}★ across ${product.reviewCount.toLocaleString('en-US')} reviews`);
  }
  let out = parts.join(', ');
  const matched = matchMustHave(product, interpretation.mustHave);
  if (matched.length > 0) out += `. Matches what you asked for: ${matched.join(', ')}`;
  return `${out}.`;
}

interface CacheEntry {
  at: number;
  result: ClaudeAskResult;
}

export class AskService {
  /** Claude interpretations by normalized text. Shared by all shoppers, so it holds nothing personal. */
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheMax: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: AskServiceOptions) {
    this.cacheMax = opts.cacheMaxEntries ?? 2000;
    this.cacheTtlMs = opts.cacheTtlMs ?? 6 * 3_600_000;
    this.now = opts.now ?? Date.now;
  }

  async ask(text: string, ctx: ShopperContext = NO_CONTEXT, profile: RankingProfile | null = null): Promise<AskResult> {
    const rules = parseAskRules(text);
    const claude = await this.interpretWithClaude(text, rules);
    const interpretation = claude?.interpretation ?? rules;
    const products = await searchWithInterpretation(this.opts.catalog, interpretation, ctx, profile);
    const top = products[0];
    const modelReason = top && claude ? vetModelReason(claude.reasons[top.id], top) : null;
    return {
      interpretation,
      products,
      retailers: RETAILERS,
      topPickReason: modelReason ?? templateReason(top, interpretation),
      source: claude ? 'claude' : 'rules',
    };
  }

  private async interpretWithClaude(text: string, rules: AskInterpretation): Promise<ClaudeAskResult | null> {
    const claude = this.opts.claude;
    if (!claude) return null;
    const key = normalizeAskText(text);
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.cacheTtlMs) {
      this.cache.delete(key); // refresh LRU position
      this.cache.set(key, hit);
      return hit.result;
    }
    if (!this.opts.budget.take()) return null; // global hourly cost ceiling reached

    // Candidates come from the rules query, unpersonalized and tax-free, so the
    // cached result is the same for every shopper.
    let candidates: AskCandidate[] = [];
    try {
      const prelim = await searchWithInterpretation(this.opts.catalog, rules, NO_CONTEXT, null, MAX_ASK_CANDIDATES);
      candidates = prelim.map((p) => {
        const cheapest = lowestShelfOffer(p);
        return { id: p.id, title: p.title, highlights: p.highlights.slice(0, 6), price: cheapest ? cheapest.totalPrice : null, rating: p.rating, reviewCount: p.reviewCount };
      });
    } catch {
      /* no candidates: the model still interprets the request */
    }

    // Hard deadline: abort the HTTP request AND stop waiting, whichever the SDK honours first.
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, this.opts.timeoutMs);
    });
    let result: ClaudeAskResult | null;
    try {
      result = await Promise.race([claude.interpret(text, candidates, controller.signal, this.opts.timeoutMs).catch(() => null), deadline]);
    } finally {
      clearTimeout(timer);
    }
    if (!result) return null;
    if (this.cache.size >= this.cacheMax) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: this.now(), result });
    return result;
  }
}
