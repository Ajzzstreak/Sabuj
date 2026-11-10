import type { Config } from '../config.js';
import { MockProvider } from './mock/index.js';
import type { PriceProvider } from './types.js';

type ProviderFactory = (config: Config) => PriceProvider;

/**
 * Provider registry. To add a real source:
 *   1. implement `PriceProvider` (see ./types.ts) in a new file,
 *   2. add a factory below (read its credentials from env there),
 *   3. enable it with PRICE_PROVIDERS=name[,name...].
 */
const REGISTRY: Record<string, ProviderFactory> = {
  mock: (config) => new MockProvider({ latencyMs: config.mockLatencyMs }),
};

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
