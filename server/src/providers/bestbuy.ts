/**
 * ============================================================================
 *  UNVERIFIED AGAINST LIVE API
 * ============================================================================
 * Best Buy Products API adapter. This file was written WITHOUT access to the
 * API or an API key, from memory of the public documentation. Nothing here has
 * been exercised against https://api.bestbuy.com. It is OFF by default
 * (PRICE_PROVIDERS=mock) and must not be enabled in production until every
 * item below has been checked against the official docs
 * (https://bestbuyapis.github.io/api-documentation/) and a real response:
 *
 *   1. Base URL and path:        GET https://api.bestbuy.com/v1/products(<filter>)
 *   2. Auth:                     `apiKey` QUERY parameter (so URLs are secrets:
 *                                this adapter never logs or throws them).
 *   3. Filter syntax:            (search=word&search=word), (sku=123), (upc=012345678905),
 *                                categoryPath.name="Name" — and how values must be URL-encoded.
 *   4. Query parameters:         format=json, pageSize (max 100?), show=<field list>, sort.
 *   5. Response envelope:        { products: [...] } (plus from/to/total/currentPage).
 *   6. Field names and types:    sku, name, manufacturer, upc, salePrice, regularPrice,
 *                                onlineAvailability, customerReviewAverage, customerReviewCount,
 *                                url, image, categoryPath[].name, shippingCost, freeShipping,
 *                                shortDescription, longDescription, features[].feature.
 *   7. Whether `upc` is always a 12-digit UPC-A, and whether it can be missing.
 *   8. `shippingCost` semantics (number vs "" when unknown) and `freeShipping`.
 *   9. Rate limits (believed 5 requests/second, 50,000/day) — this adapter does
 *      NOT throttle; the catalog cache is the only protection.
 *  10. Terms of use: price display/caching/attribution requirements and whether
 *      `url` may be used as the outbound link (affiliate links need `linkShareAffiliateUrl`/Impact).
 *
 * The HTTP call (`request`) and the mapping (`mapBestBuyProduct`) are kept
 * small and separate so fixing either after verification is a local change.
 * The mapping is covered by fixture tests (test/providers.test.ts) — fixtures
 * that were ALSO written from memory, so they prove internal consistency only.
 * ============================================================================
 */
import { normalizeGtin } from '../gtin.js';
import { asNumber, asString, type FetchLike, getJson, pickCategory, plainText, positionalRelevance, round2 } from './http.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderOffer,
  ProviderProductDetail,
  ProviderSearchHit,
  ProviderSearchOptions,
} from './types.js';

export const BESTBUY_BASE_URL = 'https://api.bestbuy.com/v1/products';
export const BESTBUY_ID_PREFIX = 'bby-';
const SHOW = [
  'sku', 'name', 'manufacturer', 'upc', 'salePrice', 'regularPrice', 'onlineAvailability', 'customerReviewAverage',
  'customerReviewCount', 'url', 'image', 'categoryPath.name', 'shippingCost', 'freeShipping', 'shortDescription',
  'longDescription', 'features.feature',
].join(',');

export interface BestBuyOptions {
  apiKey: string;
  /** Lower-cased CATALOG_CATEGORIES; narrows upstream queries and names the category. */
  categories?: readonly string[];
  fetch?: FetchLike;
  now?: () => Date;
}

type Raw = Record<string, unknown>;

/** Map one Best Buy product object. Returns null when it has no usable sku/name/price. */
export function mapBestBuyProduct(raw: unknown, observedAt: string, categories: readonly string[] = []): ProviderProductDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const sku = asString(r.sku);
  const title = asString(r.name);
  const price = asNumber(r.salePrice) ?? asNumber(r.regularPrice);
  if (!sku || !/^[A-Za-z0-9]+$/.test(sku) || !title || price === null || price <= 0) return null;

  const id = `${BESTBUY_ID_PREFIX}${sku}`;
  const regular = asNumber(r.regularPrice);
  const shipping = r.freeShipping === true ? 0 : asNumber(r.shippingCost);
  const url = asString(r.url);
  const path = Array.isArray(r.categoryPath)
    ? r.categoryPath.map((c) => asString((c as Raw | null)?.name)).filter((n): n is string => n !== null)
    : [];
  const features = Array.isArray(r.features)
    ? r.features.map((f) => plainText((f as Raw | null)?.feature, 60)).filter((f) => f.length > 0)
    : [];
  const gtin = normalizeGtin(asString(r.upc));
  const reviewCount = asNumber(r.customerReviewCount);

  const offer: ProviderOffer = {
    id: `${id}:bestbuy`,
    productId: id,
    retailerId: 'bestbuy',
    price: round2(price),
    listPrice: regular !== null && regular > price ? round2(regular) : null,
    shipping: shipping === null ? null : round2(Math.max(0, shipping)),
    totalPrice: round2(price + Math.max(0, shipping ?? 0)),
    inStock: r.onlineAvailability === true,
    membershipRequired: false,
    rating: asNumber(r.customerReviewAverage),
    reviewCount: reviewCount === null ? null : Math.max(0, Math.round(reviewCount)),
    delivery: null,
    url: url && /^https:\/\/([a-z0-9-]+\.)*bestbuy\.com\//i.test(url) ? url : `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(title)}`,
    observedAt,
    priceSource: 'live',
    matchType: 'exact',
    offerTitle: null,
    size: null,
    storeId: null,
  };
  return {
    id,
    title,
    brand: asString(r.manufacturer) ?? 'Unknown',
    category: pickCategory(path, categories),
    imageUrl: asString(r.image),
    gtin,
    size: null,
    isStoreBrand: false,
    highlights: features.slice(0, 4),
    offers: [offer],
    description: plainText(r.longDescription) || plainText(r.shortDescription),
    priceHistory: [],
    reviewSummary: null,
  };
}

/** Best Buy filter values sit inside the URL path: keep them to a safe alphabet. */
const term = (s: string) => encodeURIComponent(s.replace(/[^A-Za-z0-9.\- ]/g, ' ').trim());

export class BestBuyProvider implements PriceProvider {
  readonly name = 'bestbuy';
  private readonly fetchImpl: FetchLike;
  private readonly categories: readonly string[];

  constructor(private readonly opts: BestBuyOptions) {
    if (!opts.apiKey) throw new Error('BESTBUY_API_KEY is required for the "bestbuy" price provider');
    this.fetchImpl = opts.fetch ?? (fetch as unknown as FetchLike);
    this.categories = opts.categories ?? [];
  }

  /** The only place that talks HTTP. */
  private async request(filter: string, pageSize: number, opts: ProviderCallOptions): Promise<ProviderProductDetail[]> {
    const url = `${BESTBUY_BASE_URL}(${filter})?format=json&pageSize=${pageSize}&show=${SHOW}&apiKey=${encodeURIComponent(this.opts.apiKey)}`;
    const body = (await getJson(this.name, this.fetchImpl, url, {}, opts.signal)) as { products?: unknown } | null;
    const list = Array.isArray(body?.products) ? body.products : [];
    const observedAt = (this.opts.now?.() ?? new Date()).toISOString();
    return list.map((p) => mapBestBuyProduct(p, observedAt, this.categories)).filter((p): p is ProviderProductDetail => p !== null);
  }

  async search(query: string, opts: ProviderSearchOptions): Promise<ProviderSearchHit[]> {
    const words = query.split(/\s+/).map(term).filter(Boolean).slice(0, 8);
    if (words.length === 0) return [];
    let filter = words.map((w) => `search=${w}`).join('&');
    if (this.categories.length === 1) filter = `(${filter})&categoryPath.name=${term(this.categories[0]!)}*`;
    const products = await this.request(filter, Math.min(Math.max(1, opts.limit), 100), opts);
    return products.map((product, i) => ({ product, relevance: positionalRelevance(i, products.length) }));
  }

  async getProduct(id: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    if (!id.startsWith(BESTBUY_ID_PREFIX)) return null;
    const sku = id.slice(BESTBUY_ID_PREFIX.length);
    if (!/^\d{1,12}$/.test(sku)) return null;
    return (await this.request(`sku=${sku}`, 1, opts))[0] ?? null;
  }

  async lookupGtin(gtin: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    // Best Buy stores 12-digit UPC-A; a GTIN that does not fit in 12 digits is not a UPC.
    if (!/^00\d{12}$/.test(gtin)) return null;
    return (await this.request(`upc=${gtin.slice(2)}`, 1, opts))[0] ?? null;
  }
}
