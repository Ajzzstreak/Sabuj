import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { Catalog, UpstreamError } from './catalog.js';
import type { Config } from './config.js';
import {
  API_VERSION,
  type ApiError,
  type DeleteProfileResponse,
  type EventsResponse,
  type HomeResponse,
  type ProductResponse,
  type ProfileResponse,
  type SearchResponse,
  type SuggestResponse,
} from './contract.js';
import type { Store } from './db.js';
import { buildHomeSections } from './home.js';
import type { ClaudeProfiler } from './profile/claude.js';
import { ProfileLearner } from './profile/learner.js';
import { TRENDING_QUERIES } from './providers/mock/catalog.js';
import type { PriceProvider } from './providers/types.js';
import { RateLimiter } from './rateLimit.js';
import { NEUTRAL_RANKING_PROFILE, orderHits, personalizeProduct, personalizeProductDetail } from './ranking.js';
import { RETAILERS } from './retailers.js';
import {
  EventsRequestSchema,
  HttpError,
  OptionalDeviceQuerySchema,
  parse,
  ProductParamsSchema,
  RequiredDeviceQuerySchema,
  SearchQuerySchema,
  SuggestQuerySchema,
} from './validation.js';

export interface AppDeps {
  config: Config;
  store: Store;
  providers: PriceProvider[];
  claude?: ClaudeProfiler | null;
  logger?: boolean | { level: string };
}

export interface App {
  fastify: FastifyInstance;
  learner: ProfileLearner;
  catalog: Catalog;
}

const SUGGEST_LIMIT = 8;
const round1 = (n: number) => Math.round(n * 10) / 10;

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const { config, store } = deps;
  // Request logs must not carry user data: the query string holds the search
  // text and the deviceId, so only the path is logged.
  const logger =
    typeof deps.logger === 'object'
      ? {
          ...deps.logger,
          serializers: {
            req: (req: FastifyRequest) => ({ method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip }),
          },
        }
      : (deps.logger ?? false);
  const fastify = Fastify({
    logger,
    bodyLimit: config.bodyLimitBytes,
    // Trust only the hops our own proxies appended (see config.ts): never the
    // client-controlled leftmost X-Forwarded-For entry.
    trustProxy: config.trustProxy === false ? false : (_addr: string, hop: number) => hop < (config.trustProxy as number),
    // The catalog and profiles are per-request cheap; keep URLs bounded too.
    routerOptions: { maxParamLength: 200 },
  });

  const log = (msg: string, detail?: Record<string, unknown>) => fastify.log.warn(detail ?? {}, msg);
  const catalog = new Catalog(deps.providers, {
    providerTimeoutMs: config.providerTimeoutMs,
    cacheMaxEntries: config.cacheMaxEntries,
    cacheTtlMs: config.cacheTtlMs,
    cacheSwrMs: config.cacheSwrMs,
    onProviderError: (provider, op, err) =>
      log('price provider failed', { provider, op, error: err instanceof Error ? err.message : String(err) }),
  });
  const learner = new ProfileLearner(store, catalog, deps.claude ?? null, {
    debounceMs: config.profileDebounceMs,
    claudeEveryNEvents: config.claudeEveryNEvents,
    claudeCooldownMs: config.claudeCooldownMs,
    claudeMaxCallsPerHour: config.claudeMaxCallsPerHour,
    log,
  });
  const limiter = new RateLimiter(config.rateLimitWindowMs);

  const corsOrigin = config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim());
  await fastify.register(cors, { origin: corsOrigin, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] });

  const limit = (key: string, max: number) => {
    const decision = limiter.hit(key, max);
    if (!decision.ok) {
      throw new HttpError(429, 'rate_limited', 'Too many requests, slow down.', {
        'retry-after': String(decision.retryAfterSec),
      });
    }
  };
  const limitDevice = (deviceId: string | undefined) => {
    if (deviceId) limit(`device:${deviceId}`, config.rateLimitMax);
  };

  fastify.addHook('onRequest', async (req: FastifyRequest) => {
    if (req.method !== 'OPTIONS') limit(`ip:${req.ip}`, config.rateLimitMax);
  });

  fastify.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).headers(err.headers).send(apiError(err.code, err.message));
    }
    if (err instanceof UpstreamError) {
      return reply.code(502).send(apiError('upstream_unavailable', 'Price sources are unavailable right now. Try again shortly.'));
    }
    const e = err as { statusCode?: number; code?: string };
    if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send(apiError('payload_too_large', `Request body exceeds ${config.bodyLimitBytes} bytes.`));
    }
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      const code = e.statusCode === 415 ? 'unsupported_media_type' : 'invalid_request';
      return reply.code(e.statusCode).send(apiError(code, 'The request could not be processed.'));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(apiError('internal_error', 'Something went wrong.'));
  });
  fastify.setNotFoundHandler((_req, reply) => reply.code(404).send(apiError('not_found', 'Route not found.')));

  /** Profile used for ranking, or null when there is nothing learned yet. */
  const learnedProfile = (deviceId: string | undefined) => {
    if (!deviceId) return null;
    const profile = learner.getProfile(deviceId);
    return profile.source === 'none' ? null : profile;
  };

  const prefix = `/${API_VERSION}`;

  fastify.get(`${prefix}/health`, async () => ({ ok: true }));

  fastify.get(`${prefix}/search`, async (req): Promise<SearchResponse> => {
    const started = performance.now();
    const { q, deviceId, limit: max } = parse(SearchQuerySchema, req.query);
    limitDevice(deviceId);
    const { value: hits, cached } = await catalog.search(q);
    const profile = learnedProfile(deviceId);

    const ordered = orderHits(hits, profile).slice(0, max);
    const products = ordered.map((h) => personalizeProduct(h.product, profile ?? NEUTRAL_RANKING_PROFILE));

    let personalized = false;
    if (profile) {
      // "Personalized" means the learned profile actually changed something the
      // shopper can see: the product order or any product's offer order.
      const baseline = hits.slice(0, max);
      personalized = ordered.some((h, i) => h.product.id !== baseline[i]?.product.id);
      for (let i = 0; !personalized && i < ordered.length; i++) {
        const neutral = personalizeProduct(ordered[i]!.product);
        personalized = neutral.offers.some((o, j) => o.id !== products[i]!.offers[j]?.id);
      }
    }
    return { query: q, products, retailers: RETAILERS, tookMs: round1(performance.now() - started), cached, personalized };
  });

  fastify.get(`${prefix}/suggest`, async (req): Promise<SuggestResponse> => {
    const { q, deviceId } = parse(SuggestQuerySchema, req.query);
    limitDevice(deviceId);
    const needle = q.toLowerCase().replace(/\s+/g, ' ').trimStart();
    const profile = learnedProfile(deviceId);
    // The shopper's own likely queries come first, then catalog completions.
    const personal = (profile?.suggestedQueries ?? []).filter((s) => (needle ? s.startsWith(needle) : true));
    const general = await catalog.suggest(needle, SUGGEST_LIMIT);
    const suggestions = [...new Set([...personal.slice(0, 3), ...general])].slice(0, SUGGEST_LIMIT);
    return { query: q, suggestions };
  });

  fastify.get(`${prefix}/home`, async (req): Promise<HomeResponse> => {
    const { deviceId } = parse(OptionalDeviceQuerySchema, req.query);
    limitDevice(deviceId);
    const { value: products } = await catalog.browse(TRENDING_QUERIES);
    const profile = learnedProfile(deviceId);
    const recent = deviceId ? store.recentEvents(deviceId, 100) : [];
    return {
      sections: buildHomeSections(products, profile, recent),
      trendingQueries: TRENDING_QUERIES,
      retailers: RETAILERS,
    };
  });

  fastify.get(`${prefix}/products/:id`, async (req): Promise<ProductResponse> => {
    const { id } = parse(ProductParamsSchema, req.params);
    const { deviceId } = parse(OptionalDeviceQuerySchema, req.query);
    limitDevice(deviceId);
    const { value: detail } = await catalog.product(id);
    if (!detail) throw new HttpError(404, 'product_not_found', `No product with id "${id}".`);
    const profile = learnedProfile(deviceId);
    return { product: personalizeProductDetail(detail, profile ?? NEUTRAL_RANKING_PROFILE), retailers: RETAILERS };
  });

  fastify.post(`${prefix}/events`, async (req): Promise<EventsResponse> => {
    const { deviceId, events } = parse(EventsRequestSchema, req.body);
    limit(`events:${deviceId}`, config.rateLimitEventsMax);
    const accepted = store.insertEvents(deviceId, events);
    learner.notify(deviceId); // async + debounced; the response does not wait for it
    return { accepted };
  });

  fastify.get(`${prefix}/profile`, async (req): Promise<ProfileResponse> => {
    const { deviceId } = parse(RequiredDeviceQuerySchema, req.query);
    limitDevice(deviceId);
    return { profile: learner.getProfile(deviceId) };
  });

  fastify.delete(`${prefix}/profile`, async (req): Promise<DeleteProfileResponse> => {
    const { deviceId } = parse(RequiredDeviceQuerySchema, req.query);
    limitDevice(deviceId);
    learner.forget(deviceId);
    return { deleted: true };
  });

  fastify.addHook('onClose', async () => {
    await learner.flush();
  });

  return { fastify, learner, catalog };
}
