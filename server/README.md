# DealLens server

Price-comparison API: search a product, get every retailer's offer side by side, ranked for the shopper.
Fastify + TypeScript (strict) + SQLite. The request/response types live in `src/contract.ts` (generated from `shared/types.ts` — do not edit here).

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

## Auth: device tokens

`POST /v1/devices` returns `{ deviceId, token }`. The token is 256 random bits (`dl_` + base64url); the server stores only its SHA-256 hash, so it is shown exactly once.
Every device-scoped request sends `Authorization: Bearer <token>` and the server derives the device from it. `deviceId` is not accepted as a credential anywhere (a `deviceId` in a query or body is ignored).

- Catalog routes (`search`, `suggest`, `home`, `products`, `lookup`) work with no token (unpersonalized) and personalize when a valid token is sent.
- `profile`, `events`, `alerts`, `ask`, `push-token` need a token: `401 unauthorized` without one.
- A malformed, unknown or erased token is `401` on **every** route, including catalog routes.
- `DELETE /v1/profile` erases events, profile, alerts, push token **and the device row**, so the token stops working.

Abuse and growth bounds: registration is limited per IP per window (`DEVICE_REGISTRATION_RATE_MAX`) and per IP per day (`DEVICE_REGISTRATIONS_PER_IP_PER_DAY`), there is a global ceiling (`MAX_DEVICES`, 503 above it), events are capped per device (`MAX_EVENTS_PER_DEVICE`), and a purge at startup and every 6 hours erases devices with no authenticated request for `DEVICE_RETENTION_DAYS` (plus any rows that belong to no registered device, e.g. data from before tokens existed).

## Endpoints

| Method | Path | Token | Notes |
|---|---|---|---|
| GET | `/v1/health` | – | `{ ok: true }` |
| POST | `/v1/devices` | – | `{ deviceId, token }`. No body needed. |
| GET | `/v1/search?q=&limit=&zip=&memberships=` | optional | `limit` 1-50, default 20. Reports `tookMs`, `cached`, `personalized`. |
| GET | `/v1/suggest?q=` | optional | Autocomplete; empty `q` returns personal + trending queries. |
| GET | `/v1/home?zip=&memberships=` | optional | `for_you` / `recent` (when a profile exists), `top_deals`, category sections. |
| GET | `/v1/products/:id?zip=&memberships=` | optional | Detail with 90-day price history per retailer (mock only). |
| GET | `/v1/lookup?gtin=&zip=&memberships=` | optional | Barcode lookup → `ProductResponse`, `404 not_found`, or `400` for a malformed code. |
| POST | `/v1/ask` | required | `{ text, zip?, memberships? }` plain-English search (see below). |
| POST | `/v1/events` | required | `{ events[] }`, max 100 events and 64 KB per request. |
| GET | `/v1/profile` | required | New device: empty profile, `source: "none"`. |
| DELETE | `/v1/profile` | required | Erases everything for the device, including the device/token. |
| POST | `/v1/alerts` | required | `{ productId, targetPrice, zip?, memberships? }` → `{ alert }`. |
| GET | `/v1/alerts` | required | `{ alerts[] }` with a fresh `currentBestPrice`. |
| DELETE | `/v1/alerts/:id` | required | `{ deleted: true }` or `404`. |
| PUT | `/v1/push-token` | required | `{ token: "ExponentPushToken[...]" \| null }` → `{ ok: true }`. |

Errors are always `{ "error": { "code", "message" } }`:
`invalid_request` 400, `unauthorized` 401, `product_not_found`/`not_found` 404, `alert_limit_reached`/`price_unavailable` 409, `payload_too_large` 413, `rate_limited` 429, `upstream_unavailable` 502, `capacity_exceeded` 503, `internal_error` 500.

## Landed cost: zip and memberships

Every offer carries `estimatedTax`, `landedPrice`, `eligible` and `priceSource`.

- `zip=12345` (ZIP+4 accepted) → `estimatedTax`. **This is an estimate**: the ZIP's 3-digit prefix is mapped to a state and one approximate *combined average* state + local rate per state is applied to the item price (not shipping). See `src/tax.ts`. The five states with no statewide sales tax (AK, DE, MT, NH, OR) are 0. No zip, or a ZIP that maps to no state (territories, military) → `estimatedTax: null`. The rate table was written from memory of published averages and should be reviewed before anyone relies on it.
- `landedPrice = totalPrice + (estimatedTax ?? 0)`.
- `memberships=costco,samsclub` states which memberships the shopper holds; `memberships=` (empty) means none; omit it when unknown. `eligible` is `false` for an offer that needs a membership the shopper said they lack, and always `true` when the parameter is absent. Stated memberships override whatever the profile inferred.
- `cheapestOfferId`, `maxSavings` and ranking use `landedPrice` over in-stock, eligible, priced offers.

Offer order (an offer never outranks one in an earlier group): eligible in-stock offers within the shopper's premium bound → eligible in-stock offers beyond it → ineligible → out of stock → `link_only`. `recommendedOfferId` is `offers[0].id` when that offer is in stock, eligible and priced, otherwise `null`.

`priceSource`: `demo` (mock data), `live` (a retailer API), `link_only` (no price: every price field is 0/null, the offer is only a "check price" link; never cheapest, never recommended, excluded from `maxSavings`, always last).

## How it stays fast

- **Provider layer** (`src/providers`): every price source implements `PriceProvider` (`search`, `getProduct`, `lookupGtin`, optional `browse`/`suggest`). `Catalog` (`src/catalog.ts`) fans out to all configured providers in parallel with a per-provider timeout and merges results. Two providers' products are the same product **only** when their normalized GTINs are equal (`src/gtin.ts`) — never by title similarity.
- **Cache** (`src/cache.ts`): in-memory LRU with TTL + stale-while-revalidate. It stores the *unpersonalized* provider result, so one cache entry serves every user.
- **Shopper context + personalization**: applied after the cache — `applyContext` (`src/shopper.ts`: tax, eligibility) then `rankOffers` (`src/ranking.ts`), pure functions over a few numbers. Auth is one SHA-256 and one indexed SQLite read.
- **No LLM on catalog request paths.** Search, suggest, home, products, lookup, alerts and profile never call a model. `POST /v1/ask` is the single explicit exception, with a hard timeout and a deterministic fallback.
- **Learning** (`src/profile`): runs after event ingestion on a debounce timer, never inside a request.
  - `heuristic.ts` — always on, pure function over the event log.
  - `claude.ts` — only when `ANTHROPIC_API_KEY` is set: every `CLAUDE_PROFILE_EVERY_N_EVENTS` new events and at most once per `CLAUDE_PROFILE_COOLDOWN_MS` per device, sends a bounded digest (aggregates + up to 30 recent events, no device id) and the heuristic profile, and reads the refined profile back through a strict tool call. Every field is validated and clamped; on any failure the heuristic profile stays.

### The premium bound

`UserProfile.maxObservedPremiumPct` is the largest premium over the cheapest price the shopper has actually paid, computed by the heuristic profiler from `offer_click` events (`premiumPaid / (price − premiumPaid)`, capped at 100%). Ranking never recommends an offer whose `landedPrice` exceeds the cheapest eligible `landedPrice × (1 + maxObservedPremiumPct)` (+ $0.01 rounding tolerance), whatever the affinities say: thirty clicks paying $1 extra on a $100 item allow about 1% extra, not $30. A shopper who never paid a premium always gets the cheapest eligible offer first. The Claude profiler has no field for this value and cannot change it. Membership is inferred only after 3 clicks on a membership retailer.

## POST /v1/ask

1. The rules parser (`src/ask/rules.ts`) always runs: regexes for price ceilings ("under $60", "$80 or less"), ratings ("at least 4 stars"), retailer names (incl. "not at walmart"), sort words ("cheapest", "top rated"), attribute words (→ `mustHave`), and filler stripping.
2. If `ANTHROPIC_API_KEY` is set, the hourly budget allows it and the text is not already cached, **one** Claude call (`CLAUDE_MODEL`, strict tool, low effort) returns the `AskInterpretation`. The shopper's text is passed JSON-encoded as data with an instruction to treat it as untrusted. The call has a hard deadline (`ASK_TIMEOUT_MS`, default 4 s, no retries); on timeout, error, refusal or invalid output the rules result is used and `source` is `"rules"`.
3. The normal search path runs with the interpretation as filters: `retailers` (offers are limited to those stores), `maxPrice` (on the `landedPrice` of the cheapest eligible offer), `minRating`, `mustHave` (relevance boost against title/highlights), `sort`.
4. `topPickReason`: the same Claude call may write a note per candidate product (the top few results of the rules query: title, highlights, price, rating). The server uses the note for whichever product ends up first only if every dollar figure in it equals a real price field of that product's offers and it contains no link, store name or savings claim; otherwise (and always in rules mode) a server-side template is used, or `null` when there are no results. The model is never the source of a price.

Limits: `ASK_RATE_LIMIT_MAX` per device per window; Claude calls count against the same global `CLAUDE_MAX_CALLS_PER_HOUR` as the profiler; interpretations are cached by normalized text (6 h, 2000 entries, in memory).

## Price alerts and push

- One alert per (device, product) — creating another replaces it; at most `MAX_ALERTS_PER_DEVICE`. The alert stores the `zip`/`memberships` it was created with and is always priced under them.
- `checkAlerts` (`src/alerts.ts`, also `app.checkAlerts()`) runs every `ALERT_CHECK_INTERVAL_MS` (default 15 min, `0` disables; disabled in tests). An active alert whose best in-stock eligible `landedPrice` is ≤ `targetPrice` becomes `triggered` with `triggeredAt` (once), and a push is sent if the device registered a push token.
- `PushSender` (`src/push.ts`): `ExpoPushSender` POSTs batches of ≤100 to `https://exp.host/--/api/v2/push/send` with a timeout; failures are swallowed and logged without tokens; tokens Expo reports as `DeviceNotRegistered` are forgotten. `PUSH_PROVIDER=none` uses the no-op sender. A device with no push token gets no push; the app sees the trigger on `GET /v1/alerts`.
- Mock prices never change, so to exercise a trigger pin a price: `MOCK_PRICE_OVERRIDES="productId:retailerId=price"` at startup, or `MockProvider.setPriceOverride()` + `catalog.clearCache()` in tests.

## Price providers

`PRICE_PROVIDERS` selects them (comma-separated). Default: `mock`.

| Name | Source | Status |
|---|---|---|
| `mock` | ~80 synthetic products, `priceSource: "demo"` | default |
| `bestbuy` | Best Buy Products API (`BESTBUY_API_KEY`) | **off, UNVERIFIED AGAINST LIVE API** |
| `walmart` | Walmart Affiliate API (`WALMART_CONSUMER_ID`, `WALMART_PRIVATE_KEY`, `WALMART_KEY_VERSION`, `WALMART_PUBLISHER_ID`) | **off, UNVERIFIED AGAINST LIVE API** |

When a real provider is active, a product that has a live price also gets a `link_only` offer for every retailer nobody priced (pointing at that retailer's search URL), so the UI can show "Check price".

`CATALOG_CATEGORIES` (comma-separated, case-insensitive category names) limits the whole catalog — search, browse/home, detail, lookup, suggestions, trending — so a launch can be scoped to one category. The adapters name a product's category after the first element of the retailer's category path that matches a configured name.

### UNVERIFIED AGAINST LIVE API — check before enabling `bestbuy` or `walmart`

Both adapters were written with **no API keys and no network access to those APIs**, from memory of their public documentation. Their tests run against hand-written fixtures (`test/fixtures/*.json`, also from memory), so they prove the mapping is self-consistent, not that it matches reality. Before use, verify against the official docs and a real response:

**Best Buy** (`src/providers/bestbuy.ts`, docs: https://bestbuyapis.github.io/api-documentation/)
1. Base URL/path `https://api.bestbuy.com/v1/products(<filter>)` and that the key is the `apiKey` query parameter.
2. Filter syntax and encoding: `(search=a&search=b)`, `(sku=…)`, `(upc=…)`, `categoryPath.name=Name*`.
3. Query parameters `format=json`, `pageSize` (and its maximum), `show=<fields>`.
4. Response envelope `{ products: [...] }`.
5. Field names/types: `sku`, `name`, `manufacturer`, `upc`, `salePrice`, `regularPrice`, `onlineAvailability`, `customerReviewAverage`, `customerReviewCount`, `url`, `image`, `categoryPath[].name`, `shippingCost`, `freeShipping`, `shortDescription`, `longDescription`, `features[].feature`.
6. Whether `upc` is always a 12-digit UPC-A; `shippingCost` when unknown.
7. Rate limits (the adapter does not throttle) and the terms for price display, caching, attribution and outbound/affiliate links.

**Walmart** (`src/providers/walmart.ts`, docs: https://walmart.io/docs/affiliate)
1. Base URL/paths `https://developer.api.walmart.com/api-proxy/service/affil/product/v2` + `/search`, `/items/{id}`, `/items?upc=`.
2. Auth headers `WM_CONSUMER.ID`, `WM_CONSUMER.INTIMESTAMP`, `WM_SEC.KEY_VERSION`, `WM_SEC.AUTH_SIGNATURE`, and the signature: RSA-SHA256 (base64) over `consumerId\ntimestamp\nkeyVersion\n` — exact canonical string and key format (PKCS#8 PEM expected).
3. Search parameters `query`, `numItems` (and its maximum), `publisherId`, category filters.
4. Response envelopes for search, item and UPC lookups.
5. Field names/types: `itemId`, `name`, `salePrice`, `msrp`, `upc`, `categoryPath`, `brandName`, descriptions, images, `productTrackingUrl`/`productUrl`, `standardShipRate`, `freeShippingOver35Dollars`, `customerRating`, `numReviews`, `stock`, `availableOnline`.
6. Shipping rules (the adapter assumes free shipping at $35+ when `freeShippingOver35Dollars`), and the status code for unknown items (400/404 are treated as "not found").
7. Rate limits and the terms for price display, caching, attribution and links.

Also unverified for both: behaviour under their real latency (the 2.5 s provider timeout and cache TTLs were tuned on the mock), and that their search relevance order is usable (hits are scored by position only).

### Adding another price source

1. Implement `PriceProvider` from `src/providers/types.ts`. Return `ProviderOffer`s (no tax/landed/eligible fields — those are per-shopper) with a `priceSource`, and `null` from `getProduct` for ids you do not own.
2. Register a factory in `src/providers/index.ts` (read credentials from config there; add its name to `LIVE_PROVIDERS` if it returns real prices).
3. Set `PRICE_PROVIDERS=yourprovider` (comma-separate to combine with others).

Outbound retailer links for the mock and for `link_only` offers are built in one place, `buildOutboundUrl` in `src/retailers.ts`. It returns plain search URLs; that function is where affiliate tags would be added.

## Mock data

`MockProvider` ships ~80 products in 11 categories with 3-6 offers each across Amazon, Walmart, Sam's Club, Target, Costco and Best Buy. Everything is generated from a hash of the product id, so prices are identical on every run; none of it is real pricing, and the GTINs are synthetic (well-formed UPC-A with a valid check digit, e.g. `090430668048` for `dash-mini-2-cup-rice-cooker`). `MOCK_LATENCY_MS` adds a delay to each provider call to simulate a real upstream.

## Layout

```
src/
  index.ts            entrypoint (env, listen, graceful shutdown)
  app.ts              routes, auth, CORS, rate limiting, error shape, background timers
  config.ts           env parsing
  contract.ts         API types (generated copy)
  catalog.ts          provider fan-out + timeout + GTIN merge + link-only fallback + cache
  cache.ts            LRU / TTL / stale-while-revalidate
  shopper.ts          shopper context: tax, landedPrice, eligible
  tax.ts              ZIP prefix -> state, estimated rate per state
  gtin.ts             barcode normalization
  ranking.ts          rankOffers, premium bound, personalizeProduct, orderHits
  home.ts             home feed sections
  alerts.ts           alert pricing + checker
  push.ts             PushSender, Expo + no-op
  db.ts               SQLite store (devices, events, profiles, alerts)
  rateLimit.ts        fixed-window limiter
  validation.ts       zod schemas
  retailers.ts        retailer table, buildOutboundUrl
  ask/                rules.ts (parser), claude.ts (interpreter), index.ts (service + guards)
  profile/            heuristic.ts, claude.ts, learner.ts, budget.ts
  providers/          types.ts, index.ts (registry), http.ts, bestbuy.ts, walmart.ts, mock/
test/                 vitest suites, fixtures/
```

## Limits to know about

- Cache, rate limiters (including the per-IP daily registration cap), the ask cache, the Claude budget and all timers are in-process: run one instance, or move them to shared infrastructure before scaling out. The registration caps reset on restart.
- Device tokens do not expire or rotate; the only revocation is `DELETE /v1/profile` or the retention purge. A lost token means a new device.
- Behind NAT/carrier-grade NAT many users share an IP: tune the registration caps (and `TRUST_PROXY`) for the deployment.
- The tax figures are coarse state-level estimates (see above).
- The alert checker reads prices through the catalog cache, so a trigger can lag a price change by the cache TTL/SWR window; `priceAtCreation` is fixed at creation and is not updated by later checks.
- Neither Claude path (profiler, ask) has been exercised against the real API — only against a mocked client. Expo push has only been exercised against a mocked `fetch`.
- `events` fields such as `wasCheapest`/`premiumPaid` are client-reported; a client can only influence its own profile with them.
