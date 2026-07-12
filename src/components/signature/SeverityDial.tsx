import { Canvas, Circle, Line, Path, Skia, vec, type SkPath } from '@shopify/react-native-skia';
import React from 'react';
import { Pressable, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  interpolateColor,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { IssueSeverity } from '@/lib/types';
import { ISSUE_SEVERITY_LABELS } from '@/lib/types';
import { durations, haptic, space, springs, useMotion, useTheme, type ColorToken } from '@/theme';
import { AppText } from '@/components/ui';

export interface SeverityDialProps {
  value: IssueSeverity;
  onChange: (severity: IssueSeverity) => void;
}

const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'critical'];

/** Needle progress at each detent center: thirds of the 180 degree sweep. */
const DETENT_T = [1 / 6, 3 / 6, 5 / 6];

/** Zone color tokens: Low stays neutral, Medium and Critical follow status colors. */
const ZONE_TOKENS: Record<IssueSeverity, ColorToken> = {
  low: 'textSecondary',
  medium: 'statusDueSoon',
  critical: 'statusOverdue',
};

/** Geometry: label band above the arc, side clearance for the radial labels. */
const LABEL_BAND = 40;
const SIDE_CLEARANCE = 56;
const LABEL_RADIUS_OFFSET = 22;
const LABEL_BOX_WIDTH = 88;
const MIN_RADIUS = 72;
const MAX_RADIUS = 128;
const NEEDLE_INSET = 16;

/** One zone arc; opacity crossfades when the detent changes. */
function ZoneArc({
  index,
  path,
  color,
  detentIdx,
}: {
  index: number;
  path: SkPath;
  color: string;
  detentIdx: SharedValue<number>;
}) {
  const opacity = useDerivedValue(() =>
    withTiming(detentIdx.value === index ? 1 : 0, { duration: durations.fadeFast })
  );
  return <Path path={path} style="stroke" strokeWidth={4} strokeCap="butt" color={color} opacity={opacity} />;
}

/**
 * Signature moment 6: the severity gauge. A Skia half dial whose whole face
 * is the pan surface, three tappable detent zones, and a needle that springs
 * to the nearest detent on release. Haptic fires only when the detent
 * changes, latched in a shared value inside the pan worklet.
 *
 * Gesture note: the dial lives inside a bottom sheet whose content-panning
 * gesture owns vertical drags. The pan activates on horizontal movement
 * (activeOffsetX) and fails on a mostly vertical start (failOffsetY), so the
 * dial never fights the sheet: horizontal drags steer the needle, vertical
 * drags still move the sheet. Taps and the accessibility actions cover
 * absolute selection everywhere on the face.
 */
export const SeverityDial = React.memo(function SeverityDial({ value, onChange }: SeverityDialProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const [width, setWidth] = React.useState(0);

  const initialIdx = Math.max(0, SEVERITIES.indexOf(value));
  const detentIdx = useSharedValue(initialIdx);
  const angle = useSharedValue(DETENT_T[initialIdx]);

  const releaseSpring = React.useMemo(
    () => (reduced ? { ...springs.snappy, overshootClamping: true } : springs.snappy),
    [reduced]
  );

  const R = Math.max(MIN_RADIUS, Math.min(width / 2 - SIDE_CLEARANCE, MAX_RADIUS));
  const cx = width / 2;
  const cy = LABEL_BAND + R;
  const height = cy + 12;

  const zoneColors = React.useMemo(
    () => [colors.textSecondary, colors.statusDueSoon, colors.statusOverdue],
    [colors]
  );

  const { trackPath, zonePaths, minorTicks, majorTicks } = React.useMemo(() => {
    const rect = Skia.XYWHRect(cx - R, cy - R, R * 2, R * 2);
    const track = Skia.Path.Make();
    track.addArc(rect, 180, 180);
    const zones = [0, 1, 2].map((i) => {
      const p = Skia.Path.Make();
      p.addArc(rect, 180 + i * 60, 60);
      return p;
    });
    const minor = Skia.Path.Make();
    const major = Skia.Path.Make();
    for (let k = 0; k <= 24; k++) {
      const isMajor = k === 4 || k === 12 || k === 20;
      const a = Math.PI * (1 + k / 24);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const from = isMajor ? R + 6 : R - 3;
      const to = isMajor ? R - 8 : R - 10;
      const p = isMajor ? major : minor;
      p.moveTo(cx + cos * from, cy + sin * from);
      p.lineTo(cx + cos * to, cy + sin * to);
    }
    return { trackPath: track, zonePaths: zones, minorTicks: minor, majorTicks: major };
  }, [cx, cy, R]);

  const pivot = vec(cx, cy);
  const needleP2 = useDerivedValue(() => {
    const a = Math.PI * (1 + angle.value);
    return vec(cx + Math.cos(a) * (R - NEEDLE_INSET), cy + Math.sin(a) * (R - NEEDLE_INSET));
  }, [cx, cy, R]);
  const needleColor = useDerivedValue(
    () => interpolateColor(angle.value, DETENT_T, zoneColors),
    [zoneColors]
  );

  /** JS side of a detent change: one selection tick, then tell the parent. */
  const notifyDetent = React.useCallback(
    (idx: number) => {
      haptic.select();
      onChange(SEVERITIES[idx]);
    },
    [onChange]
  );

  /** Tap zones and accessibility actions select a detent directly. */
  const selectDetent = React.useCallback(
    (idx: number) => {
      const changed = SEVERITIES[idx] !== value;
      detentIdx.value = idx;
      angle.value = withSpring(DETENT_T[idx], releaseSpring);
      if (changed) {
        haptic.select();
        onChange(SEVERITIES[idx]);
      }
    },
    [value, onChange, releaseSpring, angle, detentIdx]
  );

  /** External value changes (editing an existing issue) re-aim the needle. */
  React.useEffect(() => {
    const idx = SEVERITIES.indexOf(value);
    if (idx >= 0 && idx !== detentIdx.value) {
      detentIdx.value = idx;
      angle.value = withSpring(DETENT_T[idx], releaseSpring);
    }
  }, [value, releaseSpring, angle, detentIdx]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .activeOffsetX([-5, 5])
        .failOffsetY([-16, 16])
        .shouldCancelWhenOutside(false)
        .onUpdate((e) => {
          'worklet';
          const dx = e.x - cx;
          const dy = e.y - cy;
          let t: number;
          if (dy < 0) {
            t = (Math.atan2(dy, dx) + Math.PI) / Math.PI;
          } else {
            t = dx < 0 ? 0 : 1;
          }
          t = Math.min(1, Math.max(0, t));
          angle.value = t;
          const idx = t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
          if (idx !== detentIdx.value) {
            detentIdx.value = idx;
            runOnJS(notifyDetent)(idx);
          }
        })
        .onFinalize(() => {
          'worklet';
          angle.value = withSpring(DETENT_T[detentIdx.value], releaseSpring);
        }),
    [cx, cy, releaseSpring, notifyDetent, angle, detentIdx]
  );

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const onAccessibilityAction = React.useCallback(
    (event: AccessibilityActionEvent) => {
      const idx = SEVERITIES.indexOf(value);
      if (event.nativeEvent.actionName === 'increment' && idx < SEVERITIES.length - 1) {
        selectDetent(idx + 1);
      } else if (event.nativeEvent.actionName === 'decrement' && idx > 0) {
        selectDetent(idx - 1);
      }
    },
    [value, selectDetent]
  );

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Severity"
        accessibilityValue={{ text: ISSUE_SEVERITY_LABELS[value] }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        onLayout={onLayout}
      >
        {width > 0 ? (
          <>
            <Canvas style={{ width, height }}>
              <Line p1={vec(cx - R - 6, cy)} p2={vec(cx + R + 6, cy)} color={colors.hairline} strokeWidth={1} />
              <Path path={trackPath} style="stroke" strokeWidth={2} strokeCap="butt" color={colors.hairline} />
              {zonePaths.map((path, i) => (
                <ZoneArc key={SEVERITIES[i]} index={i} path={path} color={zoneColors[i]} detentIdx={detentIdx} />
              ))}
              <Path path={minorTicks} style="stroke" strokeWidth={1} strokeCap="butt" color={colors.hairline} />
              <Path path={majorTicks} style="stroke" strokeWidth={1.5} strokeCap="butt" color={colors.stroke} />
              <Line p1={pivot} p2={needleP2} color={needleColor} strokeWidth={3} />
              <Circle c={pivot} r={7} style="stroke" strokeWidth={1.5} color={colors.stroke} />
              <Circle c={pivot} r={3} color={needleColor} />
            </Canvas>
            {SEVERITIES.map((sev, i) => {
              const a = Math.PI * (1 + DETENT_T[i]);
              const lx = cx + Math.cos(a) * (R + LABEL_RADIUS_OFFSET);
              const ly = cy + Math.sin(a) * (R + LABEL_RADIUS_OFFSET);
              return (
                <View
                  key={sev}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: lx - LABEL_BOX_WIDTH / 2,
                    top: ly - 8,
                    width: LABEL_BOX_WIDTH,
                    alignItems: 'center',
                  }}
                >
                  <AppText variant="label" color={value === sev ? ZONE_TOKENS[sev] : 'textMuted'}>
                    {ISSUE_SEVERITY_LABELS[sev]}
                  </AppText>
                </View>
              );
            })}
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height, flexDirection: 'row' }}>
              {SEVERITIES.map((sev, i) => (
                <Pressable
                  key={sev}
                  accessible={false}
                  importantForAccessibility="no"
                  style={{ flex: 1 }}
                  onPress={() => selectDetent(i)}
                />
              ))}
            </View>
            <AppText variant="label" color={ZONE_TOKENS[value]} center style={{ marginTop: space.xs }}>
              {ISSUE_SEVERITY_LABELS[value]}
            </AppText>
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
});
