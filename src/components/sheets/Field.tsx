import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import React from 'react';
import { View, type TextInputProps } from 'react-native';

import { fonts, radius, space, useTheme } from '@/theme';
import { AppText } from '@/components/ui';

export interface FieldProps extends TextInputProps {
  label: string;
  /** What happened and how to fix it, e.g. "Add a title first." */
  error?: string | null;
  /** Optional right-side unit stamp, e.g. "km" or "EGP". */
  unit?: string;
}

/**
 * Standard sheet input. Always BottomSheetTextInput so the keyboard behaves
 * inside gesture sheets on Android.
 */
export function Field({ label, error, unit, style, ...inputProps }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = React.useState(false);

  const borderColor = error ? colors.dangerText : focused ? colors.accentText : colors.stroke;

  return (
    <View style={{ marginBottom: space.lg }}>
      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.inset,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor,
        }}
      >
        <BottomSheetTextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              minHeight: 48,
              paddingHorizontal: space.md,
              paddingVertical: space.md,
              fontFamily: fonts.body,
              fontSize: 16,
              color: colors.text,
            },
            style,
          ]}
        />
        {unit ? (
          <AppText variant="label" color="textMuted" style={{ paddingRight: space.md }}>
            {unit}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="dangerText" style={{ marginTop: space.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/** Two fields side by side. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      {React.Children.map(children, (child) => (
        <View style={{ flex: 1 }}>{child}</View>
      ))}
    </View>
  );
}
