/**
 * Core typography scale with semantic aliases for app UI.
 * Keep hierarchy consistent and avoid one-off sizes.
 */
export const Type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, lineHeight: 41, letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34, letterSpacing: 0.36 },
  title2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: 0.35 },
  title3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 25, letterSpacing: 0.38 },
  headline: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22, letterSpacing: -0.41 },
  body: { fontSize: 17, fontWeight: '400' as const, lineHeight: 22, letterSpacing: -0.41 },
  callout: { fontSize: 16, fontWeight: '400' as const, lineHeight: 21, letterSpacing: -0.32 },
  subhead: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20, letterSpacing: -0.24 },
  footnote: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18, letterSpacing: -0.08 },
  caption1: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16, letterSpacing: 0 },
  caption2: { fontSize: 11, fontWeight: '400' as const, lineHeight: 13, letterSpacing: 0.07 },
} as const;

export const TextRole = {
  hero: Type.title1,
  sectionTitle: Type.title3,
  cardTitle: Type.headline,
  cardMeta: Type.footnote,
  body: Type.subhead,
  bodyStrong: Type.callout,
  label: Type.caption1,
  overline: Type.caption2,
} as const;

/** Inter font family names loaded via @expo-google-fonts/inter */
export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
