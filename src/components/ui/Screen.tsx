import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useTheme } from '@/theme';
import { GrainOverlay } from './GrainOverlay';

export interface ScreenProps extends ViewProps {
  /** Apply the standard horizontal gutter. Default true. */
  padded?: boolean;
  /** Respect the top inset. Default true; section screens under the car tab bar pass false. */
  safeTop?: boolean;
  /** Film grain materiality layer. Default true. */
  grain?: boolean;
}

export function Screen({ padded = true, safeTop = true, grain = true, style, children, ...rest }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      style={[
        styles.root,
        { backgroundColor: colors.bg, paddingTop: safeTop ? insets.top : 0 },
        padded && { paddingHorizontal: space.lg },
        style,
      ]}
    >
      {grain && <GrainOverlay />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
