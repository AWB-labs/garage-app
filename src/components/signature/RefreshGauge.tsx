import { Canvas, Circle, Group, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import React from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * Signature moment 8, iOS half: a small Skia gauge above the list header,
 * driven directly by negative contentOffset.y from the scroll shared value.
 * The needle sweeps the dial with pull distance; the final accent tick marks
 * the release point. While refreshing the needle spins with withRepeat.
 * No extra pan gesture anywhere near the list: the scroll offset is the
 * only input. Under reduce motion the screen never mounts this component
 * and falls back to the plain tinted RefreshControl.
 */

/** Pull distance (pt) that arms a refresh on release. */
export const REFRESH_TRIGGER = 88;

const W = 76;
const H = 52;
const PIVOT_X = W / 2;
const PIVOT_Y = 34;
const R = 22;
/** 240 degree sweep opening at the bottom, angles in canvas (y-down) space. */
const START = (150 * Math.PI) / 180;
const SWEEP = (240 * Math.PI) / 180;
const TICKS = 13;
const SPIN_MS = 1100;
/** Ignore the first few points of pull so tiny bounces do not flash the gauge. */
const APPEAR_AFTER = 8;
const APPEAR_OVER = 40;

export interface RefreshGaugeProps {
  scrollY: SharedValue<number>;
  refreshing: boolean;
}

export const RefreshGauge = React.memo(function RefreshGauge({ scrollY, refreshing }: RefreshGaugeProps) {
  const { colors } = useTheme();
  const spin = useSharedValue(0);

  React.useEffect(() => {
    if (refreshing) {
      spin.value = SWEEP;
      spin.value = withRepeat(
        withTiming(SWEEP + Math.PI * 2, { duration: SPIN_MS, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [refreshing, spin]);

  const { facePath, armPath } = React.useMemo(() => {
    const face = Skia.Path.Make();
    const arm = Skia.Path.Make();
    for (let i = 0; i < TICKS; i += 1) {
      const angle = START + (i / (TICKS - 1)) * SWEEP;
      const isMajor = i % 3 === 0;
      const isArm = i === TICKS - 1;
      const inner = R - (isMajor || isArm ? 7 : 4.5);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const target = isArm ? arm : face;
      target.moveTo(PIVOT_X + cos * inner, PIVOT_Y + sin * inner);
      target.lineTo(PIVOT_X + cos * R, PIVOT_Y + sin * R);
    }
    return { facePath: face, armPath: arm };
  }, []);

  const rotation = useDerivedValue(() => {
    if (refreshing) return START + spin.value;
    const pull = Math.min(Math.max(-scrollY.value / REFRESH_TRIGGER, 0), 1.08);
    return START + pull * SWEEP;
  }, [refreshing]);
  const needleTransform = useDerivedValue(() => [{ rotate: rotation.value }]);

  const containerStyle = useAnimatedStyle(() => {
    if (refreshing) return { opacity: 1 };
    return { opacity: Math.min(Math.max((-scrollY.value - APPEAR_AFTER) / APPEAR_OVER, 0), 1) };
  }, [refreshing]);

  return (
    <Animated.View
      style={[{ width: W, height: H }, containerStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={{ width: W, height: H }}>
        <Path path={facePath} style="stroke" strokeWidth={1} color={colors.stroke} />
        <Path path={armPath} style="stroke" strokeWidth={1.5} color={colors.accentText} />
        <Group origin={vec(PIVOT_X, PIVOT_Y)} transform={needleTransform}>
          <Line
            p1={vec(PIVOT_X - 5, PIVOT_Y)}
            p2={vec(PIVOT_X + R - 3, PIVOT_Y)}
            strokeWidth={2}
            color={colors.accentText}
          />
        </Group>
        <Circle cx={PIVOT_X} cy={PIVOT_Y} r={3} color={colors.accentText} />
      </Canvas>
    </Animated.View>
  );
});
