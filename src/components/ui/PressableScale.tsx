import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs, useMotion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  /** Scale when pressed. */
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The standard touchable: springs to a slightly smaller scale while pressed,
 * interruptible, skipped under reduce motion. Guarantees a 44pt hit target.
 */
export function PressableScale({
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressableScaleProps) {
  const { reduced } = useMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={6}
      {...rest}
      onPressIn={(e) => {
        if (!reduced) scale.value = withSpring(pressedScale, springs.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) scale.value = withSpring(1, springs.snappy);
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
    />
  );
}
