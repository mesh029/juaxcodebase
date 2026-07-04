import { Easing } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Spring configs, timing curves, and haptic map.
 * MCP: theme://motion
 */
export const Motion = {
  spring: {
    sheet: { damping: 22, stiffness: 280 },
    card: { damping: 20, stiffness: 300 },
  },
  timing: {
    /** Colour / opacity transitions — never Easing.linear on user-facing UI */
    standard: Easing.bezier(0.25, 0.46, 0.45, 0.94),
    enter: Easing.out(Easing.cubic),
    exit: Easing.in(Easing.cubic),
  },
  duration: {
    fast: 150,
    normal: 250,
    slow: 350,
  },
} as const;

/** Haptics at the right moments — never on scroll or hover */
export const HapticMap = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  bookingConfirmed: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
} as const;
