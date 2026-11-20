# Required URLs and screenshot shot-list

## URLs

All of these are **TODO**: they depend on the final name, a domain and where the site is hosted.
They must be live, public (no login) and stable before submission.

| URL | App Store | Google Play | Content |
| --- | --- | --- | --- |
| Privacy policy | Required (App information) | Required (App content › Privacy policy, and shown on the listing) | The final text of `src/content/legal.ts` › `privacy` and `data` (today every paragraph is `[DRAFT]`). Must name the operator, list the data in `PRIVACY_ANSWERS.md`, name Anthropic, Expo and the host as processors, give retention (180 days of inactivity), explain in-app deletion, and give a contact email. |
| Support | Required (Support URL, per version) | Contact email required; website optional | A page with a contact email (or form) and short answers: why prices are estimates, how to delete data, how to turn off notifications. |
| Marketing | Optional | Optional (Website) | Landing page. Can be the same site as support. |
| Terms | Optional (Apple's standard EULA applies if none) | Optional | `src/content/legal.ts` › `terms`, once final. |
| Data deletion | Not required | Not required (no accounts) | Recommended anyway: a section of the privacy policy explaining Profile › Delete my data and an email fallback. |

Suggested shape, once there is a domain: `https://<domain>/privacy`, `https://<domain>/support`,
`https://<domain>/`. The web build of the app (`npm run export:web`) is not a substitute: store
reviewers need plain pages that load without the API.

## Screenshot shot-list

Use demo-free data for the public listing (**TODO:** real prices). Capture in light mode, with the
status bar clean (full battery, no carrier clutter: use a simulator or Android's demo mode). Same
ZIP (for example 10001) across all shots so totals are consistent. No device frames are required.

### Shots (same order on both stores)

| # | Screen | Set-up | Caption idea (optional overlay text) |
| --- | --- | --- | --- |
| 1 | List tab, store totals | 8 to 10 staples on the list, ZIP set, three stores chosen. Show the best-store card. | Your whole list, totaled at every store |
| 2 | List tab, "Split across two stores" | Same list; expand the split card / "What to buy where". | Split the trip when it saves more |
| 3 | Product detail, Compare prices | A product where sizes differ, showing unit prices and "Best value per oz". | Compare per ounce, not per package |
| 4 | Price breakdown sheet | Tap a price: item, shipping, estimated tax, total. | The price you would actually pay |
| 5 | Search results | Search "eggs", sort by Lowest unit price. | Every store's price, side by side |
| 6 | Barcode scanner | Camera view pointed at a grocery barcode (a real device is needed for the camera). | Scan a barcode in the aisle |
| 7 | Ask results | "eggs under $4", showing the "understood as" chips. | Just ask, in plain English |
| 8 | Saved › Alerts | Two or three alerts, one triggered. | Get told when the price drops |
| 9 | Profile › Your controls / What is collected | Learning switch and Delete my data visible. | No account. Your data, your call. |
| 10 | Dark mode | Shot 1 again in dark mode (optional). | |

### App Store sizes

`supportsTablet` is `true`, so iPad screenshots are **required**.

| Display | Required | Accepted portrait sizes (px) | Capture on |
| --- | --- | --- | --- |
| iPhone 6.9" | Yes (or 6.5" instead) | 1320 x 2868, 1290 x 2796, 1260 x 2736 | iPhone 16/17 Pro Max simulator |
| iPhone 6.5" | Only if no 6.9" set | 1284 x 2778, 1242 x 2688 | iPhone 11 Pro Max / XS Max simulator |
| iPad 13" | Yes | 2064 x 2752, 2048 x 2732 | iPad Pro 13" (M4) or 12.9" simulator |

1 to 10 screenshots per size, PNG or JPEG, no transparency. App Store Connect scales these down
for smaller devices. Optional app preview videos: 15 to 30 seconds. **TODO:** re-check the accepted
sizes in App Store Connect › Screenshot specifications at submission time; Apple changes them with
new devices.

### Google Play sizes

| Asset | Required | Spec |
| --- | --- | --- |
| App icon | Yes | 512 x 512 PNG, 32-bit, up to 1 MB. Export from `assets/brand/generate-placeholder-assets.js` (render the icon SVG at 512) or downscale `assets/icon.png`. |
| Feature graphic | Yes | 1024 x 500 PNG or JPEG, no alpha. **TODO:** design (name + mark on the violet gradient). |
| Phone screenshots | Yes, 2 to 8 | PNG or JPEG, each side 320 to 3840 px, long side at most 2x the short side. 1080 x 1920 or 1080 x 2400 portrait works. At least 4 at 1080 px or larger make the app eligible for promotion. |
| 7" tablet screenshots | Recommended | Same rules; for example 1200 x 1920. |
| 10" tablet screenshots | Recommended | Same rules; for example 1600 x 2560 or 2560 x 1600. |

The app supports tablets (two-column layout from 700 px wide), so supply tablet shots or Play may
show it as "designed for phones".
