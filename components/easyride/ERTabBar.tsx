import { Pressable, StyleSheet, View } from 'react-native';
import { BRAND } from '../../theme/brand';
import { DarkElevation, A11y, FontFamily, HapticMap, Motion, sheetChrome, Spacing, tabLabel, Touch } from '../../theme';
import { AccessibleText } from '../ui/AccessibleText';

export type ERTabItem<T extends string> = { key: T; label: string; icon: string; badgeCount?: number };

type Props<T extends string> = {
  tabs: ERTabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  /** Safe-area bottom inset — applied as padding inside the bar (same bg color). */
  bottomInset: number;
  horizontalPad: number;
  darkMode?: boolean;
};

/**
 * Bottom tab bar — matches Figma Make TabBar.tsx:
 * canvas / primaryFaint background (NOT white sheet), border-top only.
 * Bottom inset is padding on this same container so there is no two-tone strip.
 */
export function ERTabBar<T extends string>({
  tabs,
  active,
  onChange,
  bottomInset,
  horizontalPad,
  darkMode = false,
}: Props<T>) {
  const idle = darkMode ? BRAND.dark.tabIdle : BRAND.light.tabIdle;
  const barChrome = sheetChrome(darkMode);
  const barBg = darkMode ? BRAND.dark.sheet : BRAND.light.sheet;

  return (
    <View
      style={[
        styles.root,
        barChrome,
        darkMode && DarkElevation.sheet,
        {
          backgroundColor: barBg,
          paddingBottom: bottomInset,
          paddingHorizontal: horizontalPad,
        },
      ]}
      accessibilityRole="tablist"
    >
      <View style={styles.row}>
        {tabs.map(({ key, label, icon, badgeCount }) => {
          const on = active === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={tabLabel(label, on, badgeCount)}
              accessibilityState={{ selected: on }}
              hitSlop={A11y.compactHitSlop}
              onPress={() => {
                if (!on) HapticMap.selection();
                onChange(key);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={styles.iconWrap} importantForAccessibility="no-hide-descendants">
                <AccessibleText
                  style={[styles.icon, { color: on ? BRAND.primary : idle, fontWeight: on ? '700' : '400' }]}
                  accessibilityElementsHidden
                >
                  {icon}
                </AccessibleText>
                {badgeCount && badgeCount > 0 ? (
                  <View style={styles.badge} accessibilityElementsHidden>
                    <AccessibleText style={styles.badgeText}>{badgeCount > 9 ? '9+' : String(badgeCount)}</AccessibleText>
                  </View>
                ) : null}
              </View>
              <AccessibleText style={[styles.label, { color: on ? BRAND.primary : idle }]}>{label}</AccessibleText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexShrink: 0,
    paddingTop: Spacing[1.5],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Touch.minSize,
    paddingVertical: Spacing[0.5],
    paddingHorizontal: Spacing[2],
    gap: 2,
  },
  itemPressed: {
    opacity: Motion.press.opacity,
  },
  iconWrap: {
    position: 'relative',
    minWidth: 20,
    alignItems: 'center',
  },
  icon: {
    fontSize: 19,
    marginBottom: 2,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -12,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    lineHeight: 11,
  },
  label: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
  },
});
