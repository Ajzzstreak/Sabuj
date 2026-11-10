import { API_URL, QUERY } from '@/config';
import { API_VERSION, type ApiError } from './contract';

export type ApiFailure = 'network' | 'timeout' | 'http';

export class ApiRequestError extends Error {
  readonly kind: ApiFailure;
  readonly status: number | null;
  readonly code: string | null;
  constructor(kind: ApiFailure, message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
  /** Worth retrying later: the server was unreachable or failed on its side. */
  get transient(): boolean {
    return this.kind !== 'http' || (this.status ?? 0) >= 500 || this.status === 429;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Cancels the request (TanStack Query passes one per fetch). */
  signal?: AbortSignal;
  /** Lets the request outlive the page on the web (used when backgrounding). */
  keepalive?: boolean;
  timeoutMs?: number;
}

export function apiUrl(path: string, params?: RequestOptions['params']): string {
  const query = Object.entries(params ?? {})
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `${API_URL}/${API_VERSION}${path}${query ? `?${query}` : ''}`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, body, signal, keepalive, timeoutMs = QUERY.requestTimeoutMs } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort);

  try {
    let res: Response;
    try {
      res = await fetch(apiUrl(path, params), {
        method,
        signal: controller.signal,
        keepalive,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (signal?.aborted) throw err; // a deliberate cancel, not a failure
      throw timedOut
        ? new ApiRequestError('timeout', 'The server took too long to respond.')
        : new ApiRequestError('network', 'Could not reach the server.');
    }
    if (!res.ok) {
      let message = `Request failed (${res.status}).`;
      let code: string | null = null;
      try {
        const parsed = (await res.json()) as Partial<ApiError>;
        if (parsed.error?.message) message = parsed.error.message;
        if (parsed.error?.code) code = parsed.error.code;
      } catch {
        /* body was not JSON */
      }
      throw new ApiRequestError('http', message, res.status, code);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Plain-language text for an error state. */
export function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiRequestError) {
    if (error.kind === 'network') {
      return { title: "Can't reach the server", detail: 'Check your connection, then try again.' };
    }
    if (error.kind === 'timeout') {
      return { title: 'That took too long', detail: 'The server did not answer in time. Try again.' };
    }
    if (error.status === 404) {
      return { title: 'Not found', detail: 'This item is no longer available.' };
    }
    return { title: 'Something went wrong', detail: error.message };
  }
  return { title: 'Something went wrong', detail: 'Try again in a moment.' };
}
