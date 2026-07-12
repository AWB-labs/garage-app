import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { useMotion, useTheme } from '@/theme';

/**
 * Signature moment 3: the living timeline rail. ONE absolutely positioned
 * Skia canvas behind the whole FlashList (never per row) draws the vertical
 * rail as odometer tape: a main line plus minor ticks, with brighter major
 * ticks on a fixed cadence. The tape lives in content coordinates and is
 * translated by the scroll shared value on the UI thread; its drawn length
 * is clipped to scrollY + viewportHeight * 0.85 so the tape draws itself in
 * as you scroll. Printed km values are not drawn here: Skia text is heavy,
 * so the rows carry the mono captions instead.
 */

/** Width of the left gutter column every timeline row reserves for its node glyph. */
export const RAIL_GUTTER = 40;

/** Minor odometer tick cadence along the tape, in pt. */
const TICK_STEP = 24;
/** Every Nth tick is a brighter, wider major tick. */
const MAJOR_EVERY = 5;
const MINOR_HALF = 3;
const MAJOR_HALF = 5.5;
/** The tape is drawn down to this fraction of the viewport below the scroll offset. */
const REVEAL = 0.85;

export interface TimelineRailProps {
  /** Scroll offset of the list, in a shared value (UI thread). */
  scrollY: SharedValue<number>;
  /** Rail center x, in canvas coordinates. */
  x: number;
  /** Content y where the tape starts (just below the list header). */
  top: number;
  /** Content y where the tape ends (above the list's bottom padding). */
  end: number;
  /** Canvas width. */
  width: number;
  /** Visible list viewport height. */
  viewportHeight: number;
}

export const TimelineRail = React.memo(function TimelineRail({
  scrollY,
  x,
  top,
  end,
  width,
  viewportHeight,
}: TimelineRailProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();

  const { minorPath, majorPath } = React.useMemo(() => {
    const minor = Skia.Path.Make();
    const major = Skia.Path.Make();
    if (end > top) {
      minor.moveTo(x, top);
      minor.lineTo(x, end);
      let index = 0;
      for (let y = top; y <= end; y += TICK_STEP) {
        const isMajor = index % MAJOR_EVERY === 0;
        const half = isMajor ? MAJOR_HALF : MINOR_HALF;
        const target = isMajor ? major : minor;
        target.moveTo(x - half, y);
        target.lineTo(x + half, y);
        index += 1;
      }
    }
    return { minorPath: minor, majorPath: major };
  }, [x, top, end]);

  /** Content scrolls under the canvas: mirror it by translating the tape. */
  const translate = useDerivedValue(() => [{ translateY: -scrollY.value }]);

  /**
   * Content-space clip: the tape only exists down to the reveal line.
   * Reduce motion: fully drawn from mount, no draw-in.
   */
  const clipRect = useDerivedValue(() => {
    const drawnEnd = reduced ? end : Math.min(end, scrollY.value + viewportHeight * REVEAL);
    return { x: 0, y: 0, width, height: Math.max(0, drawnEnd) };
  });

  if (end <= top) return null;

  return (
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Group transform={translate}>
        <Group clip={clipRect}>
          <Path path={minorPath} style="stroke" strokeWidth={1} color={colors.hairline} />
          <Path path={majorPath} style="stroke" strokeWidth={1} color={colors.textMuted} />
        </Group>
      </Group>
    </Canvas>
  );
});
