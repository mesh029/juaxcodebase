# Overnight production hardening — changelog

Branch: `cursor/prod-optimize-overnight`  
Started: 2026-08-06  
Scope: Fua + Keja local-first / API resilience / ship config. **No UI redesign.**

## Phase 0 — Inventory & guardrails

### Findings
- `App.tsx` ~16,315 lines — primary structural risk; owns types, demo data, map HTML, wizards, and all tab UI.
- API contract in `lib/api.ts` / `lib/api-types.ts`; catalog bootstrap already preferred.
- Auth uses `expo-secure-store` for JWT but clears token on any `fetchMe` failure (including network) — unsafe for offline.
- No AsyncStorage cache, outbox, NetInfo, React Query, sockets, Dropbox, Sentry, or push wiring yet.
- Sibling backend at `../backend`: REST `/api/v1/*`, health at `/api/health` (not `/api/v1/health`), realtime via **SSE** `/api/v1/activity/stream` + snapshot `/api/v1/activity/snapshot`. No Dropbox/media/device-token/Daraja STK routes yet.
- Pre-existing `tsc` errors: App.tsx mamafua compare, rides switch case, GuidedNavigationModal Modal/WebView typing.
- App identity still `my-expo-app`; iOS string still says TripFlow; package scripts lack `typecheck`.
- Ride fares already KES in UI; destinations include Paris/Dubai/Accra demo rows; `+880` already gone from AuthScreen.

### Decisions (defaults)
- **UI freeze**: extract hooks/lib/data only; preserve JSX structure and copy placement.
- **Realtime**: prefer backend SSE activity stream; WebSocket if `EXPO_PUBLIC_WS_URL` set; else poll snapshot every 35s for active items.
- **Health**: try `/api/v1/health` then fall back to `/api/health`.
- **Offline auth**: keep token + cached user on network/5xx; clear only on true 401 after refresh attempt fails.
- **M-Pesa**: client calls backend STK/intent endpoints only; `__DEV__` dummy receipts only when API reports `devMode` / payment-dev; never invent production success.
- **Dropbox**: prefer `POST /api/v1/media/upload`; client Dropbox helper only when access token present; local URI fallback.
- **Node**: CI/typecheck may run on Node 18 in this environment; engines remain `>=20` for Expo 54.

---

## Phase 1 — Local-first data layer

- Added `lib/offline/*` (storage, cache, outbox, health, sync).
- NetInfo subscribed once via `OfflineProvider`.
- Boot: hydrate cache → render → background revalidate when healthy.

---

## Phase 2 — API client hardening

- Timeouts, in-flight GET dedupe, idempotency keys on mutations.
- 401 clears auth only after confirmed unauthorized (not network).
- Empty API base / health fail → offline mode.

---

## Phase 3 — Realtime

- SSE/WS adapter + polling fallback; updates React Query / local caches only (no new chrome).

---

## Phase 4 — Dropbox / media

- `lib/media/*` upload path; env placeholders; graceful degrade.

---

## Phase 5 — Performance

- Extracted non-visual modules from `App.tsx`; React Query for catalog; Mapbox rate-limit/cache; Kenya-only destination trim for prod bundles.

---

## Phase 6 — Auth / payments / notifications

- Offline session restore; STK intent + poll; Expo Notifications device token → outbox/API; optional Sentry.

---

## Phase 7 — Identity & ship

- Renamed to Jua X / `jua-x`; `eas.json`; permission strings; complete `.env.example`.

---

## Phase 8 — Backend-tolerant client + sibling routes

- Client tolerates missing routes. When `../backend` available: `/api/v1/health`, media upload stub, device-token, M-Pesa STK intent stubs.

---

## Phase 9 — Quality

- Battery-friendly pause (realtime stops in background); typecheck green (`tsc --noEmit`).
- `docs/SHIP_CHECKLIST.md` — human paste-only secrets/accounts.
- Pre-existing TS errors fixed (mamafua narrow, rides switch cast, GuidedNavigationModal).
- Non-Kenya demo destinations (Paris/Dubai/Accra) removed from ride search list.
- Ride soft fare formula switched to KES-scale estimate (same UI slots).
- Sibling backend routes added: `/api/v1/health`, `/api/v1/me/device-token`, `/api/v1/media/upload`, `/api/v1/payments/mpesa/stk|status`; CORS allows `Idempotency-Key`.

### Residual notes
- Rides remain soft/coming-soon via existing segment flags.
- EAS `projectId` placeholder must be replaced after `eas init` (listed in SHIP_CHECKLIST).

## Follow-up — perf extraction + competitive assessment (2026-08-06)

- Extracted `theme/appStyles.ts` (~4.6k) and `lib/maps/htmlBuilders.ts` from `App.tsx` (~16.3k → ~11.2k).
- Stabilized map HTML memos with rounded `mapCoordsStable` to cut WebView reload jank from GPS jitter.
- Added `docs/PRODUCTION_ASSESSMENT.md` — gap analysis vs Bolt/Airbnb-class Kenya production apps + 90-day roadmap.
- Still TODO for lag: extract Activity/Profile/Fua/Keja sheet bodies into memoized components; FlashList; native maps long-term.
