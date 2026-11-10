/**
 * CANONICAL API CONTRACT — single source of truth for server and app.
 * Edit here, then run `scripts/sync-types.sh` to copy into server/ and app/.
 * Must stay dependency-free (plain TypeScript types + constants only).
 */

export const API_VERSION = 'v1';

export type RetailerId =
  | 'amazon'
  | 'walmart'
  | 'samsclub'
  | 'target'
  | 'costco'
  | 'bestbuy';

export interface Retailer {
  id: RetailerId;
  name: string;
  /** Brand hex color, used for the retailer chip. */
  color: string;
  /** True when buying generally needs a paid membership (Sam's Club, Costco). */
  membershipRequired: boolean;
}

export interface Offer {
  id: string;
  productId: string;
  retailerId: RetailerId;
  /** Item price in USD, before shipping. */
  price: number;
  /** Strikethrough/list price if the retailer shows one. */
  listPrice: number | null;
  /** Shipping cost in USD. 0 = free shipping. null = unknown. */
  shipping: number | null;
  /** price + (shipping ?? 0). This is what "cheapest" is computed on. */
  totalPrice: number;
  inStock: boolean;
  membershipRequired: boolean;
  /** Retailer-specific rating 0-5 and review count, when available. */
  rating: number | null;
  reviewCount: number | null;
  /** e.g. "Tomorrow", "2-day", "Pickup today". */
  delivery: string | null;
  /** Outbound link to the retailer product page. */
  url: string;
  /** ISO timestamp of when this price was observed. */
  observedAt: string;
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  category: string;
  /** May be null: the app must render a designed placeholder tile. */
  imageUrl: string | null;
  gtin: string | null;
  /** Short key facts, e.g. ["6-cup", "Fuzzy logic", "Keep warm"]. */
  highlights: string[];
  /** Review-count-weighted average rating across offers. */
  rating: number | null;
  reviewCount: number;
  /** Sorted for this user (personalized) — index 0 is the recommended offer. */
  offers: Offer[];
  /** Offer with the lowest totalPrice among in-stock offers. */
  cheapestOfferId: string | null;
  /** offers[0].id — may differ from cheapest when personalization applies. */
  recommendedOfferId: string | null;
  /** Human-readable reason when recommended != cheapest, else null. */
  recommendationReason: string | null;
  /** Highest in-stock totalPrice minus lowest in-stock totalPrice. */
  maxSavings: number;
}

export interface PricePoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  retailerId: RetailerId;
  price: number;
}

export interface ProductDetail extends Product {
  description: string;
  priceHistory: PricePoint[];
  /** Short review-backed pros/cons. */
  reviewSummary: { pros: string[]; cons: string[] } | null;
}

// ---- GET /v1/search?q=&deviceId=&limit= -------------------------------
export interface SearchResponse {
  query: string;
  products: Product[];
  retailers: Retailer[];
  tookMs: number;
  cached: boolean;
  /** True when a learned profile changed the ordering. */
  personalized: boolean;
}

// ---- GET /v1/suggest?q=&deviceId= -------------------------------------
export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

// ---- GET /v1/home?deviceId= -------------------------------------------
export interface HomeSection {
  id: string;
  title: string;
  subtitle: string | null;
  kind: 'for_you' | 'top_deals' | 'recent' | 'category';
  products: Product[];
}
export interface HomeResponse {
  sections: HomeSection[];
  trendingQueries: string[];
  retailers: Retailer[];
}

// ---- GET /v1/products/:id?deviceId= -----------------------------------
export interface ProductResponse {
  product: ProductDetail;
  retailers: Retailer[];
}

// ---- POST /v1/events ---------------------------------------------------
export type EventType =
  | 'search' // user ran a query
  | 'product_view' // opened a product detail
  | 'offer_click' // tapped through to a retailer (strongest signal)
  | 'offer_impression' // offer row was visible
  | 'save' // saved / watchlisted a product
  | 'unsave';

export interface ActivityEvent {
  type: EventType;
  /** Client epoch milliseconds. */
  ts: number;
  query?: string;
  productId?: string;
  offerId?: string;
  retailerId?: RetailerId;
  category?: string;
  brand?: string;
  price?: number;
  /** Position of the offer within the product's list (0 = top). */
  rank?: number;
  /** Whether the clicked offer was the cheapest available. */
  wasCheapest?: boolean;
  /** How much more than the cheapest the user chose to pay, USD. */
  premiumPaid?: number;
}

export interface EventsRequest {
  deviceId: string;
  events: ActivityEvent[];
}
export interface EventsResponse {
  accepted: number;
}

// ---- GET /v1/profile?deviceId=  |  DELETE /v1/profile?deviceId= -------
export interface UserProfile {
  deviceId: string;
  eventCount: number;
  /** -1..1 per retailer. Positive = user prefers it beyond price. */
  retailerAffinity: Partial<Record<RetailerId, number>>;
  /** 0..1. 1 = always picks the cheapest, 0 = price barely matters. */
  priceSensitivity: number;
  /** 0..1 weight on fast delivery. */
  speedPreference: number;
  /** 0..1 weight on ratings/review volume. */
  qualityPreference: number;
  /** Retailers where the user appears to hold a membership. */
  memberships: RetailerId[];
  /** Top categories and brands by interest, 0..1. */
  categoryAffinity: Record<string, number>;
  brandAffinity: Record<string, number>;
  /** One-paragraph plain-English description of this shopper. */
  summary: string;
  /** Short user-facing bullets: "You usually pick Walmart when within $2". */
  insights: string[];
  /** Queries worth suggesting to this user. */
  suggestedQueries: string[];
  /** Which engine produced the current profile. */
  source: 'none' | 'heuristic' | 'claude';
  updatedAt: string | null;
}
export interface ProfileResponse {
  profile: UserProfile;
}
export interface DeleteProfileResponse {
  deleted: true;
}

// ---- Errors ------------------------------------------------------------
export interface ApiError {
  error: { code: string; message: string };
}
