# DealLens app

The client for DealLens (working name), a price-comparison product: search a product and see every
retailer's price side by side, with the best deal marked. One Expo / React Native codebase runs on
iOS, Android, tablets and the web.

## Requirements

- Node 20 or newer
- The API server running (see `../server`). The app talks to `http://localhost:8787` by default.
- For device builds: an Expo account and `eas-cli` (`npx eas-cli@latest`).

## Run

```bash
npm install
npm run web        # browser, http://localhost:8081
npm run ios        # iOS simulator (macOS with Xcode)
npm run android    # Android emulator or a connected device
```

`npx expo start` shows a QR code for Expo Go. Barcode scanning (`expo-camera`) works there. Push
notifications for price alerts do not: remote push needs a development or store build
(`expo-notifications` no longer delivers remote notifications in Expo Go on Android) and an EAS
project id, see "Push notifications" below. Without push the app still works; alerts are polled.

On a physical phone, `localhost` is the phone itself. Point the app at your computer's LAN address:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npx expo start
```

The Android emulator reaches the host machine at `http://10.0.2.2:8787`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:8787` | Base URL of the API. Read at bundle time; restart the bundler after changing it. |
| `EXPO_PUBLIC_DEV_ROUTES` | unset | Set to `1` to include `/dev/components` (the component gallery) in an exported build. It is always on in development and off in production otherwise. |

Copy `.env.example` to `.env` to set it locally. `EXPO_PUBLIC_*` values are compiled into the
bundle, so never put a secret in one.

## Checks

```bash
npm run typecheck      # tsc --noEmit, strict
npm run export:web     # static web build in dist/
```

`dist/` is a single-page app: serve it with any static host that falls back to `index.html` for
unknown paths (for example `npx serve dist --single`).

## Renaming the product

The name, slug, URL scheme and bundle id live in **`app.identity.json`** and nowhere else.
`app.config.js` reads it for the native config and `src/config.ts` exports it to the UI as
`APP_NAME`. Change that one file to rename the app. Local storage keys are prefixed with the slug,
so a renamed build starts with empty local data.

## Building with EAS

There is no `eas.json` yet. To create one and build:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure          # writes eas.json and links the project
npx eas-cli@latest build --profile preview --platform ios
npx eas-cli@latest build --profile production --platform all
```

Notes:

- Set `EXPO_PUBLIC_API_URL` per profile in `eas.json` under `build.<profile>.env`. Production must
  use an `https` URL: iOS blocks plain `http` outside local networking, and Android blocks
  cleartext traffic in release builds.
- The bundle id / Android package is the placeholder `com.deallens.app`. Change it in
  `app.identity.json` before the first store build; it cannot be changed after release.
- `ios/` and `android/` are generated (`npx expo prebuild`) and git-ignored. Configure native
  behavior in `app.config.js`.
- Web deploy: `npm run export:web`, then upload `dist/` (or `npx eas-cli@latest deploy`).

## Native permissions and push notifications

`app.config.js` declares everything native:

- **Camera** (`expo-camera` plugin): `NSCameraUsageDescription` on iOS and `CAMERA` on Android, for
  barcode scanning only. Microphone / `RECORD_AUDIO` are explicitly off. The permission is requested
  on the scan screen after an explanation, when the user presses "Allow camera".
- **Notifications** (`expo-notifications` plugin): Android channel `price-alerts`,
  `POST_NOTIFICATIONS` on Android 13+. Permission is requested only when the user creates their
  first price alert, after an explanation.
- **Push token.** `Notifications.getExpoPushTokenAsync` needs an EAS project id. `eas build:configure`
  adds `extra.eas.projectId`; until it exists `src/lib/push.ts` silently skips token registration and
  alerts are in-app only. iOS additionally needs push credentials (`eas credentials`); Android needs
  FCM credentials uploaded to EAS.
- **Notification payload.** Tapping a notification opens the product named in
  `data.productId` (or `data.url` of the form `/product/<id>`). The server must send one of them.

## Before release (owner to-do)

- `src/content/legal.ts`: every paragraph is marked `[DRAFT]` placeholder copy. Replace it, have it
  reviewed, then set `LEGAL_COPY_IS_FINAL = true` to remove the DRAFT banner.
- `src/config.ts` `AFFILIATE_LINKS_ENABLED`: set to `true` only if outbound links really carry
  affiliate tags. It shows the disclosure line under the offers table.

## Layout

```
app.identity.json      name / slug / scheme / bundle id (single source)
app.config.js          Expo config, reads app.identity.json; camera + notification plugins
src/
  config.ts            APP_NAME, API_URL, tracking and cache tuning, DEV_ROUTES, AFFILIATE_LINKS_ENABLED
  api/
    contract.ts        GENERATED API types (do not edit; run scripts/sync-types.sh at the repo root)
    client.ts          fetch wrapper: bearer token, 401 -> re-register -> retry once, timeout, typed errors
    queries.ts         TanStack Query hooks, keys and prefetch helpers; lookup, ask, alerts
  app/                 expo-router routes
    _layout.tsx        providers, fonts, startup, onboarding gate, global sheets and toasts
    (tabs)/index.tsx   Home / search, Ask examples
    (tabs)/saved.tsx   Saved | Alerts
    (tabs)/profile.tsx What the app has learned, Shopping settings, pause, delete, About & legal
    search.tsx         Keyword results (?q=)            -> GET /v1/search
    ask.tsx            Plain-English results (?text=)   -> POST /v1/ask
    scan.tsx           Barcode scanner / manual entry   -> GET /v1/lookup
    product/[id].tsx   Product detail
    legal/[doc].tsx    privacy | terms | ranking | data (copy in src/content/legal.ts)
    dev/components.tsx Component gallery (not in production builds)
  components/
    ui/                THE shared primitives: Button, IconButton, Chip, SegmentedControl, Sheet,
                       TextField, ListRow, ToggleRow, Banner, Toast, EmptyState, Badge
    PressableScale.tsx the one touchable under all of them (press, hover, focus ring, disabled)
    ...                cards, offer rows, chart, skeletons, tab bar, onboarding, alert and breakdown sheets
  content/             legal templates, Ask example prompts
  hooks/               useLayout (breakpoints), useTypeahead
  lib/                 session (device + token), tracker, push (+ .web no-op), offers, formatting, storage
  state/               local stores: settings, shopper (ZIP, memberships), recents, saved, alert prefs
  theme/               design tokens (color, type, spacing, radius, chart palette)
```

## How it behaves

- **Device and auth.** On first launch the app calls `POST /v1/devices` and stores the returned
  `deviceId` + `token` (Keychain / Keystore via `expo-secure-store` on native, `localStorage` on
  the web). Every request sends `Authorization: Bearer <token>`; the device id is never sent as a
  parameter. A `401` on any request registers the device again and retries that request once.
  If registration fails (offline first launch) the app opens anyway and registers on the next request.
- **True total cost.** A skippable first-run flow asks for a ZIP code and Costco / Sam's Club
  memberships; both are editable under Your profile › Shopping settings. Memberships have three
  states: not answered (the `memberships` param is omitted), answered none (`memberships=`), or a
  list. `zip` and `memberships` go on every catalog request and are part of every catalog query
  key. Prices shown are `landedPrice`; tapping a price opens the item + shipping + estimated tax
  breakdown, and the detail table spells it out per store. Offers the user is not eligible for are
  dimmed, labelled "Membership required" and never marked best price. `priceSource` `demo` shows a
  persistent "Demo prices" notice, `link_only` shows "Check price" and no number, `live` shows
  "as of <time>". `recommendationReason` is rendered exactly as the server sends it.
- **Ask.** The sparkle button, the "Ask" row under the search field and the example prompts go to
  `POST /v1/ask` (30 s timeout, skeleton while waiting). Enter in the search field always uses
  `/v1/search`. Editing an "understood as" chip re-runs the edited keywords on `/v1/search` and
  applies price / rating / store / sort on the device.
- **Price alerts.** Created from product detail or a saved item. Listed under Saved › Alerts.
  `GET /v1/alerts` is refetched on launch, whenever the app or browser tab regains focus and when
  the Saved tab opens; unseen triggered alerts are badged on the Saved tab. On iOS / Android the
  Expo push token is sent with `PUT /v1/push-token` if the user allows notifications. The web build
  never asks and relies on the polling.
- **Barcode.** The barcode button in the search field opens the scanner (UPC-A, UPC-E, EAN-13,
  EAN-8) with a torch toggle and manual entry. The web build offers manual entry only.
- **Activity tracking.** `src/lib/tracker.ts` queues `search`,
  `product_view`, `offer_click`, `save` and `unsave` events and posts them to `/v1/events` every
  4 seconds, at 20 queued events, or when the app is backgrounded. Unsent events are persisted. A
  failing batch is retried with exponential backoff and dropped after 6 attempts; the queue is
  capped at 500 events.
- **Pause.** The switch on the profile tab stops recording at the source and empties the queue.
- **Delete my data.** Calls `DELETE /v1/profile` (which also revokes the token), then drops the
  token, clears the queue, saved items, recent searches, ZIP code, memberships, alert bookkeeping
  and cached responses, and registers a fresh device. The pause switch is kept. If the server
  cannot be reached nothing is cleared, so it can be retried.
- **Speed.** Responses are cached by TanStack Query and persisted to disk, so a relaunch paints the
  last results before the network answers. Previous results stay on screen while a new query
  loads. Product detail is prefetched on press-in / hover, and results for the top suggestion are
  prefetched while typing. Typeahead requests are cancelled when the text changes.
- **Layout.** Phones get a single column and a bottom tab bar. From 700 px the tab bar moves to the
  top and product grids use two columns; from 1100 px, three. Content is capped at 1180 px.
- **Theme.** Light and dark follow the system setting. All tokens are in `src/theme/tokens.ts`.
