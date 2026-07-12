import { BlurMask, Canvas, RoundedRect } from '@shopify/react-native-skia';
import React from 'react';
import { Text, View, type LayoutChangeEvent, type TextStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { durations, fonts, haptic, numHeroSize, space, springs, useMotion, useTheme } from '@/theme';

export interface OdometerProps {
  /** Current reading in the display unit, already converted and rounded. */
  value: number;
  /** Unit stamp, e.g. "km" or "mi". */
  unit: string;
}

/**
 * Signature moment 1: the odometer roll. Oversized per-digit cells in
 * ChivoMono; each digit is a vertical 0-9 strip translated on a settle
 * spring with slight overshoot. One haptic tick fires when the
 * highest-order changed digit settles. One shared glow canvas sits behind
 * the whole row. Reduce motion: digits crossfade to their final values.
 */

/** Fixed cell metrics: every digit sits in the same box, so no tabular figures are needed. */
const CELL_HEIGHT = Math.round(numHeroSize * 1.1);
const CELL_WIDTH = Math.round(numHeroSize * 0.62);
/** The strip repeats 0-9 twice so a 9 to 0 roll travels forward; a 10-cell shift is invisible. */
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const GLOW_PAD = space.xl2;

function groupDigits(n: number): string {
  return Math.max(0, Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function digitTextStyle(color: string): TextStyle {
  return {
    fontFamily: fonts.monoMedium,
    fontSize: numHeroSize,
    lineHeight: CELL_HEIGHT,
    height: CELL_HEIGHT,
    width: CELL_WIDTH,
    textAlign: 'center',
    includeFontPadding: false,
    color,
  };
}

type Register = (index: number, position: SharedValue<number> | null) => void;

interface RollingDigitProps {
  /** Stable identity: the ones place is 0 no matter how many digits exist. */
  indexFromRight: number;
  /** Initial digit; subsequent rolls are driven by the parent via the registry. */
  digit: number;
  color: string;
  register: Register;
}

const RollingDigit = React.memo(function RollingDigit({
  indexFromRight,
  digit,
  color,
  register,
}: RollingDigitProps) {
  const position = useSharedValue(digit);

  React.useEffect(() => {
    register(indexFromRight, position);
    return () => register(indexFromRight, null);
  }, [indexFromRight, position, register]);

  const rolling = useAnimatedStyle(() => ({
    transform: [{ translateY: -position.value * CELL_HEIGHT }],
  }));

  const style = digitTextStyle(color);
  return (
    <View style={{ width: CELL_WIDTH, height: CELL_HEIGHT, overflow: 'hidden' }}>
      <Animated.View style={rolling}>
        {STRIP.map((d, i) => (
          <Text key={i} allowFontScaling={false} style={style}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
});

/** Static digit or separator glyph, used by the reduce-motion crossfade path. */
function StaticGlyph({ char, color, muted }: { char: string; color: string; muted: string }) {
  const separator = char === ',';
  const style = digitTextStyle(separator ? muted : color);
  if (separator) {
    // Let the comma keep its mono advance but pull the neighbors in.
    style.width = undefined;
    style.marginHorizontal = -space.sm;
  }
  return (
    <Text allowFontScaling={false} style={style}>
      {char}
    </Text>
  );
}

export function Odometer({ value, unit }: OdometerProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const [row, setRow] = React.useState({ w: 0, h: 0 });

  const display = Math.max(0, Math.round(value));
  const grouped = groupDigits(display);
  const unitWord = unit === 'km' ? 'kilometers' : unit === 'mi' ? 'miles' : unit;

  const registry = React.useRef(new Map<number, SharedValue<number>>());
  const register = React.useCallback<Register>((index, position) => {
    if (position) registry.current.set(index, position);
    else registry.current.delete(index);
  }, []);

  // Drive every changed digit strip from here; only the highest-order changed
  // digit carries the completion callback, so exactly one tick fires per roll.
  const prevRef = React.useRef(display);
  React.useEffect(() => {
    const prev = prevRef.current;
    if (prev === display) return;
    prevRef.current = display;
    const len = Math.max(String(prev).length, String(display).length);
    const from = String(prev).padStart(len, '0');
    const to = String(display).padStart(len, '0');
    let leader = -1;
    for (let i = 0; i < len; i++) {
      if (from[i] !== to[i]) {
        leader = len - 1 - i;
        break;
      }
    }
    if (leader < 0) return;
    for (let i = 0; i < len; i++) {
      if (from[i] === to[i]) continue;
      const indexFromRight = len - 1 - i;
      const position = registry.current.get(indexFromRight);
      if (!position) continue;
      // Normalize out of the duplicated half of the strip before rolling.
      if (position.value >= 10) position.value -= 10;
      const fromDigit = Number(from[i]);
      const toDigit = Number(to[i]);
      const target = toDigit < fromDigit ? toDigit + 10 : toDigit;
      if (indexFromRight === leader) {
        position.value = withSpring(target, springs.settle, (finished) => {
          'worklet';
          if (finished) runOnJS(haptic.tick)();
        });
      } else {
        position.value = withSpring(target, springs.settle);
      }
    }
  }, [display]);

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setRow((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  };

  // Build the cells left to right; digits are keyed by place value so the
  // ones cell stays the ones cell when the reading gains a digit.
  const cells: React.ReactNode[] = [];
  if (!reduced) {
    let remaining = grouped.replace(/,/g, '').length;
    for (const ch of grouped) {
      if (ch === ',') {
        cells.push(<StaticGlyph key={`s${remaining}`} char="," color={colors.text} muted={colors.textMuted} />);
      } else {
        remaining -= 1;
        cells.push(
          <RollingDigit
            key={`d${remaining}`}
            indexFromRight={remaining}
            digit={Number(ch)}
            color={colors.text}
            register={register}
          />
        );
      }
    }
  }

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${grouped} ${unitWord}`}
      style={{ alignSelf: 'flex-start' }}
    >
      {row.w > 0 ? (
        <Canvas
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -GLOW_PAD,
            top: -GLOW_PAD,
            width: row.w + GLOW_PAD * 2,
            height: row.h + GLOW_PAD * 2,
          }}
        >
          {/* Layered glow: one wide soft pass, one tight hot core. Never a plain fade. */}
          <RoundedRect
            x={space.sm}
            y={space.sm}
            width={row.w + (GLOW_PAD - space.sm) * 2}
            height={row.h + (GLOW_PAD - space.sm) * 2}
            r={(row.h + GLOW_PAD) / 2}
            color={colors.glow}
          >
            <BlurMask blur={GLOW_PAD} style="normal" />
          </RoundedRect>
          <RoundedRect
            x={GLOW_PAD}
            y={GLOW_PAD + row.h * 0.2}
            width={row.w}
            height={row.h * 0.6}
            r={row.h * 0.3}
            color={colors.glowCore}
            opacity={0.08}
          >
            <BlurMask blur={space.md} style="normal" />
          </RoundedRect>
        </Canvas>
      ) : null}
      <View
        onLayout={onRowLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'flex-end' }}
      >
        {reduced ? (
          <Animated.View
            key={display}
            entering={FadeIn.duration(durations.fade).reduceMotion(ReduceMotion.Never)}
            exiting={FadeOut.duration(durations.fade).reduceMotion(ReduceMotion.Never)}
            style={{ flexDirection: 'row' }}
          >
            {grouped.split('').map((ch, i) => (
              <StaticGlyph key={i} char={ch} color={colors.text} muted={colors.textMuted} />
            ))}
          </Animated.View>
        ) : (
          cells
        )}
        <AppText variant="label" color="textMuted" style={{ marginLeft: space.sm, marginBottom: space.md }}>
          {unit}
        </AppText>
      </View>
    </View>
  );
}
