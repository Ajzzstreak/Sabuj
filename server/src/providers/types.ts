import type { Offer, PackageSize, PricePoint, RetailerId, Store } from '../contract.js';

/**
 * An offer as a price source reports it. The per-shopper fields (estimatedTax,
 * landedPrice, eligible) are NOT a provider concern: they are filled in after
 * the shared cache by `applyContext` (src/shopper.ts).
 * For priceSource 'link_only' every price field must be 0 / null.
 *
 * unitPrice / unitLabel are derived from price and size in the same step.
 * `storeId` is null for a national/online price; a provider whose upstream
 * prices are per location (see `storeScopedRetailers`) sets it itself.
 */
export type ProviderOffer = Omit<Offer, 'estimatedTax' | 'landedPrice' | 'eligible' | 'unitPrice' | 'unitLabel'>;

/** Which store the shopper buys from at each retailer (at most one per retailer). */
export type StoreSelection = Partial<Record<RetailerId, string>>;

/** A product as a price source sees it: normalized, NOT personalized. */
export interface ProviderProduct {
  /** Stable id. Must be URL-safe; used as /v1/products/:id. */
  id: string;
  title: string;
  brand: string;
  category: string;
  imageUrl: string | null;
  gtin: string | null;
  /** Package size of this item; null when not applicable (electronics). */
  size: PackageSize | null;
  /** True for a retailer's own label. */
  isStoreBrand: boolean;
  highlights: string[];
  /** Normalized offers in any order. totalPrice must equal price + (shipping ?? 0). */
  offers: ProviderOffer[];
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
  /**
   * Selected stores. Only providers that declare `storeScopedRetailers` need
   * to read it (their upstream prices depend on the location).
   */
  stores?: StoreSelection;
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
  /** Must resolve to null for ids this provider does not own. */
  getProduct(id: string, opts?: ProviderCallOptions): Promise<ProviderProductDetail | null>;
  /** Barcode lookup. `gtin` is the canonical 14-digit form (see src/gtin.ts). */
  lookupGtin(gtin: string, opts?: ProviderCallOptions): Promise<ProviderProductDetail | null>;
  /**
   * Optional: retailers whose prices this provider must fetch PER STORE. The
   * catalog adds those retailers' selected store ids to its cache keys, so
   * results for different stores never mix. Providers that can price a store
   * after the fact should implement `localizeOffer` instead and stay shared.
   */
  readonly storeScopedRetailers?: readonly RetailerId[];
  /** Optional: store locations near a ZIP, nearest first. */
  stores?(zip: string, opts?: ProviderCallOptions): Promise<Store[]>;
  /** Optional: the retailer a store id issued by this provider belongs to, else null. */
  storeRetailer?(storeId: string): RetailerId | null;
  /**
   * Optional, synchronous and pure: re-price one of this provider's offers for
   * a store, returning the offer with `storeId` set — or null when the offer
   * is not this provider's or has no per-store price. Runs AFTER the shared
   * cache, on every request, so it must be cheap.
   */
  localizeOffer?(offer: ProviderOffer, storeId: string): ProviderOffer | null;
  /** Optional: queries worth showing as "trending" for this catalog. */
  trending?(): string[];
  /** Optional: a browsable slice of the catalog for the home screen. */
  browse?(opts?: ProviderCallOptions): Promise<ProviderProduct[]>;
  /** Optional: query autocompletions for a prefix. */
  suggest?(prefix: string, limit: number, opts?: ProviderCallOptions): Promise<string[]>;
}
