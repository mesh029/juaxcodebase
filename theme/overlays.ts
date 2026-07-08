/**
 * Hero image scrim tokens — one source of truth for photo overlays.
 * Bottom steps simulate a gradient without expo-linear-gradient.
 */
export const HeroOverlay = {
  wash: 'rgba(8, 7, 5, 0.10)',
  gold: 'rgba(201, 162, 39, 0.07)',
  scrimDeep: 'rgba(8, 7, 5, 0.64)',
  scrimMid: 'rgba(8, 7, 5, 0.30)',
  scrimLight: 'rgba(8, 7, 5, 0.08)',
  panelBg: 'rgba(255, 255, 255, 0.06)',
  panelBorder: 'rgba(255, 255, 255, 0.16)',
} as const;
