import { Radius, Spacing, Touch } from './spacing';

/**
 * Shared component sizing primitives.
 * Keep control heights and icon sizes consistent across screens.
 */
export const ComponentSize = {
  icon: {
    xs: 14,
    sm: 16,
    md: 18,
    lg: 20,
    xl: 24,
  },
  chip: {
    height: 36,
    compactHeight: 32,
    paddingX: Spacing[1.5],
    radius: Radius.pill,
  },
  button: {
    sm: 40,
    md: Touch.minSize,
    lg: 52,
    radius: Radius.md,
    paddingX: Spacing[2],
  },
  segmented: {
    height: 38,
    radius: Radius.lg,
    inset: Spacing[0.5],
  },
  card: {
    radius: Radius.lg,
    padding: Spacing[2],
  },
} as const;
