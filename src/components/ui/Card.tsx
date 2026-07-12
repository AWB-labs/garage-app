import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { radius, space, useTheme } from '@/theme';
import { PressableScale, type PressableScaleProps } from './PressableScale';

export interface CardProps extends ViewProps {
  onPress?: PressableScaleProps['onPress'];
  onLongPress?: PressableScaleProps['onLongPress'];
  accessibilityLabel?: string;
  /** Inner padding. Default space.lg. */
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

/** Raised warm surface with a hairline edge. Depth from layering, not shadows. */
export function Card({ onPress, onLongPress, accessibilityLabel, padding = space.lg, style, children, ...rest }: CardProps) {
  const { colors } = useTheme();
  const surface: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding,
  };
  if (onPress || onLongPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={accessibilityLabel}
        style={[surface, style]}
        {...rest}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <View {...rest} style={[surface, style]}>
      {children}
    </View>
  );
}
