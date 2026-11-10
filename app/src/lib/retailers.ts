import type { Retailer, RetailerId } from '@/api/contract';

/**
 * Fallbacks so a retailer always renders (saved items shown offline, before any
 * response has arrived). Every API response carries the authoritative list,
 * which replaces these through registerRetailers().
 */
const registry: Record<RetailerId, Retailer> = {
  amazon: { id: 'amazon', name: 'Amazon', color: '#FF9900', membershipRequired: false },
  walmart: { id: 'walmart', name: 'Walmart', color: '#0071DC', membershipRequired: false },
  samsclub: { id: 'samsclub', name: "Sam's Club", color: '#0067A0', membershipRequired: true },
  target: { id: 'target', name: 'Target', color: '#CC0000', membershipRequired: false },
  costco: { id: 'costco', name: 'Costco', color: '#E31837', membershipRequired: true },
  bestbuy: { id: 'bestbuy', name: 'Best Buy', color: '#0046BE', membershipRequired: false },
};

export const RETAILER_ORDER: RetailerId[] = ['amazon', 'walmart', 'samsclub', 'target', 'costco', 'bestbuy'];

export function registerRetailers(list: Retailer[] | undefined): void {
  for (const r of list ?? []) registry[r.id] = r;
}

export function getRetailer(id: RetailerId): Retailer {
  return registry[id] ?? { id, name: id, color: '#888888', membershipRequired: false };
}
