import { useSyncExternalStore } from 'react';
import type { Offer, Product } from '@/api/contract';

/** A value any component can set and the root-level sheet hosts render from. */
function createSignal<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const get = () => value;
  return {
    get,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    use: () => useSyncExternalStore(subscribe, get, get),
  };
}

/** "How is this total made up?" for one offer. */
export const breakdownSheet = createSignal<{ product: Product; offer: Offer } | null>(null);
/** "Alert me" for one product. */
export const alertSheet = createSignal<Product | null>(null);

export const showBreakdown = (product: Product, offer: Offer) => breakdownSheet.set({ product, offer });
export const showAlertSheet = (product: Product) => alertSheet.set(product);
