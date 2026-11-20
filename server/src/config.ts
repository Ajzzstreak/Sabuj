import { z } from 'zod';

/**
 * TRUST_PROXY: number of reverse-proxy hops in front of the server. "true" means
 * one hop. It is deliberately never Fastify's `trustProxy: true`, which takes
 * the LEFTMOST X-Forwarded-For entry — a value the client controls, so anyone
 * could dodge the per-IP rate limit by sending a fake header.
 *
 * Deployments: behind exactly one proxy / load balancer (most PaaS hosts, a
 * single nginx or Caddy) set TRUST_PROXY=1; the client IP is then the entry
 * that proxy appended. Behind a CDN AND a load balancer, set the number of
 * hops (2). Clients connecting directly: leave it unset/false. With it unset
 * behind a proxy, every client shares the proxy's IP and the per-IP limits
 * (device registration, anonymous rate limits) hit everyone at once.
 * Accepted: empty, "false", "0", "true", or a whole number 1-99.
 */
const proxyHops = z
  .string()
  .optional()
  .transform((v) => (v ?? '').trim().toLowerCase())
  .refine((t) => t === '' || t === 'true' || t === 'false' || /^\d{1,2}$/.test(t), { message: 'expected "false", "true" or a number of proxy hops (0-99)' })
  .transform((t) => {
    if (t === 'true') return 1;
    const n = /^\d{1,2}$/.test(t) ? Number(t) : 0;
    return n > 0 ? n : false;
  });

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const str = (def: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? def : v.trim()));

const EnvSchema = z.object({
  PORT: int(8787, 0, 65535),
  HOST: str('0.0.0.0'),
  CORS_ORIGIN: str('*'),
  TRUST_PROXY: proxyHops,
  BODY_LIMIT_BYTES: int(65536, 1024),
  LOG_LEVEL: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim().toLowerCase() || 'info')
    .pipe(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])),
  SHUTDOWN_TIMEOUT_MS: int(10000, 100, 120000),
  DB_PATH: str('./data/deallens.db'),
  MAX_EVENTS_PER_DEVICE: int(5000, 100),
  PRICE_PROVIDERS: str('mock'),
  PROVIDER_TIMEOUT_MS: int(2500, 50),
  MOCK_LATENCY_MS: int(0, 0, 60000),
  CACHE_MAX_ENTRIES: int(2000, 1),
  CACHE_TTL_MS: int(60000),
  CACHE_SWR_MS: int(600000),
  RATE_LIMIT_WINDOW_MS: int(60000, 1000),
  RATE_LIMIT_MAX: int(300, 1),
  RATE_LIMIT_EVENTS_MAX: int(60, 1),
  PROFILE_DEBOUNCE_MS: int(1500),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: str('claude-haiku-5-5'),
  CLAUDE_PROFILE_EVERY_N_EVENTS: int(25, 1),
  CLAUDE_PROFILE_COOLDOWN_MS: int(3600000),
  CLAUDE_TIMEOUT_MS: int(30000, 1000),
  CLAUDE_MAX_CALLS_PER_HOUR: int(200, 0),
  MOCK_PRICE_OVERRIDES: str(''),
  MOCK_CATALOG: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim().toLowerCase() || 'grocery')
    .pipe(z.enum(['grocery', 'general', 'all'])),
  KROGER_CLIENT_ID: z.string().optional(),
  KROGER_CLIENT_SECRET: z.string().optional(),
  BASKET_MAX_ITEMS: int(60, 1, 200),
  BASKET_RATE_LIMIT_MAX: int(30, 1),
  BASKET_UNCACHED_LOOKUPS_MAX: int(300, 1),
  BASKET_SPLIT_MIN_SAVINGS: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? 1 : Number(v)))
    .pipe(z.number().min(0).max(1000)),
  CATALOG_CATEGORIES: str(''),
  BESTBUY_API_KEY: z.string().optional(),
  WALMART_CONSUMER_ID: z.string().optional(),
  WALMART_PRIVATE_KEY: z.string().optional(),
  WALMART_KEY_VERSION: str('1'),
  WALMART_PUBLISHER_ID: z.string().optional(),
  DEVICE_REGISTRATION_RATE_MAX: int(5, 1),
  DEVICE_REGISTRATIONS_PER_IP_PER_DAY: int(30, 1),
  DEVICE_RETENTION_DAYS: int(180, 1, 3650),
  MAX_DEVICES: int(1_000_000, 1),
  ASK_TIMEOUT_MS: int(4000, 200, 30000),
  ASK_RATE_LIMIT_MAX: int(10, 1),
  MAX_ALERTS_PER_DEVICE: int(20, 1, 500),
  ALERT_CHECK_INTERVAL_MS: int(900_000, 0),
  PUSH_PROVIDER: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim().toLowerCase() || 'expo')
    .pipe(z.enum(['expo', 'none'])),
  PUSH_TIMEOUT_MS: int(5000, 100, 60000),
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

export interface Config {
  /** NODE_ENV === 'production'. */
  production: boolean;
  /** Non-fatal production advice, logged once at startup. */
  warnings: string[];
  port: number;
  host: string;
  corsOrigin: string;
  /** false, or the number of trusted proxy hops. */
  trustProxy: false | number;
  bodyLimitBytes: number;
  logLevel: string;
  /** Graceful shutdown deadline before a forced exit. */
  shutdownTimeoutMs: number;
  dbPath: string;
  maxEventsPerDevice: number;
  providers: string[];
  providerTimeoutMs: number;
  mockLatencyMs: number;
  cacheMaxEntries: number;
  cacheTtlMs: number;
  cacheSwrMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  rateLimitEventsMax: number;
  profileDebounceMs: number;
  anthropicApiKey: string | null;
  claudeModel: string;
  claudeEveryNEvents: number;
  claudeCooldownMs: number;
  claudeTimeoutMs: number;
  /** Global ceiling on Claude profiler calls per hour, across all devices. */
  claudeMaxCallsPerHour: number;
  /** Raw MOCK_PRICE_OVERRIDES: "productId:retailerId=price,...". Dev/test hook. */
  mockPriceOverrides: string;
  /** Which demo data the mock provider serves. */
  mockCatalog: 'grocery' | 'general' | 'all';
  krogerClientId: string | null;
  krogerClientSecret: string | null;
  basketMaxItems: number;
  /** POST /v1/basket per device (or per IP when anonymous) per rate-limit window. */
  basketRateLimitMax: number;
  /**
   * Basket item lookups that missed the catalog cache, per device (or IP) per
   * rate-limit window. Each miss is a provider call and a new cache entry, so
   * this bounds what one client can cost upstream and evict from the cache.
   */
  basketUncachedLookupsMax: number;
  /** A two-store split is only suggested when it saves at least this many dollars. */
  basketSplitMinSavings: number;
  /** Lower-cased category names the catalog is limited to; empty = everything. */
  catalogCategories: string[];
  bestbuyApiKey: string | null;
  walmartConsumerId: string | null;
  walmartPrivateKey: string | null;
  walmartKeyVersion: string;
  walmartPublisherId: string | null;
  /** POST /v1/devices per IP per rate-limit window. */
  deviceRegistrationRateMax: number;
  /** POST /v1/devices per IP per 24 hours. */
  deviceRegistrationsPerIpPerDay: number;
  /** Devices with no authenticated request for this long are erased. */
  deviceRetentionDays: number;
  /** Hard ceiling on registered devices; registration is refused above it. */
  maxDevices: number;
  /** Hard deadline for the Claude call in POST /v1/ask before the rules fallback. */
  askTimeoutMs: number;
  /** POST /v1/ask per device per rate-limit window. */
  askRateLimitMax: number;
  maxAlertsPerDevice: number;
  /** 0 disables the background alert checker. */
  alertCheckIntervalMs: number;
  pushProvider: 'expo' | 'none';
  pushTimeoutMs: number;
  expoAccessToken: string | null;
}

const opt = (v: string | undefined): string | null => (v?.trim() ? v.trim() : null);

/** Invalid configuration. The message lists every problem, one per line, for a startup log. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\nSee server/.env.example and DEPLOY.md.`);
    this.name = 'ConfigError';
  }
}

/** "https://app.example.com" or "http://localhost:8081": scheme + host (+ port), no path. */
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;

/**
 * Production-only rules (NODE_ENV=production): problems refuse to start,
 * warnings are logged. Everything else has a safe default in every environment.
 */
function productionChecks(env: NodeJS.ProcessEnv, e: z.infer<typeof EnvSchema>): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const cors = env.CORS_ORIGIN?.trim() ?? '';
  if (!cors) {
    problems.push('CORS_ORIGIN must be set explicitly in production: the web app origin(s), comma-separated (e.g. https://app.example.com), or "*" to allow any origin (bearer tokens, no cookies).');
  } else if (cors !== '*') {
    const bad = cors.split(',').map((s) => s.trim()).filter((o) => !ORIGIN.test(o));
    if (bad.length) problems.push(`CORS_ORIGIN: not an origin (scheme://host[:port], no path or trailing slash): ${bad.join(', ')}`);
  }
  if (e.DB_PATH === ':memory:') problems.push('DB_PATH=:memory: loses every device, alert and profile on restart; point it at a file on a persistent volume (e.g. /data/deallens.db).');
  if (e.TRUST_PROXY === false) warnings.push('TRUST_PROXY is not set. Behind a proxy or load balancer set TRUST_PROXY=1 (hops), or every client shares the proxy IP for per-IP limits.');
  if (cors === '*') warnings.push('CORS_ORIGIN="*": any web origin may call this API. Fine for a bearer-token API; list the web app origin to narrow it.');
  const providers = e.PRICE_PROVIDERS.split(',').map((s) => s.trim());
  if (providers.includes('mock')) warnings.push('PRICE_PROVIDERS includes "mock": synthetic demo prices are served (marked priceSource "demo").');
  if (e.MOCK_PRICE_OVERRIDES) warnings.push('MOCK_PRICE_OVERRIDES is set: a dev/test hook that pins demo prices.');
  return { problems, warnings };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const secret = /KEY|SECRET|TOKEN|PASSWORD/i;
    throw new ConfigError(
      parsed.error.issues.map((i) => {
        const name = String(i.path[0] ?? 'env');
        return `${name}: ${i.message}${secret.test(name) ? '' : ` (got ${JSON.stringify(env[name] ?? null)})`}`;
      }),
    );
  }
  const e = parsed.data;
  const production = env.NODE_ENV?.trim() === 'production';
  const { problems, warnings } = production ? productionChecks(env, e) : { problems: [], warnings: [] };
  if (problems.length) throw new ConfigError(problems);
  return {
    production,
    warnings,
    port: e.PORT,
    host: e.HOST,
    corsOrigin: e.CORS_ORIGIN,
    trustProxy: e.TRUST_PROXY,
    bodyLimitBytes: e.BODY_LIMIT_BYTES,
    logLevel: e.LOG_LEVEL,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    dbPath: e.DB_PATH,
    maxEventsPerDevice: e.MAX_EVENTS_PER_DEVICE,
    providers: e.PRICE_PROVIDERS.split(',').map((s) => s.trim()).filter(Boolean),
    providerTimeoutMs: e.PROVIDER_TIMEOUT_MS,
    mockLatencyMs: e.MOCK_LATENCY_MS,
    cacheMaxEntries: e.CACHE_MAX_ENTRIES,
    cacheTtlMs: e.CACHE_TTL_MS,
    cacheSwrMs: e.CACHE_SWR_MS,
    rateLimitWindowMs: e.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: e.RATE_LIMIT_MAX,
    rateLimitEventsMax: e.RATE_LIMIT_EVENTS_MAX,
    profileDebounceMs: e.PROFILE_DEBOUNCE_MS,
    anthropicApiKey: e.ANTHROPIC_API_KEY?.trim() ? e.ANTHROPIC_API_KEY.trim() : null,
    claudeModel: e.CLAUDE_MODEL,
    claudeEveryNEvents: e.CLAUDE_PROFILE_EVERY_N_EVENTS,
    claudeCooldownMs: e.CLAUDE_PROFILE_COOLDOWN_MS,
    claudeTimeoutMs: e.CLAUDE_TIMEOUT_MS,
    claudeMaxCallsPerHour: e.CLAUDE_MAX_CALLS_PER_HOUR,
    mockPriceOverrides: e.MOCK_PRICE_OVERRIDES,
    mockCatalog: e.MOCK_CATALOG,
    krogerClientId: opt(e.KROGER_CLIENT_ID),
    krogerClientSecret: opt(e.KROGER_CLIENT_SECRET),
    basketMaxItems: e.BASKET_MAX_ITEMS,
    basketRateLimitMax: e.BASKET_RATE_LIMIT_MAX,
    basketUncachedLookupsMax: e.BASKET_UNCACHED_LOOKUPS_MAX,
    basketSplitMinSavings: e.BASKET_SPLIT_MIN_SAVINGS,
    catalogCategories: e.CATALOG_CATEGORIES.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    bestbuyApiKey: opt(e.BESTBUY_API_KEY),
    walmartConsumerId: opt(e.WALMART_CONSUMER_ID),
    walmartPrivateKey: opt(e.WALMART_PRIVATE_KEY),
    walmartKeyVersion: e.WALMART_KEY_VERSION,
    walmartPublisherId: opt(e.WALMART_PUBLISHER_ID),
    deviceRegistrationRateMax: e.DEVICE_REGISTRATION_RATE_MAX,
    deviceRegistrationsPerIpPerDay: e.DEVICE_REGISTRATIONS_PER_IP_PER_DAY,
    deviceRetentionDays: e.DEVICE_RETENTION_DAYS,
    maxDevices: e.MAX_DEVICES,
    askTimeoutMs: e.ASK_TIMEOUT_MS,
    askRateLimitMax: e.ASK_RATE_LIMIT_MAX,
    maxAlertsPerDevice: e.MAX_ALERTS_PER_DEVICE,
    alertCheckIntervalMs: e.ALERT_CHECK_INTERVAL_MS,
    pushProvider: e.PUSH_PROVIDER,
    pushTimeoutMs: e.PUSH_TIMEOUT_MS,
    expoAccessToken: opt(e.EXPO_ACCESS_TOKEN),
  };
}
