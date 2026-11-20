# Privacy answers: App Store privacy label and Google Play Data safety

Derived from the code as built, not from intentions. Re-check whenever any of these change:

- `app/src/lib/tracker.ts`: the activity event queue (`POST /v1/events`)
- `app/src/lib/session.ts`: the anonymous install id and token (`POST /v1/devices`)
- `app/src/lib/push.ts`: the Expo push token (`PUT /v1/push-token`)
- `app/src/state/` and `app/src/api/queries.ts`: ZIP, stores, memberships, alerts
- `server/src/db.ts`, `server/src/app.ts`, `server/src/profile/`, `server/src/ask/`: what the server keeps and what it sends to Claude
- `app.config.js` `ios.privacyManifests`: must stay consistent with the answers below

## What actually leaves the device

| Data | When | Kept on the server? | Code |
| --- | --- | --- | --- |
| Anonymous device id + bearer token | First launch, `POST /v1/devices`. The token is sent on every request. | Device id, and only a SHA-256 hash of the token. Last-seen time. | `session.ts`, `server/src/db.ts` (`devices`) |
| Search terms | Every search; also as `search` events | Yes, in `search` events | `search.tsx`, `tracker.ts` |
| Plain-English questions ("Ask") | `POST /v1/ask`; the interpreted query is also a `search` event | The resulting query, as an event | `ask.tsx`, `server/src/ask/` |
| Product views | `product_view` event: product id, category, brand | Yes | `product/[id].tsx` |
| Store taps | `offer_click` event: product, offer, store, price, position in the list, whether it was the cheapest, premium paid | Yes | `lib/actions.ts` |
| Saves | `save` / `unsave` events: product, category, brand, price | Yes (the saved list itself stays on the device) | `lib/actions.ts` |
| Shopping list changes | `list_add` / `list_remove` events: product id or the typed text | Yes | `lib/list.ts` |
| Shopping list contents | `POST /v1/basket`, to total the list | No, used for the response only | `(tabs)/list.tsx` |
| ZIP code | Sent with every catalog, list-total and alert request | Stored only with each price alert | `state/`, `server/src/db.ts` (`alerts`) |
| Chosen stores, warehouse memberships | Sent with catalog requests; memberships stored with each alert | With alerts only | same |
| Barcode numbers | `GET /v1/lookup?gtin=` | No (not logged: the server logs paths only) | `scan.tsx`, `server/src/app.ts` |
| Price alerts | Product, title, target price, price at creation, ZIP, memberships | Yes | `server/src/db.ts` (`alerts`) |
| Expo push token | Only if the user allows notifications | Yes | `push.ts`, `server/src/db.ts` (`devices.push_token`) |
| IP address | Every request (network level) | In server request logs and in-memory rate limiting. **TODO:** depends on hosting and log retention. | `server/src/app.ts` |
| Camera images | Never | No | `components/ScannerCamera.tsx` |

Server retention: a device with no authenticated request for 180 days is erased with all its data
(`DEVICE_RETENTION_DAYS`). At most 5,000 events per device are kept (`MAX_EVENTS_PER_DEVICE`).
"Delete my data" in the app erases the device row, events, profile, alerts and push token at once.

Third parties that process this data on the operator's behalf (service providers):

- **Anthropic (Claude)**, only when the server has an `ANTHROPIC_API_KEY`
  (**TODO:** undecided). Receives the text of plain-English questions, and an aggregate digest plus
  a sample of up to 30 recent events (searches, products, stores, prices) for profile writing. Never
  the device id, token, ZIP code or push token.
- **Expo push service** (`exp.host`), only when push is enabled: the push token and the alert text
  (product title, price, store).
- **Hosting provider.** **TODO:** undecided; it will see IP addresses and store the database.

Nothing is used for advertising or tracking across other companies' apps or websites. There is no
advertising SDK, no analytics SDK and no crash-reporting SDK.

---

## App Store Connect: App Privacy

**Data collection:** Yes, we collect data from this app.

**Linked to the user?** Apple treats data as linked when it is tied to an identifier, including a
device-level id, unless it is anonymized before collection. Every item below is stored against the
anonymous install id, so the honest answer is **linked to the user** (but not used for tracking).
If you later strip the install id from stored events, revisit this.

**Tracking:** No, for every data type. No data is combined with third-party data for advertising or
shared with data brokers.

| Apple data type | Collected | Purposes | Linked | Tracking |
| --- | --- | --- | --- | --- |
| Location › Coarse Location (ZIP code) | Yes | App Functionality | Yes | No |
| Search History (searches, Ask questions) | Yes | App Functionality, Product Personalization | Yes | No |
| Usage Data › Product Interaction (views, store taps, saves, list adds and removes, alerts) | Yes | App Functionality, Product Personalization | Yes | No |
| Identifiers › Device ID (anonymous install id, Expo push token) | Yes | App Functionality | Yes | No |
| Other Data › Other Data Types (warehouse memberships, chosen stores) | Yes | App Functionality, Product Personalization | Yes | No |
| Contact Info, Health & Fitness, Financial Info, Sensitive Info, Contacts, User Content, Browsing History, Purchases, Diagnostics, Precise Location, Body | Not collected | | | |

Notes:

- *Purchases*: the app never sees what the user buys; a tap on a store link opens the retailer's
  site and the purchase, if any, happens there.
- *Diagnostics*: nothing is collected today. **TODO:** add "Crash Data" / "Performance Data" if a
  crash reporter is added.
- *Product Personalization* is correct because the activity changes the order of offers and the
  "Suggested for you" section. It is not *Analytics* (no aggregate product analytics are run) and
  not *Third-Party Advertising*.
- The same types are declared in the iOS privacy manifest (`ios.privacyManifests` in
  `app.config.js`). Keep the two consistent.

---

## Google Play: Data safety

### Overview questions

| Question | Answer | Notes |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | Yes | |
| Is all of the user data collected by your app encrypted in transit? | Yes | **TODO:** true only once production uses an `https` API URL (`eas.json` production profile). Release Android builds block plain `http` anyway. |
| Do you provide a way for users to request that their data is deleted? | Yes | In-app: Profile › Delete my data. No account exists, so no account-deletion URL is required. **TODO:** also list a contact email for deletion requests in the privacy policy. |
| Independent security review | No | |

"Shared" in Play's sense excludes transfers to service providers that process data on your behalf,
so data sent to Anthropic, Expo or the host is **not** declared as shared, as long as the privacy
policy and the contracts say they act as processors. **TODO:** confirm with Anthropic's commercial
terms when the key is set up.

### Data types

| Play category › type | Collected | Shared | Required or optional | Purposes |
| --- | --- | --- | --- | --- |
| Location › Approximate location (ZIP code) | Yes | No | Optional (onboarding can be skipped) | App functionality |
| App activity › App interactions (views, store taps, saves, list adds and removes, alerts) | Yes | No | Optional (Profile › Learn from my activity can be turned off) | App functionality, Personalization |
| App activity › In-app search history (searches, Ask questions) | Yes | No | Optional (same switch) | App functionality, Personalization |
| App activity › Other actions | No | | | |
| Device or other IDs (anonymous install id, Expo push token) | Yes | No | Required | App functionality |
| Personal info › Other info (warehouse memberships, chosen stores) | Yes | No | Optional | App functionality, Personalization |
| Personal info › Name, email, user IDs, address, phone, race, political or religious beliefs, sexual orientation | No | | | |
| Financial info, Health and fitness, Messages, Photos and videos, Audio, Files and docs, Calendar, Contacts, Web browsing | No | | | |
| Precise location | No | | | |
| App info and performance (crash logs, diagnostics) | No | | | **TODO:** change if a crash reporter is added |

Notes:

- Barcode numbers and shopping-list contents are processed to answer a request and not stored, so
  they are not "collected" under Play's definition (ephemeral processing).
- Camera images never leave the device.
- *Ask* questions: when the turn-off switch is on, the question text is still sent to the server
  (and possibly Claude) to answer it, but no `search` event is recorded. That is processing for app
  functionality, already covered by "In-app search history".
