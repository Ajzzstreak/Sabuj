/**
 * Offer ranking — the personalization hot path.
 * Pure, synchronous, allocation-light. No I/O and no LLM calls happen here:
 * the learned profile is just a handful of numeric weights.
 */
import type { Offer, Product, ProductDetail, RetailerId, UserProfile } from './contract.js';
import type { ProviderProduct, ProviderProductDetail } from './providers/types.js';
import { retailerName } from './retailers.js';
import { applyContext, cheapestRankable, isLinkOnly, isRankable, NO_CONTEXT, type ShopperContext } from './shopper.js';

/** The subset of a profile that ranking reads. */
export type RankingProfile = Pick<
  UserProfile,
  'retailerAffinity' | 'priceSensitivity' | 'speedPreference' | 'qualityPreference' | 'memberships'
> & {
  /** Optional so profiles stored before the field existed rank as 0 (never pay more). */
  maxObservedPremiumPct?: number;
};

/** Neutral profile: ranking degenerates to strictly cheapest-total-first. */
export const NEUTRAL_RANKING_PROFILE: RankingProfile = {
  retailerAffinity: {},
  priceSensitivity: 1,
  speedPreference: 0,
  qualityPreference: 0,
  memberships: [],
  maxObservedPremiumPct: 0,
};

/** Rounding slack (USD) on the premium bound. */
export const PREMIUM_TOLERANCE_USD = 0.01;

/**
 * Highest landedPrice that may be RECOMMENDED: the cheapest rankable price plus
 * the largest relative premium this shopper has actually paid before.
 */
export function premiumBound(cheapestLanded: number, profile: RankingProfile): number {
  const pct = clamp(profile.maxObservedPremiumPct ?? 0, 0, 1);
  return cheapestLanded * (1 + pct) + PREMIUM_TOLERANCE_USD;
}

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

/**
 * Sort offers for a shopper. Returns a new array; index 0 is the recommendation.
 *
 *   effectiveCost = landedPrice - budget(profile, cheapest) * utility(offer, profile)
 *
 * Tiers, in order (an offer never outranks one in an earlier tier):
 *   0. in stock, eligible, priced, and within the shopper's premium bound
 *   1. in stock, eligible, priced, but pricier than the bound (never recommended)
 *   2. in stock but ineligible (needs a membership the shopper said they lack)
 *   3. out of stock
 *   4. link-only ("check price") offers, which have no price to rank
 * With an empty/neutral profile the budget is 0 and the bound is the cheapest
 * price itself, so the order is strictly cheapest landed price first.
 */
export function rankOffers(offers: readonly Offer[], profile: RankingProfile = NEUTRAL_RANKING_PROFILE): Offer[] {
  const cheapest = cheapestRankable(offers);
  const budget = cheapest ? preferenceBudget(cheapest.landedPrice, profile) : 0;
  const bound = cheapest ? premiumBound(cheapest.landedPrice, profile) : 0;
  const tierOf = (o: Offer): number => {
    if (isLinkOnly(o)) return 4;
    if (!o.inStock) return 3;
    if (!o.eligible) return 2;
    return o.landedPrice <= bound ? 0 : 1;
  };
  const scored = offers.map((offer) => {
    const tier = tierOf(offer);
    return {
      offer,
      tier,
      cost: budget === 0 || tier !== 0 ? offer.landedPrice : offer.landedPrice - budget * sumParts(utilityParts(offer, profile)),
    };
  });
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.cost !== b.cost) return a.cost - b.cost;
    if (a.offer.landedPrice !== b.offer.landedPrice) return a.offer.landedPrice - b.offer.landedPrice;
    return a.offer.retailerId < b.offer.retailerId ? -1 : a.offer.retailerId > b.offer.retailerId ? 1 : 0;
  });
  return scored.map((s) => s.offer);
}

/** Why `recommended` beat `cheapest` for this profile. */
export function recommendationReason(recommended: Offer, cheapest: Offer, profile: RankingProfile): string {
  const a = utilityParts(recommended, profile);
  const b = utilityParts(cheapest, profile);
  const deltas: Array<[keyof UtilityParts, number]> = [
    ['affinity', a.affinity - b.affinity],
    ['speed', a.speed - b.speed],
    ['quality', a.quality - b.quality],
    ['membership', a.membership - b.membership],
  ];
  deltas.sort((x, y) => y[1] - x[1]);
  const [driver] = deltas[0]!;
  const name = retailerName(recommended.retailerId);
  // The only dollar figure stated is the real gap between these two offers —
  // never a threshold derived from profile weights.
  const gap = round2(recommended.landedPrice - cheapest.landedPrice);
  const more = gap > 0 ? `$${Number.isInteger(gap) ? gap : gap.toFixed(2)} more` : 'the same price';
  let reason: string;
  switch (driver) {
    case 'affinity':
      // The affinity gap comes either from liking the recommended store or
      // from avoiding the cheapest one; say whichever is actually the case.
      reason =
        a.affinity > 0
          ? `${name} is ${more} — a store you often choose over the lowest price`
          : `${name} is ${more} — you tend to skip ${retailerName(cheapest.retailerId)}`;
      break;
    case 'speed':
      reason = recommended.delivery
        ? `${name} gets it to you faster (${recommended.delivery}) — you tend to pick quicker delivery`
        : `${name} usually delivers faster — you tend to pick quicker delivery`;
      break;
    case 'quality':
      // qualityScore mixes rating and review volume: only claim a better
      // rating when the star rating really is higher.
      reason =
        recommended.rating !== null && (cheapest.rating === null || recommended.rating > cheapest.rating)
          ? `Better reviewed at ${name} (${recommended.rating.toFixed(1)}★) — you tend to favor ratings`
          : `More reviews at ${name} — you tend to favor well-reviewed listings`;
      break;
    case 'membership':
      reason = cheapest.membershipRequired
        ? `The lowest price needs a ${retailerName(cheapest.retailerId)} membership`
        : `Included with your ${name} membership`;
      break;
  }
  // Never recommend a members-only offer to someone with no membership signal
  // without saying so.
  if (recommended.membershipRequired && !profile.memberships.includes(recommended.retailerId)) {
    reason += ` (${name} membership required)`;
  }
  return reason;
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

/**
 * Turn a provider product into the API `Product` for one shopper: apply the
 * shopper context (tax, eligibility), then rank. Memberships the shopper
 * STATED override whatever the profile inferred.
 */
export function personalizeProduct(
  base: ProviderProduct,
  profile: RankingProfile = NEUTRAL_RANKING_PROFILE,
  ctx: ShopperContext = NO_CONTEXT,
): Product {
  const effective: RankingProfile = ctx.memberships ? { ...profile, memberships: [...ctx.memberships] } : profile;
  const offers = rankOffers(applyContext(base.offers, ctx), effective);
  const cheapest = cheapestRankable(offers);
  // Only a rankable offer is ever "recommended": not an ineligible, out-of-stock
  // or link-only one, even when nothing better exists.
  const top = offers[0] && isRankable(offers[0]) ? offers[0] : null;
  let maxLanded = 0;
  for (const o of offers) if (isRankable(o) && o.landedPrice > maxLanded) maxLanded = o.landedPrice;
  const { rating, reviewCount } = aggregateRating(offers);
  const reason = top && cheapest && top.id !== cheapest.id ? recommendationReason(top, cheapest, effective) : null;
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
    maxSavings: cheapest ? round2(maxLanded - cheapest.landedPrice) : 0,
  };
}

export function personalizeProductDetail(base: ProviderProductDetail, profile?: RankingProfile, ctx?: ShopperContext): ProductDetail {
  return {
    ...personalizeProduct(base, profile, ctx),
    description: base.description,
    priceHistory: base.priceHistory,
    reviewSummary: base.reviewSummary,
  };
}

/** maxSavings as a fraction of the most expensive rankable landed price (0..1). */
export function savingsFraction(p: Product): number {
  let max = 0;
  for (const o of p.offers) if (isRankable(o) && o.landedPrice > max) max = o.landedPrice;
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
