/**
 * Offer ranking — the personalization hot path.
 * Pure, synchronous, allocation-light. No I/O and no LLM calls happen here:
 * the learned profile is just a handful of numeric weights.
 */
import type { Offer, Product, ProductDetail, RetailerId, UserProfile } from './contract.js';
import type { ProviderProduct, ProviderProductDetail } from './providers/types.js';
import { retailerName } from './retailers.js';

/** The subset of a profile that ranking reads. */
export type RankingProfile = Pick<
  UserProfile,
  'retailerAffinity' | 'priceSensitivity' | 'speedPreference' | 'qualityPreference' | 'memberships'
>;

/** Neutral profile: ranking degenerates to strictly cheapest-total-first. */
export const NEUTRAL_RANKING_PROFILE: RankingProfile = {
  retailerAffinity: {},
  priceSensitivity: 1,
  speedPreference: 0,
  qualityPreference: 0,
  memberships: [],
};

const SPEED_WEIGHT = 0.6;
const QUALITY_WEIGHT = 0.5;
const MEMBER_BONUS = 0.15;
const NON_MEMBER_PENALTY = 0.6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 0..1 delivery speed from the retailer's free-text delivery promise. */
export function speedScore(delivery: string | null): number {
  if (!delivery) return 0.3;
  const d = delivery.toLowerCase();
  if (d.includes('today') || d.includes('same-day') || d.includes('same day')) return 1;
  if (d.includes('tomorrow') || d.includes('1-day') || d.includes('next-day')) return 0.85;
  if (d.includes('2-day') || d.includes('2 day')) return 0.6;
  if (d.includes('3-5')) return 0.3;
  if (d.includes('5-7') || d.includes('3+') || d.includes('week')) return 0.15;
  return 0.45;
}

/** 0..1 quality signal from rating and review volume. */
export function qualityScore(rating: number | null, reviewCount: number | null): number {
  if (rating === null) return 0.3;
  const r = clamp((rating - 3.5) / 1.5, 0, 1);
  const volume = clamp(Math.log10((reviewCount ?? 0) + 1) / 4, 0, 1);
  return r * (0.6 + 0.4 * volume);
}

/**
 * How many dollars of "extra" this shopper will trade for a perfectly
 * preferred offer. Zero for a fully price-sensitive (or empty) profile.
 */
export function preferenceBudget(cheapestTotal: number, profile: RankingProfile): number {
  const ps = clamp(profile.priceSensitivity, 0, 1);
  return (1 - ps) * clamp(cheapestTotal * 0.12, 1.5, 40);
}

interface UtilityParts {
  affinity: number;
  speed: number;
  quality: number;
  membership: number;
}

function utilityParts(offer: Offer, profile: RankingProfile): UtilityParts {
  const affinity = clamp(profile.retailerAffinity[offer.retailerId] ?? 0, -1, 1);
  const speed = SPEED_WEIGHT * clamp(profile.speedPreference, 0, 1) * speedScore(offer.delivery);
  const quality =
    QUALITY_WEIGHT * clamp(profile.qualityPreference, 0, 1) * qualityScore(offer.rating, offer.reviewCount);
  let membership = 0;
  if (offer.membershipRequired) {
    membership = profile.memberships.includes(offer.retailerId) ? MEMBER_BONUS : -NON_MEMBER_PENALTY;
  }
  return { affinity, speed, quality, membership };
}

const sumParts = (p: UtilityParts) => p.affinity + p.speed + p.quality + p.membership;

function cheapestInStock(offers: readonly Offer[]): Offer | null {
  let best: Offer | null = null;
  for (const o of offers) {
    if (!o.inStock) continue;
    if (!best || o.totalPrice < best.totalPrice || (o.totalPrice === best.totalPrice && o.retailerId < best.retailerId)) {
      best = o;
    }
  }
  return best;
}

/**
 * Sort offers for a shopper. Returns a new array; index 0 is the recommendation.
 *
 *   effectiveCost = totalPrice - budget(profile, cheapestTotal) * utility(offer, profile)
 *
 * - Out-of-stock offers always sort after in-stock ones.
 * - With an empty/neutral profile (priceSensitivity = 1) budget is 0, so the
 *   order is strictly cheapest total first (ties: retailer id).
 */
export function rankOffers(offers: readonly Offer[], profile: RankingProfile = NEUTRAL_RANKING_PROFILE): Offer[] {
  const cheapest = cheapestInStock(offers);
  const budget = cheapest ? preferenceBudget(cheapest.totalPrice, profile) : 0;
  const scored = offers.map((offer) => ({
    offer,
    cost: budget === 0 ? offer.totalPrice : offer.totalPrice - budget * sumParts(utilityParts(offer, profile)),
  }));
  scored.sort((a, b) => {
    if (a.offer.inStock !== b.offer.inStock) return a.offer.inStock ? -1 : 1;
    if (a.cost !== b.cost) return a.cost - b.cost;
    if (a.offer.totalPrice !== b.offer.totalPrice) return a.offer.totalPrice - b.offer.totalPrice;
    return a.offer.retailerId < b.offer.retailerId ? -1 : a.offer.retailerId > b.offer.retailerId ? 1 : 0;
  });
  return scored.map((s) => s.offer);
}

/** Why `recommended` beat `cheapest` for this profile. */
export function recommendationReason(recommended: Offer, cheapest: Offer, profile: RankingProfile): string {
  const budget = preferenceBudget(cheapest.totalPrice, profile);
  const a = utilityParts(recommended, profile);
  const b = utilityParts(cheapest, profile);
  const deltas: Array<[keyof UtilityParts, number]> = [
    ['affinity', a.affinity - b.affinity],
    ['speed', a.speed - b.speed],
    ['quality', a.quality - b.quality],
    ['membership', a.membership - b.membership],
  ];
  deltas.sort((x, y) => y[1] - x[1]);
  const [driver, delta] = deltas[0]!;
  const name = retailerName(recommended.retailerId);
  switch (driver) {
    case 'affinity': {
      const within = Math.max(1, Math.round(budget * delta));
      return `You usually choose ${name} when it's within $${within}`;
    }
    case 'speed':
      return recommended.delivery
        ? `${name} gets it to you faster (${recommended.delivery}) — you tend to pick quicker delivery`
        : `${name} usually delivers faster — you tend to pick quicker delivery`;
    case 'quality':
      return recommended.rating !== null
        ? `Better reviewed at ${name} (${recommended.rating.toFixed(1)}★) — you tend to favor ratings`
        : `Better reviewed at ${name} — you tend to favor ratings`;
    case 'membership':
      return cheapest.membershipRequired
        ? `The lowest price needs a ${retailerName(cheapest.retailerId)} membership`
        : `Included with your ${name} membership`;
  }
}

function aggregateRating(offers: readonly Offer[]): { rating: number | null; reviewCount: number } {
  let weighted = 0;
  let count = 0;
  let plainSum = 0;
  let plainN = 0;
  for (const o of offers) {
    if (o.rating === null) continue;
    plainSum += o.rating;
    plainN += 1;
    if (o.reviewCount && o.reviewCount > 0) {
      weighted += o.rating * o.reviewCount;
      count += o.reviewCount;
    }
  }
  const reviewCount = offers.reduce((n, o) => n + (o.reviewCount ?? 0), 0);
  if (count > 0) return { rating: Math.round((weighted / count) * 10) / 10, reviewCount };
  if (plainN > 0) return { rating: Math.round((plainSum / plainN) * 10) / 10, reviewCount };
  return { rating: null, reviewCount };
}

/** Turn a provider product into the API `Product`, ranked for this profile. */
export function personalizeProduct(base: ProviderProduct, profile: RankingProfile = NEUTRAL_RANKING_PROFILE): Product {
  const offers = rankOffers(base.offers, profile);
  const cheapest = cheapestInStock(offers);
  const top = offers[0] ?? null;
  let maxInStock = 0;
  for (const o of offers) if (o.inStock && o.totalPrice > maxInStock) maxInStock = o.totalPrice;
  const { rating, reviewCount } = aggregateRating(offers);
  const reason =
    top && cheapest && top.inStock && top.id !== cheapest.id ? recommendationReason(top, cheapest, profile) : null;
  return {
    id: base.id,
    title: base.title,
    brand: base.brand,
    category: base.category,
    imageUrl: base.imageUrl,
    gtin: base.gtin,
    highlights: base.highlights,
    rating,
    reviewCount,
    offers,
    cheapestOfferId: cheapest?.id ?? null,
    recommendedOfferId: top?.id ?? null,
    recommendationReason: reason,
    maxSavings: cheapest ? round2(maxInStock - cheapest.totalPrice) : 0,
  };
}

export function personalizeProductDetail(base: ProviderProductDetail, profile?: RankingProfile): ProductDetail {
  return {
    ...personalizeProduct(base, profile),
    description: base.description,
    priceHistory: base.priceHistory,
    reviewSummary: base.reviewSummary,
  };
}

/** maxSavings as a fraction of the most expensive in-stock total (0..1). */
export function savingsFraction(p: Product): number {
  let max = 0;
  for (const o of p.offers) if (o.inStock && o.totalPrice > max) max = o.totalPrice;
  return max > 0 ? p.maxSavings / max : 0;
}

export interface RankedHit {
  product: ProviderProduct;
  relevance: number;
}

/**
 * Order search hits. Relevance stays dominant: category/brand affinity can lift
 * a product by at most ~25%, so it only reorders near-ties.
 */
export function orderHits<T extends RankedHit>(
  hits: readonly T[],
  profile: Pick<UserProfile, 'categoryAffinity' | 'brandAffinity'> | null,
): T[] {
  const scored = hits.map((h, i) => {
    const cat = profile ? clamp(profile.categoryAffinity[h.product.category] ?? 0, 0, 1) : 0;
    const brand = profile ? clamp(profile.brandAffinity[h.product.brand] ?? 0, 0, 1) : 0;
    return { h, i, score: h.relevance * (1 + 0.15 * cat + 0.1 * brand) };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.h);
}

export type { RetailerId };
