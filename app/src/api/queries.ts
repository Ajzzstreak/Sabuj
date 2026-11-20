import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { QUERY } from '@/config';
import { registerRetailers } from '@/lib/retailers';
import { getDeviceId, useDeviceId } from '@/lib/session';
import { settingsStore, shopperBody, shopperKey, shopperParams, shopperStore } from '@/state';
import { ApiRequestError, request } from './client';
import type {
  AlertResponse,
  AlertsResponse,
  AskRequest,
  AskResponse,
  BasketItemInput,
  BasketRequest,
  BasketResponse,
  ConsentRequest,
  ConsentResponse,
  CreateAlertRequest,
  DeleteProfileResponse,
  HomeResponse,
  PriceAlert,
  Product,
  ProductDetail,
  ProductResponse,
  ProfileResponse,
  PushTokenRequest,
  SearchResponse,
  Store,
  StoresResponse,
  SuggestResponse,
} from './contract';

export const SEARCH_LIMIT = 24;
const norm = (q: string) => q.trim().toLowerCase();

/**
 * What a cached response depends on besides its own arguments: which device
 * asked (personalization; a new device after "Delete my data" starts clean)
 * and the shopper context (ZIP and memberships change every price).
 */
export interface Scope {
  deviceId: string;
  /** shopperKey(): ZIP + memberships. */
  ctx: string;
}
export function currentScope(): Scope {
  return { deviceId: getDeviceId(), ctx: shopperKey() };
}
export function useScope(): Scope {
  const deviceId = useDeviceId();
  const shopper = shopperStore.use();
  return useMemo(() => ({ deviceId, ctx: shopperKey(shopper) }), [deviceId, shopper]);
}

export const keys = {
  search: (s: Scope, q: string) => ['search', s.deviceId, s.ctx, norm(q)] as const,
  suggest: (q: string) => ['suggest', norm(q)] as const,
  home: (s: Scope) => ['home', s.deviceId, s.ctx] as const,
  product: (s: Scope, id: string) => ['product', s.deviceId, s.ctx, id] as const,
  /** `ai`: whether the device had AI consent; an answer read by Claude is not reused after it is withdrawn. */
  ask: (s: Scope, text: string, ai: boolean) => ['ask', s.deviceId, s.ctx, ai ? 'ai' : 'rules', text.trim()] as const,
  consent: (deviceId: string) => ['consent', deviceId] as const,
  profile: (deviceId: string) => ['profile', deviceId] as const,
  alerts: (deviceId: string) => ['alerts', deviceId] as const,
  stores: (zip: string) => ['stores', zip] as const,
  basket: (s: Scope, signature: string) => ['basket', s.deviceId, s.ctx, signature] as const,
};

/**
 * Products already seen in a list. The detail screen paints from these at once
 * while the full record loads.
 */
const seeds = new Map<string, Product>();
export function seedProducts(products: Product[]): void {
  for (const p of products) seeds.set(p.id, p);
}
export function getSeed(id: string): Product | undefined {
  return seeds.get(id);
}
export function clearSeeds(): void {
  seeds.clear();
}

// The fetchers read the shopper context at call time. That is safe because the
// same context is in the query key: a changed ZIP is a different query.
async function fetchSearch(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await request<SearchResponse>('/search', { params: { q: q.trim(), limit: SEARCH_LIMIT, ...shopperParams() }, signal });
  registerRetailers(res.retailers);
  seedProducts(res.products);
  return res;
}
async function fetchProduct(id: string, signal?: AbortSignal): Promise<ProductDetail> {
  const res = await request<ProductResponse>(`/products/${encodeURIComponent(id)}`, { params: shopperParams(), signal });
  registerRetailers(res.retailers);
  return res.product;
}
async function fetchHome(signal?: AbortSignal): Promise<HomeResponse> {
  const res = await request<HomeResponse>('/home', { params: shopperParams(), signal });
  registerRetailers(res.retailers);
  for (const s of res.sections) seedProducts(s.products);
  return res;
}

const searchOptions = (scope: Scope, q: string) => ({
  queryKey: keys.search(scope, q),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchSearch(q, signal),
  staleTime: QUERY.searchStaleMs,
});
export const productOptions = (scope: Scope, id: string) => ({
  queryKey: keys.product(scope, id),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchProduct(id, signal),
  staleTime: QUERY.productStaleMs,
});

/** Keyword search: the fast path. Never waits on /ask. */
export function useSearch(q: string, enabled = true) {
  const scope = useScope();
  return useQuery({
    ...searchOptions(scope, q),
    enabled: enabled && norm(q).length > 0,
    // Keep the previous results on screen while a new query loads.
    placeholderData: keepPreviousData,
  });
}

export function useSuggest(q: string) {
  return useQuery({
    queryKey: keys.suggest(q),
    // The signal aborts the in-flight request as soon as the next keystroke changes the key.
    queryFn: ({ signal }) => request<SuggestResponse>('/suggest', { params: { q: q.trim() }, signal }),
    enabled: norm(q).length > 0,
    staleTime: QUERY.suggestStaleMs,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useHome() {
  const scope = useScope();
  return useQuery({
    queryKey: keys.home(scope),
    queryFn: ({ signal }) => fetchHome(signal),
    staleTime: QUERY.homeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string) {
  const scope = useScope();
  return useQuery({ ...productOptions(scope, id), enabled: id !== '' });
}

export function useProfile() {
  const deviceId = useDeviceId();
  return useQuery({
    queryKey: keys.profile(deviceId),
    queryFn: async ({ signal }) => (await request<ProfileResponse>('/profile', { signal })).profile,
    staleTime: QUERY.profileStaleMs,
  });
}

/** Warm the detail cache (called on card press-in, before navigation). */
export function prefetchProduct(client: QueryClient, id: string): void {
  void client.prefetchQuery(productOptions(currentScope(), id));
}

/** Warm search results (called for the top typeahead suggestion). */
export function prefetchSearch(client: QueryClient, q: string): void {
  if (norm(q)) void client.prefetchQuery(searchOptions(currentScope(), q));
}

/**
 * DELETE /v1/profile erases the data and the device/token. A 401 means the
 * server no longer knows this token, so there is nothing left to erase: that
 * counts as done rather than registering a device just to delete it.
 */
export async function deleteProfile(): Promise<void> {
  try {
    await request<DeleteProfileResponse>('/profile', { method: 'DELETE', retryOn401: false });
  } catch (err) {
    if (!(err instanceof ApiRequestError && err.status === 401)) throw err;
  }
}

/** ---- Barcode lookup ---------------------------------------------------------- */

/** GET /v1/lookup?gtin=. Resolves null for "not found"; throws for real failures. */
export async function lookupGtin(client: QueryClient, gtin: string): Promise<ProductDetail | null> {
  const attempt = async (code: string) => {
    try {
      return await request<ProductResponse>('/lookup', { params: { gtin: code, ...shopperParams() } });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) return null;
      throw err;
    }
  };
  // iOS reports a 12-digit UPC-A as EAN-13 with a leading zero; try both spellings.
  const res = (await attempt(gtin)) ?? (gtin.length === 13 && gtin.startsWith('0') ? await attempt(gtin.slice(1)) : null);
  if (!res) return null;
  registerRetailers(res.retailers);
  seedProducts([res.product]);
  client.setQueryData(keys.product(currentScope(), res.product.id), res.product);
  return res.product;
}

/** ---- Ask in plain English ------------------------------------------------------ */

export const ASK_MAX_CHARS = 300;

/** POST /v1/ask. Slow (an LLM may be involved), so it has its own generous timeout and never retries. */
export function useAsk(text: string, enabled = true) {
  const scope = useScope();
  const ai = settingsStore.use((s) => s.aiConsent === true);
  const trimmed = text.trim().slice(0, ASK_MAX_CHARS);
  return useQuery({
    queryKey: keys.ask(scope, trimmed, ai),
    queryFn: async ({ signal }) => {
      const body: AskRequest = { text: trimmed, ...shopperBody() };
      const res = await request<AskResponse>('/ask', { method: 'POST', body, signal, timeoutMs: QUERY.askTimeoutMs });
      registerRetailers(res.retailers);
      seedProducts(res.products);
      return res;
    },
    enabled: enabled && trimmed.length > 0,
    staleTime: QUERY.askStaleMs,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** ---- AI consent (Anthropic's Claude) -------------------------------------------- */

/** Mirror the server's answer locally (offline launches, and "Not now" is not asked again). */
function mirrorConsent(res: ConsentResponse): void {
  const local = res.decidedAt == null ? settingsStore.get().aiConsent : res.ai;
  // The server never holds consent the user did not give: a local "Allow" it does not know about is not kept.
  const next = res.decidedAt == null && local === true ? null : local;
  if (settingsStore.get().aiConsent !== next) settingsStore.set((s) => ({ ...s, aiConsent: next }));
}

/** GET /v1/consent: whether AI is available at all, and this device's answer. */
export function useConsent() {
  const deviceId = useDeviceId();
  return useQuery({
    queryKey: keys.consent(deviceId),
    queryFn: async ({ signal }) => {
      const res = await request<ConsentResponse>('/consent', { signal });
      mirrorConsent(res);
      return res;
    },
    staleTime: 60_000,
  });
}

/**
 * The consent prompt is due: the server has an AI provider, and the user has
 * not answered on the server or (offline "Not now") on this device.
 */
export function consentPending(res: ConsentResponse | undefined, local: boolean | null): boolean {
  return res != null && res.aiAvailable && res.decidedAt == null && local !== false;
}

/**
 * PUT /v1/consent. The server enforces it from the next request on. The
 * learned profile and any answer read under the old setting are refetched.
 */
export async function setAiConsent(client: QueryClient, ai: boolean): Promise<ConsentResponse> {
  const body: ConsentRequest = { ai };
  const res = await request<ConsentResponse>('/consent', { method: 'PUT', body });
  client.setQueryData(keys.consent(getDeviceId()), res);
  mirrorConsent(res);
  void client.invalidateQueries({ queryKey: keys.profile(getDeviceId()) });
  return res;
}

/** ---- Price-drop alerts ---------------------------------------------------------- */

export function useAlerts() {
  const deviceId = useDeviceId();
  return useQuery({
    queryKey: keys.alerts(deviceId),
    queryFn: async ({ signal }) => (await request<AlertsResponse>('/alerts', { signal })).alerts,
    staleTime: QUERY.alertsStaleMs,
    // Checked again whenever the app or tab regains focus: this is how a
    // triggered alert shows up when push is off or unavailable (the web).
    refetchOnWindowFocus: 'always',
  });
}

const setAlerts = (client: QueryClient, update: (prev: PriceAlert[]) => PriceAlert[]) =>
  client.setQueryData<PriceAlert[]>(keys.alerts(getDeviceId()), (prev) => update(prev ?? []));

export async function createAlert(client: QueryClient, productId: string, targetPrice: number): Promise<PriceAlert> {
  const body: CreateAlertRequest = { productId, targetPrice, ...shopperBody() };
  const { alert } = await request<AlertResponse>('/alerts', { method: 'POST', body });
  setAlerts(client, (prev) => [alert, ...prev.filter((a) => a.id !== alert.id)]);
  return alert;
}

export async function deleteAlert(client: QueryClient, id: string): Promise<void> {
  try {
    await request<{ deleted: true }>(`/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (err) {
    // Already gone on the server is the outcome the user asked for.
    if (!(err instanceof ApiRequestError && err.status === 404)) throw err;
  }
  setAlerts(client, (prev) => prev.filter((a) => a.id !== id));
}

export function putPushToken(token: string | null): Promise<{ ok: true }> {
  const body: PushTokenRequest = { token };
  return request<{ ok: true }>('/push-token', { method: 'PUT', body });
}

/** ---- Stores ------------------------------------------------------------------------ */

/** GET /v1/stores?zip= : store locations near a ZIP, nearest first. */
export function useStores(zip: string | null) {
  return useQuery({
    queryKey: keys.stores(zip ?? ''),
    queryFn: async ({ signal }) => (await request<StoresResponse>('/stores', { params: { zip: zip ?? '' }, signal })).stores,
    enabled: zip != null && /^\d{5}$/.test(zip),
    staleTime: QUERY.storesStaleMs,
  });
}

/** The nearest store of each retailer: what the server uses when none is chosen, and the picker's preselection. */
export function nearestPerRetailer(stores: readonly Store[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of [...stores].sort((a, b) => a.distanceMiles - b.distanceMiles)) {
    if (seen.has(s.retailerId)) continue;
    seen.add(s.retailerId);
    ids.push(s.id);
  }
  return ids;
}

/** Store id -> store, for the shopper's ZIP ("which store is this price from"). */
export function useStoreLookup(): Map<string, Store> {
  const zip = shopperStore.use((s) => s.zip);
  const { data } = useStores(zip);
  return useMemo(() => new Map((data ?? []).map((s) => [s.id, s])), [data]);
}

/** ---- Shopping-list totals -------------------------------------------------------------- */

/**
 * POST /v1/basket for the given list. The caller debounces `items`; a change
 * of list or shopper context is a new key, the in-flight request is cancelled
 * through the signal, and the previous totals stay on screen meanwhile.
 */
export function useBasket(items: BasketItemInput[]) {
  const scope = useScope();
  const signature = useMemo(() => items.map((i) => `${i.id}:${i.productId ?? `q=${i.query ?? ''}`}:${i.quantity}`).join('|'), [items]);
  return useQuery({
    queryKey: keys.basket(scope, signature),
    queryFn: async ({ signal }) => {
      const body: BasketRequest = { items, ...shopperBody() };
      const res = await request<BasketResponse>('/basket', { method: 'POST', body, signal });
      registerRetailers(res.retailers);
      seedProducts(res.items.flatMap((i) => (i.product ? [i.product] : [])));
      return res;
    },
    enabled: items.length > 0,
    staleTime: QUERY.basketStaleMs,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
