import { Platform } from 'react-native';
import { initialWindowMetrics, type EdgeInsets } from 'react-native-safe-area-context';

/**
 * Bottom inset for tab bars and sticky footers.
 * On Android edge-to-edge, insets.bottom can briefly be 0 before metrics load —
 * fall back to initial window metrics so we never leave an un-padded gesture zone.
 */
export function getBottomInset(insets: EdgeInsets): number {
  if (insets.bottom > 0) return insets.bottom;
  if (Platform.OS !== 'android') return 0;
  return initialWindowMetrics?.insets.bottom ?? 0;
}
