/**
 * Asynchronous profile learning. Event ingestion calls `notify(deviceId)` and
 * returns immediately; the work happens later on a debounce timer:
 *
 *   1. heuristic profile (always)
 *   2. Claude refinement (only if configured, every N new events, and at most
 *      once per cooldown window per device)
 */
import type { Catalog } from '../catalog.js';
import type { ActivityEvent, UserProfile } from '../contract.js';
import { emptyProfile, type Store } from '../db.js';
import { qualityScore, speedScore } from '../ranking.js';
import type { ClaudeProfiler } from './claude.js';
import { buildHeuristicProfile, type OfferFacts } from './heuristic.js';

export interface LearnerOptions {
  debounceMs: number;
  claudeEveryNEvents: number;
  claudeCooldownMs: number;
  /** Recent-event window the profilers read. */
  eventWindow?: number;
  now?: () => number;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
}

/** After this many multiples of N new events, a Claude profile is considered stale. */
const CLAUDE_STALE_FACTOR = 4;
const MAX_FACT_PRODUCTS = 40;

export class ProfileLearner {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<void>>();
  /** Bumped on erase so in-flight jobs cannot write a profile back. */
  private readonly epochs = new Map<string, number>();
  private readonly cache = new Map<string, UserProfile>();
  private readonly now: () => number;
  private readonly eventWindow: number;

  constructor(
    private readonly store: Store,
    private readonly catalog: Catalog | null,
    private readonly claude: ClaudeProfiler | null,
    private readonly opts: LearnerOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.eventWindow = opts.eventWindow ?? 2000;
  }

  /** Schedule a (debounced) profile rebuild. Never blocks, never throws. */
  notify(deviceId: string): void {
    this.cache.delete(deviceId);
    if (this.timers.has(deviceId)) return; // already scheduled; it will see the new events
    const timer = setTimeout(() => {
      this.timers.delete(deviceId);
      void this.runExclusive(deviceId);
    }, this.opts.debounceMs);
    timer.unref();
    this.timers.set(deviceId, timer);
  }

  /** Current profile for the request path: one indexed SQLite read, memoized. */
  getProfile(deviceId: string): UserProfile {
    const hit = this.cache.get(deviceId);
    if (hit) return hit;
    const profile = this.readProfile(deviceId);
    if (this.cache.size >= 5000) this.cache.clear();
    this.cache.set(deviceId, profile);
    return profile;
  }

  /** Erase a device: stored data, pending work, and anything in flight. */
  forget(deviceId: string): void {
    const timer = this.timers.get(deviceId);
    if (timer) clearTimeout(timer);
    this.timers.delete(deviceId);
    this.epochs.set(deviceId, (this.epochs.get(deviceId) ?? 0) + 1);
    this.store.deleteDevice(deviceId);
    this.cache.delete(deviceId);
  }

  /** Run everything pending now and wait for it (tests, graceful shutdown). */
  async flush(): Promise<void> {
    for (const [deviceId, timer] of [...this.timers]) {
      clearTimeout(timer);
      this.timers.delete(deviceId);
      void this.runExclusive(deviceId);
    }
    while (this.running.size > 0) await Promise.allSettled([...this.running.values()]);
  }

  private readProfile(deviceId: string): UserProfile {
    const row = this.store.getRow(deviceId);
    if (!row) return emptyProfile(deviceId);
    const claudeFresh =
      row.claude !== null && row.totalEvents - row.claudeEventCount < this.opts.claudeEveryNEvents * CLAUDE_STALE_FACTOR;
    const chosen = claudeFresh ? row.claude : row.heuristic;
    if (!chosen) return emptyProfile(deviceId, row.totalEvents);
    return { ...chosen, deviceId, eventCount: row.totalEvents };
  }

  private runExclusive(deviceId: string): Promise<void> {
    const prev = this.running.get(deviceId) ?? Promise.resolve();
    const next = prev
      .then(() => this.run(deviceId))
      .catch((err) => this.opts.log?.('profile learner failed', { error: err instanceof Error ? err.message : String(err) }))
      .finally(() => {
        if (this.running.get(deviceId) === next) this.running.delete(deviceId);
      });
    this.running.set(deviceId, next);
    return next;
  }

  private async run(deviceId: string): Promise<void> {
    const epoch = this.epochs.get(deviceId) ?? 0;
    const alive = () => (this.epochs.get(deviceId) ?? 0) === epoch;

    const row = this.store.getRow(deviceId);
    if (!row) return;
    const events = this.store.recentEvents(deviceId, this.eventWindow);
    const offerFacts = await this.collectOfferFacts(events);
    if (!alive()) return;

    const now = this.now();
    const heuristic = buildHeuristicProfile(deviceId, events, { now, totalEvents: row.totalEvents, offerFacts });
    this.store.saveHeuristic(deviceId, heuristic);
    this.cache.delete(deviceId);

    if (!this.claude) return;
    const newEvents = row.totalEvents - row.claudeEventCount;
    const cooledDown = row.claudeAt === null || now - row.claudeAt >= this.opts.claudeCooldownMs;
    if (newEvents < this.opts.claudeEveryNEvents || !cooledDown) return;

    const refined = await this.claude.refine(events, heuristic, now);
    if (!alive()) return; // erased while the request was in flight: drop the result
    if (!refined) {
      // Failure: the heuristic profile stays in place. Start the cooldown so a
      // broken key or outage is not retried on every batch.
      this.store.markClaudeAttempt(deviceId, this.now());
      return;
    }
    this.store.saveClaude(deviceId, refined, row.totalEvents, this.now());
    this.cache.delete(deviceId);
  }

  /** Look up delivery/rating facts for clicked offers (cached catalog reads, off the request path). */
  private async collectOfferFacts(events: readonly ActivityEvent[]): Promise<Map<string, OfferFacts>> {
    const facts = new Map<string, OfferFacts>();
    if (!this.catalog) return facts;
    const productIds: string[] = [];
    for (let i = events.length - 1; i >= 0 && productIds.length < MAX_FACT_PRODUCTS; i--) {
      const e = events[i]!;
      if (e.type === 'offer_click' && e.productId && e.offerId && !productIds.includes(e.productId)) productIds.push(e.productId);
    }
    await Promise.all(
      productIds.map(async (id) => {
        try {
          const { value: product } = await this.catalog!.product(id);
          if (!product) return;
          const inStock = product.offers.filter((o) => o.inStock);
          const cheapest = inStock.sort((a, b) => a.totalPrice - b.totalPrice)[0];
          if (!cheapest) return;
          for (const o of product.offers) {
            facts.set(o.id, {
              speed: speedScore(o.delivery),
              cheapestSpeed: speedScore(cheapest.delivery),
              quality: qualityScore(o.rating, o.reviewCount),
              cheapestQuality: qualityScore(cheapest.rating, cheapest.reviewCount),
            });
          }
        } catch {
          /* facts are optional */
        }
      }),
    );
    return facts;
  }
}
