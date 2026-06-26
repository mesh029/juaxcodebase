import { BOLT } from './bolt';

/** Jua X brand — golden black premium with dark mode. */
export const BRAND = {
  primary: BOLT.primary,
  primaryDark: BOLT.primaryDark,
  primaryLight: BOLT.primaryLight,
  primaryText: BOLT.black,
  gold: BOLT.gold,
  goldMuted: BOLT.goldMuted,
  goldSoft: BOLT.goldSoft,
  success: BOLT.success,
  warning: BOLT.warning,
  mpesa: BOLT.mpesa,
  whatsapp: BOLT.whatsapp,
  radius: BOLT.radius,
  light: {
    canvas: BOLT.canvas,
    sheet: BOLT.sheet,
    surface: BOLT.surface,
    muted: BOLT.surface,
    border: BOLT.border,
    text: BOLT.text,
    textSecondary: BOLT.textMuted,
    textMuted: '#9B9285',
    tabIdle: BOLT.tabIdle,
  },
  dark: {
    canvas: BOLT.dark.bg,
    sheet: BOLT.dark.sheet,
    surface: BOLT.dark.surface,
    muted: BOLT.dark.surface,
    border: BOLT.dark.border,
    text: '#F5E6C8',
    textSecondary: BOLT.dark.muted,
    textMuted: '#7A7268',
    tabIdle: BOLT.dark.tabIdle,
  },
  auth: {
    background: BOLT.authBg,
    inputBg: BOLT.authInputBg,
    inputBorder: BOLT.authInputBorder,
  },
  authLight: {
    background: BOLT.canvas,
    inputBg: BOLT.sheet,
    inputBorder: BOLT.border,
    text: BOLT.text,
    textMuted: BOLT.textMuted,
    subtext: 'rgba(26, 22, 18, 0.55)',
    placeholder: 'rgba(26, 22, 18, 0.35)',
    legal: 'rgba(26, 22, 18, 0.45)',
    ctaDisabled: BOLT.surface,
    backBtn: BOLT.surface,
    accessoryBg: BOLT.surface,
  },
} as const;

export { BOLT };
