/**
 * Demo store locations. Entirely synthetic: generated from a hash of the ZIP,
 * so the same ZIP always yields the same stores. Names and addresses say
 * "demo" on purpose — none of these places exist.
 */
import type { RetailerId, Store } from '../../contract.js';
import { stateForZip } from '../../tax.js';
import { hash32, rng } from './generate.js';

interface Chain {
  retailerId: RetailerId;
  prefix: string;
  banners: string[];
  /** Extra miles: warehouse clubs are sparser than supermarkets. */
  farther: number;
}

/** Grocery retailers with physical stores. Amazon is online-only; Best Buy sells no groceries. */
const CHAINS: Chain[] = [
  { retailerId: 'walmart', prefix: 'wm', banners: ['Walmart Supercenter', 'Walmart Neighborhood Market'], farther: 0 },
  { retailerId: 'kroger', prefix: 'kr', banners: ['Kroger', 'Kroger Marketplace'], farther: 0 },
  { retailerId: 'target', prefix: 'tg', banners: ['Target', 'SuperTarget'], farther: 1 },
  { retailerId: 'costco', prefix: 'co', banners: ['Costco Wholesale'], farther: 4 },
  { retailerId: 'samsclub', prefix: 'sc', banners: ["Sam's Club"], farther: 3 },
];
const BY_PREFIX = new Map(CHAINS.map((c) => [c.prefix, c.retailerId]));
const STREETS = ['Sample Rd', 'Demo Pkwy', 'Placeholder Blvd', 'Example Ave', 'Mockingbird Ln', 'Test Track Dr'];
const STORE_ID = /^([a-z]{2})-(\d{5})-([1-3])$/;

/** 2-3 stores per grocery retailer for a ZIP, all sorted nearest first. */
export function mockStores(zip: string): Store[] {
  if (!/^\d{5}$/.test(zip)) return [];
  const state = stateForZip(zip);
  const stores: Store[] = [];
  for (const chain of CHAINS) {
    const rand = rng(hash32(`stores:${chain.prefix}:${zip}`));
    const count = 2 + Math.floor(rand() * 2);
    let distance = chain.farther + 0.4 + rand() * 3;
    for (let n = 1; n <= count; n++) {
      const number = 100 + Math.floor(rand() * 9900);
      stores.push({
        id: `${chain.prefix}-${zip}-${n}`,
        retailerId: chain.retailerId,
        name: `${chain.banners[Math.floor(rand() * chain.banners.length)]} #${number} (demo)`,
        address: `${number} ${STREETS[Math.floor(rand() * STREETS.length)]}, ${state ? `${state} ` : ''}${zip} (demo address)`,
        distanceMiles: Math.round(distance * 10) / 10,
      });
      distance += 0.8 + rand() * 4;
    }
  }
  return stores.sort((a, b) => a.distanceMiles - b.distanceMiles || (a.id < b.id ? -1 : 1));
}

/** The retailer a demo store id belongs to, or null when it is not one of ours. */
export function mockStoreRetailer(storeId: string): RetailerId | null {
  const m = STORE_ID.exec(storeId);
  return m ? (BY_PREFIX.get(m[1]!) ?? null) : null;
}

/**
 * Per-store price factor for one listing: a deterministic +/-4%, so the same
 * item costs slightly different amounts at different locations of a chain.
 */
export function storePriceFactor(storeId: string, listingId: string): number {
  return 1 + (hash32(`store-price:${storeId}:${listingId}`) / 4294967296 - 0.5) * 0.08;
}
