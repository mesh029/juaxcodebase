import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { BRAND } from '../../theme/brand';
import { ComponentSize, FontFamily, HapticMap, Radius, Spacing, TextRole, Touch, sheetChrome, A11y } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { AccessibleText } from '../ui/AccessibleText';

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
  const shellChrome = sheetChrome(darkMode);
  const textPrimary = darkMode ? BRAND.dark.text : BRAND.light.text;
  const textSecondary = darkMode ? BRAND.dark.textSecondary : BRAND.light.textSecondary;
  const muted = darkMode ? BRAND.dark.surface : BRAND.light.primaryFaint;
  const subtleBorder = darkMode ? 'transparent' : BRAND.light.border;

  return (
    <View style={[styles.shell, shellChrome, style]}>
      {sublabel ? (
        <View style={styles.sublabelRow}>
          <AccessibleText style={[styles.sublabel, { color: textSecondary }]}>{sublabel}</AccessibleText>
        </View>
      ) : null}
      {children}
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.backLink}
          hitSlop={A11y.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <AccessibleText style={[styles.backLinkText, { color: textSecondary }]}>← {backLabel}</AccessibleText>
        </Pressable>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        onPress={() => {
          if (!disabled) HapticMap.light();
          onPress();
        }}
        disabled={disabled}
        style={[
          styles.cta,
          tone === 'primary' && styles.ctaPrimary,
          tone === 'subtle' && [styles.ctaSubtle, { borderColor: subtleBorder, backgroundColor: muted }],
          tone === 'outline' && styles.ctaOutline,
          disabled && styles.ctaDisabled,
        ]}
      >
        <AccessibleText
          style={[
            styles.ctaText,
            tone === 'primary' && styles.ctaTextPrimary,
            tone === 'subtle' && [styles.ctaTextSubtle, { color: disabled ? '#9B9B9B' : textPrimary }],
            tone === 'outline' && styles.ctaTextOutline,
            disabled && tone === 'primary' && styles.ctaTextDisabled,
          ]}
        >
          {label}
        </AccessibleText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexShrink: 0,
    paddingHorizontal: Spacing[2],
    paddingTop: Spacing[1],
    paddingBottom: Spacing[0.5],
  },
  sublabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sublabel: {
    fontSize: TextRole.overline.fontSize,
    lineHeight: TextRole.overline.lineHeight,
    fontFamily: FontFamily.regular,
  },
  backLink: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing[1],
    marginBottom: 4,
    minHeight: Touch.minSize,
    justifyContent: 'center',
  },
  backLinkText: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.medium,
  },
  cta: {
    minHeight: ComponentSize.button.md,
    borderRadius: Radius.sm,
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
    fontSize: TextRole.bodyStrong.fontSize,
    lineHeight: TextRole.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: 0.1,
  },
  ctaTextPrimary: {
    color: BRAND.primaryText,
  },
  ctaTextSubtle: {
    fontFamily: FontFamily.medium,
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
