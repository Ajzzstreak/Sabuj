import type { Retailer, RetailerId } from './contract.js';

export const RETAILER_IDS = ['amazon', 'walmart', 'kroger', 'samsclub', 'target', 'costco', 'bestbuy'] as const satisfies readonly RetailerId[];

export const RETAILERS: Retailer[] = [
  { id: 'amazon', name: 'Amazon', color: '#FF9900', membershipRequired: false },
  { id: 'walmart', name: 'Walmart', color: '#0071CE', membershipRequired: false },
  { id: 'kroger', name: 'Kroger', color: '#084999', membershipRequired: false },
  { id: 'samsclub', name: "Sam's Club", color: '#0067A0', membershipRequired: true },
  { id: 'target', name: 'Target', color: '#CC0000', membershipRequired: false },
  { id: 'costco', name: 'Costco', color: '#E31837', membershipRequired: true },
  { id: 'bestbuy', name: 'Best Buy', color: '#0046BE', membershipRequired: false },
];

const BY_ID = new Map(RETAILERS.map((r) => [r.id, r]));

export function retailerName(id: RetailerId): string {
  return BY_ID.get(id)?.name ?? id;
}

export function isMembershipRetailer(id: RetailerId): boolean {
  return BY_ID.get(id)?.membershipRequired ?? false;
}

export function isRetailerId(v: unknown): v is RetailerId {
  return typeof v === 'string' && BY_ID.has(v as RetailerId);
}

/**
 * Outbound link builder. Today it returns the retailer's plain search URL for
 * the product title, with NO affiliate parameters.
 *
 * >>> AFFILIATE TAGGING GOES HERE <<<
 * When affiliate programs are set up, append the per-retailer tag/params in
 * this one function (e.g. Amazon `tag=`, Impact/CJ deep links for the others)
 * and add the required disclosure in the clients.
 */
export function buildOutboundUrl(retailerId: RetailerId, productTitle: string): string {
  const q = encodeURIComponent(productTitle);
  switch (retailerId) {
    case 'amazon':
      return `https://www.amazon.com/s?k=${q}`;
    case 'walmart':
      return `https://www.walmart.com/search?q=${q}`;
    case 'kroger':
      return `https://www.kroger.com/search?query=${q}`;
    case 'samsclub':
      return `https://www.samsclub.com/s/${q}`;
    case 'target':
      return `https://www.target.com/s?searchTerm=${q}`;
    case 'costco':
      return `https://www.costco.com/CatalogSearch?keyword=${q}`;
    case 'bestbuy':
      return `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`;
  }
}
