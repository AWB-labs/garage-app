import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { durations, springs, useMotion, useTheme } from '@/theme';

export interface RewardPulseProps {
  /**
   * Fire counter. Each increment fires one pulse; the initial value never
   * fires, so recycled list rows mounting mid-session stay quiet.
   */
  trigger: number;
  /** Corner radius of the host row so the glow hugs its silhouette. */
  borderRadius: number;
}

/**
 * Signature moment 9, the reward: when an overdue or due-soon reminder is
 * cleared by a logged service, a phosphor glow pulses outward from the row.
 * Phosphor only, matching "resolved": never amber, never confetti.
 *
 * Implemented as an animated View ring plus a fill highlight rather than a
 * Skia canvas, because reminder rows live inside a recycled FlashList and
 * per-row canvases are forbidden. Reduce motion: a static phosphor highlight
 * that holds briefly, then fades.
 */

/** Ring stroke follows the icon grammar's 1.5 stroke. */
const RING_STROKE = 1.5;
/** How far the ring travels outward, as a scale factor. */
const RING_SCALE_TO = 1.07;
const RING_OPACITY_FROM = 0.9;
const FILL_OPACITY_FROM = 0.22;
/** Reduce motion: hold the static highlight about 1.5s, then fade. */
const REDUCED_HOLD_MS = 1500;

export const RewardPulse = React.memo(function RewardPulse({ trigger, borderRadius }: RewardPulseProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const fillOpacity = useSharedValue(0);
  const lastHandled = React.useRef(trigger);

  React.useEffect(() => {
    if (trigger === lastHandled.current) return;
    lastHandled.current = trigger;
    cancelAnimation(ringScale);
    cancelAnimation(ringOpacity);
    cancelAnimation(fillOpacity);

    if (reduced) {
      // Static phosphor highlight, fading out after a short hold.
      ringScale.value = 1;
      ringOpacity.value = 0;
      fillOpacity.value = FILL_OPACITY_FROM;
      fillOpacity.value = withDelay(REDUCED_HOLD_MS, withTiming(0, { duration: durations.fade }));
      return;
    }

    // Spring-driven pulse: the ring blooms outward while everything fades.
    ringScale.value = 1;
    ringOpacity.value = RING_OPACITY_FROM;
    fillOpacity.value = FILL_OPACITY_FROM;
    ringScale.value = withSpring(RING_SCALE_TO, springs.bloom);
    ringOpacity.value = withSpring(0, springs.settle);
    fillOpacity.value = withSpring(0, springs.settle);
  }, [trigger, reduced, ringScale, ringOpacity, fillOpacity]);

  React.useEffect(() => {
    return () => {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      cancelAnimation(fillOpacity);
    };
  }, [ringScale, ringOpacity, fillOpacity]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: fillOpacity.value }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius, backgroundColor: colors.success }, fillStyle]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius, borderWidth: RING_STROKE, borderColor: colors.success },
          ringStyle,
        ]}
      />
    </View>
  );
});
