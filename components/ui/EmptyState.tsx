import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { FontFamily, Radius, Spacing, TextRole, Touch } from '../../theme';
import { AccessibleText } from './AccessibleText';
import { PressableScale } from './PressableScale';

type Props = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  darkMode?: boolean;
  mutedSurface: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  border: string;
};

/** Compact empty placeholder — icon, title, optional CTA. */
export function EmptyState({
  icon = '○',
  title,
  description,
  actionLabel,
  onAction,
  style,
  darkMode = false,
  mutedSurface,
  textPrimary,
  textSecondary,
  primary,
  border,
}: Props) {
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: mutedSurface,
          borderColor: darkMode ? 'transparent' : border,
          borderWidth: darkMode ? 0 : StyleSheet.hairlineWidth,
        },
        style,
      ]}
      accessibilityRole="text"
    >
      <AccessibleText style={styles.icon} accessibilityElementsHidden>
        {icon}
      </AccessibleText>
      <AccessibleText style={[styles.title, { color: textPrimary }]}>{title}</AccessibleText>
      {description ? (
        <AccessibleText style={[styles.description, { color: textSecondary }]}>{description}</AccessibleText>
      ) : null}
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={[styles.action, { borderColor: primary }]}
        >
          <AccessibleText style={[styles.actionLabel, { color: primary }]}>{actionLabel}</AccessibleText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[3],
    alignItems: 'center',
    gap: Spacing[1],
  },
  icon: {
    fontSize: 28,
    lineHeight: 32,
    opacity: 0.85,
  },
  title: {
    fontSize: TextRole.bodyStrong.fontSize,
    lineHeight: TextRole.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  description: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.regular,
    textAlign: 'center',
    maxWidth: 280,
  },
  action: {
    marginTop: Spacing[0.5],
    minHeight: Touch.minSize,
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: TextRole.label.fontSize,
    lineHeight: TextRole.label.lineHeight,
    fontFamily: FontFamily.semibold,
  },
});
