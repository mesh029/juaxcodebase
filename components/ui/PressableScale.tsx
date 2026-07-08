import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Motion } from '../../theme/motion';

type Props = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale on press-in — default 0.97 */
  scaleTo?: number;
};

/**
 * Subtle scale feedback for tappable cards and primary actions.
 * Fast (150ms), native-driver, no decorative bounce.
 */
export function PressableScale({
  children,
  style,
  scaleTo = Motion.press.scale,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const runScale = (to: number) => {
    Animated.timing(scale, {
      toValue: to,
      duration: Motion.duration.fast,
      easing: Motion.timing.standard,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(event) => {
        if (!disabled) runScale(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        runScale(1);
        onPressOut?.(event);
      }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
