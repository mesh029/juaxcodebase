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
  /** primary = final action · subtle = wizard continue (home-style) · outline = secondary */
  tone?: 'primary' | 'outline' | 'subtle';
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
  tone = 'subtle',
  onBack,
  backLabel = 'Back',
  children,
}: Props) {
  const border = darkMode ? BRAND.dark.border : BRAND.light.border;
  const bg = darkMode ? BRAND.dark.sheet : BRAND.light.sheet;
  const textPrimary = darkMode ? BRAND.dark.text : BRAND.light.text;
  const textSecondary = darkMode ? BRAND.dark.textSecondary : BRAND.light.textSecondary;
  const muted = darkMode ? BRAND.dark.surface : BRAND.light.primaryFaint;

  return (
    <View style={[styles.shell, { borderTopColor: border, backgroundColor: bg }, style]}>
      {sublabel ? (
        <View style={styles.sublabelRow}>
          <Text style={[styles.sublabel, { color: textSecondary }]}>{sublabel}</Text>
        </View>
      ) : null}
      {children}
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backLink} hitSlop={8}>
          <Text style={[styles.backLinkText, { color: textSecondary }]}>← {backLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.cta,
          tone === 'primary' && styles.ctaPrimary,
          tone === 'subtle' && [styles.ctaSubtle, { borderColor: border, backgroundColor: muted }],
          tone === 'outline' && styles.ctaOutline,
          disabled && styles.ctaDisabled,
        ]}
      >
        <Text
          style={[
            styles.ctaText,
            tone === 'primary' && styles.ctaTextPrimary,
            tone === 'subtle' && [styles.ctaTextSubtle, { color: disabled ? '#9B9B9B' : textPrimary }],
            tone === 'outline' && styles.ctaTextOutline,
            disabled && tone === 'primary' && styles.ctaTextDisabled,
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
    paddingTop: 6,
    paddingBottom: 4,
  },
  sublabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sublabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  backLink: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    marginBottom: 4,
  },
  backLinkText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  cta: {
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimary: {
    backgroundColor: BRAND.primary,
  },
  ctaSubtle: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaDisabled: {
    opacity: 0.45,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.1,
  },
  ctaTextPrimary: {
    color: BRAND.primaryText,
  },
  ctaTextSubtle: {
    fontFamily: 'Inter_500Medium',
  },
  ctaOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: BRAND.primary,
  },
  ctaTextOutline: {
    color: BRAND.primary,
  },
  ctaTextDisabled: {
    color: '#9B9B9B',
  },
});
