import identity from '../app.identity.json';

/**
 * Product identity. The name is a placeholder: change it in app.identity.json
 * (the single source shared with app.config.js), never inline in a screen.
 */
export const APP_NAME: string = identity.name;
export const APP_SLUG: string = identity.slug;
export const APP_SCHEME: string = identity.scheme;
export const BUNDLE_ID: string = identity.bundleId;

/** Base URL of the API. Override with EXPO_PUBLIC_API_URL at build/start time. */
export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787').replace(
  /\/+$/,
  '',
);

/** Storage keys are namespaced by slug so a rename starts from a clean slate. */
export const STORAGE_PREFIX = `${identity.slug}:`;

export const TRACKING = {
  /** Flush the queue this often while it has events. */
  flushIntervalMs: 4000,
  /** Flush immediately once this many events are waiting. */
  flushAtCount: 20,
  /** Events per POST. */
  maxBatch: 50,
  /** A batch is dropped after this many failed attempts. */
  maxAttempts: 6,
  /** Hard cap on queued events; the oldest are dropped first. */
  maxQueue: 500,
} as const;

export const QUERY = {
  searchStaleMs: 60_000,
  suggestStaleMs: 5 * 60_000,
  homeStaleMs: 2 * 60_000,
  productStaleMs: 60_000,
  profileStaleMs: 15_000,
  alertsStaleMs: 30_000,
  askStaleMs: 5 * 60_000,
  /** /v1/ask may wait on an LLM. */
  askTimeoutMs: 30_000,
  /** How long cached data is kept (in memory and on disk). */
  gcMs: 24 * 60 * 60_000,
  requestTimeoutMs: 10_000,
} as const;

/**
 * Routes under /dev (the component gallery) exist in development builds only.
 * Set EXPO_PUBLIC_DEV_ROUTES=1 to include them in an exported build for review.
 */
export const DEV_ROUTES: boolean = __DEV__ || process.env.EXPO_PUBLIC_DEV_ROUTES === '1';

/**
 * TEMPLATE. Set to true only once outbound links actually carry affiliate
 * tags; it turns on the disclosure line next to offers. Leave false otherwise:
 * a disclosure that is not true is as wrong as a missing one.
 */
export const AFFILIATE_LINKS_ENABLED = false;
