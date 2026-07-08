import { Easing, LayoutAnimation, Platform } from 'react-native';
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
    tap: 180,
    fast: 150,
    normal: 250,
    transition: 300,
    slow: 350,
  },
  press: {
    scale: 0.97,
    opacity: 0.86,
  },
} as const;

export type LayoutAnimationKind = 'sheet' | 'segment' | 'filter';

/** Shared LayoutAnimation presets — sheet snap, service swipe, filter collapse.
 * On New Architecture, LayoutAnimation is a no-op on Android; still fine on iOS.
 */
export function configureLayoutAnimation(kind: LayoutAnimationKind = 'sheet') {
  if (Platform.OS === 'android') return;
  const duration =
    kind === 'segment'
      ? Motion.duration.normal
      : kind === 'filter'
        ? Motion.duration.fast
        : Motion.duration.transition;
  LayoutAnimation.configureNext(
    LayoutAnimation.create(duration, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
  );
}

/** Haptics at the right moments — never on scroll or hover */
export const HapticMap = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  bookingConfirmed: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
} as const;
