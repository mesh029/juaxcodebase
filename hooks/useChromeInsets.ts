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
 * Keeps Android window + navigation bar painted the app canvas color edge-to-edge.
 * Prevents the default white system strip below the React tree.
 */
export function useChromeInsets({ backgroundColor, isDark }: Options) {
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomInset(insets);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(backgroundColor);
  }, [backgroundColor]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void (async () => {
      try {
        await NavigationBar.setPositionAsync('absolute');
        await NavigationBar.setBackgroundColorAsync(backgroundColor);
        await NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
      } catch {
        /* unavailable on some builds */
      }
    })();
  }, [backgroundColor, isDark]);

  return { insets, bottomInset };
}
