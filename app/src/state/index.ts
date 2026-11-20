import type { Product, RetailerId } from '@/api/contract';
import { createStore } from '@/lib/createStore';

/** ---- Settings ---------------------------------------------------------- */
export interface Settings {
  /** When true, no activity events are recorded or sent. */
  learningPaused: boolean;
}
export const settingsStore = createStore<Settings>('settings', { learningPaused: false });

/** ---- Shopper context: what turns a shelf price into a true total ---------- */
export interface Shopper {
  /** Five digits, or null when not given (no tax estimate). */
  zip: string | null;
  /** null = never answered. [] = answered "none". */
  memberships: RetailerId[] | null;
  /**
   * Store locations to price from, one per retailer. null = not chosen: the
   * server then uses the nearest store of each retailer for the ZIP.
   */
  storeIds: string[] | null;
  /** The first-run flow was finished or skipped. */
  onboarded: boolean;
}
const SHOPPER_DEFAULT: Shopper = { zip: null, memberships: null, storeIds: null, onboarded: false };
export const shopperStore = createStore<Shopper>('shopper', SHOPPER_DEFAULT);

/** The warehouse clubs the app asks about. */
export const MEMBERSHIP_RETAILERS: RetailerId[] = ['costco', 'samsclub'];

export const isZip = (value: string) => /^\d{5}$/.test(value);

/** Query params for catalog endpoints. `memberships` is omitted while unanswered; "" means "none". */
export function shopperParams(s: Shopper = shopperStore.get()): { zip?: string; memberships?: string; storeIds?: string } {
  return {
    zip: s.zip ?? undefined,
    memberships: s.memberships == null ? undefined : s.memberships.join(','),
    storeIds: s.zip && s.storeIds?.length ? s.storeIds.join(',') : undefined,
  };
}
/** The same context for JSON bodies (POST /ask, POST /alerts). */
export function shopperBody(s: Shopper = shopperStore.get()): { zip?: string; memberships?: RetailerId[]; storeIds?: string[] } {
  return {
    ...(s.zip ? { zip: s.zip } : null),
    ...(s.memberships ? { memberships: s.memberships } : null),
    ...(s.zip && s.storeIds?.length ? { storeIds: s.storeIds } : null),
  };
}
/** Part of every catalog query key: prices depend on it. */
export function shopperKey(s: Shopper = shopperStore.get()): string {
  return `${s.zip ?? '-'}|${s.memberships == null ? '?' : [...s.memberships].sort().join(',')}|${s.zip && s.storeIds?.length ? [...s.storeIds].sort().join(',') : 'nearest'}`;
}

/** ---- Shopping list (local only; totals come from POST /v1/basket) ---------- */
export interface ListItem {
  /** Client-made id, echoed back by the basket endpoint. */
  id: string;
  /** Set when the user picked a specific product. */
  productId?: string;
  /** Free text ("milk") when no product was picked; the server resolves it. */
  query?: string;
  /** What the row shows: the product title, or the text as typed. */
  title: string;
  quantity: number;
  /** Ticked off while shopping. */
  checked: boolean;
  addedAt: number;
}
export const listStore = createStore<ListItem[]>('list', []);
export const LIST_MAX_ITEMS = 60;
export const QTY_MAX = 99;

/** ---- Recent searches (local only) --------------------------------------- */
export const recentsStore = createStore<string[]>('recents', []);

export function addRecent(query: string): void {
  const q = query.trim();
  if (!q) return;
  recentsStore.set((prev) => [q, ...prev.filter((p) => p.toLowerCase() !== q.toLowerCase())].slice(0, 8));
}

/** ---- Saved / watchlist (local only) -------------------------------------- */
export interface SavedItem {
  /** Snapshot so the watchlist renders instantly and offline. */
  product: Product;
  savedAt: number;
  /** Best total (shipping and estimated tax included) when saved, to show movement since. */
  priceWhenSaved: number | null;
}
export const savedStore = createStore<Record<string, SavedItem>>('saved', {});

export function useIsSaved(productId: string): boolean {
  return savedStore.use((s) => productId in s);
}

/** Refresh a saved snapshot with newer data without touching savedAt. */
export function refreshSaved(product: Product): void {
  const existing = savedStore.get()[product.id];
  if (!existing || existing.product === product) return;
  savedStore.set((prev) => ({ ...prev, [product.id]: { ...existing, product } }));
}

/** ---- Alerts: device-local bookkeeping (the alerts themselves live on the server) --- */
export interface AlertPrefs {
  /** Triggered alerts the user has already looked at; the rest are badged. */
  seenTriggered: string[];
  /** The notification explainer was shown once; never nag again. */
  pushAsked: boolean;
  /** `${deviceId}:${token}` last sent to PUT /v1/push-token. */
  pushSentFor: string | null;
}
const ALERT_PREFS_DEFAULT: AlertPrefs = { seenTriggered: [], pushAsked: false, pushSentFor: null };
export const alertPrefsStore = createStore<AlertPrefs>('alertPrefs', ALERT_PREFS_DEFAULT);

export async function hydrateStores(): Promise<void> {
  await Promise.all([settingsStore.hydrate(), shopperStore.hydrate(), recentsStore.hydrate(), savedStore.hydrate(), alertPrefsStore.hydrate(), listStore.hydrate()]);
  // Stored before store selection existed.
  if (shopperStore.get().storeIds === undefined) shopperStore.set((s) => ({ ...s, storeIds: null }));
  migrateSaved();
}

/** Snapshots saved before offers had landedPrice / eligible / priceSource get safe values until they refresh. */
function migrateSaved(): void {
  const saved = savedStore.get();
  const stale = Object.values(saved).some((item) => (item.product as Partial<Product>).size === undefined || item.product.offers.some((o) => (o as Partial<typeof o>).landedPrice == null || (o as Partial<typeof o>).matchType == null));
  if (!stale) return;
  const next: Record<string, SavedItem> = {};
  for (const [id, item] of Object.entries(saved)) {
    next[id] = {
      ...item,
      product: {
        ...item.product,
        size: (item.product as Partial<Product>).size ?? null,
        isStoreBrand: (item.product as Partial<Product>).isStoreBrand ?? false,
        offers: item.product.offers.map((o) => {
          const old = o as Partial<typeof o>;
          return {
            ...o,
            estimatedTax: old.estimatedTax ?? null,
            landedPrice: old.landedPrice ?? o.totalPrice,
            eligible: old.eligible ?? true,
            priceSource: old.priceSource ?? 'live',
            matchType: old.matchType ?? 'exact',
            offerTitle: old.offerTitle ?? null,
            size: old.size ?? null,
            unitPrice: old.unitPrice ?? null,
            unitLabel: old.unitLabel ?? null,
            storeId: old.storeId ?? null,
          };
        }),
      },
    };
  }
  savedStore.set(next);
}

/**
 * "Delete my data": everything personal on this device. The pause switch is
 * kept, because resetting it would quietly turn tracking back on.
 */
export function clearLocalState(): void {
  recentsStore.set([]);
  savedStore.set({});
  listStore.set([]);
  // ZIP and memberships go back to "not given". The first-run flow is not replayed over the
  // confirmation; the same two questions are right there in Shopping settings.
  shopperStore.set({ ...SHOPPER_DEFAULT, onboarded: true });
  alertPrefsStore.set(ALERT_PREFS_DEFAULT);
}
