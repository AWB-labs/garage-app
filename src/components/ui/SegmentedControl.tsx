import React from 'react';
import { View } from 'react-native';

import { haptic, radius, space, useTheme } from '@/theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Wrap onto multiple rows for larger sets (service types). */
  wrap?: boolean;
  /**
   * Overrides the selection tick for a given value. Return null when the caller
   * fires its own haptic for that choice, so a single tap never buzzes twice
   * (marking an issue Fixed is a save, not a pick).
   */
  hapticFor?: (value: T) => (() => void) | null;
}

/** Spec-sheet segmented picker: mono caps, amber for the active stamp. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  wrap,
  hapticFor,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap: space.sm,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              const tick = hapticFor ? hapticFor(option.value) : haptic.select;
              tick?.();
              onChange(option.value);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              minHeight: 44,
              paddingHorizontal: space.md,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: active ? colors.accentText : colors.stroke,
              backgroundColor: active ? colors.card : 'transparent',
              flexGrow: wrap ? 0 : 1,
              justifyContent: 'center',
            }}
          >
            {option.icon && (
              <Icon name={option.icon} size={14} color={active ? colors.accentText : colors.textSecondary} />
            )}
            <AppText variant="label" color={active ? 'accentText' : 'textSecondary'}>
              {option.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}
