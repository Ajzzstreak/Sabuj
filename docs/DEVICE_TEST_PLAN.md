# Real-device test plan

A step-by-step checklist for testing the app on your own iPhone, iPad or Android phone. You do not
need to be a developer, but you will type a few commands into a terminal on your computer. Each test
says what should happen and what to write down if it does not.

"DealLens" is the working name. All prices are **demo data**: they are made up, labelled "Demo
prices" in the app, and do not change over time.

---

## Part 1. Which app to install on the phone

There are two ways to run the app on a phone.

| | Expo Go | Development build |
| --- | --- | --- |
| What it is | A free app from the App Store / Play Store that loads this project from your computer | This app built on its own (its own icon and name), installed from a link |
| Cost / accounts | None | Free Expo account. **iPhone: needs the paid Apple Developer Program (USD 99/year), which does not exist yet.** Android: no Google account needed. |
| Set-up effort | 10 minutes | A developer has to run the build once (about 20 minutes on Expo's servers) |
| Everything in Part 4 except the rows below | Works | Works |
| Push notifications (test 9b) on **Android** | **Does not work.** Expo Go on Android dropped remote notifications in SDK 53 (the app shows a warning in the developer log). | Works, once Firebase (FCM) credentials are uploaded to EAS (TODO for a developer) |
| Push notifications on **iPhone** | Works only after a developer runs `eas init` once (it creates the project id that push needs; see "TODO for a developer" below) | Works (needs the Apple account) |
| The app's own icon, name, splash screen and camera permission wording | Not testable: you see Expo Go's | Testable |

Every native module this app uses is the exact version bundled with Expo SDK 58 (checked against
`expo/bundledNativeModules.json`), so everything else runs in Expo Go: camera barcode scanning,
secure storage, haptics, notifications permission, offline detection.

**Start with Expo Go** on every device. Use a development build later for Android push and to check
the icon and splash screen.

### Install Expo Go

1. On the phone, open the App Store (iPhone/iPad) or Play Store (Android).
2. Search for **Expo Go** (publisher: 650 Industries / Expo) and install it.
3. Open it once. It must support **SDK 58**: in Expo Go, open Settings (or the profile tab) and check
   the "Supported SDK" line. If it says something else, update Expo Go from the store.

---

## Part 2. Run the server on your computer

You need the computer and the phone on the **same Wi-Fi network**. Guest networks and some office
or hotel Wi-Fi block devices from seeing each other; use a home network or your phone's hotspot
(computer joins the phone's hotspot).

1. Install **Node.js 22 or newer** from nodejs.org (the LTS button). Check in a terminal:
   `node --version` should print `v22` or higher.
2. Open a terminal in the project folder (the folder that contains `app/` and `server/`).
3. Start the server:

   ```bash
   cd server
   npm install
   npm run dev
   ```

   Leave this terminal open. It should print that it is listening on port 8787. Without a Claude
   key (normal for now) the "Ask" feature uses simple rules instead of AI. That is expected.
4. Find your computer's address on the Wi-Fi (the **LAN IP**, looks like `192.168.1.23` or
   `10.0.0.5`):
   - **Mac:** System Settings › Wi-Fi › Details (next to the network name) › IP address. Or run
     `ipconfig getifaddr en0` in a terminal.
   - **Windows:** run `ipconfig` and read "IPv4 Address" under your Wi-Fi adapter.
5. Check the phone can reach the server: on the phone, open Safari or Chrome and go to
   `http://<LAN IP>:8787/v1/health` (for example `http://192.168.1.23:8787/v1/health`).
   You should see `{"ok":true}`.
   - If it does not load: the computer's firewall is blocking it. Mac: System Settings › Network ›
     Firewall: allow incoming connections for "node". Windows: allow Node.js on **Private**
     networks when Windows asks, or in Windows Defender Firewall › Allow an app.

## Part 3. Run the app and open it on the phone

1. Open a **second** terminal in the project folder.
2. Start the app, putting your LAN IP in the address:

   ```bash
   cd app
   npm install
   EXPO_PUBLIC_API_URL=http://192.168.1.23:8787 npx expo start --clear
   ```

   On **Windows (PowerShell)** use instead:

   ```powershell
   cd app
   npm install
   $env:EXPO_PUBLIC_API_URL="http://192.168.1.23:8787"; npx expo start --clear
   ```

   Or put the line `EXPO_PUBLIC_API_URL=http://192.168.1.23:8787` in a file called `app/.env`
   (copy `app/.env.example`) and just run `npx expo start --clear`.
   The address is read when the app is bundled: **if you change it, stop with Ctrl+C and start again
   with `--clear`.** If your computer's LAN IP changes (new network, restart), update it.
3. A QR code appears in the terminal.
   - **iPhone/iPad:** open the normal Camera app, point it at the QR code, tap the banner. It opens in
     Expo Go.
   - **Android:** open Expo Go and tap "Scan QR code".
4. The first load takes up to a minute. If it says "Could not connect to the development server",
   the phone cannot see the computer: check Part 2 step 5 and the firewall (this time port 8081),
   or run `npx expo start --tunnel` instead (slower, works across networks; it may ask to install a
   helper package, answer yes).

To start completely fresh (to see the first-run screens again), erase Expo Go's data: on iPhone,
delete Expo Go and reinstall it; on Android, Settings › Apps › Expo Go › Storage › Clear storage.
Profile › Delete my data (test 11) resets the ZIP code, stores and memberships but does not show
onboarding again.

---

## Part 4. Test script

Do the tests in order on your main phone. For each, tick it or write down what went wrong using the
template at the end. Where it says "screenshot", take one (iPhone: side button + volume up; Android:
power + volume down).

Useful facts:

- Demo ZIP code: **10001** (any valid 5-digit US ZIP works and gives demo stores).
- Demo barcodes that exist in the demo catalog (type them in test 8):
  **002618482056** (Great Value Whole Milk, 1 gal) and **075660185343** (Horizon Organic Whole
  Milk, 64 fl oz). These are not real product barcodes; real grocery barcodes are not in the demo
  catalog.

### 1. First launch and onboarding

1. Open the app for the first time.
   - **Expected:** the splash screen, then a full-screen welcome: "Your grocery list, totaled at
     every store." with example totals for Kroger, Walmart, Target, a "Skip" button at the top and
     "Get started" at the bottom. Dots show the step.
2. Tap **Get started**.
   - **Expected:** "Where do you shop?" with a ZIP code field and "Find my stores".
3. Type `123` and tap **Find my stores**.
   - **Expected:** the error "Enter a 5-digit ZIP code." Letters cannot be typed.
4. Clear it, type `10001`, tap **Find my stores**.
   - **Expected:** "Your stores", a short loading state, then stores grouped by chain with the
     nearest of each already selected. Names end in "(demo)".
5. Change one store, then tap **Use these stores**.
   - **Expected:** "Any warehouse memberships?" with Costco and Sam's Club. The main button reads "I
     have neither" until you pick one, then "Done".
6. Pick one membership and tap **Done**.
   - **Expected:** onboarding closes and the Search tab shows. There is a "Demo prices" notice
     somewhere on price screens.
7. Check **Back** works on each step and the Android system back gesture goes back a step rather
   than closing the app.

- **If it fails, report:** which step, what you typed, what you saw (screenshot), and whether the
  server terminal printed an error.

### 2. Shopping settings (edit later, skip path)

1. Go to **Profile** › Shopping settings.
   - **Expected:** ZIP code 10001, "Your stores" showing how many were chosen, memberships showing
     "Answered" and your choice.
2. Tap the ZIP code, change it to `90210`, tap **Save**.
   - **Expected:** a confirmation toast; stores reset to the nearest for the new ZIP; prices on
     Search refresh.
3. Tap **I have neither** for memberships, then **Clear my answer**.
   - **Expected:** the badge changes to "Answered: none", then "Not answered", each with an
     explanation of what it changes.
4. Tap the ZIP code and tap **Remove**.
   - **Expected:** toast "ZIP code removed. Prices are now national estimates." and the Search tab
     shows "These are national estimates". Set it back to 10001 afterwards.

- **If it fails, report:** the setting, the value, what changed (or did not) on which screen.

### 3. Search and results

1. On **Search**, tap the search field and type `mi` slowly.
   - **Expected:** suggestions appear under the field while typing, without lag or flicker.
2. Type `milk` and press Enter / Search on the keyboard.
   - **Expected:** a results list in about a second, each product with its best price, store and
     unit price. A "Demo prices" notice.
3. Try each sort: **Best match**, **Lowest price**, **Lowest unit price**, **Top rated**, and the
   **In stock** filter and store filters.
   - **Expected:** the order changes immediately; "Nothing matches these filters" with "Clear
     filters" if you filter everything out.
4. Search for nonsense, such as `zzzzqq`.
   - **Expected:** "No results for "zzzzqq"" with an "Ask in plain English" button.
5. Go back to Search home.
   - **Expected:** your recent searches are listed under "Recent", with "Clear".

- **If it fails, report:** the search words, which sort/filter, screenshot of the result.

### 4. Unit prices and "best value"

1. Search `milk`, open a product whose stores sell different sizes (for example the Horizon 64 fl oz).
   - **Expected:** every store row shows a unit price (such as "$0.09 / fl oz") under the price.
     When sizes differ, the top offer says **"Best value per fl oz"** (not "Best price"), and the
     card says what the lowest shelf price is if that is a different store.
2. Look for a row labelled **"Similar item"**.
   - **Expected:** it is a store's own brand, shown with its real product name.
3. If you answered memberships as "neither": a Costco / Sam's Club row is dimmed and labelled
   "Membership required", and is never marked best.

- **If it fails, report:** product name, the store row, the numbers shown, screenshot.

### 5. Product detail

1. Open any product.
   - **Expected:** title, image, "Compare prices" with every store, "Price history" chart,
     "Highlights", "About this product". Smooth scrolling.
2. Tap a **price**.
   - **Expected:** a "Price breakdown" sheet: Item, Shipping, Estimated tax, Total, and a "Go to
     <store>" button. Swipe down or tap outside to close.
3. Tap **Go to <store>** (or a store row's button).
   - **Expected:** the store's web page opens in an in-app browser sheet; closing it returns to the
     product. (Demo links may land on a generic retailer page.)
4. Tap the **save** (bookmark) button.
   - **Expected:** it fills in; the product appears on **Saved** › Saved.
5. Tap **How we rank offers**.
   - **Expected:** an explanation page opens.

- **If it fails, report:** product name, the button, screenshot.

### 6. Shopping list: add items three ways

1. Go to the **List** tab. If empty: "Your list is empty" with starter chips (milk, eggs, bread,
   bananas, chicken breast, rice).
2. **Way 1, chip:** tap the **eggs** chip.
   - **Expected:** "eggs" is added to the list.
3. **Way 2, typing:** in "Quick add", type `bread` and tap **Add** (or press Enter). Then type
   `eggs` again and add it.
   - **Expected:** bread is added. The second "eggs" shows a toast that it was already on the list
     and the quantity goes up to 2.
4. **Way 3, from a product:** search `butter`, tap **Add to list** on a result (or open a product
   and use the big **Add to list** button). Also try the small **+** on a product card on the
   Search home.
   - **Expected:** toast "Added to your list", and the button turns into a quantity control.
5. Back on **List**: change a quantity with + / −, tick an item as bought, then clear checked items.
   Remove an item and tap **Undo** in the toast.
   - **Expected:** each works; undo puts the item back in the same place.
6. On a typed item (such as "bread"), tap **Change** and choose a specific product.
   - **Expected:** the item now shows that product's name, with a toast saying so.

- **If it fails, report:** which way of adding, item name, what the list showed.

### 7. List totals and two-store split

1. With 5 or more items on the list, tap **Store totals** (on phones it is a switch at the top).
   - **Expected:** within a second or two, a card per store with its total, how many items it
     covers and any missing items. The cheapest is marked **"Best single store"**. While you edit the
     list, the old totals stay on screen and update shortly after.
2. Look for **"Split across two stores"**.
   - **Expected:** if splitting saves money it shows "Save $X" and "What to buy where" lists which
     items to buy at which store. If not, the card is absent (also correct).
3. Tap **See items** on a store.
   - **Expected:** a line-by-line list for that store with each item's price.
4. Remove the ZIP code (test 2 step 4) and come back.
   - **Expected:** a note "National estimates without tax…". Put the ZIP back.

- **If it fails, report:** the items on the list, the totals shown, screenshot of both panels.

### 8. Barcode scanning with the camera

Have a real grocery item with a barcode (cereal box, can, bottle).

1. On **Search**, tap the **barcode** button inside the search field.
   - **Expected:** "Scan a barcode" opens with an explanation and an **Allow camera** button. The
     system camera prompt has **not** appeared yet.
2. Tap **Allow camera**, then allow in the system prompt.
   - **Expected:** the live camera view. In Expo Go the prompt text is Expo Go's; in a development
     build it reads: "DealLens uses the camera only to scan product barcodes, so it can look up
     prices. No photos or video are saved."
3. Point it at the real product's barcode, about 15 cm (6 in) away. Try the **light** button in a
   dark spot.
   - **Expected:** it reads the code within about 2 seconds, with a vibration. Because the demo
     catalog has no real products, it then says **"We don't know that barcode"** with "Search by
     typing" and "Scan another". That is the correct result for now: the test is that the camera
     read the code.
4. Tap **Type the code instead**, type `002618482056`, tap **Look up**.
   - **Expected:** Great Value Whole Milk opens.
5. Type `002618482057` (last digit wrong).
   - **Expected:** an error that the last digit does not match.
6. Deny camera access (Settings › Expo Go (or the app) › Camera off), then open the scanner again.
   - **Expected:** an explanation with **Open Settings** and "Type the code instead". No crash.

- **If it fails, report:** phone model, the product and its barcode number (printed under the
  bars), how long you held it, lighting, what the screen said.

### 9. Price alerts and a push notification

**9a. Creating alerts (works everywhere)**

1. Open a product and tap **Alert me**.
   - **Expected:** a sheet with a target price already filled in a little under today's best total,
     and quick-target chips.
2. Enter a price **above** the current best and save.
   - **Expected:** an error: "That is not below the current best total ($X)."
3. Enter a lower price and save.
   - **Expected (first alert only):** an in-app explanation of notifications first, with a choice
     to allow or skip. Choosing allow shows the system notification prompt. Then a toast: "Alert
     set. We'll notify you at $X." (or "…Check Saved › Alerts." if push is not available).
4. Go to **Saved** › **Alerts**.
   - **Expected:** the alert is listed. Delete it with the delete button: toast "Alert deleted."

Demo prices never change, so an alert will not trigger by itself during testing.

**9b. Receiving a push notification (iPhone in Expo Go after `eas init`, or Android development
build).** A developer's help is easiest here.

1. Allow notifications (step 3 above) and create an alert.
2. On the computer, in the `server` folder, print the phone's push token:

   ```bash
   node -e "const D=require('better-sqlite3');console.log(new D('data/deallens.db').prepare('select push_token from devices where push_token is not null').all())"
   ```

   It looks like `ExponentPushToken[xxxxxxxxxxxx]`. If nothing prints, the app did not get a token
   (see the table in Part 1).
3. Open **https://expo.dev/notifications** in a browser. Paste the token, set Title "Price drop",
   Body "Test alert", and in Data (JSON) put `{"productId":"great-value-whole-milk-1-gal"}`.
   Send.
4. With the app in the **background** (go to the home screen):
   - **Expected:** a notification arrives within a few seconds. Tapping it opens the app on Great
     Value Whole Milk.
5. Repeat with the app fully closed (swiped away).
   - **Expected:** same; the app starts and opens the product.
6. Android: long-press the notification › settings.
   - **Expected:** the channel is called "Price alerts".

- **If it fails, report:** iPhone or Android, Expo Go or development build, whether a token printed
  in step 2, what the expo.dev tool said after Send, and app state (open, background, closed).

### 10. Ask in plain English

1. On **Search**, tap the **sparkle** button (or an example under "Ask in plain English"), and ask
   `eggs under $4`.
   - **Expected:** a loading skeleton, then results within a few seconds. An "Understood as" area
     shows chips (such as "eggs", "under $4") and a label **"Read by simple rules"** (without a
     Claude key) or **"Read by Claude (AI)"**.
2. Tap **Edit what was understood**, change the price to 6, **Show results**.
   - **Expected:** results update; label "Edited by you"; "Back to the original reading" undoes it.
3. Ask something impossible, such as `organic eggs under $0.10`.
   - **Expected:** "Nothing fits that" with suggestions.
4. Press Enter in the normal search field with the same words.
   - **Expected:** this uses normal search, not Ask (results look like test 3).

- **If it fails, report:** exact question, how long it took, screenshot of the "Understood as" area.

### 11. Profile: what is learned, pause, delete

1. After using the app for a few minutes, open **Profile**. Pull down to refresh.
   - **Expected:** "What we noticed" and other sections fill in, "Actions used" counts up and
     "Waiting to send" drops to 0 within a few seconds. "What is collected" lists the data in plain
     words, including "How an AI model is involved". An **Anonymous ID** is shown at the bottom of
     that card; note its first characters.
2. Turn **Learn from my activity** off.
   - **Expected:** the text says "Paused. Nothing you do is recorded or sent…". Search for a few
     things, come back: "Waiting to send" stays 0 and "Actions used" does not grow. Turn it back on.
3. Tap **Delete my data**, then **Delete** in the confirmation ("Delete your data?").
   - **Expected:** "Deleted. You are starting fresh with a new anonymous ID." The Anonymous ID is
     different. The List, Saved items, recent searches, ZIP code, stores and memberships are empty;
     price alerts are gone. The learning switch keeps its position.
4. Turn on airplane mode and try **Delete my data** again.
   - **Expected:** an error in the dialog and **nothing** is cleared. Turn airplane mode off and it
     works.
5. Open each page under **About & legal** (Privacy policy, Terms, How we rank, Data we collect).
   - **Expected:** each opens; a DRAFT banner is expected for now.

- **If it fails, report:** which control, Anonymous ID before and after, what was or was not
  cleared.

### 12. Dark mode

1. Switch the phone to dark mode (iPhone: Control Centre, long-press brightness; Android: quick
   settings "Dark theme"). Return to the app without restarting it.
   - **Expected:** the app switches immediately. Go through Search, a product, List totals, Saved,
     Profile, the scanner and a sheet (price breakdown). All text readable, no white flashes, no
     black text on dark backgrounds, chart lines visible.
2. Switch back to light.

- **If it fails, report:** screen, element, screenshot in dark mode.

### 13. Large text (Dynamic Type / font size)

1. Set the largest text size: iPhone: Settings › Accessibility › Display & Text Size › Larger Text,
   turn on and drag to the right end; Android: Settings › Display › Font size (and Display size) to
   the largest.
2. Go through the same screens as test 12, plus onboarding (if you can reach it again) and the
   alert sheet.
   - **Expected:** text grows (it stops growing at 1.5x by design). Nothing is cut off with "…" where
     you need to read it, buttons stay tappable, prices do not overlap store names, and screens
     scroll to reveal everything.
3. Reset the text size.

- **If it fails, report:** text size setting, screen, what overlaps or is cut off, screenshot.

### 14. VoiceOver / TalkBack spot check

1. Turn on the screen reader: iPhone: Settings › Accessibility › VoiceOver (triple-click the side
   button to toggle once set up as the Accessibility Shortcut); Android: Settings › Accessibility ›
   TalkBack. Swipe right to move to the next item, double-tap to activate.
2. Check:
   - The four tabs are read as "Search", "List", "Saved", "Profile" with "selected" on the current
     one.
   - The barcode button is read as "Scan a barcode"; the sparkle as "Ask in plain English".
   - A product row reads the product, price and store in a sensible order.
   - A list item reads its name, quantity and whether it is checked; the + / − buttons say what they
     change.
   - Sheets (price breakdown, alert) can be closed with the screen reader (iPhone: two-finger
     scrub "Z" gesture; Android: back gesture).
   - The onboarding step dots are read as "Step 1 of 4".
3. Turn the screen reader off.

- **If it fails, report:** the element, what was read aloud (or "nothing"), and where focus went.

### 15. Offline behaviour

1. With results on screen, turn on airplane mode (Wi-Fi off too).
   - **Expected:** a dark pill "Offline — showing what was saved on this device" on the screen.
     Results already loaded stay visible.
2. Open a product you viewed before, then one you never opened.
   - **Expected:** the first shows from the cache; the second shows "You're offline. Reconnect to
     load this. Saved items still work."
3. Add an item to the list and save a product while offline.
   - **Expected:** both work locally. Store totals keep the last totals on screen or show an
     error with "Try again"; they must not show wrong numbers for the new list.
4. Fully close and reopen the app while still offline.
   - **Expected:** it opens (no endless splash screen) and shows the last results it had.
5. Turn airplane mode off.
   - **Expected:** the pill disappears; totals and pages refresh on their own within a few seconds;
     activity recorded while offline is sent ("Waiting to send" goes to 0 on Profile).

- **If it fails, report:** which screen, online or offline at the time, what was shown, whether a
  restart fixed it.

### 16. Tablet layout (iPad or Android tablet, if available)

1. Open the app on a tablet (Expo Go, same QR code) in portrait, then landscape.
   - **Expected:** the tab bar moves to the **top** with the app name; product results use **two
     columns** (three on very wide screens such as a 13" iPad in landscape); content does not
     stretch edge to edge. On the List tab, items and store totals may appear side by side on wide
     screens.
2. iPad: try Split View / Slide Over with another app.
   - **Expected:** the layout switches to the phone layout when narrow, without losing your place.
3. Rotate the phone too.
   - **Expected:** rotation works on phones and tablets without losing state.

- **If it fails, report:** device, orientation, window size (full screen or split), screenshot.

### 17. Development build only: icon, name and splash

Only once a development build exists (see "TODO for a developer").

1. Look at the home screen icon.
   - **Expected:** a violet square with a white price tag (a placeholder until the name is final),
     name "DealLens". On Android 13+, with themed icons turned on, a single-colour tag.
2. Launch it.
   - **Expected:** a short splash with the same violet tile in the centre, on an off-white
     background (or near-black in dark mode), then the app.
3. Android: create an alert and receive a push (9b).
   - **Expected:** a small white tag icon in the status bar, not a grey square.

---

## Bug report template

Copy one per problem.

```text
Title: <short: what went wrong, where>

Test number and step: <e.g. 8.3>
Device: <e.g. iPhone 13 mini, iOS 19.1 / Pixel 7, Android 16>
How the app was running: <Expo Go / development build>, app version shown in Expo Go if any
Network: <Wi-Fi / mobile data / offline>
Settings that matter: <dark mode, large text, screen reader, ZIP code, memberships>

What I did:
1.
2.
3.

What I expected:

What happened instead:

How often: <every time / sometimes (x of y tries) / once>
Screenshot or screen recording: <attached>
Server terminal output at the time (copy the last 20 lines, if any errors): 
```

---

## TODO for a developer (to unlock the remaining tests)

- `expo-dev-client` is not installed yet. Add it (`npx expo install expo-dev-client`) before the
  first `eas build --profile development`; the `development` profile in `app/eas.json` expects it.
- Run `npx eas-cli@latest init` with the project's Expo account, then copy the project id and owner
  into `app/app.identity.json` (`easProjectId`, `easOwner`; `app.config.js` reads them). Without
  the project id the app never asks Expo for a push token.
- Android push: create a Firebase project, add `google-services.json` to the app config
  (`android.googleServicesFile`) and upload the FCM V1 service account key with
  `npx eas-cli credentials`.
- Then `npm run eas:build:dev` (or `--platform android` only, since iPhone builds need the Apple
  account) and set `EXPO_PUBLIC_API_URL` in the `development` profile to the computer's LAN IP, or
  build with the shell variable set.
