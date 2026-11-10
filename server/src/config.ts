import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

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
  TRUST_PROXY: bool,
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
});

export interface Config {
  port: number;
  host: string;
  corsOrigin: string;
  trustProxy: boolean;
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
}

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
  };
}
