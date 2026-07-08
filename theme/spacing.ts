/**
 * 8pt-first spacing system with 4pt micro-step.
 * Use tokens only; avoid ad-hoc numbers in components.
 */
export const Spacing = {
  0: 0,
  0.5: 4,
  1: 8,
  1.5: 12,
  2: 16,
  3: 24,
  4: 32,
  5: 40,
  6: 48,
  8: 64,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

export const Radius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Apple HIG minimum touch target — 44×44pt */
export const Touch = {
  minSize: 44,
  comfortSize: 48,
} as const;
