import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { HapticMap, Motion } from '../../theme';

type Props = {
  message: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/** Booking / success notice — slides in with optional success haptic. */
export function AnimatedNotice({ message, onPress, style, textStyle }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;
  const prevMessage = useRef('');

  useEffect(() => {
    if (!message) {
      opacity.setValue(0);
      translateY.setValue(-10);
      prevMessage.current = '';
      return;
    }
    const isNew = message !== prevMessage.current;
    prevMessage.current = message;
    if (isNew && /confirmed|submitted|active|unlocked/i.test(message)) {
      HapticMap.bookingConfirmed();
    } else if (isNew) {
      HapticMap.light();
    }
    opacity.setValue(0);
    translateY.setValue(-10);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: Motion.duration.normal,
        easing: Motion.timing.enter,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: Motion.duration.normal,
        easing: Motion.timing.enter,
        useNativeDriver: true,
      }),
    ]).start();
  }, [message, opacity, translateY]);

  if (!message) return null;

  const content = (
    <Animated.View
      style={[style, { opacity, transform: [{ translateY }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={textStyle} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.35}>
        {message}
      </Text>
    </Animated.View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
