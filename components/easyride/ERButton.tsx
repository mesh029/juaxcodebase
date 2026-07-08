import { ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { BRAND } from '../../theme/brand';
import { ComponentSize, HapticMap, Shadows, TextRole, FontFamily } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { AccessibleText } from '../ui/AccessibleText';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function ERButton({ label, onPress, disabled, loading, style }: Props) {
  const off = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!loading }}
      onPress={() => {
        if (!off) HapticMap.light();
        onPress();
      }}
      disabled={off}
      style={[styles.base, off && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <AccessibleText style={styles.label}>{label}</AccessibleText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: ComponentSize.button.lg,
    borderRadius: ComponentSize.button.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ComponentSize.button.paddingX,
    backgroundColor: BRAND.primary,
    ...Shadows.level2,
  },
  disabled: {
    backgroundColor: '#E5E5E5',
    shadowOpacity: 0,
    elevation: 0,
  },
  label: {
    fontSize: TextRole.bodyStrong.fontSize,
    lineHeight: TextRole.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    color: BRAND.primaryText,
  },
});
