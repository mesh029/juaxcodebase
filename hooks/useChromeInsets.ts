import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBottomInset } from '../theme/layout';

type Options = {
  backgroundColor: string;
  isDark: boolean;
};

/**
 * Keeps Android chrome aligned with the app canvas.
 * With edge-to-edge enabled (app.json), NavigationBar position/background
 * APIs are unsupported — only button style is safe to set.
 */
export function useChromeInsets({ backgroundColor, isDark }: Options) {
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomInset(insets);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(backgroundColor).catch(() => {
      /* unavailable on some builds */
    });
  }, [backgroundColor]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark').catch(() => {
      /* unavailable on some builds */
    });
  }, [isDark]);

  return { insets, bottomInset };
}
