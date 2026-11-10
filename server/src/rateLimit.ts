export interface RateLimitDecision {
  ok: boolean;
  retryAfterSec: number;
}

/** Fixed-window in-memory rate limiter. Single-process only. */
export class RateLimiter {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();
  private lastSweep = 0;

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 100_000,
  ) {}

  hit(key: string, limit: number): RateLimitDecision {
    const now = this.now();
    this.sweep(now);
    let b = this.buckets.get(key);
    if (!b || now - b.windowStart >= this.windowMs) {
      b = { windowStart: now, count: 0 };
      this.buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.windowStart + this.windowMs - now) / 1000)) };
    }
    return { ok: true, retryAfterSec: 0 };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs && this.buckets.size < this.maxKeys) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) {
      if (now - b.windowStart >= this.windowMs) this.buckets.delete(k);
    }
    // Hard cap: under a key-flood, drop the oldest buckets rather than grow unbounded.
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}
