import { StyleSheet, type ViewStyle } from 'react-native';
import { Colors } from './colors';
import { DarkElevation, Shadows } from './shadows';

type SurfaceChrome = Pick<ViewStyle, 'backgroundColor' | 'borderWidth' | 'borderColor'> & ViewStyle;

/** Floating card — border in light, elevation in dark. */
export function cardChrome(darkMode: boolean): SurfaceChrome {
  if (!darkMode) {
    return {
      backgroundColor: Colors.light.sheet,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: Colors.light.border,
    };
  }
  return {
    backgroundColor: Colors.dark.elevated,
    borderWidth: 0,
    ...DarkElevation.card,
  };
}

/** Nested panel on a sheet — muted nest in light, surface step in dark. */
export function nestedChrome(darkMode: boolean): SurfaceChrome {
  if (!darkMode) {
    return {
      backgroundColor: Colors.light.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: Colors.light.border,
    };
  }
  return {
    backgroundColor: Colors.dark.surface,
    borderWidth: 0,
    ...DarkElevation.nested,
  };
}

/** Primary sheet / sticky footer — hairline in light, lift in dark. */
export function sheetChrome(darkMode: boolean): SurfaceChrome {
  if (!darkMode) {
    return {
      backgroundColor: Colors.light.sheet,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: Colors.light.border,
    };
  }
  return {
    backgroundColor: Colors.dark.sheet,
    borderTopWidth: 0,
    ...DarkElevation.sheet,
  };
}

/** Segmented control track. */
export function trackChrome(darkMode: boolean): Pick<ViewStyle, 'backgroundColor'> {
  return {
    backgroundColor: darkMode ? Colors.dark.surface : Colors.light.surface,
  };
}

export function sheetElevationStyle(darkMode: boolean): ViewStyle {
  return darkMode ? DarkElevation.sheet : Shadows.sheet;
}
