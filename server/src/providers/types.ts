import type { Offer, PricePoint } from '../contract.js';

/** A product as a price source sees it: normalized, NOT personalized. */
export interface ProviderProduct {
  /** Stable id. Must be URL-safe; used as /v1/products/:id. */
  id: string;
  title: string;
  brand: string;
  category: string;
  imageUrl: string | null;
  gtin: string | null;
  highlights: string[];
  /** Normalized offers in any order. totalPrice must equal price + (shipping ?? 0). */
  offers: Offer[];
}

export interface ProviderProductDetail extends ProviderProduct {
  description: string;
  priceHistory: PricePoint[];
  reviewSummary: { pros: string[]; cons: string[] } | null;
}

export interface ProviderSearchHit {
  product: ProviderProduct;
  /** 0..1, higher is more relevant to the query. */
  relevance: number;
}

export interface ProviderCallOptions {
  /** Aborted when the fan-out timeout fires; providers should stop work. */
  signal?: AbortSignal;
}

export interface ProviderSearchOptions extends ProviderCallOptions {
  limit: number;
}

/**
 * A price source (shopping aggregator, retailer affiliate API, ...).
 * Implement `search` and `getProduct`, register the class in
 * `src/providers/index.ts`, and enable it with PRICE_PROVIDERS.
 */
export interface PriceProvider {
  readonly name: string;
  search(query: string, opts: ProviderSearchOptions): Promise<ProviderSearchHit[]>;
  getProduct(id: string, opts?: ProviderCallOptions): Promise<ProviderProductDetail | null>;
  /** Optional: a browsable slice of the catalog for the home screen. */
  browse?(opts?: ProviderCallOptions): Promise<ProviderProduct[]>;
  /** Optional: query autocompletions for a prefix. */
  suggest?(prefix: string, limit: number, opts?: ProviderCallOptions): Promise<string[]>;
}
