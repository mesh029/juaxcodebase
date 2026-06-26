import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { BRAND } from '../../theme/brand';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  sublabel?: string;
  style?: ViewStyle;
  darkMode?: boolean;
  tone?: 'primary' | 'outline';
  onBack?: () => void;
  backLabel?: string;
  children?: ReactNode;
};

export function SheetStickyFooter({
  label,
  onPress,
  disabled,
  sublabel,
  style,
  darkMode = false,
  tone = 'primary',
  onBack,
  backLabel = 'Back',
  children,
}: Props) {
  const border = darkMode ? BRAND.dark.border : BRAND.light.border;
  const bg = darkMode ? BRAND.dark.sheet : BRAND.light.sheet;

  return (
    <View style={[styles.shell, { borderTopColor: border, backgroundColor: bg }, style]}>
      {sublabel ? (
        <View style={styles.sublabelRow}>
          <Text style={[styles.sublabel, { color: darkMode ? BRAND.dark.textSecondary : BRAND.light.textSecondary }]}>
            {sublabel}
          </Text>
        </View>
      ) : null}
      {children}
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backLink} hitSlop={8}>
          <Text style={[styles.backLinkText, { color: darkMode ? BRAND.dark.textSecondary : BRAND.light.textSecondary }]}>
            ← {backLabel}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.cta,
          tone === 'outline' && styles.ctaOutline,
          disabled && styles.ctaDisabled,
        ]}
      >
        <Text
          style={[
            styles.ctaText,
            tone === 'outline' && styles.ctaTextOutline,
            disabled && styles.ctaTextDisabled,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sublabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sublabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  backLink: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginBottom: 10,
  },
  backLinkText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  cta: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: BRAND.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    backgroundColor: '#E5E5E5',
  },
  ctaText: {
    color: BRAND.primaryText,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  ctaOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: BRAND.primary,
  },
  ctaTextOutline: {
    color: BRAND.primary,
  },
  ctaTextDisabled: {
    color: '#9B9B9B',
  },
});
