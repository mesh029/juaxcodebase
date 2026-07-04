import { Colors } from './colors';
import { Radius } from './spacing';

const { light: L, dark: D, auth: A } = Colors;

/**
 * Jua X brand — warm terracotta from Figma Make Laundry-app.
 * Replaces legacy BOLT golden-black tokens.
 */
export const BRAND = {
  primary: L.primary,
  primaryDark: L.primaryDark,
  primaryLight: L.primaryLight,
  primaryText: L.ctaText,
  gold: L.primary,
  goldMuted: L.primaryDark,
  goldSoft: L.primaryLight,
  success: L.success,
  warning: L.warning,
  mpesa: L.mpesa,
  whatsapp: L.whatsapp,
  radius: Radius,
  light: {
    canvas: L.canvas,
    sheet: L.sheet,
    surface: L.surface,
    muted: L.surface,
    border: L.border,
    text: L.text,
    textSecondary: L.textSecondary,
    textMuted: L.textMuted,
    tabIdle: L.tabIdle,
  },
  dark: {
    canvas: D.canvas,
    sheet: D.sheet,
    surface: D.surface,
    muted: D.surface,
    border: D.border,
    text: D.text,
    textSecondary: D.textSecondary,
    textMuted: D.textMuted,
    tabIdle: D.tabIdle,
  },
  auth: {
    background: A.background,
    inputBg: A.inputBg,
    inputBorder: A.inputBorder,
    accent: A.accent,
    muted: A.muted,
  },
  authLight: {
    background: L.canvas,
    inputBg: L.sheet,
    inputBorder: L.border,
    text: L.text,
    textMuted: L.textMuted,
    subtext: 'rgba(28, 15, 8, 0.55)',
    placeholder: 'rgba(28, 15, 8, 0.35)',
    legal: 'rgba(28, 15, 8, 0.45)',
    ctaDisabled: L.ctaDisabled,
    backBtn: L.surface,
    accessoryBg: L.surface,
  },
} as const;
