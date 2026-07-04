import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../theme/brand';

export type ERTabItem<T extends string> = { key: T; label: string; icon: string };

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
  const barBg = darkMode ? BRAND.dark.canvas : BRAND.light.canvas;
  const border = darkMode ? BRAND.dark.border : BRAND.light.border;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: barBg,
          borderTopColor: border,
          paddingBottom: bottomInset,
          paddingHorizontal: horizontalPad,
        },
      ]}
    >
      <View style={styles.row}>
        {tabs.map(({ key, label, icon }) => {
          const on = active === key;
          return (
            <Pressable key={key} onPress={() => onChange(key)} style={styles.item}>
              <Text style={[styles.icon, { color: on ? BRAND.primary : idle, fontWeight: on ? '700' : '400' }]}>
                {icon}
              </Text>
              <Text style={[styles.label, { color: on ? BRAND.primary : idle }]}>{label}</Text>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
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
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 16,
    gap: 2,
  },
  icon: {
    fontSize: 19,
    marginBottom: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
