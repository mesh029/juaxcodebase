import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Radius } from '../../theme/spacing';
import { Motion } from '../../theme/motion';

type Props = {
  style?: StyleProp<ViewStyle>;
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
};

/**
 * Soft opacity pulse — placeholder while content loads.
 * No shimmer gradient; calm and lightweight.
 */
export function SkeletonBlock({ style, height = 14, width = '100%', radius = Radius.xs }: Props) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: Motion.duration.normal,
          easing: Motion.timing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: Motion.duration.normal,
          easing: Motion.timing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        { height, width, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: 'rgba(127, 127, 142, 0.22)',
  },
});
