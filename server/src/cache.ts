export interface CacheResult<V> {
  value: V;
  /** True when the value came from the cache (fresh or stale). */
  cached: boolean;
  /** True when a stale value was served and a background refresh was started. */
  stale: boolean;
}

export interface SwrCacheOptions {
  maxEntries: number;
  /** Entries younger than this are fresh. */
  ttlMs: number;
  /** After ttl, entries are served stale for this long while revalidating in the background. */
  swrMs: number;
  now?: () => number;
}

interface Entry<V> {
  value: V;
  storedAt: number;
}

/**
 * In-memory LRU cache with TTL and stale-while-revalidate.
 * Concurrent loads for the same key are de-duplicated.
 */
export class SwrCache<V> {
  private readonly map = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private readonly now: () => number;

  constructor(private readonly opts: SwrCacheOptions) {
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.map.size;
  }

  async get(key: string, loader: () => Promise<V>): Promise<CacheResult<V>> {
    const entry = this.map.get(key);
    if (entry) {
      const age = this.now() - entry.storedAt;
      if (age < this.opts.ttlMs) {
        this.touch(key, entry);
        return { value: entry.value, cached: true, stale: false };
      }
      if (age < this.opts.ttlMs + this.opts.swrMs) {
        this.touch(key, entry);
        // Revalidate in the background; a failed refresh keeps the stale entry.
        this.load(key, loader).catch(() => undefined);
        return { value: entry.value, cached: true, stale: true };
      }
      this.map.delete(key);
    }
    const value = await this.load(key, loader);
    return { value, cached: false, stale: false };
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  private touch(key: string, entry: Entry<V>): void {
    this.map.delete(key);
    this.map.set(key, entry);
  }

  private load(key: string, loader: () => Promise<V>): Promise<V> {
    let p = this.inflight.get(key);
    if (!p) {
      p = loader()
        .then((value) => {
          this.set(key, value);
          return value;
        })
        .finally(() => {
          this.inflight.delete(key);
        });
      this.inflight.set(key, p);
    }
    return p;
  }

  private set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, storedAt: this.now() });
    while (this.map.size > this.opts.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
