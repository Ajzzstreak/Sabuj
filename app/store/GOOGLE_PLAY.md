# Google Play Console: listing draft

Status: DRAFT. Not submitted. No Google Play developer account yet (one-time USD 25 fee, plus
identity verification).

**TODO (timeline):** a new *personal* developer account must run a closed test with at least 12
testers opted in for 14 consecutive days before it can apply for production access. Verify the
current numbers in the Play Console when the account is created. An *organization* account is
exempt but needs a D-U-N-S number.

## App details

| Field | Value |
| --- | --- |
| Package name | `com.deallens.app` (from `app.identity.json`). **TODO:** final value before the first upload; it can never change. |
| Default language | English (United States), en-US |
| App or game | App |
| Free or paid | Free |
| Category | Shopping |
| Tags | Shopping list, Price comparison, Groceries (choose the closest from Play's list) |
| Contact email | **TODO:** required and shown publicly. |
| Website | **TODO:** marketing URL, see `URLS_AND_SCREENSHOTS.md`. |
| Countries | United States only. |

## App name

<!-- limit: Google Play · App name · 30 -->
```text
DealLens: Grocery Price Finder
```

## Short description

<!-- limit: Google Play · Short description · 80 -->
```text
See what your grocery list costs at each store near you, per unit and with tax.
```

## Full description

Play does not allow keyword lists, ALL-CAPS emphasis for promotion, or claims such as "#1" or
"best app". Retailer names are avoided here for the same reason as on the App Store.
**TODO:** same demo-data caveat as the App Store copy: do not publish to production while prices
are demo data (internal or closed testing is fine).

<!-- limit: Google Play · Full description · 4000 -->
```text
DealLens prices your whole grocery list at the stores near you and shows where it costs least.

One list, every store
Add what you need: type it, tap a suggestion, or add a product from search. DealLens totals the list at each nearby store, highlights the cheapest single store, and shows when splitting the trip across two stores saves more. Tap any store to see its list line by line.

Compare prices per unit
Package sizes differ from store to store, so every price comes with its unit price. When sizes differ, DealLens ranks by price per ounce or per count and tells you so. Store brands are included as similar items, under their real names.

The price you would pay
Enter your ZIP code to price from your own stores and add estimated sales tax. Tell DealLens whether you belong to a warehouse club, and member-only prices count only when they apply to you. Tap any price to see the item, shipping and tax that make it up.

Search, scan or just ask
Search by name, scan a barcode with the camera, or ask in plain English, such as "eggs under $4". You can see and edit how your question was understood.

Price alerts
Set a target price on any product and get a notification when it drops to that price or below.

Private by design
No account, no email, no ads. Activity is tied to an anonymous ID created on your phone. Your profile shows everything the app has learned about how you shop. You can pause learning at any time, or delete your data from the server with one tap.

DealLens is not affiliated with the stores it compares. Prices, availability and tax are estimates; the store's own price at checkout is what you pay.
```

## Graphics

See `URLS_AND_SCREENSHOTS.md`: 512 x 512 icon, 1024 x 500 feature graphic, phone and tablet
screenshots.

## App content declarations (Policy > App content)

| Declaration | Answer |
| --- | --- |
| Privacy policy | **TODO:** public URL. Required. |
| Ads | No, the app contains no ads. |
| App access | All functionality is available without special access (no login). |
| Content rating | IARC questionnaire below. |
| Target audience and content | 18 and over. Not designed for children; not in the Families program. (Choosing under-13 age groups triggers the Families policy; do not.) |
| News app | No |
| COVID-19 contact tracing / status | No |
| Data safety | See `PRIVACY_ANSWERS.md`. |
| Government app | No |
| Financial features | None (the app does not handle payments, loans, crypto or banking). |
| Health | None |
| Advertising ID | The app does not use the Android advertising ID. **TODO:** confirm in the Play Console after the first upload that the merged manifest has no `AD_ID` permission (none of the current libraries add it). |
| Photo and video permissions | Not used: `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` are blocked in `app.config.js`. |
| Foreground service, exact alarm, full-screen intent | Not used. |

## Content rating (IARC questionnaire)

Category: **"All Other App Types"** (not a game, not social, not a browser). Expected result:
Everyone / PEGI 3 / USK 0.

| Question | Answer |
| --- | --- |
| Violence, blood, fear | No |
| Sexuality, nudity | No |
| Language (profanity) | No |
| Controlled substances (drugs, alcohol, tobacco) | No. **TODO:** revisit if the real catalog lists alcohol or tobacco products. |
| Gambling or simulated gambling | No |
| Users can interact or exchange content with each other | No |
| Shares the user's current physical location with other users | No |
| Allows purchase of digital goods | No |
| Unrestricted internet access (web browser, search engine) | No. Retailer links open one specific retailer page. |
| Is the app a "miscellaneous" or utility app with no rated content | Yes |

## Release notes (1.0.0)

<!-- limit: Google Play · Release notes · 500 -->
```text
First release.
```
