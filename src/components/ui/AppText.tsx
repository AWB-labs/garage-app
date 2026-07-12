import React from 'react';
import { Text, type TextProps } from 'react-native';

import { type ColorToken, type TypeRole, type, useTheme } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeRole;
  /** A theme color token, or a raw color when it starts with '#' or 'rgba'. */
  color?: ColorToken | (string & {});
  center?: boolean;
}

/** Numerals and display type cap scaling lower so instrument layouts survive large text. */
const MAX_SCALE: Partial<Record<TypeRole, number>> = {
  displayXL: 1.3,
  displayL: 1.3,
  numL: 1.3,
  numM: 1.3,
  label: 1.4,
};

export function AppText({ variant = 'body', color = 'text', center, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const resolved = color in colors ? colors[color as ColorToken] : (color as string);
  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE[variant] ?? 1.6}
      {...rest}
      style={[type[variant], { color: resolved }, center && { textAlign: 'center' }, style]}
    />
  );
}
