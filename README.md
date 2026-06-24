# Jua X

**Jua X** is a Kenya-focused super-app prototype that combines rides, laundry valet (Jua Fua), short-term stays (BNBs), long-term rentals, and city discovery in one mobile experience. The tagline on the splash screen is *"Powered by Jua Fua laundry and city services."*

This repository is a **working UI prototype**, not a production app. Booking, auth, messaging, and listings are largely client-side demos. The only live external integration today is **Mapbox** (maps, geocoding, routing).

---

## What the app does

Jua X targets travelers and residents in **Nairobi, Mombasa, Kisumu, and Nyamira**. After a splash screen and mock sign-up, users land on five main tabs:

| Tab | Purpose |
|-----|---------|
| **Home** | Four service modes — VALET (laundry), BNBS, RENTALS, RIDES — with map-backed bottom sheets, filters, and booking flows |
| **Explore** | Discovery map with lenses (hotels, markets, meetups, fashion, journal) and curated city content |
| **Trips** | Session history of confirmed rides and service requests |
| **Inbox** | Static demo messages (no real notifications) |
| **Me** | Hardcoded profile, Gold membership badge, light/dark theme toggle |

### Home services (intended capabilities)

- **VALET / Laundry** — Door-to-door pickup or drop-off at a nearby Jua Fua station; load sizing by kg or item count; KES pricing estimate; optional valet studio (mama fua at home, schedule, notes).
- **BNBS** — Short-term stay listings with galleries, amenities, 3D tour placeholder, county filters, and booking confirmation.
- **RENTALS** — Long-term housing catalog with proximity radius, listing detail pages, and viewing requests.
- **RIDES** — Destination search (Mapbox geocoding), route preview, fare estimate, ride tier selection, and ride planner extras (extra stop, luggage, meet & assist).

### Explore (intended capabilities)

- Interactive map with heat-style discovery signals (demo data, not live analytics).
- Filter by scope (nearby vs everywhere) and lens (discover, hotels, markets, meetups, fashion, journal).
- Journal articles that can fly the map to a "read here" location.
- In-app route preview to venues (WebView-based; not turn-by-turn navigation).

### Maps & location

- GPS via `expo-location` with county detection from coordinates and geocoding.
- Mapbox GL JS embedded in `react-native-webview` for interactive maps.
- Unified home map (`homeUnifiedMapHtml.ts`) switches VALET / BNBS / RENTALS without full WebView reload.
- Live route guidance is a **WebView preview**; production intent is Mapbox Navigation SDK or Google Navigation.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [Expo](https://expo.dev) SDK ~54 (managed workflow, New Architecture enabled) |
| UI | React 19.1 + React Native 0.81.5 |
| Language | TypeScript 5.9 (strict) |
| Fonts | Inter via `@expo-google-fonts/inter` |
| Location | `expo-location` (foreground permissions) |
| Maps | Mapbox Geocoding, Directions, Static Images, Mapbox GL JS v3.3.0 (CDN in WebView) |
| WebView | `react-native-webview` (map rendering + RN bridge) |
| Images | Unsplash URLs for listing/venue hero shots |
| Layout | `react-native-safe-area-context` |
| State | React `useState` / `useMemo` / `useCallback` — single monolithic `App.tsx` (~8,290 lines) |

### Not in use (yet)

No React Navigation, Redux/Zustand, AsyncStorage, backend API, database, payments (M-Pesa/Stripe), push notifications, analytics, crash reporting, or native navigation SDK.

### Project layout

```
juaxcodebase/
├── App.tsx                 # All UI, state, data, map HTML builders
├── homeUnifiedMapHtml.ts   # Unified Home map WebView document
├── index.ts                # Entry: SafeAreaProvider + registerRootComponent
├── app.json                # Expo config (still named my-expo-app)
├── package.json
└── tsconfig.json
```

---

## Development setup (new machine)

Follow this once on a fresh laptop or VM before you edit code. You do **not** need a global Expo install — `expo` is pulled in by `npm install` and run via the `npm` scripts below.

### What you need

| Tool | Version / notes |
|------|-----------------|
| **Node.js** | **20.19.4+** (required by Expo SDK 54 / React Native 0.81). Node 18 will warn or fail. |
| **npm** | 9+ (ships with Node) |
| **Git** | To clone the repo |
| **Mapbox token** | Free public token (`pk.…`) from [mapbox.com](https://account.mapbox.com/) |
| **Phone or emulator** | See [Run the app](#run-the-app) |

Optional: **Android Studio** (Linux/Windows emulator), **Cursor/VS Code** with the TypeScript extension.

> **Linux note:** iOS Simulator is macOS-only. On Ubuntu, use a physical device with Expo Go or an Android emulator.

### 1. Install Node.js 20

Check what you have:

```bash
node -v   # must be v20.19.4 or newer for this project
npm -v
```

If Node is missing or below 20, install via [nvm](https://github.com/nvm-sh/nvm) (recommended):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart your terminal, then:
nvm install 20
nvm use 20
node -v
```

On Ubuntu you can also use [NodeSource](https://github.com/nodesource/distributions) or the Node 20 package from your distro — just ensure `node -v` reports **≥ 20.19.4**.

You do **not** need `npm install -g expo-cli`. The project uses the local `expo` package from `node_modules`.

### 2. Clone and enter the project

```bash
git clone <your-repo-url> code_realm
cd code_realm/juaxcodebase
```

### 3. Install dependencies

```bash
npm install
```

This installs Expo SDK 54, React Native, TypeScript, fonts, WebView, location, and all other imports declared in `package.json`. First run may take a few minutes.

Verify the CLI is available locally:

```bash
npx expo --version
```

### 4. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your Mapbox **public** token:

```bash
EXPO_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_public_token_here
```

Restart the dev server after changing `.env` (Expo reads `EXPO_PUBLIC_*` at bundle time).

Without a token, maps use static fallbacks and destination search is disabled.

### 5. Local image files

`assets/` (app icons) should be in the repo. `template/` is **gitignored** and must exist on your machine or Metro crashes on `require()`.

Quick bootstrap if `template/` is missing:

```bash
mkdir -p template
cp assets/icon.png "template/Preview 4.png"
cp assets/icon.png "template/Preview 6.png"
```

| Path | Used for |
|------|----------|
| `assets/icon.png` | App icon, profile theme toggle |
| `assets/adaptive-icon.png` | Android adaptive icon |
| `assets/splash-icon.png` | Splash screen (`app.json`) |
| `assets/favicon.png` | Web favicon |
| `template/Preview 4.png` | Map fallback when no Mapbox token |
| `template/Preview 6.png` | Profile avatar |

### 6. Run the app

Start the Expo dev server (Metro bundler):

```bash
npm start
```

In the terminal UI:

| Key / action | Result |
|--------------|--------|
| **QR code** | Scan with **Expo Go** on your phone (same Wi‑Fi as the PC) |
| `a` | Open on Android emulator (requires Android Studio + emulator running) |
| `i` | Open on iOS Simulator (**macOS only**) |
| `w` | Open in the browser (`npm run web`) — maps/location are limited on web |

**Expo Go on a physical device (easiest path):**

1. Install [Expo Go](https://expo.dev/go) from the App Store or Play Store.
2. Ensure the phone and dev machine are on the **same network**.
3. Run `npm start` and scan the QR code.
4. Use a build of Expo Go that supports **SDK 54** (update the app if prompted).

**Android emulator (Linux/Windows):**

1. Install [Android Studio](https://developer.android.com/studio) → SDK Platform + a virtual device (AVD).
2. Start the emulator from Device Manager.
3. Confirm `adb devices` lists the emulator.
4. Run `npm start`, then press `a`, or run `npm run android`.

### 7. Verify everything works

```bash
# From juaxcodebase/
node -v                    # ≥ 20.19.4
npx expo --version         # local Expo CLI
npx tsc --noEmit           # TypeScript check (optional; no npm script yet)
npm start                  # dev server starts, QR code appears
```

In the app: Splash → **Experience Convenience** → **Sign Up** → Home tab loads with map (if Mapbox token is set).

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `EBADENGINE` / Node version warnings | Upgrade to Node **20.19.4+** (`nvm install 20 && nvm use 20`), delete `node_modules`, run `npm install` again |
| `Unable to resolve module` / missing `template/` | Create `template/` PNGs (step 5) |
| Maps blank, search fails | Set `EXPO_PUBLIC_MAPBOX_TOKEN` in `.env` and restart `npm start` |
| Phone can’t connect to dev server | Same Wi‑Fi; try `npx expo start --tunnel` (slower, works across networks) |
| Expo Go “SDK mismatch” | Update Expo Go on the device to match SDK 54 |
| `adb` not found (Android) | Install Android Studio platform-tools; add `~/Android/Sdk/platform-tools` to `PATH` |

### Demo flow

1. Splash → **Experience Convenience**
2. Sign-up screen → **Sign Up** (no real validation)
3. **Home** → switch VALET / BNBS / RENTALS / RIDES → configure options → **Confirm**
4. **Trips** tab shows the booking summary (in-memory only; lost on restart)

For production gaps and env var details, see **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**.

---

## Current maturity

| Area | Status |
|------|--------|
| UI / UX flows | High-fidelity prototype |
| Maps (with token) | Functional (geocode, route, interactive pins) |
| Auth | Mock (button sets `isAuthed = true`) |
| Data | Hardcoded arrays in `App.tsx` |
| Bookings / payments | Local state only |
| Persistence | None |
| Backend | None |
| Store deployment | Not configured (no `eas.json`) |

For environment variables, production roadmap, and a line-by-line gap analysis, see **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Start with Android |
| `npm run ios` | Start with iOS |
| `npm run web` | Start web build |

There are no `test`, `lint`, or `typecheck` scripts yet.

---

## License

Private (`package.json`: `"private": true`). No license file in the repository.
