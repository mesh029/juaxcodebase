import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

type Props = {
  size?: number;
  color?: string;
  letterColor?: string;
};

/** Jua X sun mark — matches Figma Make JuaSunIcon */
export function JuaSunIcon({
  size = 72,
  color = Colors.light.primary,
  letterColor = Colors.light.ctaText,
}: Props) {
  const radius = size / 2;
  return (
    <View
      style={[
        styles.sun,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color,
        },
      ]}
    >
      <Text style={[styles.letter, { fontSize: size * 0.42, color: letterColor }]}>J</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sun: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  letter: {
    fontFamily: 'Inter_700Bold',
    marginTop: -2,
  },
});
