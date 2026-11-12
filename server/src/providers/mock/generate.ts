/**
 * Deterministic mock data generation. Everything is derived from a hash of the
 * product id, so the catalog is identical across restarts. Only the calendar
 * dates of the price history (and observedAt) move with the clock.
 */
import type { PricePoint, RetailerId } from '../../contract.js';
import { buildOutboundUrl, isMembershipRetailer } from '../../retailers.js';
import type { ProviderOffer, ProviderProduct, ProviderProductDetail } from '../types.js';
import { CATEGORY_NOUN, type CatalogSeed } from './catalog.js';

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Retail-looking price: .99 endings above $20, plain cents below. */
function retailPrice(n: number): number {
  if (n >= 20) return round2(Math.max(1, Math.round(n)) - 0.01);
  return round2(n);
}

const DELIVERY: Record<RetailerId, string[]> = {
  amazon: ['Tomorrow', 'Tomorrow', '2-day', 'Free delivery Fri'],
  walmart: ['Tomorrow', 'Pickup today', '2-day', '3+ days'],
  target: ['Pickup today', '2-day', 'Same-day delivery', '2-day'],
  bestbuy: ['Pickup today', 'Tomorrow', '2-day'],
  costco: ['3-5 days', '2-day', '5-7 days'],
  samsclub: ['Pickup today', '3-5 days', '2-day'],
  kroger: ['Pickup today', 'Tomorrow'],
};

/** How many reviews a retailer typically accumulates, relative to Amazon. */
const REVIEW_SCALE: Record<RetailerId, number> = {
  amazon: 1,
  walmart: 0.22,
  target: 0.08,
  bestbuy: 0.12,
  costco: 0.04,
  samsclub: 0.03,
  kroger: 0.1,
};

/** Per-retailer price bias: warehouse clubs run cheaper, others near street price. */
const PRICE_BIAS: Record<RetailerId, number> = {
  amazon: -0.012,
  walmart: -0.015,
  target: 0.008,
  bestbuy: 0.012,
  costco: -0.05,
  samsclub: -0.055,
  kroger: 0.005,
};

/**
 * Retailers of the general (non-grocery) demo catalog. Deliberately a fixed
 * list rather than RETAILER_IDS: adding a retailer to the app must not reshuffle
 * this catalog's deterministic offers.
 */
export const GENERAL_RETAILERS: readonly RetailerId[] = ['amazon', 'walmart', 'samsclub', 'target', 'costco', 'bestbuy'];

function pickRetailers(seed: CatalogSeed, rand: () => number): RetailerId[] {
  const pool: RetailerId[] = [...(seed.only ?? GENERAL_RETAILERS)];
  // Fisher-Yates with the seeded generator.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const want = 3 + Math.floor(rand() * 4); // 3..6
  const chosen = pool.slice(0, Math.min(pool.length, Math.max(3, want)));
  return GENERAL_RETAILERS.filter((r) => chosen.includes(r));
}

export function generateOffers(productId: string, seed: CatalogSeed, observedAt: string): ProviderOffer[] {
  const rand = rng(hash32(`offers:${productId}`));
  const retailers = pickRetailers(seed, rand);
  const popularity = 400 + Math.floor(Math.pow(rand(), 2) * 60000);
  const baseRating = 4.0 + rand() * 0.7;
  const saleIndex = rand() < 0.35 ? Math.floor(rand() * retailers.length) : -1;

  return retailers.map((retailerId, i) => {
    let factor = 1 + PRICE_BIAS[retailerId] + (rand() - 0.5) * 0.11;
    if (i === saleIndex) factor -= 0.08 + rand() * 0.1;
    const price = retailPrice(seed.basePrice * factor);
    const list = retailPrice(seed.basePrice * 1.0);
    const listPrice = price < list * 0.975 ? list : rand() < 0.3 ? retailPrice(seed.basePrice * 1.12) : null;

    let shipping: number | null = 0;
    const roll = rand();
    if (price < 35) {
      if (retailerId === 'walmart') shipping = 6.99;
      else if (retailerId === 'target') shipping = 5.99;
      else if (retailerId === 'amazon') shipping = roll < 0.5 ? 0 : 6.99;
      else if (retailerId === 'bestbuy') shipping = 5.49;
      else shipping = roll < 0.5 ? 0 : 4.99;
    } else if (retailerId === 'costco' || retailerId === 'samsclub') {
      shipping = roll < 0.25 ? 5.99 : 0;
    } else if (roll < 0.06) {
      shipping = null;
    }

    const inStock = rand() > 0.09;
    const rating = Math.round(Math.min(4.9, Math.max(3.6, baseRating + (rand() - 0.5) * 0.5)) * 10) / 10;
    const reviewCount = Math.max(3, Math.round(popularity * REVIEW_SCALE[retailerId] * (0.6 + rand() * 0.8)));
    const deliveries = DELIVERY[retailerId];
    const delivery = rand() < 0.04 ? null : deliveries[Math.floor(rand() * deliveries.length)]!;

    return {
      id: `${productId}:${retailerId}`,
      productId,
      retailerId,
      price,
      listPrice,
      shipping,
      totalPrice: round2(price + (shipping ?? 0)),
      inStock,
      membershipRequired: isMembershipRetailer(retailerId),
      rating,
      reviewCount,
      delivery: inStock ? delivery : null,
      url: buildOutboundUrl(retailerId, seed.title),
      observedAt,
      priceSource: 'demo',
      matchType: 'exact',
      offerTitle: null,
      size: null,
      storeId: null,
    };
  });
}

/** Fake but well-formed UPC-A (valid check digit). Not a real product code. */
function fakeGtin(productId: string): string {
  const rand = rng(hash32(`gtin:${productId}`));
  const digits = [0];
  for (let i = 0; i < 10; i++) digits.push(Math.floor(rand() * 10));
  let sum = 0;
  digits.forEach((d, i) => (sum += i % 2 === 0 ? d * 3 : d));
  digits.push((10 - (sum % 10)) % 10);
  return digits.join('');
}

export function buildProduct(seed: CatalogSeed, observedAt: string): ProviderProduct {
  const id = slugify(seed.title);
  return {
    id,
    title: seed.title,
    brand: seed.brand,
    category: seed.category,
    imageUrl: null,
    gtin: fakeGtin(id),
    size: null,
    isStoreBrand: false,
    highlights: seed.highlights,
    offers: generateOffers(id, seed, observedAt),
  };
}

const HISTORY_DAYS = 90;

/**
 * 90 daily points per retailer: a mean-reverting walk around the street price
 * with a couple of sale windows, pinned so the last point is today's price.
 */
export function generatePriceHistory(
  product: ProviderProduct,
  basePrice: number,
  today: Date,
  /** Price the walk hovers around; defaults to the street price with the retailer's usual bias. */
  anchorOf: (offer: ProviderOffer) => number = (offer) => basePrice * (1 + PRICE_BIAS[offer.retailerId]),
): PricePoint[] {
  const points: PricePoint[] = [];
  const dayMs = 86_400_000;
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const offer of product.offers) {
    const rand = rng(hash32(`history:${offer.id}`));
    const anchor = anchorOf(offer);
    const sales = [0, 1].map(() => ({
      start: Math.floor(rand() * (HISTORY_DAYS - 12)),
      len: 3 + Math.floor(rand() * 7),
      depth: 0.07 + rand() * 0.13,
    }));
    let drift = (rand() - 0.5) * 0.04;
    const series: number[] = [];
    for (let d = 0; d < HISTORY_DAYS; d++) {
      // Prices move in steps, not every day.
      if (rand() < 0.12) drift = drift * 0.5 + (rand() - 0.5) * 0.06;
      let p = anchor * (1 + drift);
      for (const s of sales) if (d >= s.start && d < s.start + s.len) p *= 1 - s.depth;
      series.push(p);
    }
    // Blend the final week toward the live price so the chart ends where the offer is.
    for (let k = 0; k < 7; k++) {
      const idx = HISTORY_DAYS - 1 - k;
      const w = (7 - k) / 7;
      series[idx] = series[idx]! * (1 - w) + offer.price * w;
    }
    series[HISTORY_DAYS - 1] = offer.price;
    for (let d = 0; d < HISTORY_DAYS; d++) {
      const date = new Date(end - (HISTORY_DAYS - 1 - d) * dayMs).toISOString().slice(0, 10);
      const price = d === HISTORY_DAYS - 1 ? offer.price : retailPrice(series[d]!);
      points.push({ date, retailerId: offer.retailerId, price });
    }
  }
  return points;
}

const REVIEW_POINTS: Record<string, { pros: string[]; cons: string[] }> = {
  'Rice Cookers': {
    pros: ['Consistently fluffy rice', 'Keep-warm holds for hours without drying', 'Inner pot is easy to clean', 'Simple, clearly labeled menu'],
    cons: ['Slower than stovetop', 'Inner pot coating can wear over years', 'Short power cord', 'Lid needs regular wiping'],
  },
  'Air Fryers': {
    pros: ['Crisps food with little oil', 'Heats up fast', 'Basket is dishwasher safe', 'Easy presets'],
    cons: ['Takes up counter space', 'Fan is noticeable', 'Basket coating needs gentle care', 'Capacity feels small for families'],
  },
  'Coffee Makers': {
    pros: ['Brews a hot, consistent cup', 'Quick to start in the morning', 'Easy to descale', 'Compact footprint'],
    cons: ['Reservoir could be larger', 'Some plastic taste at first', 'Louder than expected', 'Replacement parts add up'],
  },
  'Kitchen Appliances': {
    pros: ['Powerful motor', 'Sturdy build', 'Parts are easy to clean', 'Does the job of several gadgets'],
    cons: ['Heavy and bulky', 'Loud at top speed', 'Learning curve for settings', 'Pricey accessories'],
  },
  TVs: {
    pros: ['Sharp, bright picture', 'Good built-in streaming apps', 'Low input lag for gaming', 'Easy setup'],
    cons: ['Built-in speakers are thin', 'Some glare in bright rooms', 'Remote feels cheap', 'Ads on the home screen'],
  },
  Headphones: {
    pros: ['Strong noise cancellation', 'Comfortable for long sessions', 'Battery lasts all day', 'Clear call quality'],
    cons: ['Case is bulky', 'Companion app required for full features', 'Touch controls misfire', 'Pricey replacement tips/pads'],
  },
  Laptops: {
    pros: ['Snappy everyday performance', 'Bright, sharp display', 'Battery lasts a workday', 'Light enough to carry daily'],
    cons: ['Limited ports', 'Webcam is average', 'Preinstalled software', 'Runs warm under load'],
  },
  Vacuums: {
    pros: ['Strong suction on carpet', 'Easy to empty', 'Maneuvers around furniture', 'Good on pet hair'],
    cons: ['Small dust bin', 'Battery fades on max power', 'Loud', 'Filters need regular washing'],
  },
  'Smart Home': {
    pros: ['Quick app setup', 'Reliable Wi-Fi connection', 'Works with major voice assistants', 'Useful automations'],
    cons: ['Some features need a subscription', 'App can be slow', 'Needs 2.4GHz Wi-Fi', 'Privacy settings are buried'],
  },
  Toys: {
    pros: ['Keeps kids engaged for hours', 'Well made', 'Great gift', 'Clear instructions'],
    cons: ['Small pieces to keep track of', 'Packaging is hard to open', 'Takes up storage space', 'Stickers are fiddly'],
  },
  'Personal Care': {
    pros: ['Noticeably better results', 'Long battery life', 'Comfortable to hold', 'Easy to rinse clean'],
    cons: ['Replacement heads are pricey', 'Louder than expected', 'Bulky charger', 'Travel case not included'],
  },
};

function pickN<T>(items: T[], n: number, rand: () => number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]!);
  return out;
}

export function buildDetail(product: ProviderProduct, seed: CatalogSeed, today: Date): ProviderProductDetail {
  const rand = rng(hash32(`detail:${product.id}`));
  const noun = CATEGORY_NOUN[seed.category] ?? seed.category.toLowerCase();
  const facts = seed.highlights.slice(0, 3).join(', ').toLowerCase();
  const pool = REVIEW_POINTS[seed.category];
  return {
    ...product,
    description:
      `The ${seed.title} is a ${noun} pick from ${seed.brand}, known for ${facts}. ` +
      `Prices below are compared across ${product.offers.length} retailers, including shipping, so the total you see is the total you pay.`,
    priceHistory: generatePriceHistory(product, seed.basePrice, today),
    reviewSummary: pool ? { pros: pickN(pool.pros, 3, rand), cons: pickN(pool.cons, 2, rand) } : null,
  };
}
