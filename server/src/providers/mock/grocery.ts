/**
 * Builds the demo grocery catalog from `groceryData.ts`. Deterministic: every
 * number comes from a hash of the item, so the catalog is identical on every
 * run. None of it is real pricing; GTINs are synthetic.
 *
 * The unit everything hangs off is a LISTING: one concrete item sold by one
 * retailer (e.g. "Kroger Whole Milk, 1 gal" at Kroger). A listing has one
 * price, stock state and rating, and shows up
 *   - as the 'exact' offer of its own product, and
 *   - as an 'equivalent' offer inside every other retailer's store-brand
 *     product of the same kind,
 * always with the same numbers.
 */
import type { PackageSize, RetailerId } from '../../contract.js';
import { buildOutboundUrl, isMembershipRetailer } from '../../retailers.js';
import { parseSize } from '../../size.js';
import type { ProviderOffer, ProviderProduct } from '../types.js';
import { hash32, slugify } from './generate.js';
import { FRESH, GROCERY, type GroceryKind, SHELF_STABLE } from './groceryData.js';

type StoreBrandRetailer = 'walmart' | 'kroger' | 'target' | 'costco' | 'samsclub';
/** Order = which store brand represents a kind in search results. */
const STORE_BRAND_RETAILERS: StoreBrandRetailer[] = ['walmart', 'kroger', 'target', 'costco', 'samsclub'];

export function storeBrandName(retailer: StoreBrandRetailer, category: string): string {
  switch (retailer) {
    case 'walmart':
      return category === 'Baby' ? "Parent's Choice" : 'Great Value';
    case 'kroger':
      return category === 'Baby' ? 'Comforts' : 'Kroger';
    case 'target':
      return category === 'Baby' || category === 'Household' ? 'up & up' : 'Good & Gather';
    case 'costco':
      return 'Kirkland Signature';
    case 'samsclub':
      return "Member's Mark";
  }
}

/** Every store-brand label in the demo catalog (used by the profiler to tell store brands from national ones). */
export const STORE_BRAND_NAMES: ReadonlySet<string> = new Set(
  ['Great Value', "Parent's Choice", 'Kroger', 'Comforts', 'Good & Gather', 'up & up', 'Kirkland Signature', "Member's Mark"].map((b) => b.toLowerCase()),
);

/** Relative price level per retailer. Clubs are priced from their own bulk price. */
const PRICE_LEVEL: Record<RetailerId, number> = { walmart: 0.97, kroger: 1.03, target: 1.08, amazon: 1.12, costco: 1.0, samsclub: 0.97, bestbuy: 1 };
const REVIEW_SCALE: Record<RetailerId, number> = { walmart: 1, kroger: 0.45, target: 0.4, amazon: 1.2, costco: 0.3, samsclub: 0.25, bestbuy: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Deterministic 0..1 from a string key. */
const chance = (key: string) => hash32(key) / 4294967296;

export interface GroceryMeta {
  title: string;
  brand: string;
  category: string;
  keywords: string[];
  /** Equivalence group of a store-brand product; null for national brands. */
  group: string | null;
  /** Rank among its group in search results (0 = shown first). */
  groupRank: number;
}

export interface GroceryCatalog {
  products: ProviderProduct[];
  meta: Map<string, GroceryMeta>;
  /** offerId -> id of the listing it prices (differs from productId for equivalents). */
  listingOf: Map<string, string>;
}

interface Listing {
  /** Product id of the item actually sold. */
  id: string;
  retailer: RetailerId;
  title: string;
  size: PackageSize;
  price: number;
  listPrice: number | null;
  inStock: boolean;
  rating: number;
  reviewCount: number;
}

function sizeOf(text: string, what: string): PackageSize {
  const size = parseSize(text);
  if (!size) throw new Error(`mock grocery: cannot parse size "${text}" of ${what}`);
  return size;
}

function makeListing(id: string, title: string, retailer: RetailerId, base: number, sizeText: string): Listing {
  const key = `${id}@${retailer}`;
  const regular = round2(Math.max(0.25, base * PRICE_LEVEL[retailer] * (1 + (chance(`price:${key}`) - 0.5) * 0.08)));
  // Weekly-ad style markdowns, mostly at the conventional grocers.
  const saleOdds = retailer === 'kroger' ? 0.28 : retailer === 'target' ? 0.15 : retailer === 'walmart' ? 0.06 : 0.1;
  const onSale = chance(`sale:${key}`) < saleOdds;
  const price = onSale ? round2(regular * (0.78 + chance(`depth:${key}`) * 0.12)) : regular;
  const popularity = 150 + Math.floor(chance(`pop:${id}`) ** 2 * 18000);
  return {
    id,
    retailer,
    title,
    size: sizeOf(sizeText, title),
    price,
    listPrice: onSale ? regular : null,
    inStock: chance(`stock:${key}`) > 0.04,
    rating: Math.round((4.0 + chance(`rating:${id}`) * 0.8 + (chance(`rating:${key}`) - 0.5) * 0.3) * 10) / 10,
    reviewCount: Math.max(3, Math.round(popularity * REVIEW_SCALE[retailer] * (0.6 + chance(`reviews:${key}`) * 0.8))),
  };
}

function toOffer(productId: string, l: Listing, observedAt: string): ProviderOffer {
  const own = l.id === productId;
  return {
    id: `${productId}:${l.retailer}`,
    productId,
    retailerId: l.retailer,
    price: l.price,
    listPrice: l.listPrice,
    // In-store / pickup prices: nothing to ship (Amazon: assume free delivery).
    shipping: 0,
    totalPrice: l.price,
    inStock: l.inStock,
    membershipRequired: isMembershipRetailer(l.retailer),
    rating: Math.min(5, Math.max(1, l.rating)),
    reviewCount: l.reviewCount,
    delivery: !l.inStock ? null : l.retailer === 'amazon' ? '2-day' : 'Pickup today',
    url: buildOutboundUrl(l.retailer, l.title),
    observedAt,
    priceSource: 'demo',
    matchType: own ? 'exact' : 'equivalent',
    offerTitle: own ? null : l.title,
    size: l.size,
    storeId: null,
  };
}

/** Well-formed UPC-A with a valid check digit. Not a real product code. */
function fakeUpc(id: string): string {
  let seed = hash32(`gtin:${id}`);
  const digits = [0];
  for (let i = 0; i < 10; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    digits.push(Math.floor((seed / 4294967296) * 10));
  }
  let sum = 0;
  digits.forEach((d, i) => (sum += i % 2 === 0 ? d * 3 : d));
  digits.push((10 - (sum % 10)) % 10);
  return digits.join('');
}

function storeBrandListings(category: string, kind: GroceryKind): Listing[] {
  const group = `${category}/${kind.name}`;
  const out: Listing[] = [];
  // Walmart and Kroger carry nearly everything (never both missing).
  const skipWalmart = chance(`skip:walmart:${group}`) < 0.04;
  const skipKroger = !skipWalmart && chance(`skip:kroger:${group}`) < 0.04;
  for (const retailer of STORE_BRAND_RETAILERS) {
    const club = retailer === 'costco' || retailer === 'samsclub';
    if (retailer === 'walmart' && skipWalmart) continue;
    if (retailer === 'kroger' && skipKroger) continue;
    if (retailer === 'target' && (kind.target === false || chance(`carry:target:${group}`) > 0.75)) continue;
    // Clubs only sell the bulk package, and not every club stocks every kind.
    if (club && (!kind.club || chance(`carry:${retailer}:${group}`) > 0.85)) continue;
    const [sizeText, base] = club ? kind.club! : [kind.size, kind.price];
    const title = `${storeBrandName(retailer, category)} ${kind.name}, ${sizeText}`;
    out.push(makeListing(slugify(title), title, retailer, base, sizeText));
  }
  return out;
}

export function buildGroceryCatalog(observedAt: string): GroceryCatalog {
  const products: ProviderProduct[] = [];
  const meta = new Map<string, GroceryMeta>();
  const listingOf = new Map<string, string>();
  const add = (product: ProviderProduct, m: GroceryMeta, listings: Listing[]) => {
    if (meta.has(product.id)) throw new Error(`duplicate mock grocery product id: ${product.id}`);
    product.offers = listings.map((l) => toOffer(product.id, l, observedAt));
    for (const l of listings) listingOf.set(`${product.id}:${l.retailer}`, l.id);
    products.push(product);
    meta.set(product.id, m);
  };

  for (const [category, kinds] of Object.entries(GROCERY)) {
    for (const kind of kinds) {
      const group = `${category}/${kind.name}`;
      const keywords = kind.keywords ?? [];
      if (kind.storeBrand !== false) {
        const listings = storeBrandListings(category, kind);
        listings.forEach((own, rank) => {
          const brand = storeBrandName(own.retailer as StoreBrandRetailer, category);
          add(
            {
              id: own.id,
              title: own.title,
              brand,
              category,
              imageUrl: null,
              gtin: fakeUpc(own.id),
              size: own.size,
              isStoreBrand: true,
              highlights: [...kind.tags, 'Store brand'],
              offers: [],
            },
            { title: own.title, brand, category, keywords, group, groupRank: rank },
            // Its own listing first, then every other store's counterpart.
            [own, ...listings.filter((l) => l !== own)],
          );
        });
      }
      for (const [brand, name, sizeText, base, tags] of kind.nationals ?? []) {
        const title = brand === FRESH ? `${name}, ${sizeText}` : `${brand} ${name}, ${sizeText}`;
        const id = slugify(brand === FRESH ? `fresh ${title}` : title);
        const sells = (retailer: RetailerId, odds: number) => chance(`carry:${retailer}:${id}`) < odds;
        const retailers: RetailerId[] = [];
        if (sells('walmart', 0.95)) retailers.push('walmart');
        if (sells('kroger', 0.95) || retailers.length === 0) retailers.push('kroger');
        if (sells('target', brand === FRESH ? 0.5 : 0.65)) retailers.push('target');
        if (SHELF_STABLE.has(category) && sells('amazon', 0.55)) retailers.push('amazon');
        add(
          {
            id,
            title,
            brand,
            category,
            imageUrl: null,
            gtin: fakeUpc(id),
            size: sizeOf(sizeText, title),
            isStoreBrand: false,
            highlights: tags ?? [],
            offers: [],
          },
          { title, brand, category, keywords, group: null, groupRank: 0 },
          // The same item (same GTIN) at every store: one listing per retailer.
          retailers.map((r) => makeListing(id, title, r, base, sizeText)),
        );
      }
    }
  }
  return { products, meta, listingOf };
}
