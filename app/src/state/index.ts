import type { Product } from '@/api/contract';
import { createStore } from '@/lib/createStore';

/** ---- Settings ---------------------------------------------------------- */
export interface Settings {
  /** When true, no activity events are recorded or sent. */
  learningPaused: boolean;
}
export const settingsStore = createStore<Settings>('settings', { learningPaused: false });

/** ---- Recent searches (local only) --------------------------------------- */
export const recentsStore = createStore<string[]>('recents', []);

export function addRecent(query: string): void {
  const q = query.trim();
  if (!q) return;
  recentsStore.set((prev) => [q, ...prev.filter((p) => p.toLowerCase() !== q.toLowerCase())].slice(0, 8));
}
export function removeRecent(query: string): void {
  recentsStore.set((prev) => prev.filter((p) => p !== query));
}

/** ---- Saved / watchlist (local only) -------------------------------------- */
export interface SavedItem {
  /** Snapshot so the watchlist renders instantly and offline. */
  product: Product;
  savedAt: number;
  /** Best in-stock total when saved, to show price movement since. */
  priceWhenSaved: number | null;
}
export const savedStore = createStore<Record<string, SavedItem>>('saved', {});

export function bestTotal(product: Product): number | null {
  const offer = product.offers.find((o) => o.id === product.cheapestOfferId);
  return offer ? offer.totalPrice : null;
}

export function useIsSaved(productId: string): boolean {
  return savedStore.use((s) => productId in s);
}

/** Refresh a saved snapshot with newer data without touching savedAt. */
export function refreshSaved(product: Product): void {
  const existing = savedStore.get()[product.id];
  if (!existing || existing.product === product) return;
  savedStore.set((prev) => ({ ...prev, [product.id]: { ...existing, product } }));
}

export async function hydrateStores(): Promise<void> {
  await Promise.all([settingsStore.hydrate(), recentsStore.hydrate(), savedStore.hydrate()]);
}

export function clearLocalState(): void {
  recentsStore.set([]);
  savedStore.set({});
}
