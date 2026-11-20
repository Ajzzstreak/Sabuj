import * as Crypto from 'expo-crypto';
import type { Product } from '@/api/contract';
import { LIST_MAX_ITEMS, listStore, QTY_MAX, type ListItem } from '@/state';
import { haptic } from './haptics';
import { track } from './tracker';

/** Shopping-list actions. The list is local; every add / remove is also a list_add / list_remove event. */

const newId = () => {
  try {
    return Crypto.randomUUID();
  } catch {
    return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
};
const clampQty = (n: number) => Math.min(QTY_MAX, Math.max(1, Math.round(n)));

export type AddResult = 'added' | 'increased' | 'full';

/** Add a specific product, or raise its quantity if it is already on the list. */
export function addProductToList(product: Pick<Product, 'id' | 'title' | 'category' | 'brand'>, quantity = 1): AddResult {
  const list = listStore.get();
  const existing = list.find((i) => i.productId === product.id);
  if (existing) {
    listStore.set(list.map((i) => (i === existing ? { ...i, quantity: clampQty(i.quantity + quantity), checked: false } : i)));
    haptic.light();
    return 'increased';
  }
  if (list.length >= LIST_MAX_ITEMS) return 'full';
  listStore.set([...list, { id: newId(), productId: product.id, title: product.title, quantity: clampQty(quantity), checked: false, addedAt: Date.now() }]);
  track({ type: 'list_add', productId: product.id, category: product.category, brand: product.brand });
  haptic.success();
  return 'added';
}

/** Add free text such as "milk". The server picks a product for it when totalling. */
export function addQueryToList(text: string): AddResult {
  const query = text.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!query) return 'full';
  const list = listStore.get();
  const existing = list.find((i) => !i.productId && i.query?.toLowerCase() === query.toLowerCase());
  if (existing) {
    listStore.set(list.map((i) => (i === existing ? { ...i, quantity: clampQty(i.quantity + 1), checked: false } : i)));
    return 'increased';
  }
  if (list.length >= LIST_MAX_ITEMS) return 'full';
  listStore.set([...list, { id: newId(), query, title: query, quantity: 1, checked: false, addedAt: Date.now() }]);
  track({ type: 'list_add', query });
  haptic.success();
  return 'added';
}

export function setListQuantity(id: string, quantity: number): void {
  listStore.set((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: clampQty(quantity) } : i)));
}

export function toggleListChecked(id: string): void {
  haptic.selection();
  listStore.set((prev) => prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
}

/** Remove one item. Returns a function that puts it back where it was (for the Undo toast). */
export function removeFromList(id: string): (() => void) | null {
  const list = listStore.get();
  const index = list.findIndex((i) => i.id === id);
  const item = list[index];
  if (!item) return null;
  listStore.set(list.filter((i) => i.id !== id));
  track({ type: 'list_remove', productId: item.productId, query: item.productId ? undefined : item.query });
  haptic.light();
  return () => {
    const now = listStore.get();
    if (now.some((i) => i.id === item.id)) return;
    const next = [...now];
    next.splice(Math.min(index, next.length), 0, item);
    listStore.set(next);
    track({ type: 'list_add', productId: item.productId, query: item.productId ? undefined : item.query });
  };
}

/** Remove every checked item. Returns an undo, or null when nothing was checked. */
export function clearChecked(): (() => void) | null {
  const before = listStore.get();
  const gone = before.filter((i) => i.checked);
  if (gone.length === 0) return null;
  listStore.set(before.filter((i) => !i.checked));
  for (const item of gone) track({ type: 'list_remove', productId: item.productId, query: item.productId ? undefined : item.query });
  return () => listStore.set(before);
}

/** "Change": pin a free-text (or wrongly matched) item to a specific product. */
export function setListItemProduct(id: string, product: Pick<Product, 'id' | 'title'>): void {
  const list = listStore.get();
  // Picking a product that is already on the list merges the two rows.
  const twin = list.find((i) => i.productId === product.id && i.id !== id);
  const self = list.find((i) => i.id === id);
  if (!self) return;
  if (twin) {
    listStore.set(list.filter((i) => i.id !== id).map((i) => (i === twin ? { ...i, quantity: clampQty(i.quantity + self.quantity) } : i)));
    return;
  }
  listStore.set(list.map((i): ListItem => (i.id === id ? { id: i.id, productId: product.id, title: product.title, quantity: i.quantity, checked: i.checked, addedAt: i.addedAt } : i)));
}
