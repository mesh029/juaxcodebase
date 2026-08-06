# Overnight execution plan — senior engineer brief

**Goal:** Make Jua X feel production-ready for Fua + Keja without Daraja/OTP/store account signups.  
**Constraint:** No UI redesign. Verify by booting servers; shut them down when idle.

## Non-goals (human later)
- Live Safaricom Daraja credentials
- Africa’s Talking / real OTP SMS
- Real Dropbox app secrets on server
- Apple / Google / EAS project ownership
- Native Mapbox Navigation SDK migration

## Workstreams

### A — Frontend performance (lag)
1. Extract Activity tab → memoized component (identical JSX)
2. Extract Profile tab → memoized component
3. FlashList (or FlatList windowing) for Activity feed + long listing rows where safe
4. Defer secondary loads; keep mapCoordsStable discipline
5. `tsc --noEmit` green after each chunk

### B — Backend production surface
1. `POST /api/v1/webhooks/mpesa` stub (signature-tolerant, idempotent apply)
2. Payment intent store (in-memory or DB if schema allows) for STK status
3. Honor `Idempotency-Key` on mutating routes where cheap
4. Device-token persistence (User metadata / table if available)
5. Media upload: clear contract when Dropbox unset
6. Smoke tests for health + catalog + STK stub

### C — Client payment honesty
1. Production builds: no fake “paid” without server `devMode` / completed status
2. Poll STK status after intent; reuse existing pending UI copy
3. Outbox remains source of truth offline

### D — Verification protocol
1. Start backend → curl health + bootstrap
2. Start Expo (`npx expo start` or typecheck + bundle) → confirm no boot crash
3. **Stop** node/expo processes after each verification window

### E — Ship
1. Commits on existing overnight branches
2. Update PRODUCTION_ASSESSMENT + SHIP_CHECKLIST
3. Push PRs
