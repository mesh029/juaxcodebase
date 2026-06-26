import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../theme/brand';

export type ERTabItem<T extends string> = { key: T; label: string; icon: string };

type Props<T extends string> = {
  tabs: ERTabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  bottomPad: number;
  horizontalPad: number;
  darkMode?: boolean;
};

export function ERTabBar<T extends string>({
  tabs,
  active,
  onChange,
  bottomPad,
  horizontalPad,
  darkMode = false,
}: Props<T>) {
  const idle = darkMode ? BRAND.dark.tabIdle : BRAND.light.tabIdle;

  return (
    <View
      style={[
        styles.shell,
        {
          paddingBottom: bottomPad,
          paddingHorizontal: horizontalPad,
          backgroundColor: darkMode ? BRAND.dark.sheet : BRAND.light.sheet,
          borderTopColor: darkMode ? BRAND.dark.border : BRAND.light.border,
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
  shell: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    flexShrink: 0,
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
