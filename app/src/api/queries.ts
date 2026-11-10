import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { QUERY } from '@/config';
import { getDeviceId, useDeviceId } from '@/lib/deviceId';
import { registerRetailers } from '@/lib/retailers';
import { request } from './client';
import type {
  DeleteProfileResponse,
  HomeResponse,
  Product,
  ProductDetail,
  ProductResponse,
  ProfileResponse,
  SearchResponse,
  SuggestResponse,
} from './contract';

export const SEARCH_LIMIT = 24;
const norm = (q: string) => q.trim().toLowerCase();

/** The device id is part of every key, so rotating it ("Delete my data") starts clean. */
export const keys = {
  search: (deviceId: string, q: string) => ['search', deviceId, norm(q)] as const,
  suggest: (deviceId: string, q: string) => ['suggest', deviceId, norm(q)] as const,
  home: (deviceId: string) => ['home', deviceId] as const,
  product: (deviceId: string, id: string) => ['product', deviceId, id] as const,
  profile: (deviceId: string) => ['profile', deviceId] as const,
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

async function fetchSearch(deviceId: string, q: string, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await request<SearchResponse>('/search', { params: { q: q.trim(), deviceId, limit: SEARCH_LIMIT }, signal });
  registerRetailers(res.retailers);
  seedProducts(res.products);
  return res;
}
async function fetchProduct(deviceId: string, id: string, signal?: AbortSignal): Promise<ProductDetail> {
  const res = await request<ProductResponse>(`/products/${encodeURIComponent(id)}`, { params: { deviceId }, signal });
  registerRetailers(res.retailers);
  return res.product;
}
async function fetchHome(deviceId: string, signal?: AbortSignal): Promise<HomeResponse> {
  const res = await request<HomeResponse>('/home', { params: { deviceId }, signal });
  registerRetailers(res.retailers);
  for (const s of res.sections) seedProducts(s.products);
  return res;
}

const searchOptions = (deviceId: string, q: string) => ({
  queryKey: keys.search(deviceId, q),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchSearch(deviceId, q, signal),
  staleTime: QUERY.searchStaleMs,
});
const productOptions = (deviceId: string, id: string) => ({
  queryKey: keys.product(deviceId, id),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchProduct(deviceId, id, signal),
  staleTime: QUERY.productStaleMs,
});

export function useSearch(q: string) {
  const deviceId = useDeviceId();
  return useQuery({
    ...searchOptions(deviceId, q),
    enabled: deviceId !== '' && norm(q).length > 0,
    // Keep the previous results on screen while a new query loads.
    placeholderData: keepPreviousData,
  });
}

export function useSuggest(q: string) {
  const deviceId = useDeviceId();
  return useQuery({
    queryKey: keys.suggest(deviceId, q),
    // The signal aborts the in-flight request as soon as the next keystroke changes the key.
    queryFn: ({ signal }) => request<SuggestResponse>('/suggest', { params: { q: q.trim(), deviceId }, signal }),
    enabled: deviceId !== '' && norm(q).length > 0,
    staleTime: QUERY.suggestStaleMs,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useHome() {
  const deviceId = useDeviceId();
  return useQuery({
    queryKey: keys.home(deviceId),
    queryFn: ({ signal }) => fetchHome(deviceId, signal),
    enabled: deviceId !== '',
    staleTime: QUERY.homeStaleMs,
  });
}

export function useProduct(id: string) {
  const deviceId = useDeviceId();
  return useQuery({
    ...productOptions(deviceId, id),
    enabled: deviceId !== '' && id !== '',
  });
}

export function useProfile() {
  const deviceId = useDeviceId();
  return useQuery({
    queryKey: keys.profile(deviceId),
    queryFn: async ({ signal }) => (await request<ProfileResponse>('/profile', { params: { deviceId }, signal })).profile,
    enabled: deviceId !== '',
    staleTime: QUERY.profileStaleMs,
  });
}

/** Warm the detail cache (called on card press-in, before navigation). */
export function prefetchProduct(client: QueryClient, id: string): void {
  const deviceId = getDeviceId();
  if (deviceId) void client.prefetchQuery(productOptions(deviceId, id));
}

/** Warm search results (called for the top typeahead suggestion). */
export function prefetchSearch(client: QueryClient, q: string): void {
  const deviceId = getDeviceId();
  if (deviceId && norm(q)) void client.prefetchQuery(searchOptions(deviceId, q));
}

export function deleteProfile(deviceId: string): Promise<DeleteProfileResponse> {
  return request<DeleteProfileResponse>('/profile', { method: 'DELETE', params: { deviceId } });
}

export { productOptions };
