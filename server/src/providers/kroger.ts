/**
 * ============================================================================
 *  UNVERIFIED AGAINST LIVE API
 * ============================================================================
 * Kroger public API adapter (Products + Locations, OAuth2 client credentials).
 * Written WITHOUT credentials or network access to api.kroger.com, from memory
 * of https://developer.kroger.com. Nothing here has been exercised against
 * Kroger. It is OFF by default (PRICE_PROVIDERS=mock) and must not be enabled
 * in production until every item below is checked against the official docs
 * and real responses:
 *
 *   1. Token endpoint:      POST https://api.kroger.com/v1/connect/oauth2/token
 *                           Authorization: Basic base64(clientId:clientSecret)
 *                           body: grant_type=client_credentials&scope=product.compact
 *                           -> { access_token, expires_in (seconds), token_type }.
 *   2. Scope:               that `product.compact` is the right scope for Products, and
 *                           whether Locations needs a scope at all (this adapter uses the
 *                           same token for both).
 *   3. Products search:     GET /v1/products?filter.term=&filter.locationId=&filter.limit=
 *                           (limit max believed 50; `filter.term` needs >= 3 characters).
 *   4. Product by id:       GET /v1/products/{productId}?filter.locationId=  -> { data: {...} }.
 *   5. Response shape:      { data: [ { productId, upc, brand, description, categories[],
 *                           items: [ { itemId, size, soldBy, price: { regular, promo },
 *                           fulfillment: { inStore, curbside, delivery, shipToHome },
 *                           inventory: { stockLevel } } ], images: [ { perspective,
 *                           sizes: [ { size, url } ] } ] } ] }.
 *   6. Prices:              that `price` is only present when filter.locationId is sent, that
 *                           `promo` is 0 (not absent) when there is no promotion, and whether
 *                           prices are in-store prices (assumed) for that location.
 *   7. UPC format:          Kroger's `upc`/`productId` are believed to be 13 digits WITHOUT a
 *                           standard check digit. `krogerUpcToGtin` / `gtinToKrogerUpc` encode
 *                           that belief (try as-is, else append a computed check digit). If
 *                           it is wrong, barcode lookup and cross-store GTIN merging silently
 *                           miss — verify with a few known products.
 *   8. Stock:               meaning of inventory.stockLevel (HIGH | LOW | TEMPORARILY_OUT_OF_STOCK)
 *                           and whether it is present for every location.
 *   9. Locations:           GET /v1/locations?filter.zipCode.near=&filter.limit=&filter.radiusInMiles=
 *                           -> { data: [ { locationId, chain, name, address: { addressLine1,
 *                           city, state, zipCode }, geolocation: { latitude, longitude } } ] },
 *                           nearest first (assumed). The response is NOT believed to include a
 *                           distance, and this server has no ZIP geocoder, so `distanceMiles`
 *                           is reported as 0 — fix before showing distances to users.
 *  10. Banners:             the API covers every Kroger-family banner (Ralphs, Fred Meyer,
 *                           King Soopers, ...). All are reported as retailer "kroger".
 *  11. Store brands:        the BRAND list in `KROGER_STORE_BRANDS` is a guess.
 *  12. Rate limits (believed 10,000 product calls/day) and terms of use: price display,
 *      caching and attribution rules, and what the outbound link may be.
 *
 * HTTP (`token`, `request`) and mapping (`mapKrogerProduct`, `mapKrogerLocation`)
 * are small and separate. The mapping is covered by fixture tests whose
 * fixtures were ALSO written from memory: they prove internal consistency only.
 * ============================================================================
 */
import type { RetailerId, Store } from '../contract.js';
import { normalizeGtin } from '../gtin.js';
import { parseSize } from '../size.js';
import { asNumber, asString, type FetchLike, getJson, pickCategory, positionalRelevance, ProviderHttpError, round2 } from './http.js';
import type {
  PriceProvider,
  ProviderCallOptions,
  ProviderOffer,
  ProviderProductDetail,
  ProviderSearchHit,
  ProviderSearchOptions,
} from './types.js';

export const KROGER_BASE_URL = 'https://api.kroger.com/v1';
export const KROGER_ID_PREFIX = 'kro-';
export const KROGER_STORE_PREFIX = 'kroger-';
const STORE_ID = /^kroger-([A-Za-z0-9]{4,12})$/;
/** Guess at Kroger's own labels (see header item 11). */
export const KROGER_STORE_BRANDS: ReadonlySet<string> = new Set(['kroger', 'simple truth', 'simple truth organic', 'private selection', 'comforts', 'smart way', 'heritage farm']);

export interface KrogerOptions {
  clientId: string;
  clientSecret: string;
  categories?: readonly string[];
  fetch?: FetchLike;
  now?: () => Date;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null);

function gtinCheckDigit(digits13: string): number {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += (digits13.charCodeAt(12 - i) - 48) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * Kroger UPC -> canonical GTIN-14. Kroger's 13-digit codes are believed to omit
 * the check digit: if the code is not already a valid GTIN, append one.
 * HEURISTIC, unverified (header item 7).
 */
export function krogerUpcToGtin(upc: string | null): string | null {
  if (!upc || !/^\d{8,14}$/.test(upc)) return null;
  const asIs = normalizeGtin(upc);
  if (asIs) return asIs;
  return upc.length === 13 ? normalizeGtin(`${upc}${gtinCheckDigit(upc)}`) : null;
}

/** Canonical GTIN-14 -> the 13-digit code Kroger is believed to use (check digit dropped). */
export function gtinToKrogerUpc(gtin14: string): string {
  return gtin14.slice(0, 13);
}

/** Map one Kroger product. Without a location Kroger sends no price: the offer is then link-only. */
export function mapKrogerProduct(raw: unknown, observedAt: string, storeId: string | null, categories: readonly string[] = []): ProviderProductDetail | null {
  const r = obj(raw);
  const productId = asString(r?.productId);
  const title = asString(r?.description);
  if (!r || !productId || !/^[A-Za-z0-9]{1,20}$/.test(productId) || !title) return null;

  const id = `${KROGER_ID_PREFIX}${productId}`;
  const item = obj(Array.isArray(r.items) ? r.items[0] : null) ?? {};
  const price = obj(item.price);
  const regular = asNumber(price?.regular);
  const promo = asNumber(price?.promo);
  const current = promo !== null && promo > 0 && (regular === null || promo < regular) ? promo : regular;
  const priced = current !== null && current > 0;
  const stock = asString(obj(item.inventory)?.stockLevel)?.toUpperCase() ?? null;
  const fulfillment = obj(item.fulfillment);
  const size = parseSize(asString(item.size)) ?? parseSize(title);
  const brand = asString(r.brand) ?? 'Unknown';
  const images = Array.isArray(r.images) ? r.images.map(obj).filter((x): x is Raw => x !== null) : [];
  const front = images.find((i) => i.perspective === 'front') ?? images[0];
  const sizes = Array.isArray(front?.sizes) ? front.sizes.map(obj).filter((x): x is Raw => x !== null) : [];
  const image = asString((sizes.find((s) => s.size === 'medium') ?? sizes[0])?.url);
  const path = Array.isArray(r.categories) ? r.categories.map(asString).filter((c): c is string => c !== null) : [];
  const url = `https://www.kroger.com/search?query=${encodeURIComponent(title)}`;

  const offer: ProviderOffer = {
    id: `${id}:kroger`,
    productId: id,
    retailerId: 'kroger',
    price: priced ? round2(current) : 0,
    listPrice: priced && regular !== null && regular > current ? round2(regular) : null,
    // In-store / pickup price: nothing to ship.
    shipping: priced ? 0 : null,
    totalPrice: priced ? round2(current) : 0,
    // Unknown stock level is treated as available; only an explicit out-of-stock is not.
    inStock: stock !== 'TEMPORARILY_OUT_OF_STOCK' && fulfillment?.inStore !== false,
    membershipRequired: false,
    rating: null,
    reviewCount: null,
    delivery: priced ? (fulfillment?.curbside === true ? 'Pickup' : 'In store') : null,
    url,
    observedAt,
    priceSource: priced ? 'live' : 'link_only',
    matchType: 'exact',
    offerTitle: null,
    size,
    storeId: priced ? storeId : null,
  };
  return {
    id,
    title,
    brand,
    category: pickCategory(path, categories),
    imageUrl: image && /^https:\/\//i.test(image) ? image : null,
    gtin: krogerUpcToGtin(asString(r.upc) ?? productId),
    size,
    isStoreBrand: KROGER_STORE_BRANDS.has(brand.toLowerCase()),
    highlights: asString(item.size) ? [asString(item.size)!] : [],
    offers: [offer],
    description: title,
    priceHistory: [],
    reviewSummary: null,
  };
}

/** Map one Kroger location. distanceMiles is 0: see header item 9. */
export function mapKrogerLocation(raw: unknown): Store | null {
  const r = obj(raw);
  const locationId = asString(r?.locationId);
  if (!r || !locationId || !/^[A-Za-z0-9]{4,12}$/.test(locationId)) return null;
  const a = obj(r.address) ?? {};
  const line = [asString(a.addressLine1), asString(a.city), [asString(a.state), asString(a.zipCode)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    id: `${KROGER_STORE_PREFIX}${locationId}`,
    retailerId: 'kroger',
    name: asString(r.name) ?? asString(r.chain) ?? 'Kroger',
    address: line,
    distanceMiles: 0,
  };
}

export class KrogerProvider implements PriceProvider {
  readonly name = 'kroger';
  /** Kroger prices only exist per location: the catalog keys its cache by the selected Kroger store. */
  readonly storeScopedRetailers: readonly RetailerId[] = ['kroger'];
  private readonly fetchImpl: FetchLike;
  private readonly categories: readonly string[];
  private readonly now: () => Date;
  private cached: { token: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;

  constructor(private readonly opts: KrogerOptions) {
    if (!opts.clientId || !opts.clientSecret) throw new Error('KROGER_CLIENT_ID and KROGER_CLIENT_SECRET are required for the "kroger" price provider');
    this.fetchImpl = opts.fetch ?? (fetch as unknown as FetchLike);
    this.categories = opts.categories ?? [];
    this.now = opts.now ?? (() => new Date());
  }

  /** Client-credentials token, cached until a minute before it expires; concurrent callers share one request. */
  private token(signal?: AbortSignal): Promise<string> {
    const now = this.now().getTime();
    if (this.cached && this.cached.expiresAt > now) return Promise.resolve(this.cached.token);
    this.pending ??= (async () => {
      try {
        const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64');
        const body = (await getJson(
          this.name,
          this.fetchImpl,
          `${KROGER_BASE_URL}/connect/oauth2/token`,
          { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
          signal,
          { method: 'POST', body: 'grant_type=client_credentials&scope=product.compact' },
        )) as Raw | null;
        const token = asString(body?.access_token);
        if (!token) throw new Error('kroger API returned no access token');
        const ttlSec = Math.max(60, asNumber(body?.expires_in) ?? 1800);
        this.cached = { token, expiresAt: this.now().getTime() + (ttlSec - 60) * 1000 };
        return token;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  /** The only place that calls the data APIs. A 401 drops the cached token and retries once. */
  private async request(pathAndQuery: string, opts: ProviderCallOptions): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token(opts.signal);
      try {
        return await getJson(this.name, this.fetchImpl, `${KROGER_BASE_URL}${pathAndQuery}`, { authorization: `Bearer ${token}` }, opts.signal);
      } catch (err) {
        if (err instanceof ProviderHttpError && err.status === 401 && attempt === 0) {
          this.cached = null;
          continue;
        }
        throw err;
      }
    }
  }

  private location(opts: ProviderCallOptions): { storeId: string | null; param: string } {
    const storeId = opts.stores?.kroger ?? null;
    const m = storeId ? STORE_ID.exec(storeId) : null;
    return m ? { storeId, param: `&filter.locationId=${m[1]}` } : { storeId: null, param: '' };
  }

  private mapList(body: unknown, storeId: string | null): ProviderProductDetail[] {
    const data = (body as Raw | null)?.data;
    const list = Array.isArray(data) ? data : data ? [data] : [];
    const observedAt = this.now().toISOString();
    return list.map((p) => mapKrogerProduct(p, observedAt, storeId, this.categories)).filter((p): p is ProviderProductDetail => p !== null);
  }

  async search(query: string, opts: ProviderSearchOptions): Promise<ProviderSearchHit[]> {
    const term = query.trim().slice(0, 100);
    if (term.length < 3) return []; // Kroger rejects shorter terms (header item 3)
    const { storeId, param } = this.location(opts);
    const limit = Math.min(Math.max(1, opts.limit), 50);
    const products = this.mapList(await this.request(`/products?filter.term=${encodeURIComponent(term)}&filter.limit=${limit}${param}`, opts), storeId);
    return products.map((product, i) => ({ product, relevance: positionalRelevance(i, products.length) }));
  }

  async getProduct(id: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    if (!id.startsWith(KROGER_ID_PREFIX)) return null;
    const productId = id.slice(KROGER_ID_PREFIX.length);
    if (!/^[A-Za-z0-9]{1,20}$/.test(productId)) return null;
    return this.byProductId(productId, opts);
  }

  async lookupGtin(gtin: string, opts: ProviderCallOptions = {}): Promise<ProviderProductDetail | null> {
    return this.byProductId(gtinToKrogerUpc(gtin), opts);
  }

  private async byProductId(productId: string, opts: ProviderCallOptions): Promise<ProviderProductDetail | null> {
    const { storeId, param } = this.location(opts);
    try {
      return this.mapList(await this.request(`/products/${productId}${param ? `?${param.slice(1)}` : ''}`, opts), storeId)[0] ?? null;
    } catch (err) {
      if (err instanceof ProviderHttpError && (err.status === 404 || err.status === 400)) return null;
      throw err;
    }
  }

  async stores(zip: string, opts: ProviderCallOptions = {}): Promise<Store[]> {
    if (!/^\d{5}$/.test(zip)) return [];
    const body = (await this.request(`/locations?filter.zipCode.near=${zip}&filter.limit=3&filter.radiusInMiles=25`, opts)) as Raw | null;
    const list = Array.isArray(body?.data) ? body.data : [];
    return list.map(mapKrogerLocation).filter((s): s is Store => s !== null);
  }

  storeRetailer(storeId: string): RetailerId | null {
    return STORE_ID.test(storeId) ? 'kroger' : null;
  }
}
