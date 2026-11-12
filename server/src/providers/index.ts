import type { Config } from '../config.js';
import { BestBuyProvider } from './bestbuy.js';
import { KrogerProvider } from './kroger.js';
import { MockProvider, parsePriceOverrides } from './mock/index.js';
import type { PriceProvider } from './types.js';
import { WalmartProvider } from './walmart.js';

type ProviderFactory = (config: Config) => PriceProvider;

/**
 * Provider registry. To add a real source:
 *   1. implement `PriceProvider` (see ./types.ts) in a new file,
 *   2. add a factory below (read its credentials from config/env there),
 *   3. enable it with PRICE_PROVIDERS=name[,name...].
 *
 * `bestbuy`, `walmart` and `kroger` are OFF unless named in PRICE_PROVIDERS and are
 * UNVERIFIED AGAINST THE LIVE APIs — read their file headers before enabling.
 */
const REGISTRY: Record<string, ProviderFactory> = {
  mock: (config) =>
    new MockProvider({
      latencyMs: config.mockLatencyMs,
      catalog: config.mockCatalog,
      categories: config.catalogCategories,
      priceOverrides: parsePriceOverrides(config.mockPriceOverrides),
    }),
  bestbuy: (config) => {
    if (!config.bestbuyApiKey) throw new Error('PRICE_PROVIDERS includes "bestbuy" but BESTBUY_API_KEY is not set');
    return new BestBuyProvider({ apiKey: config.bestbuyApiKey, categories: config.catalogCategories });
  },
  kroger: (config) => {
    if (!config.krogerClientId || !config.krogerClientSecret) {
      throw new Error('PRICE_PROVIDERS includes "kroger" but KROGER_CLIENT_ID / KROGER_CLIENT_SECRET are not set');
    }
    return new KrogerProvider({ clientId: config.krogerClientId, clientSecret: config.krogerClientSecret, categories: config.catalogCategories });
  },
  walmart: (config) => {
    if (!config.walmartConsumerId || !config.walmartPrivateKey) {
      throw new Error('PRICE_PROVIDERS includes "walmart" but WALMART_CONSUMER_ID / WALMART_PRIVATE_KEY are not set');
    }
    return new WalmartProvider({
      consumerId: config.walmartConsumerId,
      privateKey: config.walmartPrivateKey,
      keyVersion: config.walmartKeyVersion,
      publisherId: config.walmartPublisherId,
      categories: config.catalogCategories,
    });
  },
};

/** Providers that return real retailer prices (priceSource 'live'). */
export const LIVE_PROVIDERS: readonly string[] = ['bestbuy', 'walmart', 'kroger'];

export function createProviders(config: Config): PriceProvider[] {
  if (config.providers.length === 0) throw new Error('PRICE_PROVIDERS is empty');
  return config.providers.map((name) => {
    const factory = REGISTRY[name];
    if (!factory) {
      throw new Error(`Unknown price provider "${name}". Known providers: ${Object.keys(REGISTRY).join(', ')}`);
    }
    return factory(config);
  });
}
