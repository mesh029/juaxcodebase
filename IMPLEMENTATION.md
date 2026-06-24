# Jua X — Implementation & Production Readiness

This document describes how the app is built today, what is required to run the prototype, and what remains before Jua X can ship as a production product.

**Assessment date:** June 24, 2026  
**Codebase:** `/juaxcodebase` — 10 tracked source files, single commit (`init`)

---

## 1. Executive summary

Jua X is a **high-fidelity Expo/React Native prototype** for a Kenya multi-service lifestyle app (rides + Jua Fua laundry + BNBs + rentals + city explore). The product vision is clear in the UI; the engineering foundation is intentionally thin.

| Dimension | Rating | Notes |
|-----------|--------|-------|
| UI completeness | ~85% | Full tab flows, deep pages, themes, sheets, modals |
| Map integration | ~70% | Real Mapbox when token present; WebView preview for navigation |
| Data layer | ~5% | All listings, venues, inbox, profile are hardcoded |
| Auth | ~0% | Mock sign-up only |
| Backend | 0% | No API, DB, or persistence |
| Payments | 0% | No M-Pesa, card, or wallet |
| Deployment | ~10% | `app.json` only; no EAS, CI, or store metadata |
| **Overall production readiness** | **~15–20%** | Strong demo; not shippable without substantial backend and hardening |

**Prototype verdict:** Runnable today with `npm install`, a Mapbox token, and local placeholder images. Bookings work as in-session UI state only.

---

## 2. Environment variables

### 2.1 Currently used in code

Defined in `App.tsx` (line 226–227):

```typescript
const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
```

| Variable | Required | Where set | Purpose |
|----------|----------|-----------|---------|
| `EXPO_PUBLIC_MAPBOX_TOKEN` | **Yes** (for full maps) | `.env` at project root | Mapbox Geocoding, Directions, Static Images, GL JS in WebViews |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | No | `.env` (fallback only) | Same as above; non-idiomatic for Expo — use `EXPO_PUBLIC_*` |

**Behavior without token:**

- Home/explore maps show `template/Preview 4.png` fallback with a prompt to add token
- Reverse geocoding uses coordinate-based county labels only
- Destination search shows: *"Mapbox token is required for destination search."*
- Route distance/duration/fare remain empty

Copy `.env.example` → `.env` and add your public Mapbox token (`pk.` prefix).

Expo inlines `EXPO_PUBLIC_*` at bundle time. Restart the dev server after changing `.env`.

### 2.2 Not used today (recommended for production)

These do **not** appear in the codebase yet but will be needed for a real launch:

| Variable | Service | When needed |
|----------|---------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Your REST/GraphQL API | User auth, listings, bookings |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry | Crash reporting |
| `EXPO_PUBLIC_ANALYTICS_KEY` | Mixpanel / Amplitude / Firebase | Product analytics |
| `EXPO_PUBLIC_MPESA_*` or server-side payment secrets | M-Pesa Daraja | Kenya payments (**never** expose secrets in `EXPO_PUBLIC_*`) |
| `EXPO_PUBLIC_ONESIGNAL_APP_ID` or FCM config | Push notifications | Trip updates, laundry pickup alerts |
| `EXPO_PUBLIC_MATTERPORT_SDK_KEY` | 3D tours | BNB/rental virtual tours |
| Server-only: `MAPBOX_SECRET_TOKEN`, DB URLs, JWT secrets | Backend | Route matrix, admin, webhooks |

**Rule:** Only public, client-safe keys use the `EXPO_PUBLIC_` prefix. Payment and auth secrets belong on a backend.

---

## 3. Prototype setup checklist

Use this to get a **working demo ASAP**.

### Step 1 — Dependencies

```bash
cd juaxcodebase
npm install
```

### Step 2 — Environment

```bash
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_MAPBOX_TOKEN
```

### Step 3 — Local assets (blocker if missing)

Metro will error on `require()` if these paths are absent:

| File | Referenced in |
|------|---------------|
| `assets/icon.png` | `app.json`, `App.tsx` (profile settings) |
| `assets/adaptive-icon.png` | `app.json`, `App.tsx` (profile settings) |
| `assets/splash-icon.png` | `app.json` |
| `assets/favicon.png` | `app.json` |
| `template/Preview 4.png` | `App.tsx` — map fallback (3 locations) |
| `template/Preview 6.png` | `App.tsx` — profile avatar |

`template/` is gitignored (`.gitignore` line 39). `assets/` is referenced but not committed.

**Quick fix:** Create both directories and drop in any PNG files (1024×1024 for icons is fine).

### Step 4 — Run

```bash
npm start
```

### Step 5 — Verify prototype paths

| Flow | Expected result |
|------|-----------------|
| Splash → Sign Up | Enters main app (no validation) |
| Home → RIDES | Map loads (with token); search destination; see fare in **USD** (`$`) |
| Home → VALET | KES estimate; confirm → appears in Trips |
| Home → BNBS / RENTALS | Pins on unified map; listing detail; confirm booking |
| Explore | Map + lens filters; demo heat/touring numbers |
| Trips | Shows `tripFeed` entries until app restart |
| Profile | Shows "Mesh Traveler"; theme toggle works |
| Kill & reopen app | Trips cleared; back to splash (no persistence) |

### Known prototype quirks (not bugs — demo limitations)

- Sign-up phone placeholder shows `+880` (Bangladesh), not Kenya `+254`
- Ride fares use USD (`$`); laundry/rentals use KES
- `app.json` name is still `my-expo-app`; iOS permission text says "TripFlow"
- Explore "touring now" / "visited today" are illustrative, not live data

---

## 4. Architecture (as implemented)

```
┌─────────────────────────────────────────────────────────┐
│                     App.tsx (~8290 LOC)                  │
│  State (useState) │ Hardcoded data │ Map HTML builders   │
│  All screens      │ Booking logic  │ WebView onMessage   │
└────────────┬───────────────────────────────┬────────────┘
             │                               │
    ┌────────▼────────┐            ┌─────────▼──────────┐
    │ homeUnifiedMap  │            │ react-native-webview│
    │ Html.ts         │            │ (Mapbox GL JS 3.3)  │
    └────────┬────────┘            └─────────┬──────────┘
             │                               │
             └───────────────┬───────────────┘
                             │
              ┌──────────────▼──────────────┐
              │ Mapbox APIs (client-side)    │
              │ • Geocoding v5               │
              │ • Directions v5 (driving)    │
              │ • Static Images              │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │ expo-location (device GPS) │
              └────────────────────────────┘

External images: images.unsplash.com (no API key)
Backend: none
Persistence: none (React state only)
```

### Entry point

`index.ts` wraps `App` in `SafeAreaProvider` and calls `registerRootComponent`.

### Geographic model

- **Counties:** `nairobi`, `mombasa`, `kisumu`, `nyamira` (`SUPPORTED_COUNTIES`)
- County detection: coordinate proximity to county centers + Mapbox geocode text parsing
- Kenya bounding box used for map zoom heuristics (`isInKenya`)

### Hardcoded data inventory (`App.tsx`)

| Constant | Approx. count | Line ref |
|----------|---------------|----------|
| `DESTINATIONS` | 9 (incl. Paris, Dubai, Accra) | ~807 |
| `EXPLORE_ARTICLES` | ~10 journal pieces | ~897 |
| `EXPLORE_VENUES` | Many curated spots | ~1016 |
| `PICKUP_STATIONS` | 6 laundry stations | ~1239 |
| `HOUSE_LISTINGS` | 6 rentals | ~1295 |
| `BNB_LISTINGS` | 6 stays | ~1388 |
| `RIDE_OPTIONS` | 3 tiers | ~1233 |

### Booking model (current)

All "Confirm" actions append a string to `tripFeed` via `setTripFeed` and optionally set `bookingMessage`. No HTTP request, no payment, no ID generation, no push notification.

Example ride confirm (`App.tsx` ~3381–3394):

- Builds summary string from ride tier, destination, duration, planner extras
- Pushes to `tripFeed` (max 10 items)
- Sets phase to `confirmed`; does not call any API

---

## 5. Feature matrix: implemented vs mocked

### ✅ Implemented (client-side, functional)

| Feature | Evidence |
|---------|----------|
| Splash + mock auth gate | `renderSplash`, `renderSignIn`, `isAuthed` |
| 5-tab navigation | `MAIN_TAB_CONFIG`, custom tab bar |
| Light/dark themes | `LIGHT_THEME` / `DARK_THEME`, profile toggle |
| GPS + permissions | `fetchCurrentLocation`, `expo-location` |
| Mapbox geocoding | `fetch()` to `api.mapbox.com/geocoding/v5/...` |
| Mapbox directions | `fetchRouteEstimate` |
| Unified home map tab switching | `homeUnifiedMapHtml.ts`, `injectHomeMapSync` |
| WebView ↔ RN messaging | `onHomeMapWebViewMessage` |
| Service UIs (all four) | Home bottom sheets + deep pages |
| Explore lenses & journal | `renderExplore`, `ExploreLens` types |
| Listing catalog + detail | `homeDeepPage`: listings, listing-detail, valet-studio, rides-planner |
| Session trip history | `tripFeed` → Trips tab |
| 3D tour modal (placeholder) | Full-screen hero image + Matterport copy |
| Guided journey WebView | `buildGuidanceMapHtml`, `guidedJourney` state |

### ⚠️ Mocked / demo-only

| Feature | Current behavior | Production target |
|---------|------------------|-------------------|
| Authentication | Button sets `isAuthed(true)` | Phone/email OTP, OAuth, or M-Pesa-linked identity |
| User profile | "Mesh Traveler", `mesh@email.com`, Gold | API-driven profile, KYC, membership tiers |
| Inbox | 2 static cards | Real-time messaging, push, read state |
| Listings & venues | Hardcoded arrays | CMS or partner API, search indexing |
| Bookings | `tripFeed` in memory | Order service, status machine, webhooks |
| Payments | None | M-Pesa STK Push (+ optional card) |
| Ride fares | Client USD formula: `max(8, round((3.2 + km * 1.1) * multiplier))` | KES pricing, surge, driver payout, tax |
| Laundry pricing | KES 180/kg, 95/item (client only) | Server-validated quotes, promotions |
| Turn-by-turn nav | WebView + step text preview | Mapbox Navigation SDK or Google Navigation |
| 3D tours | Listing hero as stand-in | Matterport / Polycam embed |
| Explore analytics | Demo heat, touring, visits | POI provider or first-party analytics pipeline |
| Persistence | Lost on restart | AsyncStorage + secure token store + server sync |

---

## 6. Roadmap to production

Prioritized phases. Effort is approximate for a small team.

### Phase 0 — Prototype hardening (1–2 weeks)

**Goal:** Stable demo for stakeholders and investors.

- [ ] Add committed `assets/` (or generate via Expo defaults)
- [ ] Document/commit `template/` fallbacks or replace with programmatic placeholders
- [ ] Rename `my-expo-app` → `jua-x` in `package.json` and `app.json`
- [ ] Fix `+880` → `+254` on sign-up mock
- [ ] Align ride currency to KES in UI (even if still client-calculated)
- [ ] Add `typecheck` script: `"typecheck": "tsc --noEmit"`
- [ ] Add `.env.example` (done) and README quick start (done)

### Phase 1 — Foundation (4–8 weeks)

**Goal:** Real users, real data, persistent sessions.

- [ ] Split `App.tsx` into `src/screens`, `src/components`, `src/services`
- [ ] Introduce React Navigation (stack + tabs)
- [ ] Backend API (Node/Fastify, Supabase, or Firebase — team choice)
- [ ] Auth: phone OTP (Africa's Talking / Twilio) + JWT refresh tokens
- [ ] Secure storage: `expo-secure-store` for tokens
- [ ] Listings CRUD from API; retire hardcoded `BNB_LISTINGS` / `HOUSE_LISTINGS`
- [ ] Booking API: create order, status (`pending` → `confirmed` → `completed`)
- [ ] AsyncStorage or React Query cache for offline-first reads

### Phase 2 — Payments & operations (4–6 weeks)

**Goal:** Monetizable transactions in Kenya.

- [ ] M-Pesa Daraja integration (server-side STK Push; callback URLs)
- [ ] Ride: driver dispatch model (or partner integration)
- [ ] Laundry: pickup scheduling, station assignment, status SMS
- [ ] Admin dashboard for Jua Fua ops
- [ ] Push notifications (Expo Notifications + FCM/APNs)
- [ ] Error monitoring (Sentry)

### Phase 3 — Maps & navigation (2–4 weeks)

**Goal:** Production-grade location experience.

- [ ] Mapbox Navigation SDK (or Google Maps Navigation) replacing WebView guidance
- [ ] Server-side route validation and fare calculation
- [ ] Geofencing for pickup confirmation
- [ ] Rate limiting and token proxy for Mapbox (avoid exposing unlimited client usage)

### Phase 4 — Explore & content (3–5 weeks)

**Goal:** Live discovery, not demo heat maps.

- [ ] CMS for journal articles and venue listings
- [ ] Real analytics pipeline for footfall signals (or drop misleading metrics)
- [ ] Matterport/Polycam SDK for `has3dTour` listings
- [ ] Search across venues, stays, and articles

### Phase 5 — Ship (2–4 weeks)

**Goal:** App Store and Play Store release.

- [ ] EAS Build (`eas.json`) — development, preview, production profiles
- [ ] App icons, screenshots, privacy policy, terms of service
- [ ] iOS App Store + Google Play listings under **Jua X**
- [ ] CI/CD (GitHub Actions: lint, typecheck, EAS build on tag)
- [ ] Load testing on booking and payment endpoints
- [ ] Security review (OWASP mobile, PII handling, Kenya DPA compliance)

---

## 7. External services & API usage

### Mapbox (required for prototype maps)

| API | Endpoint pattern | Used for |
|-----|------------------|----------|
| Geocoding v5 | `/geocoding/v5/mapbox.places/{lng},{lat}.json` | Reverse geocode user location |
| Geocoding v5 | `/geocoding/v5/mapbox.places/{query}.json` | Destination search |
| Directions v5 | `/directions/v5/mapbox/driving/{coords}` | Route distance, duration, geometry |
| Static Images | Built URL in `mapPreviewUrl` | Ride map preview fallback |
| GL JS v3.3.0 | CDN in WebView HTML | Interactive maps |

**Cost note:** Client-side Mapbox calls bill to your token. Production should proxy sensitive or high-volume requests through a backend.

### Unsplash

All listing images use `https://images.unsplash.com/...` via the `IMG` constant (`App.tsx` ~781–799). No API key; suitable for demo only. Production needs licensed media or partner-supplied photos.

### Device permissions

From `app.json`:

- **iOS:** `NSLocationWhenInUseUsageDescription`
- **Android:** `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`

---

## 8. Deployment (current gaps)

| Item | Status |
|------|--------|
| `app.json` | Present — version `1.0.0`, `newArchEnabled: true` |
| `eas.json` | **Missing** — no EAS Build/Submit profiles |
| Native `ios/` / `android/` | Gitignored — Expo managed workflow |
| CI/CD | **None** |
| Store metadata | **None** |
| Privacy policy URL | **None** |

### Minimum EAS setup (future)

```bash
npx eas-cli build:configure
# eas.json with development, preview, production
eas build --platform android --profile preview
```

Signing credentials, bundle IDs (`com.juax.app` or similar), and Play/App Store accounts are not configured.

---

## 9. Technical debt & risks

| Risk | Severity | Detail |
|------|----------|--------|
| Monolithic `App.tsx` | High | ~8,290 lines — unmaintainable for a team; merge conflicts, no unit test seams |
| No tests | High | Zero test files or scripts |
| No persistence | High | Users lose all bookings on restart |
| Mock auth | Critical | Anyone can "sign up" with no identity |
| Client-only fares | Medium | Ride pricing in USD; trivial to manipulate |
| Misleading explore metrics | Medium | "Touring now" presented as live signal — legal/UX risk if shipped as-is |
| Missing assets in repo | Medium | Fresh clone fails without manual PNG setup |
| Mapbox token in client | Medium | Expected for GL JS; mitigate with URL restrictions and billing alerts |
| WebView maps | Medium | Performance and accessibility vs native Mapbox RN SDK |
| Generic Expo slug | Low | `my-expo-app` not branded |

---

## 10. Suggested target architecture (production)

```
┌──────────────┐     HTTPS      ┌─────────────────┐
│  Jua X App   │ ◄────────────► │  API Gateway    │
│  (Expo RN)   │    JWT         │  + Auth service │
└──────┬───────┘                └────────┬────────┘
       │                                 │
       │                          ┌──────▼──────┐
       │                          │  Services   │
       │                          │  • Rides    │
       │                          │  • Laundry  │
       │                          │  • Stays    │
       │                          │  • Explore  │
       │                          └──────┬──────┘
       │                                 │
       ▼                          ┌──────▼──────┐
 Mapbox (maps)                    │  PostgreSQL │
 M-Pesa (via server)              │  + Redis    │
 Push (FCM/APNs)                  └─────────────┘
```

---

## 11. Assessment verification — Pass 1 (initial audit)

Claims cross-checked against source files on June 24, 2026.

| Claim | Verified | Source |
|-------|----------|--------|
| Single env var in code | ✅ | `App.tsx:226-227` |
| No backend | ✅ | No `fetch` to proprietary URLs; only Mapbox + Unsplash |
| Mock auth | ✅ | `App.tsx:3256-3261` — `setIsAuthed(true)` on press |
| 4 home services | ✅ | `SERVICE_TABS:1286-1291` |
| 5 main tabs | ✅ | `MAIN_TAB_CONFIG:46-52` |
| 4 counties | ✅ | `SUPPORTED_COUNTIES:241` |
| tripFeed session-only | ✅ | `useState<string[]>([])` line 1526 |
| Laundry KES 180/kg | ✅ | `LAUNDRY_KES_PER_KG:300` |
| Ride fare USD | ✅ | `$${estimatedFare}` lines 3357, 3368 |
| Unified map module | ✅ | `homeUnifiedMapHtml.ts` exists, imported line 29 |
| 3D tour placeholder copy | ✅ | `App.tsx:5743-5745` |
| Navigation SDK deferred | ✅ | Comments lines 101, 580, 730, 1559 |
| assets/ missing from repo | ✅ | Glob search: 0 files under `assets/` |
| template/ gitignored | ✅ | `.gitignore:39` |
| Expo SDK 54 | ✅ | `package.json` `expo ~54.0.33` |
| No README before this doc | ✅ | No prior `README.md` in repo |

---

## 12. Assessment verification — Pass 2 (second iteration)

Re-read critical paths to catch overstatements or omissions.

### Corrections and refinements from Pass 2

1. **Package name mismatch** — Splash says "Jua X" but `package.json` and `app.json` use `my-expo-app`. Documented above; not a runtime bug but affects builds and store identity.

2. **Ride fare formula** — Confirmed: `Math.max(8, Math.round((3.2 + routeDistanceKm * 1.1) * selectedRide.multiplier))` (`App.tsx:1915-1918`). Base unit is dollars in UI, not KES.

3. **Booking persistence cap** — `tripFeed` slices to 10 items on confirm (e.g. line 3391), not unlimited.

4. **Recent searches** — `recentSearches` state exists (line 1513) and is updated in destination flow — small amount of session memory beyond `tripFeed`.

5. **Explore map without token** — Uses `Preview 4.png` fallback (line 4974), same as other map fallbacks. Profile always requires `Preview 6.png` regardless of token.

6. **Profile theme toggle** — Requires `assets/icon.png` and `assets/adaptive-icon.png` (line 5647), not just `template/`. Both asset trees are prerequisites.

7. **Home deep pages** — Four types confirmed: `listings`, `listing-detail`, `valet-studio`, `rides-planner` (line 37).

8. **Web platform** — `npm run web` exists but Mapbox in WebView and `expo-location` have limited web behavior; **mobile is the intended prototype target**.

9. **No `expo-router`** — Navigation is custom tab state + `homeDeepPage` + modals, not file-based routing.

10. **Data counts** — Six items each for houses, BNBs, and pickup stations confirmed by array definitions starting ~1239–1388. Nine destinations including three international.

### Pass 2 confidence statement

After two full passes over `App.tsx`, `homeUnifiedMapHtml.ts`, `package.json`, `app.json`, `index.ts`, and `.gitignore`:

- **Environment variables documented are complete** for the current codebase (only Mapbox tokens).
- **Production gap list is accurate** — no hidden API integrations were found.
- **Prototype blockers are exactly:** npm install, Mapbox token, local `assets/` + `template/` PNG files.
- **Overall readiness ~15–20%** is appropriate: rich UI, minimal platform infrastructure.

---

## 13. Quick reference

| Need | Action |
|------|--------|
| Run prototype | README → Quick start |
| Mapbox token | `.env` → `EXPO_PUBLIC_MAPBOX_TOKEN` |
| Missing images | Create `assets/` and `template/` PNGs |
| Production plan | Phases 0–5 in Section 6 |
| What is real vs fake | Section 5 feature matrix |
| File to split first | `App.tsx` |

---

*This document was produced from a full repository audit and verified twice against source. Update it when backend, auth, or deployment work lands.*
