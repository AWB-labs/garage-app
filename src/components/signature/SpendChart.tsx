import { Canvas, Rect } from '@shopify/react-native-skia';
import { format } from 'date-fns';
import React from 'react';
import { View } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText, Icon } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import type { MonthSpend } from '@/lib/stats';
import { radius, space, springs, useMotion, useTheme } from '@/theme';

/** Drawing-area height. Bars grow from the baseline toward a small headroom that absorbs spring overshoot. */
const CHART_HEIGHT = 148;
/** Portion of the mount-progress timeline across which bar starts are staggered. */
const STAGGER_SPREAD = 0.55;

interface BarProps {
  progress: SharedValue<number>;
  index: number;
  count: number;
  x: number;
  width: number;
  /** This month's share of the tallest month, 0..1. */
  ratio: number;
  baseY: number;
  maxHeight: number;
  /** Floor so tiny nonzero months stay visible: presence is honest. */
  minHeight: number;
  color: string;
}

/**
 * One bar. Height derives on the UI thread from the single shared progress
 * value: height = value * progress, with a per-bar staggered start.
 */
const Bar = React.memo(function Bar({
  progress,
  index,
  count,
  x,
  width,
  ratio,
  baseY,
  maxHeight,
  minHeight,
  color,
}: BarProps) {
  const height = useDerivedValue(() => {
    if (ratio <= 0) return 0;
    const start = count <= 1 ? 0 : (index / count) * STAGGER_SPREAD;
    const p = Math.max(0, (progress.value - start) / (1 - start));
    return Math.max(maxHeight * ratio * p, minHeight * Math.min(p, 1));
  });
  const y = useDerivedValue(() => baseY - height.value);
  return <Rect x={x} y={y} width={width} height={height} color={color} />;
});

export interface SpendChartProps {
  /** Calendar months oldest first, from spendByMonth. The last bucket is the current month. */
  data: MonthSpend[];
  currency: string;
}

/**
 * Honest spend bars: one Skia canvas, no tooltips, the max value stamped at
 * the axis top and month initials as plain text under the canvas. Bars grow
 * in with staggered springs driven by ONE progress shared value; the chart
 * renders instantly under reduce motion. Decorative for accessibility: a
 * preceding text line carries the summary.
 */
export function SpendChart({ data, currency }: SpendChartProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const [width, setWidth] = React.useState(0);

  const progress = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    // Grows once per mount; instant when reduce motion is on.
    if (!reduced) progress.value = withSpring(1, springs.settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const max = data.reduce((m, bucket) => Math.max(m, bucket.total), 0);

  if (data.length === 0 || max <= 0) {
    return (
      <View
        accessible
        accessibilityLabel="No costs logged in the last year."
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          borderWidth: 1,
          borderColor: colors.hairline,
          borderRadius: radius.md,
          paddingVertical: space.xl2,
          paddingHorizontal: space.lg,
        }}
      >
        <Icon name="stats" size={18} color={colors.textMuted} />
        <AppText variant="small" color="textSecondary">
          No costs logged in the last year.
        </AppText>
      </View>
    );
  }

  const windowTotal = data.reduce((sum, bucket) => sum + bucket.total, 0);
  const peak = data.reduce((best, bucket) => (bucket.total > best.total ? bucket : best));
  const peakName = format(new Date(`${peak.month}-01T00:00:00`), 'MMMM');
  const summary = `${formatMoney(windowTotal, currency)} in the last ${data.length} months, highest in ${peakName}.`;

  const count = data.length;
  const cellW = width > 0 ? width / count : 0;
  const barW = Math.max(cellW - space.xs, 1);
  const baseY = CHART_HEIGHT - 1;
  const maxBarH = CHART_HEIGHT - space.sm - 1;

  return (
    <View>
      <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
        {summary}
      </AppText>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
          {formatMoney(max, currency)}
        </AppText>
        <View
          style={{ height: CHART_HEIGHT }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          {width > 0 ? (
            <Canvas style={{ width, height: CHART_HEIGHT }}>
              {data.map((bucket, index) => (
                <Bar
                  key={bucket.month}
                  progress={progress}
                  index={index}
                  count={count}
                  x={index * cellW + (cellW - barW) / 2}
                  width={barW}
                  ratio={bucket.total / max}
                  baseY={baseY}
                  maxHeight={maxBarH}
                  minHeight={space.xs2}
                  color={index === count - 1 ? colors.accent : colors.accentDim}
                />
              ))}
              <Rect x={0} y={baseY} width={width} height={1} color={colors.hairline} />
            </Canvas>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', marginTop: space.xs }}>
          {data.map((bucket, index) => (
            <View key={bucket.month} style={{ flex: 1, alignItems: 'center' }}>
              <AppText variant="label" color={index === count - 1 ? 'accentText' : 'textMuted'}>
                {bucket.label.slice(0, 1)}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
