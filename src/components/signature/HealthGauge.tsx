import { Canvas, Circle, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import React from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  interpolateColor,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { HealthDeduction } from '@/lib/health';
import { AppText, Icon, PressableScale } from '@/components/ui';
import { durations, radius, space, springs, useMotion, useTheme } from '@/theme';

export interface HealthGaugeProps {
  /** 5..100 from healthScore. */
  score: number;
  deductions: HealthDeduction[];
  /** Rendered dial width; height follows the 240 degree geometry. */
  width: number;
}

/**
 * Signature moment 2: the health gauge. A 240 degree dial opening at the
 * bottom, hairline ticks, a permanent redline sector over the last 15 points
 * of health, and a thin needle that springs in with overshoot. Only the
 * needle and the active sweep lerp phosphor, amber, redline; ticks stay
 * neutral. Tap to spring open the deduction breakdown.
 */

/** Dial opens at the bottom: 150deg start, 240deg sweep, gap centered on 90deg. */
const START_DEG = 150;
const SWEEP_DEG = 240;
/** Redline sector: the last 15 points of health, at the low end of the sweep. */
const REDLINE_FRACTION = 0.15;

export function HealthGauge({ score, deductions, width }: HealthGaugeProps) {
  const { colors } = useTheme();
  const { reduced, stagger } = useMotion();
  const [expanded, setExpanded] = React.useState(false);

  const geom = React.useMemo(() => {
    const pad = space.md;
    const outerR = (width - pad * 2) / 2;
    const cx = width / 2;
    const cy = pad + outerR;
    // The arc endpoints sit at sin(30deg) = 0.5 below the pivot.
    const height = Math.ceil(cy + outerR * 0.5 + pad);
    const arcR = outerR - space.lg - space.sm;
    const needleR = arcR - space.xs;
    return { outerR, cx, cy, height, arcR, needleR };
  }, [width]);

  const dial = React.useMemo(() => {
    const { outerR, cx, cy, arcR } = geom;
    const minor = Skia.Path.Make();
    const major = Skia.Path.Make();
    // 48 intervals: 8 major divisions, 40 minor ticks between them.
    for (let i = 0; i <= 48; i++) {
      const isMajor = i % 6 === 0;
      const a = ((START_DEG + (i / 48) * SWEEP_DEG) * Math.PI) / 180;
      const len = isMajor ? space.lg : space.sm;
      const path = isMajor ? major : minor;
      path.moveTo(cx + Math.cos(a) * (outerR - len), cy + Math.sin(a) * (outerR - len));
      path.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
    }
    const rRed = outerR - space.xs;
    const redline = Skia.Path.Make();
    redline.addArc(
      { x: cx - rRed, y: cy - rRed, width: rRed * 2, height: rRed * 2 },
      START_DEG,
      SWEEP_DEG * REDLINE_FRACTION
    );
    const arc = Skia.Path.Make();
    arc.addArc({ x: cx - arcR, y: cy - arcR, width: arcR * 2, height: arcR * 2 }, START_DEG, SWEEP_DEG);
    return { minor, major, redline, arc };
  }, [geom]);

  // The needle springs in on mount and re-springs on every score change.
  const progress = useSharedValue(reduced ? score / 100 : 0);
  React.useEffect(() => {
    const target = Math.max(0, Math.min(1, score / 100));
    if (reduced) {
      progress.value = target;
      return;
    }
    progress.value = withSpring(target, springs.settle);
  }, [score, reduced, progress]);

  const trimEnd = useDerivedValue(() => Math.max(0.001, Math.min(1, progress.value)), [progress]);
  const sweepColor = useDerivedValue(
    () =>
      interpolateColor(
        Math.max(0, Math.min(1, progress.value)),
        [REDLINE_FRACTION, 0.5, 0.85],
        [colors.danger, colors.accent, colors.success]
      ),
    [progress, colors.danger, colors.accent, colors.success]
  );
  const needleP1 = useDerivedValue(() => {
    const a = ((START_DEG + progress.value * SWEEP_DEG) * Math.PI) / 180;
    return vec(geom.cx - Math.cos(a) * space.md, geom.cy - Math.sin(a) * space.md);
  }, [progress, geom]);
  const needleP2 = useDerivedValue(() => {
    const a = ((START_DEG + progress.value * SWEEP_DEG) * Math.PI) / 180;
    return vec(geom.cx + Math.cos(a) * geom.needleR, geom.cy + Math.sin(a) * geom.needleR);
  }, [progress, geom]);

  const rowEnter = (index: number) =>
    reduced
      ? FadeIn.duration(durations.fade).reduceMotion(ReduceMotion.Never)
      : FadeInDown.springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness)
          .overshootClamping(1)
          .delay(stagger(index));

  const displayScore = Math.round(score);

  return (
    <View>
      <PressableScale
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`Health ${displayScore} out of 100`}
        accessibilityHint="Shows what lowered the score"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((prev) => !prev)}
        style={{ alignSelf: 'center' }}
      >
        <Canvas style={{ width, height: geom.height }} pointerEvents="none">
          <Path path={dial.redline} style="stroke" strokeWidth={space.sm} color={colors.danger} opacity={0.3} />
          <Path path={dial.minor} style="stroke" strokeWidth={1} color={colors.hairline} />
          <Path path={dial.major} style="stroke" strokeWidth={1.5} color={colors.stroke} />
          <Path
            path={dial.arc}
            style="stroke"
            strokeWidth={3}
            strokeCap="butt"
            color={sweepColor}
            start={0}
            end={trimEnd}
          />
          <Line p1={needleP1} p2={needleP2} color={sweepColor} strokeWidth={2} />
          <Circle cx={geom.cx} cy={geom.cy} r={5} color={colors.stroke} />
          <Circle cx={geom.cx} cy={geom.cy} r={2} color={colors.bg} />
        </Canvas>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: geom.cy + space.sm, alignItems: 'center' }}
        >
          <AppText variant="displayXL">{displayScore}</AppText>
          <AppText variant="label" color="textMuted">
            Health
          </AppText>
        </View>
      </PressableScale>
      {expanded ? (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {deductions.length === 0 ? (
            <Animated.View
              entering={rowEnter(0)}
              exiting={FadeOut.duration(durations.fadeFast)}
              accessible
              accessibilityLabel="All clear. No deductions."
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                backgroundColor: colors.inset,
                borderRadius: radius.sm,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
              }}
            >
              <Icon name="check" size={16} color={colors.successText} />
              <AppText variant="small" color="textSecondary">
                All clear. No deductions.
              </AppText>
            </Animated.View>
          ) : (
            deductions.map((deduction, index) => (
              <Animated.View
                key={`${deduction.label}-${index}`}
                entering={rowEnter(index)}
                exiting={FadeOut.duration(durations.fadeFast)}
                accessible
                accessibilityLabel={`${deduction.label}, minus ${deduction.points} points`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space.md,
                  backgroundColor: colors.inset,
                  borderRadius: radius.sm,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                }}
              >
                <AppText variant="small" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {deduction.label}
                </AppText>
                <AppText variant="smallMedium" color="dangerText">
                  {`-${deduction.points}`}
                </AppText>
              </Animated.View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
