/**
 * PRODUCTION bookmarks — areas that need real integrations before launch.
 * Search the codebase for `PRODUCTION_TODO` to find all call sites.
 */
/**
 * Remaining server/ops work after overnight client hardening.
 * Client already queues intents and calls /api/v1/payments/mpesa/stk when present.
 */
export const PRODUCTION_TODO = {
  MPESA_STK: 'PRODUCTION_TODO: Enable Daraja STK on server (MPESA_* env) + /webhooks/mpesa',
  MPESA_SUBSCRIPTION: 'PRODUCTION_TODO: Confirm subscriptions only after Daraja callback (disable PILOT_DUMMY_PAYMENTS)',
  MPESA_BNB: 'PRODUCTION_TODO: Confirm BnB bookings only after Daraja callback',
  MAPESA_LAUNDRY: 'PRODUCTION_TODO: Add laundry order payment step with M-Pesa STK',
  MAPBOX_NAVIGATION_SDK: 'PRODUCTION_TODO: Native Mapbox Navigation SDK (dev client / EAS) — pilot uses WebView preview',
  PUSH_NOTIFICATIONS: 'PRODUCTION_TODO: Persist device tokens + send Expo pushes from backend',
  LISTING_REQUESTS_API: 'PRODUCTION_TODO: Listing-request API is live — remove feedback fallback when fully rolled out',
  RIDES_API: 'PRODUCTION_TODO: Real rides booking + dispatch APIs',
  ADMIN_CONTACT: 'PRODUCTION_TODO: In-app chat or WhatsApp deep-link to ops',
} as const;
