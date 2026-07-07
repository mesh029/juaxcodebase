/**
 * PRODUCTION bookmarks — areas that need real integrations before launch.
 * Search the codebase for `PRODUCTION_TODO` to find all call sites.
 */
export const PRODUCTION_TODO = {
  MPESA_STK: 'PRODUCTION_TODO: Replace dummy M-Pesa flow with Daraja STK push + /webhooks/mpesa',
  MPESA_SUBSCRIPTION: 'PRODUCTION_TODO: Wire subscription confirm to real M-Pesa receipt validation',
  MPESA_BNB: 'PRODUCTION_TODO: Wire BnB booking confirm to real M-Pesa STK',
  MAPESA_LAUNDRY: 'PRODUCTION_TODO: Add laundry order payment step with M-Pesa',
  MAPBOX_NAVIGATION_SDK: 'PRODUCTION_TODO: Native Mapbox Navigation SDK (dev client / EAS) — pilot uses WebView preview',
  PUSH_NOTIFICATIONS: 'PRODUCTION_TODO: FCM/APNs for booking updates, FUA checkpoints, request follow-ups',
  LISTING_REQUESTS_API: 'PRODUCTION_TODO: Dedicated POST /listing-requests instead of feedback overload',
  RIDES_API: 'PRODUCTION_TODO: Real rides booking + dispatch APIs',
  ADMIN_CONTACT: 'PRODUCTION_TODO: In-app chat or WhatsApp deep-link to ops',
} as const;
