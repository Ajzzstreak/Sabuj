import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { prefetchSearch, useSuggest } from '@/api/queries';

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * Debounced suggestions for the text being typed. Each keystroke that changes
 * the debounced value cancels the previous request. The top suggestion's
 * results are prefetched so choosing it is instant.
 */
export function useTypeahead(text: string, active = true) {
  const client = useQueryClient();
  const debounced = useDebounced(text.trim(), 140);
  const query = useSuggest(active ? debounced : '');
  const fresh = query.data && !query.isPlaceholderData ? query.data : undefined;
  const top = fresh?.suggestions[0];

  useEffect(() => {
    if (top) prefetchSearch(client, top);
  }, [client, top]);

  return {
    suggestions: debounced && text.trim() ? (query.data?.suggestions ?? []) : [],
    loading: query.isFetching,
  };
}
