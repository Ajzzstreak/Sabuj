/**
 * Heuristic profiler: derives a UserProfile from the raw event log.
 * Pure function — no I/O, no clock access (pass `now`), deterministic.
 */
import type { ActivityEvent, EventType, RetailerId, UserProfile } from '../contract.js';
import { isMembershipRetailer, isRetailerId, retailerName, RETAILER_IDS } from '../retailers.js';

/** Facts about a clicked offer that the event itself does not carry. */
export interface OfferFacts {
  /** 0..1 delivery speed of the clicked offer / of the cheapest alternative. */
  speed: number;
  cheapestSpeed: number;
  /** 0..1 rating quality of the clicked offer / of the cheapest alternative. */
  quality: number;
  cheapestQuality: number;
}

export interface HeuristicContext {
  now: number;
  /** Lifetime event count when `events` is a bounded recent window. */
  totalEvents?: number;
  /** Keyed by offerId. Optional: without it speed/quality stay at their priors. */
  offerFacts?: ReadonlyMap<string, OfferFacts>;
}

/** Interest weight per event type. offer_click is the strongest signal. */
export const EVENT_WEIGHT: Record<EventType, number> = {
  offer_click: 5,
  save: 3,
  product_view: 1.5,
  search: 1,
  offer_impression: 0.1,
  unsave: -2,
};

const HALF_LIFE_MS = 14 * 86_400_000;
// Priors are deliberately neutral for ranking: until clicks say otherwise we
// assume a price-first shopper with no speed/quality trade-offs, so a thin
// profile never reorders offers on a guess.
const PRICE_PRIOR = { value: 1, weight: 3 };
const PREF_PRIOR = { value: 0, weight: 4 };
const MAX_AFFINITY_KEYS = 8;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface RetailerStats {
  clicks: number;
  cheapestClicks: number;
  nonCheapestClicks: number;
  premiumSum: number;
  premiumN: number;
  premiumMax: number;
  impressions: number;
}

function topNormalized(scores: Map<string, number>): Record<string, number> {
  const positive = [...scores.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const max = positive[0]?.[1] ?? 0;
  const out: Record<string, number> = {};
  for (const [k, v] of positive.slice(0, MAX_AFFINITY_KEYS)) {
    const n = round3(v / max);
    if (n >= 0.05) out[k] = n;
  }
  return out;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function buildHeuristicProfile(deviceId: string, events: readonly ActivityEvent[], ctx: HeuristicContext): UserProfile {
  const eventCount = Math.max(ctx.totalEvents ?? 0, events.length);
  const stats = new Map<RetailerId, RetailerStats>();
  const statFor = (r: RetailerId) => {
    let s = stats.get(r);
    if (!s) {
      s = { clicks: 0, cheapestClicks: 0, nonCheapestClicks: 0, premiumSum: 0, premiumN: 0, premiumMax: 0, impressions: 0 };
      stats.set(r, s);
    }
    return s;
  };

  const categories = new Map<string, number>();
  const brands = new Map<string, number>();
  const queries = new Map<string, { score: number; lastTs: number }>();

  let clicks = 0;
  let priceSignalSum = 0;
  let priceSignalN = 0;
  let cheapestKnown = 0;
  let cheapestTrue = 0;
  let speedHits = 0;
  let qualityHits = 0;
  let factsN = 0;

  for (const e of events) {
    const age = Math.max(0, ctx.now - e.ts);
    const decay = Math.pow(0.5, age / HALF_LIFE_MS);
    const w = (EVENT_WEIGHT[e.type] ?? 0) * decay;

    if (e.category) categories.set(e.category, (categories.get(e.category) ?? 0) + w);
    if (e.brand) brands.set(e.brand, (brands.get(e.brand) ?? 0) + w);

    if (e.type === 'search' && e.query) {
      const q = e.query.toLowerCase().replace(/\s+/g, ' ').trim();
      if (q) {
        const cur = queries.get(q) ?? { score: 0, lastTs: 0 };
        queries.set(q, { score: cur.score + decay, lastTs: Math.max(cur.lastTs, e.ts) });
      }
    }

    const retailer = isRetailerId(e.retailerId) ? e.retailerId : null;
    if (e.type === 'offer_impression' && retailer) statFor(retailer).impressions += 1;

    if (e.type === 'offer_click') {
      clicks += 1;
      if (retailer) {
        const s = statFor(retailer);
        s.clicks += 1;
        if (e.wasCheapest === true) s.cheapestClicks += 1;
        if (e.wasCheapest === false) {
          s.nonCheapestClicks += 1;
          if (typeof e.premiumPaid === 'number' && e.premiumPaid >= 0) {
            s.premiumSum += e.premiumPaid;
            s.premiumN += 1;
            s.premiumMax = Math.max(s.premiumMax, e.premiumPaid);
          }
        }
      }
      // Price sensitivity: 1 for a cheapest pick; a non-cheapest pick scores
      // lower the larger the premium was relative to the price.
      if (e.wasCheapest === true) {
        priceSignalSum += 1;
        priceSignalN += 1;
        cheapestKnown += 1;
        cheapestTrue += 1;
      } else if (e.wasCheapest === false) {
        cheapestKnown += 1;
        let v = 0.2;
        if (typeof e.premiumPaid === 'number' && typeof e.price === 'number' && e.price > 0) {
          v = clamp(0.4 - (e.premiumPaid / e.price) * 4, 0, 0.4);
        }
        priceSignalSum += v;
        priceSignalN += 1;
      }
      const facts = e.offerId ? ctx.offerFacts?.get(e.offerId) : undefined;
      if (facts) {
        factsN += 1;
        if (e.wasCheapest === false) {
          if (facts.speed > facts.cheapestSpeed + 0.1) speedHits += 1;
          if (facts.quality > facts.cheapestQuality + 0.05) qualityHits += 1;
        }
      }
    }
  }

  // --- numeric fields -----------------------------------------------------
  const priceSensitivity = round3(
    clamp((PRICE_PRIOR.value * PRICE_PRIOR.weight + priceSignalSum) / (PRICE_PRIOR.weight + priceSignalN), 0, 1),
  );
  const speedPreference = round3(clamp((PREF_PRIOR.value * PREF_PRIOR.weight + speedHits) / (PREF_PRIOR.weight + factsN), 0, 1));
  const qualityPreference = round3(
    clamp((PREF_PRIOR.value * PREF_PRIOR.weight + qualityHits) / (PREF_PRIOR.weight + factsN), 0, 1),
  );

  const confidence = clicks / (clicks + 5);
  const retailerAffinity: Partial<Record<RetailerId, number>> = {};
  const memberships: RetailerId[] = [];
  for (const id of RETAILER_IDS) {
    const s = stats.get(id);
    if (!s) continue;
    let affinity = 0;
    if (s.clicks > 0 && clicks > 0) {
      // Choosing a retailer when it was NOT the cheapest is the real loyalty
      // signal; cheapest picks count a little, they are mostly about price.
      const neutral = s.clicks - s.cheapestClicks - s.nonCheapestClicks;
      const raw = (s.nonCheapestClicks + 0.3 * (s.cheapestClicks + neutral)) / clicks;
      affinity = confidence * Math.min(1, raw * 1.2);
    } else if (s.impressions >= 5 && clicks >= 5) {
      // Seen often, never chosen.
      affinity = -confidence * 0.4 * (s.impressions / (s.impressions + 10));
    }
    affinity = round3(clamp(affinity, -1, 1));
    if (Math.abs(affinity) >= 0.02) retailerAffinity[id] = affinity;
    if (isMembershipRetailer(id) && (s.clicks >= 2 || s.nonCheapestClicks >= 1)) memberships.push(id);
  }

  const categoryAffinity = topNormalized(categories);
  const brandAffinity = topNormalized(brands);

  // --- templated text -----------------------------------------------------
  const topRetailer = (Object.entries(retailerAffinity) as Array<[RetailerId, number]>)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  const topCats = Object.keys(categoryAffinity).slice(0, 3);
  const topBrands = Object.keys(brandAffinity).slice(0, 2);
  const insights: string[] = [];

  if (topRetailer && topRetailer[1] >= 0.2) {
    const s = stats.get(topRetailer[0])!;
    const name = retailerName(topRetailer[0]);
    if (s.nonCheapestClicks >= 2 && s.premiumN > 0) {
      // Largest premium actually paid, rounded up, so the bound covers every
      // observed pick. A mean would say "within $8" for $1 once and $15 once.
      const bound = Math.max(1, Math.ceil(s.premiumMax - 1e-9));
      insights.push(`You usually pick ${name} when it's within $${bound} of the lowest price`);
    } else if (s.nonCheapestClicks >= 2) {
      insights.push(`You often pick ${name} even when it isn't the cheapest`);
    } else {
      insights.push(`${name} is the store you click through to most`);
    }
  }
  if (cheapestKnown >= 3) {
    const pct = Math.round((cheapestTrue / cheapestKnown) * 100);
    insights.push(`You chose the lowest price ${pct}% of the time`);
  }
  for (const m of memberships) insights.push(`Looks like you shop with a ${retailerName(m)} membership`);
  if (factsN >= 3 && speedHits / factsN >= 0.4) insights.push('You often pay a little more for faster delivery');
  if (factsN >= 3 && qualityHits / factsN >= 0.4) insights.push('You lean toward better-reviewed listings');
  if (topCats.length) insights.push(`You look at ${joinNames(topCats.map((c) => c.toLowerCase()))} the most`);

  const shopperKind =
    clicks < 3 ? 'a new' : priceSensitivity >= 0.75 ? 'a price-first' : priceSensitivity >= 0.45 ? 'a balanced' : 'a convenience-first';
  const parts: string[] = [`Based on ${eventCount} interaction${eventCount === 1 ? '' : 's'}, this is ${shopperKind} shopper`];
  if (topRetailer && topRetailer[1] >= 0.2) parts.push(`who favors ${retailerName(topRetailer[0])}`);
  let summary = parts.join(' ');
  if (topCats.length) summary += `, mostly interested in ${joinNames(topCats.map((c) => c.toLowerCase()))}`;
  if (topBrands.length) summary += ` (notably ${joinNames(topBrands)})`;
  summary += '.';
  if (memberships.length) summary += ` Appears to hold a ${joinNames(memberships.map(retailerName))} membership.`;

  const suggested: string[] = [];
  const pushQuery = (q: string) => {
    const v = q.toLowerCase().trim().slice(0, 80);
    if (v && !suggested.includes(v) && suggested.length < 8) suggested.push(v);
  };
  [...queries.entries()]
    .sort((a, b) => b[1].score - a[1].score || b[1].lastTs - a[1].lastTs)
    .slice(0, 4)
    .forEach(([q]) => pushQuery(q));
  for (const brand of topBrands) if (topCats[0]) pushQuery(`${brand} ${topCats[0]}`);
  for (const cat of topCats) pushQuery(`best ${cat}`);

  return {
    deviceId,
    eventCount,
    retailerAffinity,
    priceSensitivity,
    speedPreference,
    qualityPreference,
    memberships,
    categoryAffinity,
    brandAffinity,
    summary,
    insights: insights.slice(0, 6),
    suggestedQueries: suggested,
    source: 'heuristic',
    updatedAt: new Date(ctx.now).toISOString(),
  };
}
