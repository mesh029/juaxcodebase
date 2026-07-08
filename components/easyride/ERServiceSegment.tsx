import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BRAND } from '../../theme/brand';
import { A11y, ComponentSize, FontFamily, HapticMap, Motion, Radius, Spacing, chipLabel, trackChrome } from '../../theme';
import { AccessibleText } from '../ui/AccessibleText';

export type ServiceSegmentItem<T extends string> = {
  key: T;
  label: string;
  comingSoon?: boolean;
  soonEmoji?: string;
  /** Small icon after label (e.g. chevron on “More”). */
  suffixIcon?: keyof typeof Ionicons.glyphMap;
};

type Props<T extends string> = {
  tabs: ServiceSegmentItem<T>[];
  active: T;
  onChange: (key: T) => void;
  onComingSoon?: (key: T) => void;
  fontSize?: number;
  darkMode?: boolean;
  /** `track` = full-width pill row; `inline` = compact outline chips beside logo. */
  variant?: 'track' | 'inline';
};

export function ERServiceSegment<T extends string>({
  tabs,
  active,
  onChange,
  onComingSoon,
  fontSize = 11,
  darkMode = false,
  variant = 'track',
}: Props<T>) {
  const inline = variant === 'inline';
  const trackStyle = inline ? null : trackChrome(darkMode);
  const idle = darkMode ? BRAND.dark.textSecondary : BRAND.light.textSecondary;
  // Brand tokens use `text`, not `textPrimary` — undefined color made inline chips invisible.
  const idleText = inline ? (darkMode ? BRAND.dark.text : BRAND.light.text) : idle;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={inline ? styles.scrollInline : undefined}
      contentContainerStyle={[styles.scrollContent, inline && styles.scrollContentInline, trackStyle]}
      decelerationRate="fast"
    >
      {tabs.map(({ key, label, comingSoon, suffixIcon }) => {
        const on = active === key;
        const activeBg = inline
          ? darkMode
            ? 'rgba(255, 122, 26, 0.12)'
            : 'rgba(255, 122, 26, 0.08)'
          : darkMode
            ? BRAND.dark.sheet
            : BRAND.light.sheet;
        const soonOnBg = darkMode ? BRAND.dark.surface : BRAND.light.surface;
        const soonIdleBorder = darkMode ? 'transparent' : BRAND.light.border;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={chipLabel(label, on, comingSoon)}
            accessibilityState={{ selected: on, disabled: comingSoon }}
            hitSlop={A11y.compactHitSlop}
            style={({ pressed }) => [
              styles.chip,
              inline ? styles.chipInline : darkMode ? styles.chipDark : styles.chipLight,
              on && !comingSoon && [
                styles.chipOn,
                inline ? styles.chipOnInline : null,
                { backgroundColor: inline ? activeBg : activeBg },
              ],
              on && comingSoon && [styles.chipSoonOn, { backgroundColor: soonOnBg }],
              comingSoon && !on && !inline && [styles.chipSoon, { borderColor: soonIdleBorder }],
              pressed && styles.chipPressed,
            ]}
            onPress={() => {
              if (comingSoon) {
                onComingSoon?.(key);
                return;
              }
              if (!on) HapticMap.selection();
              onChange(key);
            }}
          >
            <AccessibleText
              style={[
                styles.text,
                inline && styles.textInline,
                on && !comingSoon && styles.textOn,
                on && comingSoon && styles.textSoonOn,
                !on && { color: idleText },
                { fontSize: inline ? Math.max(fontSize, 12) : fontSize },
              ]}
              numberOfLines={1}
            >
              {label}
            </AccessibleText>
            {suffixIcon ? (
              <Ionicons
                name={suffixIcon}
                size={14}
                color={on ? BRAND.primary : idleText}
                accessibilityElementsHidden
              />
            ) : null}
            {comingSoon && !inline ? (
              <View style={[styles.soonBadge, darkMode && styles.soonBadgeDark]} accessibilityElementsHidden>
                <AccessibleText style={[styles.soonText, { color: darkMode ? BRAND.dark.textMuted : '#9B9B9B' }]}>Soon</AccessibleText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollInline: {
    flexGrow: 0,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[0.5],
  },
  scrollContentInline: {
    paddingVertical: Spacing[0.5],
    paddingHorizontal: Spacing[0.5],
    gap: Spacing[1],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ComponentSize.chip.height,
    gap: Spacing[0.5],
    paddingHorizontal: Spacing[1.5],
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLight: {
    borderColor: BRAND.light.border,
    backgroundColor: '#FFFFFF',
  },
  chipDark: {
    borderColor: 'transparent',
    backgroundColor: BRAND.dark.elevated,
  },
  chipInline: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    minHeight: 34,
    paddingHorizontal: Spacing[1.5],
    paddingVertical: Spacing[0.5],
  },
  chipOn: {
    borderColor: BRAND.primary,
  },
  chipOnInline: {
    borderWidth: 1.5,
  },
  chipSoon: {
    backgroundColor: 'transparent',
    opacity: 0.85,
  },
  chipSoonOn: {
    borderColor: BRAND.primary,
  },
  chipPressed: {
    opacity: Motion.press.opacity,
  },
  textSoonOn: {
    color: BRAND.primary,
  },
  text: {
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.3,
  },
  textInline: {
    fontFamily: FontFamily.medium,
    letterSpacing: 0,
  },
  textOn: {
    color: BRAND.primary,
  },
  soonBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F0F0F0',
  },
  soonBadgeDark: {
    backgroundColor: BRAND.dark.surface,
  },
  soonText: {
    fontSize: 8,
    fontFamily: FontFamily.bold,
    letterSpacing: 0.3,
  },
});
