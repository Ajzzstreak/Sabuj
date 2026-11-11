import { z } from 'zod';

/**
 * TRUST_PROXY: number of reverse-proxy hops in front of the server. "true" means
 * one hop. It is deliberately never Fastify's `trustProxy: true`, which takes
 * the LEFTMOST X-Forwarded-For entry — a value the client controls, so anyone
 * could dodge the per-IP rate limit by sending a fake header.
 */
const proxyHops = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? '').trim().toLowerCase();
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
  LOG_LEVEL: str('info'),
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
  port: number;
  host: string;
  corsOrigin: string;
  /** false, or the number of trusted proxy hops. */
  trustProxy: false | number;
  bodyLimitBytes: number;
  logLevel: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = EnvSchema.parse(env);
  return {
    port: e.PORT,
    host: e.HOST,
    corsOrigin: e.CORS_ORIGIN,
    trustProxy: e.TRUST_PROXY,
    bodyLimitBytes: e.BODY_LIMIT_BYTES,
    logLevel: e.LOG_LEVEL,
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
