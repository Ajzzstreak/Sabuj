# App Store Connect: listing draft

Status: DRAFT. Not submitted. No Apple Developer Program membership yet (USD 99/year; needed for
TestFlight, push notifications, and any build on a physical iPhone other than through Expo Go).

## App information

| Field | Value |
| --- | --- |
| Bundle ID | `com.deallens.app` (from `app.identity.json`). **TODO:** final value before the first upload; it cannot change afterwards. |
| SKU | `deallens-ios-1` (internal, never shown). **TODO:** rename with the product. |
| Primary language | English (U.S.) |
| Primary category | Shopping |
| Secondary category | Food & Drink |
| Price | Free. No in-app purchases. |
| Availability | United States only (ZIP codes, US retailers, US sales tax estimates). |
| Content rights | **TODO:** confirm the app shows no third-party content you lack rights to (product images and names come from the price data source). |
| Export compliance | Uses only standard HTTPS. `ITSAppUsesNonExemptEncryption` is `false` in `app.config.js`, so App Store Connect will not ask per build. |

## App name

The name must be unique on the App Store. **TODO:** the name is a placeholder; check availability
once it is final.

<!-- limit: App Store · App name · 30 -->
```text
DealLens: Grocery Price Finder
```

## Subtitle

<!-- limit: App Store · Subtitle · 30 -->
```text
Your grocery list, best total
```

## Promotional text

Can be changed at any time without a new build.

<!-- limit: App Store · Promotional text · 170 -->
```text
Build your shopping list once and see what it costs at each store near you, with store brands, unit prices and estimated tax included.
```

## Keywords

Comma-separated, no spaces after commas (spaces count toward the limit). Do not use other
companies' names (Walmart, Kroger, Costco and so on): App Review guideline 2.3.7 and 5.2.1.
Words already in the name and subtitle are indexed anyway and are not repeated.

<!-- limit: App Store · Keywords · 100 -->
```text
compare,cheap,deals,savings,food,sale,unit price,supermarket,shopping list,budget,store brand,scan
```

## Description

**TODO before submission:** this copy assumes real prices. While the app still runs on demo data
(the app shows a "Demo prices" banner), App Review is likely to reject it as incomplete
(guideline 2.1), and the description must not claim real prices. Do not submit a demo-data build to
the App Store; use TestFlight instead.

<!-- limit: App Store · Description · 4000 -->
```text
DealLens prices your whole grocery list at the stores near you and shows where it costs least.

ONE LIST, EVERY STORE
Add what you need: type it, tap a suggestion, or add a product from search. DealLens totals the list at each nearby store, highlights the cheapest single store, and shows when splitting the trip across two stores saves more. Tap any store to see its list line by line.

COMPARE PRICES PER UNIT
Package sizes differ from store to store, so every price comes with its unit price. When sizes differ, DealLens ranks by price per ounce or per count and tells you so. Store brands are included as similar items, under their real names.

THE PRICE YOU WOULD PAY
Enter your ZIP code to price from your own stores and add estimated sales tax. Tell DealLens whether you belong to a warehouse club, and member-only prices count only when they apply to you. Tap any price to see the item, shipping and tax that make it up.

SEARCH, SCAN OR JUST ASK
Search by name, scan a barcode with the camera, or ask in plain English, such as "eggs under $4". You can see and edit how your question was understood.

PRICE ALERTS
Set a target price on any product and get a notification when it drops to that price or below.

PRIVATE BY DESIGN
No account, no email, no ads. Activity is tied to an anonymous ID created on your phone. Your profile shows everything the app has learned about how you shop. You can pause learning at any time, or delete your data from the server with one tap.

DealLens is not affiliated with the stores it compares. Prices, availability and tax are estimates; the store's own price at checkout is what you pay.
```

**TODO:** the last paragraph must match the final legal copy (`src/content/legal.ts`), including
whether retailer links earn a commission.

## What's New (version 1.0.0)

<!-- limit: App Store · What's New · 4000 -->
```text
First release.
```

## Age rating questionnaire

Apple's current questionnaire (ratings 4+, 9+, 13+, 16+, 18+). Expected result: **4+**.

| Question | Answer | Why |
| --- | --- | --- |
| Cartoon or fantasy violence | None | |
| Realistic violence | None | |
| Prolonged graphic or sadistic realistic violence | None | |
| Profanity or crude humor | None | |
| Mature or suggestive themes | None | |
| Horror or fear themes | None | |
| Medical or treatment information | None | |
| Alcohol, tobacco or drug use or references | None | **TODO:** if the real catalog includes beer, wine or tobacco products, answer "Infrequent" (the demo catalog is groceries only). |
| Simulated gambling | None | |
| Sexual content or nudity | None | |
| Graphic sexual content and nudity | None | |
| Contests | No | |
| Gambling (real money) | No | |
| Unrestricted web access | No | Retailer links open a specific retailer page in the system browser sheet; the app has no general-purpose browser. |
| User-generated content shared with other users | No | Searches and questions are never shown to other people. |
| Messaging or chat between users | No | |
| Advertising | No | |
| Parental controls / age assurance | No | |
| Made for Kids | No | |

## App Review information

| Field | Value |
| --- | --- |
| Sign-in required | No. Do not fill in demo account fields. |
| Contact | **TODO:** owner's name, phone, email. |
| Attachment | Optional. A short screen recording of the barcode scan and the list totals helps. |

### Review notes

<!-- limit: App Store · Review notes · 4000 -->
```text
No account or sign-in is needed. Everything works from first launch.

TODO (remove this line before submitting): replace the next paragraph once real prices are live. Do not submit while the app shows demo data.
Prices in this build come from [TODO: data source]. Prices are labelled with their source and time.

HOW TO TEST
1. First launch: tap Get started, enter ZIP code 10001, tap Find my stores, keep the preselected stores, then answer the membership question (or tap Skip at the top to skip setup).
2. Search: type "milk" and press Enter. Each product shows its best total and unit price. Open a product to compare stores; tap a price to see item, shipping and estimated tax.
3. Shopping list: on the List tab, type "eggs" and tap Add, or tap a suggestion. On a product, tap Add to list. The list shows a total per store and, when cheaper, a two-store split.
4. Barcode: tap the barcode button in the search field, allow the camera, and scan a grocery barcode. Or tap "Type the code instead" and enter [TODO: a barcode from the live catalog].
5. Ask: tap the sparkle button and ask "eggs under $4". The result says whether it was read by Claude (AI) or by simple rules, and the reading can be edited.
6. Price alerts: on a product, tap Alert me and enter a target below the current price. The app explains notifications before iOS asks for permission. Alerts are listed under Saved > Alerts.
7. Privacy controls: the Profile tab lists what is collected, has a switch to pause learning, and "Delete my data", which erases this device's data on the server.

PERMISSIONS
Camera: only for barcode scanning, requested when the user opens the scanner and taps Allow camera. No photos or video are stored or uploaded.
Notifications: only for price alerts, requested the first time the user creates an alert, after an in-app explanation.

AI
On the server, Anthropic's Claude may interpret plain-English questions and summarize in-app shopping activity, tied only to an anonymous ID. This is disclosed on the Profile tab. TODO: describe the in-app consent step (see note below) and whether Claude is enabled in production.

The app has no ads, no tracking, no in-app purchases and no user accounts.
```

**Notes for the owner, not for Apple:**

- **TODO (blocking): third-party AI consent.** App Review guideline 5.1.2(i) requires apps to
  disclose where personal data is shared with third parties, including third-party AI, and to get
  the user's explicit permission before sharing it. Today the app discloses Claude on the Profile
  tab and lets the user pause learning, but learning is on by default and there is no explicit
  "allow" step before activity or questions reach Claude. Either add an explicit opt-in (for
  example in onboarding and before the first Ask) or run production without a Claude key, then
  update this note.
- **TODO:** the review server must be the production server (`EXPO_PUBLIC_API_URL` in the
  `production` profile of `eas.json`), online, over HTTPS, during review.
- **TODO:** a barcode the reviewer can type that exists in the live catalog.
- Price alerts cannot be shown firing during review unless a price actually drops. Say so if the
  reviewer asks; the alert list and the permission flow can be reviewed without it.
