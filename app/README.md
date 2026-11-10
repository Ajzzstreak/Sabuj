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

`npx expo start` shows a QR code for Expo Go. The app uses only modules that ship in Expo Go
(SDK 58), so a development build is optional.

On a physical phone, `localhost` is the phone itself. Point the app at your computer's LAN address:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:8787 npx expo start
```

The Android emulator reaches the host machine at `http://10.0.2.2:8787`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:8787` | Base URL of the API. Read at bundle time; restart the bundler after changing it. |

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

## Layout

```
app.identity.json      name / slug / scheme / bundle id (single source)
app.config.js          Expo config, reads app.identity.json
src/
  config.ts            APP_NAME, API_URL, tracking and cache tuning
  api/
    contract.ts        GENERATED API types (do not edit; run scripts/sync-types.sh at the repo root)
    client.ts          fetch wrapper: timeout, cancellation, typed errors
    queries.ts         TanStack Query hooks, keys and prefetch helpers
  app/                 expo-router routes
    _layout.tsx        providers, fonts, startup
    (tabs)/index.tsx   Home / search
    (tabs)/saved.tsx   Watchlist
    (tabs)/profile.tsx What the app has learned, pause switch, delete my data
    search.tsx         Results (?q=)
    product/[id].tsx   Product detail
  components/          UI building blocks (cards, offer rows, chart, skeletons, tab bar)
  hooks/               useLayout (breakpoints), useTypeahead
  lib/                 tracker (event queue), device id, storage, formatting, offer logic
  state/               local stores: settings, recent searches, saved items
  theme/               design tokens (color, type, spacing, radius, chart palette)
```

## How it behaves

- **Activity tracking.** An anonymous device id is created on first launch (Keychain / Keystore via
  `expo-secure-store` on native, `localStorage` on the web). `src/lib/tracker.ts` queues `search`,
  `product_view`, `offer_click`, `save` and `unsave` events and posts them to `/v1/events` every
  4 seconds, at 20 queued events, or when the app is backgrounded. Unsent events are persisted. A
  failing batch is retried with exponential backoff and dropped after 6 attempts; the queue is
  capped at 500 events.
- **Pause.** The switch on the profile tab stops recording at the source and empties the queue.
- **Delete my data.** Calls `DELETE /v1/profile`, then clears the queue, saved items, recent
  searches and cached responses, and creates a new device id. If the server cannot be reached,
  nothing is cleared, so the request can be retried with the same id.
- **Speed.** Responses are cached by TanStack Query and persisted to disk, so a relaunch paints the
  last results before the network answers. Previous results stay on screen while a new query
  loads. Product detail is prefetched on press-in / hover, and results for the top suggestion are
  prefetched while typing. Typeahead requests are cancelled when the text changes.
- **Layout.** Phones get a single column and a bottom tab bar. From 700 px the tab bar moves to the
  top and product grids use two columns; from 1100 px, three. Content is capped at 1180 px.
- **Theme.** Light and dark follow the system setting. All tokens are in `src/theme/tokens.ts`.
