import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { AppState, Platform } from 'react-native';
import { ApiRequestError } from '@/api/client';
import type { HomeResponse, SearchResponse } from '@/api/contract';
import { seedProducts } from '@/api/queries';
import { QUERY, STORAGE_PREFIX } from '@/config';
import { registerRetailers } from './retailers';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Must be >= the persister's maxAge, or restored data is collected at once.
      gcTime: QUERY.gcMs,
      retry: (failureCount, error) => failureCount < 1 && (!(error instanceof ApiRequestError) || error.transient),
      retryDelay: 600,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  },
});

/** Refetch stale data when the app returns to the foreground (the web has this built in). */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

const CACHE_KEY = `${STORAGE_PREFIX}query-cache`;

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: CACHE_KEY, throttleTime: 1000 });

/** The cache is written to disk so a relaunch paints the last results immediately. */
export const persistOptions: PersistQueryClientProviderProps['persistOptions'] = {
  persister,
  maxAge: QUERY.gcMs,
  // Bumped when Offer gained landedPrice / eligible / priceSource: older cached shapes must not render.
  buster: 'v2',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success' && query.queryKey[0] !== 'suggest' && query.queryKey[0] !== 'ask',
  },
};

/** After a restore, rebuild the in-memory lookups the fetchers normally fill. */
export function onCacheRestored(): void {
  for (const query of queryClient.getQueryCache().getAll()) {
    const kind = query.queryKey[0];
    if (kind === 'search') {
      const data = query.state.data as SearchResponse | undefined;
      registerRetailers(data?.retailers);
      seedProducts(data?.products ?? []);
    } else if (kind === 'home') {
      const data = query.state.data as HomeResponse | undefined;
      registerRetailers(data?.retailers);
      for (const s of data?.sections ?? []) seedProducts(s.products);
    }
  }
}

/** Drop every cached response, in memory and on disk. */
export async function wipeQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
