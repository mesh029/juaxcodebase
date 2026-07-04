/**
 * App layout constants — map heights, sheet snap points, KES pricing.
 * MCP: theme://config — synced from Figma Make context.tsx
 */
export const SheetConfig = {
  snapPoints: {
    collapsed: 0.27,
    mid: 0.54,
    full: 0.92,
  },
  grabber: { width: 36, height: 4 },
} as const;

export const Pricing = {
  laundryKesPerKg: 80,
  laundryKesPerItem: 50,
  laundryPickupFee: 150,
  staysCleaningFee: 500,
  ridePerKm: { ride: 30, comfort: 45, xl: 60 },
  subscription: { daily: 99, weekly: 299, monthly: 599 },
} as const;
