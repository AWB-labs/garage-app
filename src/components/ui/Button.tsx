import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { radius, space, useTheme } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'quiet';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to fill the row. */
  full?: boolean;
}

/**
 * Amber fills always carry void content, and pressing brightens toward
 * glowCore: light emits more when touched, never less.
 */
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, full }: ButtonProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = React.useState(false);

  const palette = {
    primary: {
      bg: disabled ? colors.accentDisabled : pressed ? colors.glowCore : colors.accent,
      border: 'transparent',
      fg: colors.onAccent,
    },
    ghost: {
      bg: 'transparent',
      border: colors.stroke,
      fg: disabled ? colors.textMuted : colors.text,
    },
    danger: {
      bg: 'transparent',
      border: colors.dangerText,
      fg: colors.dangerText,
    },
    quiet: {
      bg: 'transparent',
      border: 'transparent',
      fg: disabled ? colors.textMuted : colors.accentText,
    },
  }[variant];

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={{
        minHeight: 48,
        borderRadius: radius.sm,
        backgroundColor: palette.bg,
        borderWidth: palette.border === 'transparent' ? 0 : 1,
        borderColor: palette.border,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: space.sm,
        alignSelf: full ? 'stretch' : 'auto',
        opacity: disabled && variant !== 'primary' ? 0.6 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={palette.fg} strokeWidth={1.8} />}
          <AppText variant="bodySemi" color={palette.fg}>
            {label}
          </AppText>
        </>
      )}
    </PressableScale>
  );
}
