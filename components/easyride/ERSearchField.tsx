import { Pressable, StyleSheet, Text } from 'react-native';
import { BRAND } from '../../theme/brand';

type Props = {
  value: string;
  placeholder?: string;
  onPress?: () => void;
};

export function ERSearchField({ value, placeholder = 'Where to, Jua?', onPress }: Props) {
  return (
    <Pressable style={styles.wrap} onPress={onPress}>
      <Text style={styles.icon}>⌕</Text>
      <Text style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>
        {value || placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: BRAND.radius.lg,
    backgroundColor: BRAND.light.surface,
    marginBottom: 16,
  },
  icon: {
    fontSize: 16,
    color: BRAND.light.textSecondary,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: BRAND.light.text,
  },
  placeholder: {
    color: BRAND.light.textSecondary,
  },
});
