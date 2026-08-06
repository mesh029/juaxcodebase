# Jua X — production assessment vs best-in-class

**Date:** 2026-08-06  
**Scope:** Expo/React Native client + sibling Next.js API (`juaxBackend`)  
**Peer set:** Uber / Bolt (rides+multi), Airbnb (stays), Washmen / Laundrapp / 2ULaundry (laundry), Glovo / Uber Eats (ops density), M-Pesa-native Kenya apps (market expectation)

This is an engineering + product-systems assessment, not a UI redesign brief. Goal: what separates Jua X from “award-winning production” in the Kenya Fua + Keja race.

---

## Executive scorecard

| Domain | Now | World-class bar | Gap |
|--------|-----|-----------------|-----|
| App architecture / perf | Monolith shrinking; offline core live | Feature modules, isolated re-renders, native maps | **High** |
| Local-first / reliability | Cache + outbox + health | Conflict-free sync, idempotent server, offline UX polish | **Medium** |
| Auth & identity | Phone OTP + email; SecureStore | Device binding, session refresh, account recovery, KYC hooks | **Medium** |
| Payments (M-Pesa) | Client → STK intent; pilot dummy still possible | Daraja STK + webhook + reconciliation + receipts | **High** |
| Realtime | SSE/poll adapter | Presence, typed events, push + in-app parity | **Medium** |
| Maps / location | Mapbox WebView | Native Mapbox/Google, nav SDK, traffic, ETA trust | **High** |
| Catalog / search | Bootstrap + nearby | Ranking, facets, availability calendar, fraud signals | **High** |
| Trust & safety | Basic listing lock / subscription | Verified hosts, reviews graph, dispute flow | **High** |
| Growth / retention | Soft coming-soon shells | Referrals, loyalty, lifecycle push, deep links | **High** |
| Observability | Optional Sentry stub | Crash-free sessions, funnels, perf budgets, release health | **High** |
| QA / CI / release | `tsc` only | E2E, detox/maestro, store pipelines, staged rollouts | **High** |
| Compliance (KE) | Placeholder legal URLs | ODPC privacy, consumer terms, data residency clarity | **High** |

**Verdict:** The overnight hardening made Jua X *operable offline* and *ship-configurable*. It is **not yet** in the same league as Bolt/Airbnb on performance architecture, payments finality, native maps, trust systems, or release discipline. Closing the gaps below is the path into that race.

---

## 1. What already puts you in the game

- Clear Kenya MVP focus: **Fua + Keja**, KES, `+254`, M-Pesa-shaped flows
- Catalog bootstrap + React Query + durable cache (instant Home after first online session)
- Mutation outbox when Aiden is down (bookings/orders don’t evaporate)
- Auth token persistence with offline session restore
- Realtime path that matches backend SSE (`/api/v1/activity/stream`) + poll fallback
- Mapbox WebView unified home map (mode switch without always remounting — when HTML stays stable)
- EAS profiles, renamed **Jua X**, env template, ship checklist

---

## 2. Architecture & performance (root of the lag)

### Current state (measured)

| Signal | Approx |
|--------|--------|
| `App.tsx` after extraction | ~11.2k lines (was ~16.3k) |
| Styles extracted | `theme/appStyles.ts` (~4.6k) |
| Map HTML builders extracted | `lib/maps/htmlBuilders.ts` |
| Hooks in `App` | ~80 `useState`, ~56 `useEffect`, ~65 `useMemo` |
| ScrollViews in monolith | ~50+ |
| FlatLists | few; mostly nested horizontal carousels |

### Why it lagged

1. **Single React tree owner** — sheet tabs (Home / Activity / Profile), maps, wizards, and catalogs share one component. Any state tick (GPS, poll, typing) re-renders massive JSX.
2. **WebView HTML rebuild storms** — `source={{ html }}` regenerates when `currentCoords` / pin banks change. GPS jitter = document reload = jank. *(Mitigated: stable rounded `mapCoordsStable` for map HTML memos.)*
3. **Activity/Profile inside Home sheet** — tab switches don’t unmount the map shell, but they still recompute the entire `sheetInner` closure.
4. **Non-virtualized feeds** — Activity/Profile/explore content mapped inside parent `ScrollView`.
5. **Styles factory** was 4.5k lines inside the same module (parse + recreate cost on theme flip). *(Extracted.)*

### What world-class apps do

- **Feature folders** (`features/fua`, `features/keja`, `features/activity`) with screen + hooks + API adapters
- **Navigation stack** (React Navigation / Expo Router) so maps aren’t parent to every tab
- **Native maps** (Mapbox Maps SDK / Google Maps) with camera APIs — not full HTML documents
- **FlashList / RecyclerListView** for feeds
- **Perf budgets**: JS FPS, TTI, interaction latency; Flipper/React DevTools in CI smoke

### Remaining work (ordered)

1. Finish extracting **Activity tab** and **Profile tab** into memoized components (same JSX, props-driven)
2. Extract Fua / Keja / Rides sheet bodies one switch-case at a time
3. Move map shell to a dedicated `HomeMapShell` that only receives pin banks + inject commands
4. Adopt Expo Router or React Navigation for true tab isolation
5. Replace WebView maps with native Mapbox for Home (keep WebView only for guided preview until Navigation SDK)
6. Virtualize Activity feed and listing catalogs
7. Cap location updates; pause watches when app backgrounded / sheet collapsed

---

## 3. Product functionality gaps (Fua + Keja first)

### Jua Fua (laundry)

| Capability | Status | Best-in-class |
|------------|--------|---------------|
| Door / station / Mama Fua booking | Live UI + API | Same + capacity / SLA |
| Live order steps | Status fields + Activity | Driver/valet tracking map |
| Proof photos | Media path wired | Required checkpoints + QA |
| Payments | Intent/outbox; pilot dummy possible | STK before dispatch |
| Reorder / favorites | Missing | One-tap reorder |
| Pricing transparency | Estimate API | Itemized + surge rules |
| Support chat | Missing | In-app + WhatsApp |

### Saka Keja (BnB + rentals)

| Capability | Status | Best-in-class |
|------------|--------|---------------|
| Listings browse / nearby | Live | Search ranking + calendar |
| Viewing requests | Live + Activity thread | Agent SLAs + scheduling |
| Exact pin unlock | Subscription / booking gate | Verified ID + paid unlock |
| Host tools | Admin web, not consumer host app | Host calendar, payouts |
| Reviews | Feedback API partial | Two-sided reviews |
| Messaging | Listing-request messages | Real-time chat + media |
| Cancellation / refunds | Missing | Policy engine + M-Pesa refunds |

### Rides

Marked **coming soon** — correct. Do not block Fua/Keja. When live: dispatch, driver app, fare integrity, safety (share trip), M-Pesa + cash.

### Explore

Demo venues / journal — fine as soft discovery. Not a launch blocker. Needs CMS + real POIs before claiming “city OS.”

---

## 4. Backend & money (must be perfect in Kenya)

Without final M-Pesa, the app cannot win trust.

| Item | Missing for “best” |
|------|---------------------|
| Daraja STK + callback webhook | Production credentials + signed callbacks |
| Payment ledger | Intent → paid → fulfilled; idempotent webhooks |
| Disable pilot dummy | `PILOT_DUMMY_PAYMENTS=false` when live |
| Payouts to stations / hosts | Ops + settlement reports |
| Fraud | Velocity limits, device reputation |
| Invoices / SMS receipts | Africa’s Talking / SMS |

OTP provider, rate limits, and abuse controls belong on the server — client already degrades when API is down.

---

## 5. Trust, safety, compliance

- Verified agents/hosts, listing quality scores
- User reports / blocks
- Clear ODPC-aligned privacy policy + in-app consent
- Data deletion / export
- Insurance / damage deposits for stays (product decision)
- Child-safety / prohibited use policies for store review

---

## 6. Growth, notifications, deep links

| Area | Now | Needed |
|------|-----|--------|
| Push | Register token path | Campaigns + transactional templates |
| Deep links | Partial notification parse | Universal links → order/listing |
| Referrals | Missing | Invite codes, Keja host referrals |
| Analytics | Missing | Funnel: open → book → pay → complete |
| App Store ASO | Identity renamed | Screenshots, KE localization (EN/SW) |

---

## 7. Quality & shipping discipline

| Practice | Now | Needed |
|----------|-----|--------|
| Typecheck | `npm run typecheck` | CI required check |
| Unit / integration | Minimal / none on client | Mutations, outbox, adapters |
| E2E | None | Maestro flows: auth, Fua book, Keja view |
| Crash-free | Optional Sentry | DSN + release sourcemaps |
| Perf | Manual | Startup + interaction budgets |
| Staged rollout | EAS channels exist | % rollout + kill switches |

---

## 8. Competitive positioning (honest)

**You can win Kisumu/pilot** on: unified Fua+Keja, Kenya-native payments story, offline-tolerant booking, warm brand.

**You cannot yet claim “best of the best” vs Bolt/Airbnb** until:

1. Native-quality map performance (no HTML reload jank)
2. Real M-Pesa finality + receipts
3. Modular app architecture (sub-2000-line screens)
4. Trust (reviews, verified listings, support)
5. Release/observability discipline

---

## 9. Recommended roadmap (90 days)

### Sprint A — Feel fast (2–3 weeks)

- Finish Activity / Profile / Fua / Keja sheet extractions + `React.memo`
- FlashList on Activity + listing catalogs
- Native map spike OR further WebView inject-only discipline
- CI: typecheck + Maestro smoke

### Sprint B — Money & truth (3–4 weeks)

- Daraja live; kill dummy payments
- Webhook reconciliation; payment status in Activity
- Sentry + basic funnels
- Support deep-link (WhatsApp ops)

### Sprint C — Trust & retention (4–6 weeks)

- Reviews for Fua + Keja
- Host/agent response SLAs in admin
- Push for order/status
- Privacy/terms real URLs + account delete

### Later

- Rides MVP, Explore CMS, Navigation SDK, host mobile app

---

## 10. Immediate human inputs

See `docs/SHIP_CHECKLIST.md` — API URL, Mapbox, Daraja, Dropbox, OTP, EAS/store accounts, optional Sentry.

---

## Changelog note

Perf extraction:

- `theme/appStyles.ts`, `lib/maps/htmlBuilders.ts`, `mapCoordsStable`
- `ActivityTab` + `ProfileTab` memoized components (same UI)
- `App.tsx` ~16.3k → ~10.5k lines

Backend overnight:

- Persisted payment intents (memory + AppSetting), STK status poll, `/api/v1/webhooks/mpesa` idempotent stub
- Device tokens persisted via AppSetting
- Still needs: live Daraja keys, reachable Postgres (Aiven), OTP provider
