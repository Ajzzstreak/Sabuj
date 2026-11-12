import { createHash, randomBytes, randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { type AlertCheckResult, bestPriceFor, checkAlerts, toPriceAlert } from './alerts.js';
import { computeBasket } from './basket.js';
import type { ClaudeAsk } from './ask/claude.js';
import { AskService } from './ask/index.js';
import { Catalog, UpstreamError } from './catalog.js';
import type { Config } from './config.js';
import {
  API_VERSION,
  type AlertResponse,
  type AlertsResponse,
  type ApiError,
  type AskResponse,
  type BasketResolvedItem,
  type BasketResponse,
  type DeleteProfileResponse,
  type EventsResponse,
  type HomeResponse,
  type ProductResponse,
  type ProfileResponse,
  type RegisterDeviceResponse,
  type SearchResponse,
  type StoresResponse,
  type SuggestResponse,
} from './contract.js';
import type { Store } from './db.js';
import { normalizeGtin } from './gtin.js';
import { buildHomeSections } from './home.js';
import { ClaudeBudget } from './profile/budget.js';
import type { ClaudeProfiler } from './profile/claude.js';
import { ProfileLearner } from './profile/learner.js';
import { LIVE_PROVIDERS } from './providers/index.js';
import type { PriceProvider } from './providers/types.js';
import { ExpoPushSender, NoopPushSender, type PushSender } from './push.js';
import { RateLimiter } from './rateLimit.js';
import { NEUTRAL_RANKING_PROFILE, orderHits, personalizeProduct, personalizeProductDetail } from './ranking.js';
import { RETAILERS } from './retailers.js';
import {
  AlertParamsSchema,
  AskRequestSchema,
  basketRequestSchema,
  ContextQuerySchema,
  CreateAlertRequestSchema,
  EventsRequestSchema,
  HttpError,
  LookupQuerySchema,
  parse,
  ProductParamsSchema,
  PushTokenRequestSchema,
  SearchQuerySchema,
  StoresQuerySchema,
  SuggestQuerySchema,
} from './validation.js';

export interface AppDeps {
  config: Config;
  store: Store;
  providers: PriceProvider[];
  claude?: ClaudeProfiler | null;
  /** Claude interpreter for POST /v1/ask; null/undefined = rules parser only. */
  claudeAsk?: ClaudeAsk | null;
  /** Defaults to Expo (or a no-op when PUSH_PROVIDER=none). */
  push?: PushSender;
  logger?: boolean | { level: string };
}

export interface App {
  fastify: FastifyInstance;
  learner: ProfileLearner;
  catalog: Catalog;
  /** Run the price-alert checker once, now. */
  checkAlerts(): Promise<AlertCheckResult>;
  /** Run the retention purge once, now. Returns the number of devices erased. */
  purgeInactiveDevices(): number;
}

const DAY_MS = 86_400_000;
/** last_seen_at is refreshed at most this often, to keep reads write-free. */
const TOUCH_INTERVAL_MS = 3_600_000;
const PURGE_INTERVAL_MS = 6 * 3_600_000;
const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

/** Only this hash is ever stored; the token itself is shown to the client once. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const SUGGEST_LIMIT = 8;
const round1 = (n: number) => Math.round(n * 10) / 10;

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const { config, store } = deps;
  // Request logs must not carry user data: the query string holds the search
  // text, ZIP and barcode, so only the path is logged (and never headers:
  // the Authorization header carries the device token).
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
    categories: config.catalogCategories,
    linkOnlyFallback: deps.providers.some((p) => LIVE_PROVIDERS.includes(p.name)),
  });
  // One hourly Claude budget for everything that can spend: profiler + ask.
  const claudeBudget = new ClaudeBudget(config.claudeMaxCallsPerHour);
  const learner = new ProfileLearner(store, catalog, deps.claude ?? null, {
    debounceMs: config.profileDebounceMs,
    claudeEveryNEvents: config.claudeEveryNEvents,
    claudeCooldownMs: config.claudeCooldownMs,
    claudeBudget,
    log,
  });
  const limiter = new RateLimiter(config.rateLimitWindowMs);
  const dailyLimiter = new RateLimiter(DAY_MS);
  const askService = new AskService({ catalog, claude: deps.claudeAsk ?? null, budget: claudeBudget, timeoutMs: config.askTimeoutMs });
  const push: PushSender =
    deps.push ??
    (config.pushProvider === 'expo'
      ? new ExpoPushSender({ timeoutMs: config.pushTimeoutMs, accessToken: config.expoAccessToken, log })
      : new NoopPushSender());

  const corsOrigin = config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim());
  await fastify.register(cors, { origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] });

  // JSON bodies: like Fastify's default parser, but an empty body is allowed
  // (POST /v1/devices has none) and parse errors use the ApiError shape.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, raw, done) => {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    if (text.trim() === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(new HttpError(400, 'invalid_request', 'Request body is not valid JSON.'), undefined);
    }
  });

  const limitWith = (rl: RateLimiter, key: string, max: number) => {
    const decision = rl.hit(key, max);
    if (!decision.ok) {
      throw new HttpError(429, 'rate_limited', 'Too many requests, slow down.', {
        'retry-after': String(decision.retryAfterSec),
      });
    }
  };
  const limit = (key: string, max: number) => limitWith(limiter, key, max);
  const limitDevice = (deviceId: string | undefined) => {
    if (deviceId) limit(`device:${deviceId}`, config.rateLimitMax);
  };

  const unauthorized = (message: string) => new HttpError(401, 'unauthorized', message, { 'www-authenticate': 'Bearer' });

  /**
   * Resolve the device from `Authorization: Bearer <token>`.
   * No header: undefined (anonymous). A header that is malformed or carries an
   * unknown/erased token is ALWAYS 401, on every route.
   */
  const deviceFrom = (req: FastifyRequest): string | undefined => {
    const header = req.headers.authorization;
    if (header === undefined) return undefined;
    const token = BEARER.exec(header)?.[1];
    const device = token ? store.deviceByTokenHash(hashToken(token)) : null;
    if (!device) throw unauthorized('Invalid or expired device token.');
    const now = Date.now();
    if (now - device.lastSeenAt > TOUCH_INTERVAL_MS) store.touchDevice(device.deviceId, now);
    limitDevice(device.deviceId);
    return device.deviceId;
  };
  const requireDevice = (req: FastifyRequest): string => {
    const deviceId = deviceFrom(req);
    if (!deviceId) throw unauthorized('This endpoint needs a device token: send "Authorization: Bearer <token>" (see POST /v1/devices).');
    return deviceId;
  };

  const purgeInactiveDevices = (): number => {
    try {
      const removed = store.purgeInactiveDevices(Date.now() - config.deviceRetentionDays * DAY_MS);
      if (removed > 0) fastify.log.info({ removed }, 'purged inactive devices');
      return removed;
    } catch (err) {
      log('device purge failed', { error: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  };

  let alertCheckRunning: Promise<AlertCheckResult> | null = null;
  const runAlertCheck = (): Promise<AlertCheckResult> => {
    // Never overlap two runs: a slow upstream must not stack checks.
    alertCheckRunning ??= checkAlerts({ store, catalog, push, log }).finally(() => {
      alertCheckRunning = null;
    });
    return alertCheckRunning;
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

  /** Trending queries of the active catalog, limited to ones that still find something under a category scope. */
  const trendingQueries = async (): Promise<string[]> => {
    const trending = catalog.trending();
    if (config.catalogCategories.length === 0) return trending;
    const found = await Promise.all(trending.map((q) => catalog.search(q).then((r) => r.value.length > 0, () => false)));
    return trending.filter((_, i) => found[i]);
  };
  const BasketRequestSchema = basketRequestSchema(config.basketMaxItems);

  const prefix = `/${API_VERSION}`;

  fastify.get(`${prefix}/health`, async () => ({ ok: true }));

  fastify.post(`${prefix}/devices`, async (req): Promise<RegisterDeviceResponse> => {
    // Registration is the one unauthenticated write, so it is the abuse surface:
    // a short-window rate limit, a daily cap per IP, and a global device ceiling.
    limit(`register:${req.ip}`, config.deviceRegistrationRateMax);
    limitWith(dailyLimiter, `register:${req.ip}`, config.deviceRegistrationsPerIpPerDay);
    if (store.countDevices() >= config.maxDevices) {
      purgeInactiveDevices();
      if (store.countDevices() >= config.maxDevices) {
        throw new HttpError(503, 'capacity_exceeded', 'Device registration is temporarily unavailable.', { 'retry-after': '3600' });
      }
    }
    const deviceId = randomUUID();
    const token = `dl_${randomBytes(32).toString('base64url')}`; // 256 bits of entropy
    store.createDevice(deviceId, hashToken(token));
    return { deviceId, token };
  });

  fastify.get(`${prefix}/search`, async (req): Promise<SearchResponse> => {
    const started = performance.now();
    const deviceId = deviceFrom(req);
    const { q, limit: max, zip, memberships, storeIds } = parse(SearchQuerySchema, req.query);
    const ctx = await catalog.contextFor(zip, memberships, storeIds);
    const { value: hits, cached } = await catalog.search(q, ctx.stores);
    const profile = learnedProfile(deviceId);

    const ordered = orderHits(hits, profile).slice(0, max);
    const products = ordered.map((h) => personalizeProduct(h.product, profile ?? NEUTRAL_RANKING_PROFILE, ctx));

    let personalized = false;
    if (profile) {
      // "Personalized" means the learned profile actually changed something the
      // shopper can see: the product order or any product's offer order.
      const baseline = hits.slice(0, max);
      personalized = ordered.some((h, i) => h.product.id !== baseline[i]?.product.id);
      for (let i = 0; !personalized && i < ordered.length; i++) {
        const neutral = personalizeProduct(ordered[i]!.product, NEUTRAL_RANKING_PROFILE, ctx);
        personalized = neutral.offers.some((o, j) => o.id !== products[i]!.offers[j]?.id);
      }
    }
    return { query: q, products, retailers: RETAILERS, tookMs: round1(performance.now() - started), cached, personalized };
  });

  fastify.get(`${prefix}/suggest`, async (req): Promise<SuggestResponse> => {
    const deviceId = deviceFrom(req);
    const { q } = parse(SuggestQuerySchema, req.query);
    const needle = q.toLowerCase().replace(/\s+/g, ' ').trimStart();
    const profile = learnedProfile(deviceId);
    // The shopper's own likely queries come first, then catalog completions.
    const personal = (profile?.suggestedQueries ?? []).filter((s) => (needle ? s.startsWith(needle) : true));
    const general = await catalog.suggest(needle, SUGGEST_LIMIT);
    const suggestions = [...new Set([...personal.slice(0, 3), ...general])].slice(0, SUGGEST_LIMIT);
    return { query: q, suggestions };
  });

  fastify.get(`${prefix}/home`, async (req): Promise<HomeResponse> => {
    const deviceId = deviceFrom(req);
    const { zip, memberships, storeIds } = parse(ContextQuerySchema, req.query);
    const ctx = await catalog.contextFor(zip, memberships, storeIds);
    const { value: products } = await catalog.browse(catalog.trending());
    const profile = learnedProfile(deviceId);
    const recent = deviceId ? store.recentEvents(deviceId, 100) : [];
    return {
      sections: buildHomeSections(products, profile, recent, ctx),
      trendingQueries: await trendingQueries(),
      retailers: RETAILERS,
    };
  });

  fastify.get(`${prefix}/products/:id`, async (req): Promise<ProductResponse> => {
    const deviceId = deviceFrom(req);
    const { id } = parse(ProductParamsSchema, req.params);
    const { zip, memberships, storeIds } = parse(ContextQuerySchema, req.query);
    const ctx = await catalog.contextFor(zip, memberships, storeIds);
    const { value: detail } = await catalog.product(id, ctx.stores);
    if (!detail) throw new HttpError(404, 'product_not_found', `No product with id "${id}".`);
    const profile = learnedProfile(deviceId);
    return {
      product: personalizeProductDetail(detail, profile ?? NEUTRAL_RANKING_PROFILE, ctx),
      retailers: RETAILERS,
    };
  });

  fastify.get(`${prefix}/lookup`, async (req): Promise<ProductResponse> => {
    const deviceId = deviceFrom(req);
    const { gtin: raw, zip, memberships, storeIds } = parse(LookupQuerySchema, req.query);
    const gtin = normalizeGtin(raw);
    if (!gtin) throw new HttpError(400, 'invalid_request', 'gtin: must be a valid UPC-A / EAN-13 barcode (8-14 digits with a correct check digit).');
    const ctx = await catalog.contextFor(zip, memberships, storeIds);
    const { value: detail } = await catalog.lookup(gtin, ctx.stores);
    if (!detail) throw new HttpError(404, 'not_found', 'No product found for that barcode.');
    const profile = learnedProfile(deviceId);
    return {
      product: personalizeProductDetail(detail, profile ?? NEUTRAL_RANKING_PROFILE, ctx),
      retailers: RETAILERS,
    };
  });

  fastify.get(`${prefix}/stores`, async (req): Promise<StoresResponse> => {
    deviceFrom(req);
    const { zip } = parse(StoresQuerySchema, req.query);
    return { zip, stores: await catalog.stores(zip) };
  });

  // Shopping-list totals. No LLM: every item resolves through the cached catalog path.
  fastify.post(`${prefix}/basket`, async (req): Promise<BasketResponse> => {
    const started = performance.now();
    const deviceId = deviceFrom(req);
    limit(`basket:${deviceId ?? `ip:${req.ip}`}`, config.basketRateLimitMax);
    const body = parse(BasketRequestSchema, req.body);
    const ctx = await catalog.contextFor(body.zip, body.memberships, body.storeIds);
    const profile = learnedProfile(deviceId) ?? NEUTRAL_RANKING_PROFILE;
    const items = await Promise.all(
      body.items.map(async (item): Promise<BasketResolvedItem> => {
        const unresolved = { id: item.id, quantity: item.quantity, product: null, resolvedFromQuery: false };
        // An upstream failure on one item leaves that item unresolved instead of failing the whole list.
        if (item.productId) {
          const detail = await catalog.product(item.productId, ctx.stores).then((r) => r.value, () => null);
          if (detail) return { ...unresolved, product: personalizeProduct(detail, profile, ctx) };
        }
        if (item.query) {
          const hits = await catalog.search(item.query, ctx.stores).then((r) => r.value, () => []);
          if (hits[0]) return { ...unresolved, product: personalizeProduct(hits[0].product, profile, ctx), resolvedFromQuery: true };
        }
        return unresolved;
      }),
    );
    const totals = computeBasket(items, { minSplitSavings: config.basketSplitMinSavings });
    return { items, ...totals, retailers: RETAILERS, tookMs: round1(performance.now() - started) };
  });

  fastify.post(`${prefix}/ask`, async (req): Promise<AskResponse> => {
    const started = performance.now();
    const deviceId = requireDevice(req);
    limit(`ask:${deviceId}`, config.askRateLimitMax);
    const { text, zip, memberships } = parse(AskRequestSchema, req.body);
    const result = await askService.ask(text, await catalog.contextFor(zip, memberships), learnedProfile(deviceId));
    return { ...result, tookMs: round1(performance.now() - started) };
  });

  fastify.post(`${prefix}/events`, async (req): Promise<EventsResponse> => {
    const deviceId = requireDevice(req);
    limit(`events:${deviceId}`, config.rateLimitEventsMax);
    const { events } = parse(EventsRequestSchema, req.body);
    const accepted = store.insertEvents(deviceId, events);
    learner.notify(deviceId); // async + debounced; the response does not wait for it
    return { accepted };
  });

  fastify.get(`${prefix}/profile`, async (req): Promise<ProfileResponse> => {
    return { profile: learner.getProfile(requireDevice(req)) };
  });

  // Erases events, profile, alerts, push token AND the device row: the token stops working.
  fastify.delete(`${prefix}/profile`, async (req): Promise<DeleteProfileResponse> => {
    learner.forget(requireDevice(req));
    return { deleted: true };
  });

  fastify.post(`${prefix}/alerts`, async (req): Promise<AlertResponse> => {
    const deviceId = requireDevice(req);
    const body = parse(CreateAlertRequestSchema, req.body);
    const existing = store.alertsForDevice(deviceId);
    // One alert per product: a second one for the same product replaces the first.
    if (existing.filter((a) => a.productId !== body.productId).length >= config.maxAlertsPerDevice) {
      throw new HttpError(409, 'alert_limit_reached', `You can have at most ${config.maxAlertsPerDevice} price alerts. Delete one first.`);
    }
    const context = { zip: body.zip ?? null, memberships: body.memberships ?? null };
    const ctx = await catalog.contextFor(context.zip, context.memberships);
    const { value: product } = await catalog.product(body.productId, ctx.stores);
    if (!product) throw new HttpError(404, 'product_not_found', `No product with id "${body.productId}".`);
    const best = bestPriceFor(product, ctx);
    if (!best) throw new HttpError(409, 'price_unavailable', 'No in-stock price is available for this product right now, so it cannot be watched.');
    const row = {
      id: randomUUID(),
      deviceId,
      productId: product.id,
      productTitle: product.title,
      targetPrice: Math.round(body.targetPrice * 100) / 100,
      priceAtCreation: best.price,
      ...context,
      createdAt: Date.now(),
    };
    store.createAlert(row);
    return { alert: toPriceAlert({ ...row, status: 'active', triggeredAt: null }, best) };
  });

  fastify.get(`${prefix}/alerts`, async (req): Promise<AlertsResponse> => {
    const rows = store.alertsForDevice(requireDevice(req));
    // Fresh prices from the (cached) catalog; an upstream failure leaves currentBestPrice null.
    const alerts = await Promise.all(
      rows.map(async (row) => {
        const ctx = await catalog.contextFor(row.zip, row.memberships);
        const product = await catalog.product(row.productId, ctx.stores).then((r) => r.value, () => null);
        return toPriceAlert(row, product ? bestPriceFor(product, ctx) : null);
      }),
    );
    return { alerts };
  });

  fastify.delete(`${prefix}/alerts/:id`, async (req): Promise<{ deleted: true }> => {
    const deviceId = requireDevice(req);
    const { id } = parse(AlertParamsSchema, req.params);
    if (!store.deleteAlert(deviceId, id)) throw new HttpError(404, 'not_found', 'No such alert.');
    return { deleted: true };
  });

  fastify.put(`${prefix}/push-token`, async (req): Promise<{ ok: true }> => {
    const deviceId = requireDevice(req);
    const { token } = parse(PushTokenRequestSchema, req.body);
    // A push token belongs to one install: drop it from any other device first.
    if (token) store.clearPushTokenValue(token);
    store.setPushToken(deviceId, token);
    return { ok: true };
  });

  // ---- background work (never on a request path) ---------------------------
  const timers: NodeJS.Timeout[] = [];
  purgeInactiveDevices();
  timers.push(setInterval(purgeInactiveDevices, PURGE_INTERVAL_MS));
  if (config.alertCheckIntervalMs > 0) {
    timers.push(setInterval(() => void runAlertCheck(), config.alertCheckIntervalMs));
  }
  for (const t of timers) t.unref();

  fastify.addHook('onClose', async () => {
    for (const t of timers) clearInterval(t);
    await alertCheckRunning?.catch(() => undefined);
    await learner.flush();
  });

  return { fastify, learner, catalog, checkAlerts: runAlertCheck, purgeInactiveDevices };
}
