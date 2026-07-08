import type { Insets } from 'react-native';
import { Touch } from './spacing';

/**
 * Accessibility tokens and helpers for consistent a11y across the app.
 */
export const A11y = {
  /** Cap dynamic type so layouts stay usable on large text settings. */
  text: {
    allowFontScaling: true,
    maxFontSizeMultiplier: 1.35,
  } as const,
  /** Minimum comfortable hit slop for compact controls (dots, links). */
  hitSlop: { top: 12, bottom: 12, left: 12, right: 12 } satisfies Insets,
  compactHitSlop: { top: 8, bottom: 8, left: 8, right: 8 } satisfies Insets,
  minTouchSize: Touch.minSize,
} as const;

export function tabLabel(label: string, selected: boolean, badgeCount?: number) {
  const badge =
    badgeCount && badgeCount > 0
      ? `, ${badgeCount > 9 ? '9 plus' : badgeCount} notifications`
      : '';
  return `${label}${badge}${selected ? ', selected' : ''}`;
}

export function chipLabel(label: string, selected: boolean, comingSoon?: boolean) {
  const soon = comingSoon ? ', coming soon' : '';
  return `${label}${soon}${selected ? ', selected' : ''}`;
}

export function pagerDotLabel(index: number, total: number, selected: boolean) {
  return `Slide ${index + 1} of ${total}${selected ? ', current' : ''}`;
}
