/**
 * 4pt spacing grid, radius scale, and touch targets.
 * MCP: theme://spacing
 */
export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 20,
  pill: 999,
} as const;

/** Apple HIG minimum touch target — 44×44pt */
export const Touch = {
  minSize: 44,
} as const;
