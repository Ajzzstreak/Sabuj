# DealLens server

Grocery price-comparison API: search a product, get every store's offer side by side (the same item, or that store's equivalent, compared per unit), and total a whole shopping list per store.
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
| GET | `/v1/search?q=&limit=&zip=&memberships=&storeIds=` | optional | `limit` 1-50, default 20. Reports `tookMs`, `cached`, `personalized`. |
| GET | `/v1/suggest?q=` | optional | Autocomplete; empty `q` returns personal + trending queries. |
| GET | `/v1/home?zip=&memberships=&storeIds=` | optional | `for_you` / `recent` (when a profile exists), `top_deals`, category sections. |
| GET | `/v1/products/:id?zip=&memberships=&storeIds=` | optional | Detail with 90-day price history per retailer (mock only). |
| GET | `/v1/lookup?gtin=&zip=&memberships=&storeIds=` | optional | Barcode lookup → `ProductResponse`, `404 not_found`, or `400` for a malformed code. |
| GET | `/v1/stores?zip=` | optional | `{ zip, stores[] }` nearest first. |
| POST | `/v1/basket` | optional | Shopping-list totals per store, best single store, best two-store split (see below). |
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
- `cheapestOfferId`, `maxSavings` and ranking use `landedPrice` over in-stock, eligible, priced offers — per unit when the offers are not the same item in the same size (next section).
- **Groceries are taxed like everything else here.** Most states exempt or reduce sales tax on food; this table does not know that, so `estimatedTax` on food items is usually too high. Treat it as a known error until a per-state grocery rule is added.

Offer order (an offer never outranks one in an earlier group): eligible in-stock comparable offers within the shopper's premium bound → eligible in-stock offers beyond it or not comparable → ineligible → out of stock → `link_only`. `recommendedOfferId` is `offers[0].id` when that offer is in stock, eligible and priced, otherwise `null`.

`priceSource`: `demo` (mock data), `live` (a retailer API), `link_only` (no price: every price field is 0/null, the offer is only a "check price" link; never cheapest, never recommended, excluded from `maxSavings`, always last).

## Grocery: sizes, unit prices, store brands

Products and offers carry a `size` (`{ amount, unit }`, units `oz | lb | fl_oz | gal | ct | each`). Each offer gets `unitPrice` + `unitLabel`, normalized **within a dimension only**: weight → `per oz`, volume → `per fl oz`, count → `each` (`src/size.ts`; `parseSize` reads "16 oz", "5 lb", "half gallon", "12 ct", "2 L", and multipacks such as "12 x 12 fl oz" or "12 fl oz, 12 count").

`matchType` says what an offer is: `exact` = the same item (same GTIN); `equivalent` = a comparable item at that store, with its real name in `offerTitle` and possibly another size — typically that store's own brand. `Product.isStoreBrand` marks a retailer's own label.

**How offers are compared** (`src/compare.ts`):

- Same item, same size at every store → `landedPrice`, as before.
- As soon as a product has an `equivalent` offer or offers in different sizes → landed price **per unit**. A 25 lb bag is not "more expensive" than a 5 lb bag. `cheapestOfferId`, `recommendedOfferId`, ordering and the premium bound all use it; `maxSavings` is then the saving on the product's own package size (priciest vs cheapest unit price × that size).
- Unit prices are never compared across dimensions: an offer whose size is unknown or in another dimension than the product's (oz vs ct) has no comparison value — it is listed after the comparable offers and is never cheapest or recommended.
- `recommendationReason` states the per-unit gap in that mode ("Walmart is 0.8¢ per oz more — …"), never a shelf-price difference between different pack sizes.
- Things that are about a shelf price use the shelf price: `POST /v1/ask` applies `maxPrice` to the lowest in-stock eligible `landedPrice` ("eggs under $4" means at the till), and a price alert watches only offers for the exact item in the product's own size.

## Stores

`GET /v1/stores?zip=` lists store locations (nearest first) from every provider that has them. Catalog routes and the basket accept `storeIds=wm-45202-1,kr-45202-2`; with only `zip`, the nearest store of each retailer is used; with neither, prices are national/demo and `Offer.storeId` is `null`. Explicit ids win per retailer (first one), ids no provider recognizes are ignored, and retailers you did not name still get their nearest store when a `zip` is present.

Cache correctness: the shared cache holds national, unpersonalized provider results. A provider that can re-price an offer for a store on the fly implements `localizeOffer` (the mock does) and is applied **after** the cache, so one entry serves every store selection. A provider whose upstream prices only exist per location declares `storeScopedRetailers` (Kroger does) and the catalog adds exactly those retailers' selected store ids to its cache keys — other retailers' stores never fragment the cache.

## POST /v1/basket — shopping-list totals

`{ items: [{ id, productId?, query?, quantity }], zip?, memberships?, storeIds? }` → `BasketResponse`. Works with or without a token; limits: `BASKET_MAX_ITEMS` (60) items, quantity 1-99, query ≤ 100 chars, unique item ids, `BASKET_RATE_LIMIT_MAX` per device (per IP when anonymous). No LLM: every item resolves concurrently through the cached catalog path.

- An item resolves to its `productId`; otherwise (or if that id is unknown) to the top search match of `query` with `resolvedFromQuery: true`; otherwise `product: null`.
- A store can supply an item when the product has an in-stock, eligible, priced (not `link_only`) offer there — the exact item or that store's equivalent. The line is `unitCost` (= the offer's `landedPrice`) × `quantity`.
- `perStore`: one entry per retailer with at least one line, ordered **most items covered first, then lowest total** — so `perStore[0]` is always `bestSingleStore` (the cheapest complete store; if none is complete, the one covering the most items, ties by total).
- `bestSplit`: every pair of stores is evaluated, each item going to the cheaper store of the pair (ties to the store that ranks better on its own). A pair is returned only if both stores actually get an item, it covers **exactly the items the best single store covers**, and it is cheaper by at least `BASKET_SPLIT_MIN_SAVINGS` (default $1). The pair with the largest saving wins; otherwise `null`.

The maths lives in `src/basket.ts` as pure functions (`computeBasket`, `lineFor`).

## How it stays fast

- **Provider layer** (`src/providers`): every price source implements `PriceProvider` (`search`, `getProduct`, `lookupGtin`, optional `browse`/`suggest`). `Catalog` (`src/catalog.ts`) fans out to all configured providers in parallel with a per-provider timeout and merges results. Two providers' products are the same product **only** when their normalized GTINs are equal (`src/gtin.ts`) — never by title similarity.
- **Cache** (`src/cache.ts`): in-memory LRU with TTL + stale-while-revalidate. It stores the *unpersonalized* provider result, so one cache entry serves every user.
- **Shopper context + personalization**: applied after the cache — `applyContext` (`src/shopper.ts`: tax, eligibility) then `rankOffers` (`src/ranking.ts`), pure functions over a few numbers. Auth is one SHA-256 and one indexed SQLite read.
- **No LLM on catalog request paths.** Search, suggest, home, products, lookup, stores, basket, alerts and profile never call a model. `POST /v1/ask` is the single explicit exception, with a hard timeout and a deterministic fallback.
- **Learning** (`src/profile`): runs after event ingestion on a debounce timer, never inside a request.
  - `heuristic.ts` — always on, pure function over the event log.
  - `claude.ts` — only when `ANTHROPIC_API_KEY` is set: every `CLAUDE_PROFILE_EVERY_N_EVENTS` new events and at most once per `CLAUDE_PROFILE_COOLDOWN_MS` per device, sends a bounded digest (aggregates + up to 30 recent events, no device id) and the heuristic profile, and reads the refined profile back through a strict tool call. Every field is validated and clamped; on any failure the heuristic profile stays.

### The premium bound

`UserProfile.maxObservedPremiumPct` is the largest premium over the cheapest price the shopper has actually paid, computed by the heuristic profiler from `offer_click` events (`premiumPaid / (price − premiumPaid)`, capped at 100%). `list_add` / `list_remove` events feed category and brand interest only (never ranking weights); a store-brand vs name-brand lean is reported as an insight, since the profile has no field for it. Ranking never recommends an offer whose `landedPrice` exceeds the cheapest eligible `landedPrice × (1 + maxObservedPremiumPct)` (+ $0.01 rounding tolerance), whatever the affinities say: thirty clicks paying $1 extra on a $100 item allow about 1% extra, not $30. A shopper who never paid a premium always gets the cheapest eligible offer first. The Claude profiler has no field for this value and cannot change it. Membership is inferred only after 3 clicks on a membership retailer.

## POST /v1/ask

1. The rules parser (`src/ask/rules.ts`) always runs: regexes for price ceilings ("under $60", "eggs under $4"), ratings ("at least 4 stars"), retailer names (incl. "at kroger", "not at walmart"), sort words ("cheap", "cheapest", "top rated"), attribute words and phrases ("organic", "gluten free", "low sodium" → `mustHave`), and filler stripping.
2. If `ANTHROPIC_API_KEY` is set, the hourly budget allows it and the text is not already cached, **one** Claude call (`CLAUDE_MODEL`, strict tool, low effort) returns the `AskInterpretation`. The shopper's text is passed JSON-encoded as data with an instruction to treat it as untrusted. The call has a hard deadline (`ASK_TIMEOUT_MS`, default 4 s, no retries); on timeout, error, refusal or invalid output the rules result is used and `source` is `"rules"`.
3. The normal search path runs with the interpretation as filters: `retailers` (offers are limited to those stores), `maxPrice` (on the lowest in-stock eligible `landedPrice`), `minRating`, `mustHave` (relevance boost against title/highlights; with a price or rating sort, products matching more of it come first — "cheap gluten free pasta" lists the gluten-free ones first, cheapest first), `sort`.
4. `topPickReason`: the same Claude call may write a note per candidate product (the top few results of the rules query: title, highlights, price, rating). The server uses the note for whichever product ends up first only if every dollar figure in it equals a real price field of that product's offers and it contains no link, store name or savings claim; otherwise (and always in rules mode) a server-side template is used, or `null` when there are no results. The model is never the source of a price.

Limits: `ASK_RATE_LIMIT_MAX` per device per window; Claude calls count against the same global `CLAUDE_MAX_CALLS_PER_HOUR` as the profiler; interpretations are cached by normalized text (6 h, 2000 entries, in memory).

## Price alerts and push

- One alert per (device, product) — creating another replaces it; at most `MAX_ALERTS_PER_DEVICE`. The alert stores the `zip`/`memberships` it was created with and is always priced under them (tax, eligibility, and the nearest store per retailer for that zip). It watches the shelf price of the exact item: another store's equivalent or another pack size never triggers it.
- `checkAlerts` (`src/alerts.ts`, also `app.checkAlerts()`) runs every `ALERT_CHECK_INTERVAL_MS` (default 15 min, `0` disables; disabled in tests). An active alert whose best in-stock eligible `landedPrice` is ≤ `targetPrice` becomes `triggered` with `triggeredAt` (once), and a push is sent if the device registered a push token.
- `PushSender` (`src/push.ts`): `ExpoPushSender` POSTs batches of ≤100 to `https://exp.host/--/api/v2/push/send` with a timeout; failures are swallowed and logged without tokens; tokens Expo reports as `DeviceNotRegistered` are forgotten. `PUSH_PROVIDER=none` uses the no-op sender. A device with no push token gets no push; the app sees the trigger on `GET /v1/alerts`.
- Mock prices never change, so to exercise a trigger pin a price: `MOCK_PRICE_OVERRIDES="productId:retailerId=price"` at startup, or `MockProvider.setPriceOverride()` + `catalog.clearCache()` in tests.

## Price providers

`PRICE_PROVIDERS` selects them (comma-separated). Default: `mock`.

| Name | Source | Status |
|---|---|---|
| `mock` | Synthetic demo data, `priceSource: "demo"` (`MOCK_CATALOG=grocery\|general\|all`) | default |
| `kroger` | Kroger Products + Locations APIs, OAuth2 client credentials (`KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`), location-scoped prices | **off, UNVERIFIED AGAINST LIVE API** |
| `bestbuy` | Best Buy Products API (`BESTBUY_API_KEY`) | **off, UNVERIFIED AGAINST LIVE API** |
| `walmart` | Walmart Affiliate API (`WALMART_CONSUMER_ID`, `WALMART_PRIVATE_KEY`, `WALMART_KEY_VERSION`, `WALMART_PUBLISHER_ID`) | **off, UNVERIFIED AGAINST LIVE API** |

When a real provider is active, a product that has a live price also gets a `link_only` offer for every retailer nobody priced (pointing at that retailer's search URL), so the UI can show "Check price".

`CATALOG_CATEGORIES` (comma-separated, case-insensitive category names) limits the whole catalog — search, browse/home, detail, lookup, suggestions, trending — so a launch can be scoped to one category. The adapters name a product's category after the first element of the retailer's category path that matches a configured name.

### UNVERIFIED AGAINST LIVE API — check before enabling `kroger`, `walmart` or `bestbuy`

All three adapters were written with **no API keys and no network access to those APIs**, from memory of their public documentation. Their tests run against hand-written fixtures (`test/fixtures/*.json`, also from memory), so they prove the mapping is self-consistent, not that it matches reality. Before use, verify against the official docs and a real response:

**Kroger** (`src/providers/kroger.ts`, docs: https://developer.kroger.com)
1. Token endpoint `POST https://api.kroger.com/v1/connect/oauth2/token` with HTTP Basic client credentials and body `grant_type=client_credentials&scope=product.compact`; response `{ access_token, expires_in }`.
2. That `product.compact` is the right scope for Products and whether Locations needs one (the adapter uses the same token for both).
3. Products search `GET /v1/products?filter.term=&filter.locationId=&filter.limit=` (max limit, minimum term length) and product by id `GET /v1/products/{productId}?filter.locationId=`.
4. Response shape and field names: `data[].productId`, `upc`, `brand`, `description`, `categories[]`, `items[0].size`, `items[0].price.regular`/`promo`, `items[0].fulfillment.*`, `items[0].inventory.stockLevel`, `images[].perspective`/`sizes[].size`/`url`.
5. That `price` is only present with a location, that `promo` is `0` (not absent) without a promotion, and that these are that location's in-store prices. Without a price the adapter emits a `link_only` offer.
6. **UPC format**: Kroger's `upc`/`productId` are believed to be 13 digits without a standard check digit; `krogerUpcToGtin`/`gtinToKrogerUpc` encode that belief. If wrong, barcode lookup and cross-store GTIN merging silently miss.
7. `inventory.stockLevel` values and coverage (only an explicit `TEMPORARILY_OUT_OF_STOCK` is treated as out of stock).
8. Locations `GET /v1/locations?filter.zipCode.near=&filter.limit=&filter.radiusInMiles=`, its response shape, and its ordering (assumed nearest first). The response is not believed to include a distance and the server has no ZIP geocoder, so **`distanceMiles` is reported as 0 for Kroger stores** — fix before showing distances.
9. Kroger-family banners (Ralphs, Fred Meyer, …) are all reported as retailer `kroger`; the store-brand list (`KROGER_STORE_BRANDS`) is a guess.
10. Rate limits (the adapter does not throttle) and the terms for price display, caching, attribution and links.

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
7. Grocery fields: the package `size` is **parsed from the item title** (heuristic) because no reliable structured size field is remembered; `isStoreBrand` uses a guessed label list; prices are walmart.com prices, not per-store shelf prices (`storeId` stays `null`), which is not the in-store price the product calls for.
8. Rate limits and the terms for price display, caching, attribution and links.

Also unverified for all three: behaviour under their real latency (the 2.5 s provider timeout and cache TTLs were tuned on the mock), and that their search relevance order is usable (hits are scored by position only).

### Adding another price source

1. Implement `PriceProvider` from `src/providers/types.ts`. Return `ProviderOffer`s (no tax/landed/eligible/unit-price fields — those are derived per shopper) with a `priceSource`, `matchType` and `size`, and `null` from `getProduct` for ids you do not own. Optional capabilities: `stores(zip)`, `storeRetailer(storeId)`, `localizeOffer` (re-price after the cache) or `storeScopedRetailers` (prices fetched per location), `trending()`.
2. Register a factory in `src/providers/index.ts` (read credentials from config there; add its name to `LIVE_PROVIDERS` if it returns real prices).
3. Set `PRICE_PROVIDERS=yourprovider` (comma-separate to combine with others).

Outbound retailer links for the mock and for `link_only` offers are built in one place, `buildOutboundUrl` in `src/retailers.ts`. It returns plain search URLs; that function is where affiliate tags would be added.

## Mock data

`MOCK_CATALOG` picks the demo data set (default `grocery`). Everything is generated from hashes, so it is identical on every run; **none of it is real pricing**, GTINs are synthetic (well-formed UPC-A), and store locations are invented.

- **`grocery`** — about 470 products in 12 aisles (Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, Canned Goods, Snacks, Beverages, Frozen, Breakfast, Baby, Household), from `src/providers/mock/groceryData.ts`.
  - National brands (Barilla, Tide, ...) are the same GTIN at every store that carries them: `exact` offers, one size.
  - Store brands: each kind of item (e.g. whole milk, 1 gal) exists as one product per retailer label — Great Value / Parent's Choice (Walmart), Kroger / Comforts (Kroger), Good & Gather / up & up (Target), Kirkland Signature (Costco), Member's Mark (Sam's Club). A store-brand product has one `exact` offer at its own retailer and `equivalent` offers at the others, each pointing at that retailer's own product of the same kind (same aisle, same item, same unit dimension) at exactly that product's price. Equivalence is by construction from the seed table, never inferred.
  - Walmart and Kroger have a store brand for every kind and ~95% of national brands; Target carries a subset; Costco and Sam's Club sell only bulk store-brand packs; Amazon carries shelf-stable national brands; Best Buy sells no groceries.
  - Search and browse show one product per store-brand kind (Walmart's unless the query names another brand); siblings remain reachable by id and barcode.
  - Stores: 2-3 synthetic locations per grocery retailer per ZIP (`wm-`, `kr-`, `tg-`, `co-`, `sc-` + zip + index; names and addresses say "demo"). A store shifts each item's price by a deterministic ±4%, consistently wherever that item appears.
- **`general`** — the original ~80 electronics/appliance products (rice cookers, TVs, ...) across Amazon, Walmart, Sam's Club, Target, Costco and Best Buy; no sizes, no stores. Its offers are unchanged by the addition of Kroger.
- **`all`** — both.

`MOCK_LATENCY_MS` adds a delay to each provider call to simulate a real upstream.

## Layout

```
src/
  index.ts            entrypoint (env, listen, graceful shutdown)
  app.ts              routes, auth, CORS, rate limiting, error shape, background timers
  config.ts           env parsing
  contract.ts         API types (generated copy)
  catalog.ts          provider fan-out + timeout + GTIN merge + link-only fallback + cache
  cache.ts            LRU / TTL / stale-while-revalidate
  shopper.ts          shopper context: store price, tax, landedPrice, eligible, unit price
  size.ts             package sizes: parsing, normalization, unit price
  compare.ts          shelf-price vs unit-price comparison of a product's offers
  basket.ts           shopping-list totals, best single store, best split (pure)
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
  providers/          types.ts, index.ts (registry), http.ts, kroger.ts, walmart.ts, bestbuy.ts,
                      mock/ (grocery + general catalogs, stores)
test/                 vitest suites, fixtures/
```

## Limits to know about

- Cache, rate limiters (including the per-IP daily registration cap), the ask cache, the Claude budget and all timers are in-process: run one instance, or move them to shared infrastructure before scaling out. The registration caps reset on restart.
- Device tokens do not expire or rotate; the only revocation is `DELETE /v1/profile` or the retention purge. A lost token means a new device.
- Behind NAT/carrier-grade NAT many users share an IP: tune the registration caps (and `TRUST_PROXY`) for the deployment.
- The tax figures are coarse state-level estimates and ignore grocery exemptions, so tax on food is usually overstated (see above).
- Basket lines cost one package of whatever that store sells: a club's equivalent is a bulk pack, so club totals are for more product than the list asked for. The response does not scale quantities to match sizes.
- `bestSplit` is only compared against the best single store on identical item coverage; a pair of stores that covers MORE items than any single store is not surfaced as a split (read `perStore[].missingItemIds` for that).
- Free-text basket items take the top search hit; nothing checks that "milk" meant whole milk. The app should let the user change the resolved product.
- Unit prices are compared on `landedPrice` per unit; the displayed `unitPrice` is the pre-tax item price per unit.
- The alert checker reads prices through the catalog cache, so a trigger can lag a price change by the cache TTL/SWR window; `priceAtCreation` is fixed at creation and is not updated by later checks.
- Neither Claude path (profiler, ask) has been exercised against the real API — only against a mocked client. Expo push has only been exercised against a mocked `fetch`.
- `events` fields such as `wasCheapest`/`premiumPaid` are client-reported; a client can only influence its own profile with them.
