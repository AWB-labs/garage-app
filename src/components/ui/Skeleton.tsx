import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radius as radii, useMotion, useTheme } from '@/theme';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Layout-matching loading block. Pulses gently; static under reduce motion. */
export function Skeleton({ width = '100%', height = 16, radius = radii.xs, style }: SkeletonProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const pulse = useSharedValue(0.55);

  React.useEffect(() => {
    if (reduced) {
      pulse.value = 0.55;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [reduced, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton }, animatedStyle, style]}
    />
  );
}
