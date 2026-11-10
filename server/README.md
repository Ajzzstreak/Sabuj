# DealLens server

Price-comparison API: search a product, get every retailer's offer side by side, ranked for the shopper.
Fastify + TypeScript (strict) + SQLite. The response types live in `src/contract.ts` (generated from `shared/types.ts` — do not edit here).

## Run

```bash
npm install
cp .env.example .env   # optional; every setting has a default
npm run dev            # tsx watch, http://localhost:8787
npm test               # vitest
npm run typecheck
npm run build && npm start
```

Node 22+. Port from `PORT` (default 8787). The SQLite file is created at `DB_PATH` (default `./data/deallens.db`, gitignored).

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/health` | `{ ok: true }` |
| GET | `/v1/search?q=&deviceId=&limit=` | `limit` 1-50, default 20. Reports `tookMs`, `cached`, `personalized`. |
| GET | `/v1/suggest?q=&deviceId=` | Autocomplete; empty `q` returns personal + trending queries. |
| GET | `/v1/home?deviceId=` | `for_you` / `recent` (when a profile exists), `top_deals`, category sections. |
| GET | `/v1/products/:id?deviceId=` | Detail with 90-day price history per retailer. |
| POST | `/v1/events` | `{ deviceId, events[] }`, max 100 events and 64 KB per request. |
| GET | `/v1/profile?deviceId=` | Unknown device: empty profile, `source: "none"`. |
| DELETE | `/v1/profile?deviceId=` | Erases every event and the profile for that device. |

`deviceId` is 8-128 characters of `A-Z a-z 0-9 . _ : -`. Errors are always `{ "error": { "code", "message" } }`
(`invalid_request` 400, `product_not_found`/`not_found` 404, `payload_too_large` 413, `rate_limited` 429, `upstream_unavailable` 502, `internal_error` 500).

## How it stays fast

- **Provider layer** (`src/providers`): every price source implements `PriceProvider` (`search`, `getProduct`, optional `browse`/`suggest`). `Catalog` (`src/catalog.ts`) fans out to all configured providers in parallel with a per-provider timeout and merges results (same GTIN = same product, best offer per retailer).
- **Cache** (`src/cache.ts`): in-memory LRU with TTL + stale-while-revalidate. It stores the *unpersonalized* provider result, so one cache entry serves every user.
- **Personalization** (`src/ranking.ts`): applied after the cache by `rankOffers(offers, profile)` — a pure function over a few numeric weights. No LLM, network or disk I/O beyond one indexed SQLite read (memoized) happens on a request.
- **Learning** (`src/profile`): runs after event ingestion on a debounce timer, never inside a request.
  - `heuristic.ts` — always on, pure function over the event log.
  - `claude.ts` — only when `ANTHROPIC_API_KEY` is set: every `CLAUDE_PROFILE_EVERY_N_EVENTS` new events and at most once per `CLAUDE_PROFILE_COOLDOWN_MS` per device, sends a bounded digest (aggregates + up to 30 recent events, no device id) and the heuristic profile, and reads the refined profile back through a strict tool call. Every field is validated and clamped; on any failure the heuristic profile stays.

## Adding a real price source

1. Implement `PriceProvider` from `src/providers/types.ts`.
2. Register a factory in `src/providers/index.ts` (read credentials from env there).
3. Set `PRICE_PROVIDERS=yourprovider` (comma-separate to combine with others).

Outbound retailer links are built in one place, `buildOutboundUrl` in `src/retailers.ts`. It returns plain search URLs today; that function is where affiliate tags would be added.

## Mock data

`MockProvider` ships ~80 products in 11 categories with 3-6 offers each across Amazon, Walmart, Sam's Club, Target, Costco and Best Buy. Everything is generated from a hash of the product id, so prices are identical on every run; none of it is real pricing, and the GTINs are synthetic. `MOCK_LATENCY_MS` adds a delay to each provider call to simulate a real upstream.

## Layout

```
src/
  index.ts            entrypoint (env, listen, graceful shutdown)
  app.ts              routes, CORS, rate limiting, error shape
  config.ts           env parsing
  contract.ts         API types (generated copy)
  catalog.ts          provider fan-out + timeout + merge + cache
  cache.ts            LRU / TTL / stale-while-revalidate
  ranking.ts          rankOffers, personalizeProduct, orderHits
  home.ts             home feed sections
  db.ts               SQLite store (events, profiles)
  rateLimit.ts        fixed-window limiter (per IP and per device)
  validation.ts       zod schemas
  retailers.ts        retailer table, buildOutboundUrl
  profile/            heuristic.ts, claude.ts, learner.ts
  providers/          types.ts, index.ts (registry), mock/
test/                 vitest suites
```

## Limits to know about

- Cache, rate limiter and learning timers are in-process: run one instance, or move them to shared infrastructure before scaling out.
- `deviceId` is an unauthenticated client-chosen id. Anyone who knows one can read or erase that profile.
- The Claude profiler has only been exercised against a mocked client.
