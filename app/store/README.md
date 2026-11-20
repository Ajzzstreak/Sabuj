# Store submission drafts

Drafts for the App Store and Google Play listings. Nothing here has been submitted. There is no
Apple Developer or Google Play Console account yet.

| File | What it holds |
| --- | --- |
| `APP_STORE.md` | App Store Connect listing copy, category, age rating answers, review notes |
| `GOOGLE_PLAY.md` | Play Console listing copy, category, content rating answers, app content declarations |
| `PRIVACY_ANSWERS.md` | App Store privacy "nutrition label" and Google Play Data safety answers, derived from the code |
| `URLS_AND_SCREENSHOTS.md` | Required URLs and the screenshot shot-list with device sizes |
| `check-limits.js` | Counts every length-limited field in the files above and fails if one is over |

Every `TODO` must be resolved before submission. Most depend on things that are still undecided:
the product name, where the server is hosted, whether real prices replace the demo data, and
whether the server runs with a Claude API key.

## Checking the character limits

Each length-limited field is written as a `text` code block preceded by a marker comment such as
`<!-- limit: App Store · Subtitle · 30 -->`. After editing any copy, run from `app/`:

```bash
node store/check-limits.js
```

It prints each field's length (counted in Unicode characters, which is how both stores count) and
exits with an error if any field is over its limit.

## Name changes

The name appears in the copy below as **DealLens**, the working name. When the final name is chosen,
change `app.identity.json`, then search this folder for `DealLens` and rerun `check-limits.js`:
names change the lengths.
