/**
 * ============================================================================
 *  UNVERIFIED AGAINST LIVE API
 * ============================================================================
 * Walmart Affiliate API (walmart.io "Affiliate Marketing API") adapter. Written
 * WITHOUT access to the API or credentials, from memory of the public docs.
 * Nothing here has been exercised against Walmart. It is OFF by default
 * (PRICE_PROVIDERS=mock) and must not be enabled in production until every
 * item below has been checked against https://walmart.io/docs/affiliate and a
 * real response:
 *
 *   1. Base URL and paths:   https://developer.api.walmart.com/api-proxy/service/affil/product/v2
 *                            /search?query=&numItems=   /items/{itemId}   /items?upc=
 *   2. Auth headers:         WM_CONSUMER.ID, WM_CONSUMER.INTIMESTAMP (epoch ms),
 *                            WM_SEC.KEY_VERSION, WM_SEC.AUTH_SIGNATURE.
 *   3. Signature:            RSA-SHA256 (base64) with the registered private key over
 *                            "<consumerId>\n<timestamp>\n<keyVersion>\n" — verify the exact
 *                            canonical string, header ordering and trailing newline.
 *   4. Private key format:   this adapter expects a PEM (PKCS#8) key in WALMART_PRIVATE_KEY
 *                            with literal "\n" for newlines.
 *   5. Search parameters:    query, numItems (max 25?), categoryId, sort, publisherId.
 *   6. Response envelopes:   search -> { items: [...] }; /items?upc= -> { items: [...] };
 *                            /items/{id} -> a single item object (or { items: [...] }?).
 *   7. Field names/types:    itemId, name, salePrice, msrp, upc, categoryPath ("A/B/C"),
 *                            brandName, shortDescription, longDescription, thumbnailImage,
 *                            mediumImage, largeImage, productTrackingUrl, productUrl,
 *                            standardShipRate, freeShippingOver35Dollars, customerRating
 *                            (string), numReviews, stock ("Available" | "Not available"),
 *                            availableOnline.
 *   8. Shipping:             whether standardShipRate is reliable, and the free-shipping
 *                            threshold (assumed: free at $35+ when freeShippingOver35Dollars).
 *   9. Not-found behaviour:  HTTP 404 vs 400 vs empty list for unknown ids/UPCs (this adapter
 *                            treats 400 and 404 as "not found").
 *  10. Grocery fields:        there is no reliable structured package size in this API as far
 *                            as remembered. `size` is PARSED FROM THE TITLE (heuristic, see
 *                            parseSize) and can be wrong or missing; unit prices inherit that.
 *                            `isStoreBrand` comes from a guessed list of Walmart labels. Prices
 *                            are walmart.com prices, NOT per-store shelf prices: storeId is null.
 *  11. Rate limits and terms: calls/second and/day, price caching limits, required
 *                            attribution, and that productTrackingUrl is the link to use.
 *
 * The HTTP call (`request`) and the mapping (`mapWalmartItem`) are kept small
 * and separate. The mapping is covered by fixture tests whose fixtures were
 * ALSO written from memory — they prove internal consistency only.
 * ============================================================================
 */
import { createSign } from 'node:crypto';
import { normalizeGtin } from '../gtin.js';
import { parseSize } from '../size.js';
import { asNumber, asString, type FetchLike, getJson, pickCategory, plainText, positionalRelevance, ProviderHttpError, round2 } from './http.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderOffer,
  ProviderProductDetail,
  ProviderSearchHit,
  ProviderSearchOptions,
} from './types.js';

export const WALMART_BASE_URL = 'https://developer.api.walmart.com/api-proxy/service/affil/product/v2';
export const WALMART_ID_PREFIX = 'wmt-';
const FREE_SHIPPING_THRESHOLD = 35;
/** Guess at Walmart's own labels (header item 10). */
export const WALMART_STORE_BRANDS: ReadonlySet<string> = new Set(['great value', 'marketside', 'freshness guaranteed', "sam's choice", 'equate', "parent's choice", 'bettergoods']);

export interface WalmartOptions {
  consumerId: string;
  /** PEM private key (PKCS#8). */
  privateKey: string;
  keyVersion: string;
  publisherId?: string | null;
  categories?: readonly string[];
  fetch?: FetchLike;
  now?: () => Date;
}

type Raw = Record<string, unknown>;

/** Auth headers for one request. Exported for the signature test. */
export function walmartAuthHeaders(consumerId: string, privateKeyPem: string, keyVersion: string, timestampMs: number): Record<string, string> {
  const ts = String(timestampMs);
  const signer = createSign('RSA-SHA256');
  signer.update(`${consumerId}\n${ts}\n${keyVersion}\n`);
  return {
    'WM_CONSUMER.ID': consumerId,
    'WM_CONSUMER.INTIMESTAMP': ts,
    'WM_SEC.KEY_VERSION': keyVersion,
    'WM_SEC.AUTH_SIGNATURE': signer.sign(privateKeyPem, 'base64'),
  };
}

/** Map one Walmart item object. Returns null when it has no usable id/name/price. */
export function mapWalmartItem(raw: unknown, observedAt: string, categories: readonly string[] = []): ProviderProductDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  const itemId = asString(r.itemId);
  const title = asString(r.name);
  const price = asNumber(r.salePrice);
  if (!itemId || !/^\d{1,15}$/.test(itemId) || !title || price === null || price <= 0) return null;

  const id = `${WALMART_ID_PREFIX}${itemId}`;
  const msrp = asNumber(r.msrp);
  const rate = asNumber(r.standardShipRate);
  let shipping: number | null = rate === null ? null : Math.max(0, rate);
  if (r.freeShippingOver35Dollars === true && price >= FREE_SHIPPING_THRESHOLD) shipping = 0;
  const stock = asString(r.stock)?.toLowerCase();
  const inStock = stock === 'available' && r.availableOnline !== false;
  const link = asString(r.productTrackingUrl) ?? asString(r.productUrl);
  const path = (asString(r.categoryPath) ?? '').split('/').map((s) => s.trim()).filter(Boolean);
  const reviews = asNumber(r.numReviews);
  const brand = asString(r.brandName) ?? 'Unknown';
  // HEURISTIC: package size read out of the title, e.g. "Great Value Whole Milk, 1 gal".
  const size = parseSize(asString(r.size)) ?? parseSize(title);

  const offer: ProviderOffer = {
    id: `${id}:walmart`,
    productId: id,
    retailerId: 'walmart',
    price: round2(price),
    listPrice: msrp !== null && msrp > price ? round2(msrp) : null,
    shipping: shipping === null ? null : round2(shipping),
    totalPrice: round2(price + (shipping ?? 0)),
    inStock,
    membershipRequired: false,
    rating: asNumber(r.customerRating),
    reviewCount: reviews === null ? null : Math.max(0, Math.round(reviews)),
    delivery: null,
    url: link && /^https:\/\/([a-z0-9-]+\.)*walmart\.com\//i.test(link) ? link : `https://www.walmart.com/search?q=${encodeURIComponent(title)}`,
    observedAt,
    priceSource: 'live',
    matchType: 'exact',
    offerTitle: null,
    size,
    storeId: null,
  };
  return {
    id,
    title,
    brand,
    category: pickCategory(path, categories),
    imageUrl: asString(r.largeImage) ?? asString(r.mediumImage) ?? asString(r.thumbnailImage),
    gtin: normalizeGtin(asString(r.upc)),
    size,
    isStoreBrand: WALMART_STORE_BRANDS.has(brand.toLowerCase()),
    highlights: [],
    offers: [offer],
    description: plainText(r.shortDescription) || plainText(r.longDescription),
    priceHistory: [],
    reviewSummary: null,
  };
}

export class WalmartProvider implements PriceProvider {
  readonly name = 'walmart';
  private readonly fetchImpl: FetchLike;
  private readonly categories: readonly string[];
  private readonly privateKey: string;

  constructor(private readonly opts: WalmartOptions) {
    if (!opts.consumerId || !opts.privateKey) {
      throw new Error('WALMART_CONSUMER_ID and WALMART_PRIVATE_KEY are required for the "walmart" price provider');
    }
    this.privateKey = opts.privateKey.replace(/\\n/g, '\n');
    this.fetchImpl = opts.fetch ?? (fetch as unknown as FetchLike);
    this.categories = opts.categories ?? [];
  }

  /** The only place that talks HTTP. Resolves to the raw item list ([] when not found). */
  private async request(pathAndQuery: string, opts: ProviderCallOptions): Promise<ProviderProductDetail[]> {
    const now = this.opts.now?.() ?? new Date();
    const headers = walmartAuthHeaders(this.opts.consumerId, this.privateKey, this.opts.keyVersion, now.getTime());
    let body: unknown;
    try {
      body = await getJson(this.name, this.fetchImpl, `${WALMART_BASE_URL}${pathAndQuery}`, headers, opts.signal);
    } catch (err) {
      if (err instanceof ProviderHttpError && (err.status === 404 || err.status === 400)) return [];
      throw err;
    }
    const b = body as { items?: unknown } | null;
    const list = Array.isArray(b?.items) ? b.items : b && typeof b === 'object' && 'itemId' in b ? [b] : [];
    const observedAt = now.toISOString();
    return list.map((item) => mapWalmartItem(item, observedAt, this.categories)).filter((p): p is ProviderProductDetail => p !== null);
  }

  private publisher(): string {
    return this.opts.publisherId ? `&publisherId=${encodeURIComponent(this.opts.publisherId)}` : '';
  }

  async search(query: string, opts: ProviderSearchOptions): Promise<ProviderSearchHit[]> {
    if (!query.trim()) return [];
    const numItems = Math.min(Math.max(1, opts.limit), 25);
    const products = await this.request(`/search?query=${encodeURIComponent(query)}&numItems=${numItems}${this.publisher()}`, opts);
    return products.map((product, i) => ({ product, relevance: positionalRelevance(i, products.length) }));
  }

  async getProduct(id: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    if (!id.startsWith(WALMART_ID_PREFIX)) return null;
    const itemId = id.slice(WALMART_ID_PREFIX.length);
    if (!/^\d{1,15}$/.test(itemId)) return null;
    return (await this.request(`/items/${itemId}?${this.publisher().slice(1)}`, opts))[0] ?? null;
  }

  async lookupGtin(gtin: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    if (!/^00\d{12}$/.test(gtin)) return null; // Walmart looks items up by 12-digit UPC
    return (await this.request(`/items?upc=${gtin.slice(2)}${this.publisher()}`, opts))[0] ?? null;
  }
}
