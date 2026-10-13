# Pulse as an installed app (PWA)

Pulse installs as an app from the browser: on Android (Chrome) and iPhone/iPad (Safari, Add to Home Screen), and on
desktop. It can also be wrapped into an Android APK with PWABuilder. This guide covers what makes that work, how to
configure and rebrand it for your fork, how to test it, and what each platform will not do.

## What is in it

| Piece | Where | Notes |
|---|---|---|
| Manifest | `src/app/manifest.ts` | Name, `id`, scope, portrait, `dir`, `display_override`, shortcuts (Check in, Recovery, Sleep), screenshots, `launch_handler`. Open to signed-out visitors, so install works from `/login`. |
| App icons | `public/icons/icon-*.png`, `icon-maskable-*.png` | The mark only. `any` for browsers and desktop; `maskable` keeps the mark inside the 80% safe zone and is what Android uses for the home-screen icon **and** its launch screen. |
| Shortcut icons | `public/icons/shortcut-*.png` | Glyphs in deep brand tones on transparent: Android draws them on its own grey disc. |
| iOS launch screens | `public/splash/`, `src/app/launch-screens.json` | 92 images: every iPhone and iPad, portrait and landscape, light and dark, with the mark and the PULSE wordmark. Linked from `src/app/layout.tsx`. |
| Service worker | `public/sw.js` | Caches `/_next/static/*`, `/offline.html` and the last copy of each page this device opened (30 at most). Pages always come from the network; the copy is served only when the network is gone, else the offline page. Landing on `/login` (sign-out, an ended session) deletes every copy. Receives Web Push and keeps the app badge at the number of notifications in the tray. |
| Registration | `src/lib/sw.ts` (head script), `src/components/pwa/PwaRuntime.tsx` | Production builds only. The `<head>` script registers `/sw.js?v=<build id>` on load; `PwaRuntime` watches it for updates ("New version available · Reload") and turns a stale-build Server Action error into a reload prompt. |
| App lifecycle | `src/components/shells/AppLifecycle.tsx` | Signed-in screens: refresh after 5 min in the background, clear the app badge, send queued check-ins, pull down to sync. |
| Offline check-ins | `src/lib/offline-queue.ts` | Check-in answers saved offline stay in `localStorage` and are sent when the connection returns. |
| Offline banner | `src/components/metrics/ConnectionBanner.tsx` | Offline, every screen says so with the last sync time: the screen may be this device's stored copy. |
| Screen transitions | `src/components/shells/PageEnter.tsx` | The content column animates in on navigation: deeper slides from the right, back to the tab root from the left, another tab fades through. Header and nav stay still. Fade only under reduced motion. |
| Desktop title bar | `display_override` in the manifest, `--inset-top` in `src/app/globals.css` | Installed on desktop, the app draws into the title bar (Window Controls Overlay). Headers and the side rail clear the window controls with `--inset-top`, and dragging a header moves the window. |
| Install and notifications UI | Settings › App (`src/app/(app)/settings/AppSettings.tsx`), `src/lib/install.ts`, `src/lib/push-client.ts` | Install button where the browser offers one, the Share › Add to Home Screen steps on iOS, the notifications switch. |
| Push backend | `src/server/push.ts`, `src/app/push/route.ts` | "Recovery ready" once per local day, "Pulse can't sync" once per day when the Google grant is revoked. |
| Android app link | `src/app/.well-known/assetlinks.json/route.ts` | Digital Asset Links for an APK (see [Android APK](#android-apk-with-pwabuilder)). 404 until configured. |
| Touch details | `src/lib/haptics.ts`, `src/hooks/use-online.ts`, `src/components/ui/chart.tsx` | Haptics on key taps, online state, chart tooltips that let go after a touch. |

```mermaid
flowchart LR
  A[Open app] --> B{Network?}
  B -- yes --> C[Page from server]
  B -- no --> X{Copy of this page stored?}
  X -- yes --> Y[Stored copy + offline banner]
  X -- no --> D[sw.js serves offline.html]
  C --> E[head script registers /sw.js?v=build]
  E --> F{New build deployed?}
  F -- yes --> G[Toast: New version, Reload]
  G --> H[SKIP_WAITING, page reloads]
```

```mermaid
flowchart LR
  S[Worker sync finishes] --> R{Today's recovery new?}
  R -- yes --> P[notifyRecovery, once per local day]
  S --> E{Google grant revoked?}
  E -- yes --> Q[notifySyncProblem, once per day]
  P --> W[web-push]
  Q --> W
  W --> SW[sw.js push event: notification and badge]
  SW --> K[Tap opens the url]
```

## Navigation like an app

Back works like an app's navigation stack, not like a website's history of every URL:

- **Back** (the header chevron, Android's back gesture, iOS's edge swipe) pops to the screen this one was opened
  from: Strain › Steps › Back is Strain. When there is nothing to return to (opened from a shortcut, a notification
  or a shared link), Back replaces the screen with its parent instead (`useAppBack` in
  `src/components/shells/AppNavigation.tsx`, using the Navigation API).
- **Tabs don't stack.** From Home a tab opens on top of Home; from any other tab it replaces the screen, so Back from
  any tab returns Home and never walks through tabs (`useTabNavigate`).
- **Steps on the way don't stay.** Picking a chat in Chats pops Chats and replaces Coach with the chat, and a new
  chat replaces the open one: Back from a chat returns to wherever Coach was opened (`replaceUnder`).
- **Changes within a screen** (the day, a chart range, Settings sections) replace the URL and add no Back step.
  Sheets add one, so Back closes the sheet first.

```mermaid
flowchart LR
  H[Home] -- tap Strain --> S[Strain] -- tap Steps --> T[Steps]
  T -- Back --> S -- Back --> H
  H -- Health tab --> HE[Health] -- Journal tab: replaces --> J[Journal]
  J -- Back --> H
  C[Coach] -- history --> L[Chats] -- pick a chat: pop Chats, replace Coach --> CH[Chat]
  CH -- Back --> O[Where Coach was opened]
```

## Configure

All optional. Everything else works with no configuration.

| Variable | What it turns on |
|---|---|
| `APP_URL=https://…` | Required in practice: install, the service worker and push need HTTPS (or `localhost`). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications. Make the keys once with `npx web-push generate-vapid-keys`; the subject is `mailto:you@example.com`. Set all three or none. Changing the keys drops every existing subscription. Without them the switch in Settings is hidden. |
| `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` | Serves `/.well-known/assetlinks.json` for your APK. Set both or neither. |

## Rebrand it for your fork

Every asset is generated from a few sources, so a fork changes those and regenerates.

1. **Name and colours.** `src/app/manifest.ts` (`name`, `short_name`, `description`, `background_color`,
   `theme_color`) and `metadata` / `viewport` in `src/app/layout.tsx`. Keep the name short: Android prints it on its
   launch screen in the system font.
2. **Mark.** `src/app/icon.svg` is the favicon. The PNG icons draw the same two pills from coordinates in
   `scripts/gen-pwa-assets.py` (`mark()`), so change both together.
3. **Launch screen lockup.** `scripts/pwa/lockup-light.svg` and `lockup-dark.svg`: the mark over the wordmark, one
   per colour scheme.
4. **Shortcut glyphs.** `scripts/shortcuts/*.svg` (lucide icons) and their colours in `scripts/gen-pwa-assets.py`.
5. **Regenerate:** `pnpm pwa:assets`. It runs `scripts/gen-pwa-assets.py` (icons; needs Python with Pillow and
   `rsvg-convert` from `brew install librsvg`) and `scripts/gen-ios-splash.mjs` (iOS launch screens via
   [pwa-asset-generator](https://github.com/elegantapp/pwa-asset-generator) through `pnpm dlx`; it downloads a
   headless Chrome the first time).
6. **Bump `V`** in `src/app/manifest.ts`. Android and its install service cache icons by URL, so a new picture
   needs a new `?v=`.
7. **Screenshots.** `public/screenshots/*.webp` (shown in Chrome's install sheet) come from `docs/screenshots/`.
   Their declared `sizes` in the manifest must match the files.

## Test it

The service worker, the update toast and the offline page run only in a production build:

```sh
pnpm build && pnpm start   # http://localhost:3000
```

`pnpm dev` covers everything else (manifest, install UI, launch screens, layout).

**On a phone.** A plain `http://192.168.x.x` address is not a secure origin, so Chrome refuses to install
("This app cannot be installed") and there is no service worker or push. Use one of:

- **Chrome flag** (Android): `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<your-ip>:3000`,
  enable and relaunch.
- **USB:** `adb reverse tcp:3000 tcp:3000`, then open `http://localhost:3000` on the phone.
- **Tunnel:** `cloudflared tunnel --url http://localhost:3000` gives an HTTPS URL (push works there too). Add its host
  to `DEV_ORIGINS` for the dev server.

**Simulators.**

- iOS Simulator: Safari can open `http://localhost:3000` directly. Add to Home Screen with "Open as Web App" on.
- Android Emulator: an image without the Play Store cannot make a real WebAPK. The app installs as a Chrome
  shortcut (a Chrome badge on the icon) with no shortcuts and the old-style splash, so test those on a real phone.

**After changing an icon or launch screen,** delete the installed app and add it again. iOS stores the launch
screen when the app is added (including which colour scheme), and Android bakes icons and shortcuts in at
install.

**Automated tests:**

- `src/app/manifest.test.ts`: the manifest's shape, and that every icon, shortcut icon and screenshot exists.
- `src/lib/offline-queue.test.ts`, `src/server/push.test.ts`, `src/server/config.test.ts`.
- `e2e/pwa.spec.ts`: everything is served without a session, the 92 launch screen links. The offline-page test runs
  only against a production build (`E2E_PROD=1 pnpm e2e`), and so does the stored-copy test (offline banner, cleared
  on sign-out).
- `src/components/shells/PageEnter.test.ts`: which screen change gets which motion.
- [PWABuilder's report card](https://www.pwabuilder.com/reportcard) is a good outside check of a deployed site.

## Android APK with PWABuilder

A PWABuilder APK is tied to one server. For one APK that connects to any Pulse server, see the native shell in
[mobile.md](mobile.md).

PWABuilder wraps the site in a Trusted Web Activity: an Android app that opens your Pulse full screen in Chrome.
The web app inside is the same deployed site, so code changes reach the APK with every deploy. Only a change to the
manifest, the icons or the package needs a new APK.

```mermaid
flowchart TD
  A[pwabuilder.com: enter your HTTPS URL] --> B[Package for stores › Android]
  B --> C[Package ID e.g. in.example.pulse<br/>signing key: new]
  C --> D[Download zip: .apk, .aab, signing.keystore,<br/>signing-key-info.txt, assetlinks.json]
  D --> E[Server .env: ANDROID_PACKAGE_NAME and<br/>ANDROID_CERT_SHA256 from assetlinks.json]
  E --> F[Deploy, then check<br/>/.well-known/assetlinks.json]
  F --> G[Install the .apk on the phone]
  G --> H{URL bar at the top?}
  H -- no --> I[Done]
  H -- yes --> J[Package name or fingerprint does not match]
```

1. Deploy the site with HTTPS, then open `https://www.pwabuilder.com`, enter its URL and choose **Package for
   stores › Android**.
2. Pick a package ID (reverse domain, e.g. `in.example.pulse`). Let PWABuilder create a new signing key.
3. Download the zip. It holds the `.apk` (install directly), the `.aab` (only for Google Play), the
   `signing.keystore` with its passwords in `signing-key-info.txt`, and an `assetlinks.json`.
4. In the server's `.env`, set:

   ```sh
   ANDROID_PACKAGE_NAME=in.example.pulse
   ANDROID_CERT_SHA256=AB:CD:...   # sha256_cert_fingerprints from the zip's assetlinks.json; comma-separate several
   ```

   Deploy, then check that `https://<your-host>/.well-known/assetlinks.json` shows them.
5. Copy the `.apk` to the phone and open it (allow installs from that source). Uninstall the browser-installed PWA
   first, or you will have two icons.
6. **Keep `signing.keystore` and its passwords safe and out of the repo.** An update to the APK must be signed with
   the same key. If the key is lost, users must uninstall and reinstall.

If the app opens with a URL bar, Android could not verify the link. The package name or the fingerprint does not
match what the server serves, or the server is not serving it yet. Google Play re-signs apps, so a Play build adds
Play's app signing fingerprint to `ANDROID_CERT_SHA256` as well.

## What each platform does

| | Android (Chrome) | iPhone / iPad (Safari) |
|---|---|---|
| Install | Install prompt; Settings › App has the button | Share › Add to Home Screen ("Open as Web App" on) |
| Launch screen | Built from the maskable icon and `background_color`; no text | `public/splash` image for the exact device, in the system colour scheme at the time it was added |
| Long-press shortcuts | Yes (manifest `shortcuts`) | No: Safari ignores them; the menu offers only Edit Home Screen, Share and Delete |
| Push notifications | Yes | Only from the Home Screen app, iOS 16.4+ |
| App badge | Yes | Yes |
| Offline page | Yes | Yes |

## Decisions and dead ends

- **No View Transitions for routes.** React View Transitions snapshot the page, and the glass nav and headers
  (`backdrop-filter`) flickered on every route change. Screen transitions animate only the content column instead,
  with the Web Animations API (`PageEnter`), so the header and nav are never snapshotted. The cost: the old screen
  does not slide out, it is replaced and the new one slides in. When a skeleton hands over to the content mid-slide,
  the content continues the same slide from where the skeleton was.
- **An installed iPhone app's page is at least the screen's height** (`IOS_APP_HEIGHT_SCRIPT` in `src/app/layout.tsx`).
  iOS gives a Home Screen app a viewport short by the status bar (812 of 874 pt on an iPhone 17) while the page is no
  taller than that, and paints nothing below it, so a one-screen page like Coach lost its bottom 62 pt. Measured in the
  iOS 26.5 simulator: 812 with a one-screen page, 874 once the page is the screen's height. `100vh` and `100lvh` both
  resolve to 812 there, so it is set from `screen` in a head script, only when `navigator.standalone`.
- **Keyboard and Coach.** Android Chrome: `interactive-widget=resizes-content` in the viewport, so the keyboard shrinks
  the page and Coach's frame follows; the tab bar hides while a text field has focus. iOS ignores that, so
  `CoachViewport` sizes and moves the frame to the visual viewport. Coach locks the page behind it with
  `position: fixed` on the body, never `overflow: hidden`: on iOS that clips the frame with the page.
- **Icons carry no name.** On Android 12+ the launch screen is the home-screen icon, so a name on the launch screen
  means a name on the home screen too.
- **Pages are cached only as an offline fallback.** The network always wins, so scores are never stale while online.
  The copies are on this device only and are deleted on the way to `/login`, so the next person to sign in on a
  shared device never sees them. Only full page loads are stored (a launch, a reload); in-app navigations fetch RSC
  payloads, which are not stored, so offline the app shows the screen it opened on.
- **Coach actions live in the header.** A sticky in-page toolbar's resting position depended on the banners above it.

## Troubleshooting

- **Hydration mismatch in dev after many edits:** the dev server is serving stale compiled code. Restart
  `pnpm dev` (delete `.next` if it persists).
- **"Failed to fetch RSC payload … Load failed":** a request was cut off (a full reload, or the network resuming
  after the app was in the background). Next falls back to a full navigation; nothing is lost.
- **New icon or launch screen not showing:** reinstall the app, and check that `V` in `manifest.ts` was bumped.
- **`scripts/deploy.sh` says "nothing to do":** the checkout is already at `origin/main`; pass `--force` to rebuild.
