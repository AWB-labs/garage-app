import { Image } from 'expo-image';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Vehicle } from '@/lib/types';
import { durations, radius, springs, useTheme } from '@/theme';
import { CarSilhouette } from './CarSilhouette';

export interface ExpandingHeroRequest {
  vehicle: Vehicle;
  /** Window coordinates of the pressed card's image block. */
  rect: { x: number; y: number; width: number; height: number };
}

/** Matches the dashboard chrome: CarHeader minHeight. */
const HEADER_HEIGHT = 52;
/** Matches the dashboard hero photo height. */
const HERO_HEIGHT = 190;

/**
 * The expanding-card veneer (DESIGN.md 6.4): a clone of the pressed garage
 * card's hero springs from its measured rect to the dashboard hero region
 * while the real route fades in underneath, then crossfades away. Rendered
 * through the root Portal; purely visual, never owns navigation state.
 * Reduce motion skips this entirely (plain fade push).
 */
export function ExpandingHero({ request, onDone }: { request: ExpandingHeroRequest; onDone: () => void }) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);

  const targetY = insets.top + HEADER_HEIGHT;

  React.useEffect(() => {
    progress.value = withSpring(1, springs.settle, (finished) => {
      'worklet';
      if (finished) {
        opacity.value = withTiming(0, { duration: durations.fade }, (faded) => {
          'worklet';
          if (faded) runOnJS(onDone)();
        });
      } else {
        runOnJS(onDone)();
      }
    });
    // Mount-once choreography by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: interpolate(progress.value, [0, 1], [request.rect.x, 0]),
    top: interpolate(progress.value, [0, 1], [request.rect.y, targetY]),
    width: interpolate(progress.value, [0, 1], [request.rect.width, screenWidth]),
    height: interpolate(progress.value, [0, 1], [request.rect.height, HERO_HEIGHT]),
    borderRadius: interpolate(progress.value, [0, 1], [radius.lg, 0]),
    opacity: opacity.value,
    overflow: 'hidden' as const,
  }));

  return (
    <Animated.View pointerEvents="none" style={[style, { backgroundColor: colors.inset }]}>
      {request.vehicle.photoUri ? (
        <Image
          source={{ uri: request.vehicle.photoUri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : (
        <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <CarSilhouette width={Math.min(screenWidth - 64, 340)} emphasis="hero" />
        </Animated.View>
      )}
    </Animated.View>
  );
}
