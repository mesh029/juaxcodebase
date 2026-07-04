/**
 * Flat token alias — Figma Make Laundry-app prototype.
 * Canonical source: theme/colors.ts (MCP theme://colors)
 * https://www.figma.com/make/SgiMZojmLP1rUeSWwxMvaI/Laundry-app
 */
import { Colors } from './colors';
import { Radius } from './spacing';

const { light: L, dark: D, auth: A } = Colors;

export const MAKE = {
  primary: L.primary,
  primaryDark: L.primaryDark,
  primaryLight: L.primaryLight,
  success: L.success,
  warning: L.warning,
  canvas: L.canvas,
  sheet: L.sheet,
  surface: L.surface,
  border: L.border,
  divider: L.divider,
  text: L.text,
  textMuted: L.textMuted,
  tabIdle: L.tabIdle,
  grabber: L.grabber,
  authBg: A.background,
  authInputBg: A.inputBg,
  authInputBorder: A.inputBorder,
  authAccent: A.accent,
  mpesa: L.mpesa,
  whatsapp: L.whatsapp,
  shadowPrimary: 'rgba(245,166,35,0.35)',
  radius: Radius,
  dark: {
    bg: D.canvas,
    surface: D.surface,
    border: D.border,
    muted: D.textMuted,
    sheet: D.sheet,
  },
} as const;
