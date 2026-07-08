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
 * Layout styles stay on the Pressable so flex/minHeight work; only scale
 * runs on the inner Animated.View (native driver).
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
      style={style}
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
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}
