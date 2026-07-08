/**
 * Semantic color tokens — neutral surfaces with warm accent for CTAs only.
 */
export const Colors = {
  light: {
    primary: '#E8951A',
    primaryDark: '#C47A10',
    /** Warm tint for active segments, chips, and highlights — must read on white. */
    primaryLight: '#FFF4E0',
    primaryFaint: '#FFFBF5',
    accent: '#2563EB',
    success: '#2D7A4F',
    successFaint: '#ECFDF5',
    warning: '#B45309',
    error: '#DC2626',
    errorFaint: '#FEF2F2',
    canvas: '#F8F8FA',
    sheet: '#FFFFFF',
    /** Nested controls on sheet (search, pills, chips) — slightly off-white for contrast. */
    surface: '#F6F6F8',
    border: '#E7E7EC',
    divider: '#EFEFF3',
    text: '#18181B',
    textSecondary: '#434350',
    textMuted: '#646472',
    tabIdle: '#73737F',
    grabber: '#A1A1AA',
    ctaText: '#FFFFFF',
    ctaDisabled: '#A1A1AA',
    mpesa: '#00A651',
    whatsapp: '#25D366',
    statusBar: 'dark' as const,
    mapStyleId: 'light-v11',
  },
  dark: {
    primary: '#F0A030',
    primaryDark: '#D4870F',
    /** Warm orange nest for active chips / highlights on dark surfaces. */
    primaryLight: '#3A2C18',
    primaryFaint: '#1C1B24',
    accent: '#60A5FA',
    success: '#34D399',
    successFaint: '#064E3B',
    warning: '#FBBF24',
    error: '#F87171',
    errorFaint: '#7F1D1D',
    /** Deepest app background — warm charcoal, not pure black. */
    canvas: '#0F0E12',
    /** Primary sheet / panel layer. */
    sheet: '#17161C',
    /** Nested controls (chips, toggles, search fields). */
    surface: '#201F28',
    /** Floating cards and list rows. */
    elevated: '#2A2933',
    border: '#2E2D38',
    divider: '#34333F',
    text: '#F5F5F7',
    textSecondary: '#AEADB8',
    textMuted: '#7E7D8A',
    tabIdle: '#787786',
    grabber: '#5C5B66',
    ctaText: '#18181B',
    ctaDisabled: '#52525B',
    mpesa: '#22C55E',
    whatsapp: '#25D366',
    statusBar: 'light' as const,
    mapStyleId: 'dark-v11',
  },
  auth: {
    background: '#09090B',
    inputBg: '#18181B',
    inputBorder: '#3F3F46',
    accent: '#F0A030',
    muted: '#71717A',
    ctaText: '#18181B',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];
