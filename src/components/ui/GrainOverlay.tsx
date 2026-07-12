import { Canvas, Fill, FractalNoise } from '@shopify/react-native-skia';
import React from 'react';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme';

/**
 * Film-grain materiality layer. Mount ONCE per screen (never per card or per
 * list row: every Skia canvas is its own GPU surface).
 */
export const GrainOverlay = React.memo(function GrainOverlay() {
  const { isDark } = useTheme();
  return (
    <Canvas style={[StyleSheet.absoluteFill, { opacity: isDark ? 0.05 : 0.03 }]} pointerEvents="none">
      <Fill blendMode="overlay">
        <FractalNoise freqX={0.9} freqY={0.9} octaves={4} />
      </Fill>
    </Canvas>
  );
});
