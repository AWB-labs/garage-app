import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { durations, space, springs, useMotion, useTheme } from '@/theme';
import { CarSilhouette } from './CarSilhouette';

export interface IgnitionHeroProps {
  width: number;
  height: number;
  /** Brightens the beam while a sign in is in flight. */
  busy?: boolean;
}

/**
 * The sign in hero: a car standing in the dark garage whose headlights come up
 * as the screen arrives.
 *
 * It is the design thesis said out loud. Amber is emitted light in a warm black
 * world, so the one moment before you have an account is the moment the light
 * is switched on. The lamp swells past its resting brightness and settles, the
 * way a filament does, which is why this uses the bloom spring rather than the
 * overshoot-clamped entrance every other screen uses. That is deliberate: the
 * motion policy reserves overshoot for signature moments, and this is one.
 *
 * One Skia canvas for the whole region, behind the drawn car. The light is the
 * only thing on the canvas; the car itself stays the same SVG the garage cards
 * use, so there is one drawing of a car in this codebase and not two.
 */
export function IgnitionHero({ width, height, busy = false }: IgnitionHeroProps) {
  const { colors, isDark } = useTheme();
  const { reduced } = useMotion();

  const geom = React.useMemo(() => {
    // The car sits left rather than centered, which is both the asymmetry the
    // layout language asks for and the only way the beam gets anywhere. A
    // centered car at the width this once used left the light 14 percent of the
    // screen to travel in; at 58 percent it gets 40, on every phone size.
    const carWidth = Math.max(180, Math.min(width * 0.58, 260));
    const carHeight = (carWidth * 100) / 240;
    const scale = carWidth / 240;
    const carX = space.lg;
    // The car stands on the floor of the region; the tape ticks are its ground.
    const carY = height - carHeight;
    // CarSilhouette draws its odometer tape at y 93 of a 240x100 viewBox.
    const groundY = carY + 93 * scale;

    // Leading edge of the drawn body, so the lamp sits on the car's nose.
    const lampX = carX + 232 * scale;
    const lampY = carY + 62 * scale;

    // A dipped beam: narrow at the lamp, spreading as it runs off the right
    // edge, and landing on the road rather than sinking through it.
    const beam = Skia.Path.Make();
    beam.moveTo(lampX, lampY - 4 * scale);
    beam.lineTo(width, lampY - 20 * scale);
    beam.lineTo(width, groundY);
    beam.lineTo(lampX, lampY + 6 * scale);
    beam.close();

    return { carWidth, carHeight, carX, carY, scale, groundY, lampX, lampY, beam };
  }, [width, height]);

  // Rests at 1. Overshoots on ignition, and lifts to 1.3 while signing in, so
  // the wait reads as the engine being asked for something.
  const ignition = useSharedValue(reduced ? 1 : 0);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (reduced) {
      ignition.value = busy ? 1.3 : 1;
      return;
    }
    if (!started.current) {
      started.current = true;
      // Waits out the screen's own entrance so the light arrives after the car.
      ignition.value = withDelay(durations.fade * 2, withSpring(1, springs.bloom));
      return;
    }
    ignition.value = withSpring(busy ? 1.3 : 1, springs.settle);
  }, [busy, reduced, ignition]);

  // Light mode is the printed spec sheet, where a glowing headlight would be a
  // lie. The beam stays, quietly, as ink.
  const intensity = isDark ? 1 : 0.5;
  const lampBase = space.xl2 * geom.scale * 4;

  /**
   * Gradient stops are built from the theme's hex values rather than written as
   * rgba() strings, because colour strings are handed straight to native with
   * no parsing on the JavaScript side, and a stop the parser does not
   * understand fails at runtime where nothing here would catch it. Skia.Color
   * gives normalized channels, so the alpha ramp is ours to set.
   */
  const stops = React.useMemo(() => {
    const withAlpha = (color: string, alpha: number): Float32Array => {
      const parsed = Skia.Color(color);
      return Float32Array.of(parsed[0], parsed[1], parsed[2], alpha);
    };
    return {
      beam: [withAlpha(colors.accent, 0.26), withAlpha(colors.accent, 0)],
      lamp: [
        withAlpha(colors.glowCore, 0.95),
        withAlpha(colors.accent, 0.36),
        withAlpha(colors.accent, 0),
      ],
    };
  }, [colors.accent, colors.glowCore]);

  const beamOpacity = useDerivedValue(() => Math.min(1, ignition.value) * intensity);
  const lampOpacity = useDerivedValue(() => Math.min(1, ignition.value) * intensity);
  // Radius carries the overshoot, because opacity would clip it away.
  const lampRadius = useDerivedValue(() => lampBase * ignition.value);

  return (
    <View
      style={{ width, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={beamOpacity}>
          <Path path={geom.beam}>
            <LinearGradient
              start={vec(geom.lampX, geom.lampY)}
              end={vec(width, geom.lampY)}
              colors={stops.beam}
            />
          </Path>
        </Group>
        <Group opacity={lampOpacity}>
          <Circle cx={geom.lampX} cy={geom.lampY} r={lampRadius}>
            <RadialGradient
              c={vec(geom.lampX, geom.lampY)}
              r={lampBase}
              colors={stops.lamp}
            />
          </Circle>
        </Group>
      </Canvas>

      <View style={{ position: 'absolute', left: geom.carX, top: geom.carY }}>
        <CarSilhouette width={geom.carWidth} emphasis="hero" />
      </View>
    </View>
  );
}
