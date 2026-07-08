import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { A11y, Motion } from '../../theme';

type Props = {
  active: boolean;
  activeColor: string;
  idleColor: string;
  onPress: () => void;
  style?: ViewStyle;
  accessibilityLabel: string;
};

/** Carousel / pager dot with width morph on selection. */
export function AnimatedPagerDot({ active, activeColor, idleColor, onPress, style, accessibilityLabel }: Props) {
  const width = useRef(new Animated.Value(active ? 22 : 8)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: active ? 22 : 8,
      duration: Motion.duration.normal,
      easing: Motion.timing.standard,
      useNativeDriver: false,
    }).start();
  }, [active, width]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={A11y.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
    >
      <Animated.View
        style={[
          styles.dot,
          style,
          {
            width,
            backgroundColor: active ? activeColor : idleColor,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
