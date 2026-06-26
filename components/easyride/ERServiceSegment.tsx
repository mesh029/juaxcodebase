import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../theme/brand';

export type ServiceSegmentItem<T extends string> = {
  key: T;
  label: string;
  comingSoon?: boolean;
  soonEmoji?: string;
};

type Props<T extends string> = {
  tabs: ServiceSegmentItem<T>[];
  active: T;
  onChange: (key: T) => void;
  onComingSoon?: (key: T) => void;
  fontSize?: number;
  darkMode?: boolean;
};

export function ERServiceSegment<T extends string>({
  tabs,
  active,
  onChange,
  onComingSoon,
  fontSize = 11,
  darkMode = false,
}: Props<T>) {
  const trackBg = darkMode ? BRAND.dark.surface : BRAND.light.surface;
  const idle = darkMode ? BRAND.dark.tabIdle : BRAND.light.tabIdle;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { backgroundColor: trackBg }]}
      decelerationRate="fast"
    >
      {tabs.map(({ key, label, comingSoon, soonEmoji }) => {
        const on = active === key;
        return (
          <Pressable
            key={key}
            style={[
              styles.chip,
              on && !comingSoon && styles.chipOn,
              on && comingSoon && styles.chipSoonOn,
              comingSoon && !on && styles.chipSoon,
            ]}
            onPress={() => {
              if (comingSoon) {
                onComingSoon?.(key);
                return;
              }
              onChange(key);
            }}
          >
            <Text
              style={[
                styles.text,
                on && !comingSoon && styles.textOn,
                on && comingSoon && styles.textSoonOn,
                !on && { color: idle },
                { fontSize },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {comingSoon ? (
              <View style={[styles.soonBadge, darkMode && styles.soonBadgeDark]}>
                <Text style={styles.soonText}>{soonEmoji ? `${soonEmoji} Soon` : 'Soon'}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  chipSoon: {
    borderColor: '#E5E5E5',
    backgroundColor: 'transparent',
    opacity: 0.85,
  },
  chipSoonOn: {
    borderColor: BRAND.primary,
    backgroundColor: BRAND.light.surface,
  },
  textSoonOn: {
    color: BRAND.primary,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  textOn: {
    color: BRAND.primaryText,
  },
  soonBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F0F0F0',
  },
  soonBadgeDark: {
    backgroundColor: '#2C2C2C',
  },
  soonText: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    color: '#9B9B9B',
    letterSpacing: 0.3,
  },
});
