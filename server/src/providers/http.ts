/** Minimal JSON request used by the real provider adapters. Injectable for tests. */
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal; method?: string; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
  ) {
    // Never include the URL: it can carry an API key in the query string.
    super(`${provider} API responded with HTTP ${status}`);
  }
}

export async function getJson(
  provider: string,
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  /** Defaults to GET with no body. */
  extra: { method?: string; body?: string } = {},
): Promise<unknown> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal, ...extra });
  } catch (err) {
    // fetch errors can embed the request URL; rethrow without it.
    throw new Error(`${provider} API request failed (${err instanceof Error ? err.name : 'error'})`);
  }
  if (!res.ok) throw new ProviderHttpError(provider, res.status);
  return res.json();
}

export const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
export const asNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Strip tags/entities from retailer-supplied HTML snippets. */
export function plainText(v: unknown, max = 600): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|#39|lt|gt);/g, (e) => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' })[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Pick the product's category: the first path element that matches a
 * configured CATALOG_CATEGORIES name (so category scoping works against the
 * retailer's own taxonomy), else the most specific (last) path element.
 */
export function pickCategory(path: string[], scoped: readonly string[]): string {
  const hit = path.find((name) => scoped.includes(name.toLowerCase()));
  return hit ?? path[path.length - 1] ?? 'Other';
}

/** Search-result position -> 0..1 relevance (upstream order is all we know). */
export const positionalRelevance = (index: number, total: number) => Math.round((0.9 - (0.5 * index) / Math.max(1, total)) * 10000) / 10000;
