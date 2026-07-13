import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { radius, space, useTheme } from '@/theme';
import { PressableScale, type PressableScaleProps } from './PressableScale';

export interface CardProps extends ViewProps {
  onPress?: PressableScaleProps['onPress'];
  onLongPress?: PressableScaleProps['onLongPress'];
  accessibilityLabel?: string;
  /**
   * Screen-reader grouping. A pressable Card renders a Pressable, and RN sets
   * `accessible: accessible !== false`, so by default the whole card collapses
   * into ONE accessibility element and VoiceOver / TalkBack cannot descend into
   * anything nested inside it.
   *
   * Constraint: a pressable Card that nests its own buttons (for example a
   * reminder card with "Mark done" and an edit button, or a note row with a pin
   * button) MUST pass `accessible={false}` so those children stay reachable, and
   * must then expose the card's own onPress another way: give the card
   * `accessibilityActions` / `onAccessibilityAction`, or wrap the tappable body
   * in its own PressableScale inside a non-pressable Card.
   *
   * Leave undefined for a leaf card with no nested controls: the grouped
   * announcement is the right read there.
   */
  accessible?: boolean;
  /** Inner padding. Default space.lg. */
  padding?: number;
  style?: StyleProp<ViewStyle>;
}

/** Raised warm surface with a hairline edge. Depth from layering, not shadows. */
export function Card({
  onPress,
  onLongPress,
  accessibilityLabel,
  accessible,
  padding = space.lg,
  style,
  children,
  ...rest
}: CardProps) {
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
        accessible={accessible}
        style={[surface, style]}
        {...rest}
      >
        {children}
      </PressableScale>
    );
  }
  return (
    <View accessible={accessible} {...rest} style={[surface, style]}>
      {children}
    </View>
  );
}
