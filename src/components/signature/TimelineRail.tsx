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
 * translated by the scroll shared value on the UI thread.
 *
 * The tape is built once per coarse `pathEnd` step and then trimmed on the UI
 * thread by a clip that follows the exact content end (`end`, a shared value)
 * and the scroll offset, so growing content never rebuilds the path on the JS
 * thread mid-scroll. The clip leads the bottom of the viewport, so the tape is
 * drawn to where the user has scrolled and is never short of the visible area.
 * Printed km values are not drawn here: Skia text is heavy, so the rows carry
 * the mono captions instead.
 */

/** Width of the left gutter column every timeline row reserves for its node glyph. */
export const RAIL_GUTTER = 40;

/** Minor odometer tick cadence along the tape, in pt. */
const TICK_STEP = 24;
/** Every Nth tick is a brighter, wider major tick. */
const MAJOR_EVERY = 5;
const MINOR_HALF = 3;
const MAJOR_HALF = 5.5;
/**
 * The reveal line leads the bottom of the viewport by this fraction of a
 * viewport, so the tape always covers the visible rows and simply keeps
 * extending as the user scrolls. Anything below 1 would truncate the tape
 * on screen at rest.
 */
const REVEAL_LEAD = 1.15;

export interface TimelineRailProps {
  /** Scroll offset of the list, in a shared value (UI thread). */
  scrollY: SharedValue<number>;
  /** Rail center x, in canvas coordinates. */
  x: number;
  /** Content y where the tape starts (just below the list header). */
  top: number;
  /** Exact content y where the tape ends, in a shared value: trims the drawn tape. */
  end: SharedValue<number>;
  /** Coarse content y the Skia path is built to. Grows in steps, never per frame. */
  pathEnd: number;
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
  pathEnd,
  width,
  viewportHeight,
}: TimelineRailProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();

  const { minorPath, majorPath } = React.useMemo(() => {
    const minor = Skia.Path.Make();
    const major = Skia.Path.Make();
    if (pathEnd > top) {
      minor.moveTo(x, top);
      minor.lineTo(x, pathEnd);
      let index = 0;
      for (let y = top; y <= pathEnd; y += TICK_STEP) {
        const isMajor = index % MAJOR_EVERY === 0;
        const half = isMajor ? MAJOR_HALF : MINOR_HALF;
        const target = isMajor ? major : minor;
        target.moveTo(x - half, y);
        target.lineTo(x + half, y);
        index += 1;
      }
    }
    return { minorPath: minor, majorPath: major };
  }, [x, top, pathEnd]);

  /** Content scrolls under the canvas: mirror it by translating the tape. */
  const translate = useDerivedValue(() => [{ translateY: -scrollY.value }]);

  /**
   * Content-space clip: trims the coarse path back to the real content end, and
   * extends with the scroll so the tape reads as drawing itself in. The reveal
   * line always sits below the bottom edge of the screen, so the visible rows
   * always have tape behind them. Reduce motion: fully drawn from mount.
   */
  const clipRect = useDerivedValue(() => {
    const drawnEnd = reduced
      ? end.value
      : Math.min(end.value, scrollY.value + viewportHeight * REVEAL_LEAD);
    return { x: 0, y: 0, width, height: Math.max(0, drawnEnd) };
  });

  if (pathEnd <= top) return null;

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
