import { describe, expect, it } from 'vitest';
import { SwrCache } from '../src/cache.js';
import { RateLimiter } from '../src/rateLimit.js';

describe('SwrCache', () => {
  it('serves fresh, then stale-while-revalidate, then reloads', async () => {
    let now = 0;
    let loads = 0;
    const cache = new SwrCache<number>({ maxEntries: 10, ttlMs: 100, swrMs: 200, now: () => now });
    const loader = async () => ++loads;

    expect(await cache.get('k', loader)).toEqual({ value: 1, cached: false, stale: false });
    now = 50;
    expect(await cache.get('k', loader)).toEqual({ value: 1, cached: true, stale: false });
    now = 150; // stale: old value now, refresh in background
    expect(await cache.get('k', loader)).toEqual({ value: 1, cached: true, stale: true });
    await new Promise((r) => setImmediate(r));
    expect(await cache.get('k', loader)).toEqual({ value: 2, cached: true, stale: false });
    now = 1000; // past ttl + swr: must reload
    expect(await cache.get('k', loader)).toEqual({ value: 3, cached: false, stale: false });
  });

  it('keeps the stale value when a background refresh fails', async () => {
    let now = 0;
    const cache = new SwrCache<string>({ maxEntries: 10, ttlMs: 100, swrMs: 1000, now: () => now });
    await cache.get('k', async () => 'good');
    now = 150;
    const r = await cache.get('k', async () => {
      throw new Error('upstream down');
    });
    expect(r).toEqual({ value: 'good', cached: true, stale: true });
    await new Promise((r2) => setImmediate(r2));
    expect((await cache.get('k', async () => 'never')).value).toBe('good');
  });

  it('does not cache failures and de-duplicates concurrent loads', async () => {
    const cache = new SwrCache<number>({ maxEntries: 10, ttlMs: 100, swrMs: 0 });
    await expect(cache.get('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    let loads = 0;
    const slow = () => new Promise<number>((r) => setTimeout(() => r(++loads), 10));
    const [a, b] = await Promise.all([cache.get('k', slow), cache.get('k', slow)]);
    expect(loads).toBe(1);
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
  });

  it('evicts the least recently used entry', async () => {
    const cache = new SwrCache<string>({ maxEntries: 2, ttlMs: 1000, swrMs: 0 });
    await cache.get('a', async () => 'a');
    await cache.get('b', async () => 'b');
    await cache.get('a', async () => 'a2'); // touch a
    await cache.get('c', async () => 'c'); // evicts b
    expect(cache.size).toBe(2);
    expect((await cache.get('a', async () => 'reloaded')).cached).toBe(true);
    expect((await cache.get('b', async () => 'reloaded')).cached).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('blocks above the limit and resets after the window', () => {
    let now = 0;
    const rl = new RateLimiter(1000, () => now);
    expect(rl.hit('a', 2).ok).toBe(true);
    expect(rl.hit('a', 2).ok).toBe(true);
    const blocked = rl.hit('a', 2);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(rl.hit('b', 2).ok).toBe(true);
    now = 1000;
    expect(rl.hit('a', 2).ok).toBe(true);
  });
});
