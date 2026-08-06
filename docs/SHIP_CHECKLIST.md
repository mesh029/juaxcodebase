# Jua X — ship checklist (human paste only)

Everything else is wired to activate when present and degrade when missing.

## Paste into Expo / EAS env

| Variable | Where |
|----------|--------|
| `EXPO_PUBLIC_API_BASE_URL` | Aiden / backend base URL (no trailing slash) |
| `EXPO_PUBLIC_WS_URL` | Optional; only if WebSocket host differs from API |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Mapbox public token (`pk.…`) |
| `EXPO_PUBLIC_DROPBOX_APP_KEY` | Optional client OAuth; prefer server upload |
| `EXPO_PUBLIC_DROPBOX_ACCESS_TOKEN` | Optional fallback only — prefer server |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional crash reporting |
| `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` | Store / legal links |

Copy from `.env.example`. Set the same keys in EAS secrets for preview/production builds.

## Paste on the backend (never in the app)

| Secret | Purpose |
|--------|---------|
| Daraja `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` / `MPESA_SHORTCODE` / `MPESA_PASSKEY` / `MPESA_CALLBACK_URL` | M-Pesa STK + webhook |
| Set `PILOT_DUMMY_PAYMENTS=false` when going live | Disable pilot dummy confirms |
| Dropbox app / refresh token (server) | `POST /api/v1/media/upload` |
| Africa’s Talking (or OTP provider) keys | Phone OTP |
| Database / JWT secrets | Already required by backend |

## Store / EAS accounts

| Item | Notes |
|------|--------|
| Expo / EAS account | Replace `extra.eas.projectId` in `app.json` after `eas init` |
| Apple Developer | Bundle id `com.juax.app` |
| Google Play | Package `com.juax.app` |

No other human tasks required for the overnight client hardening.
