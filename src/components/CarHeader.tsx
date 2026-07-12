import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import type { Vehicle } from '@/lib/types';
import { space, useTheme } from '@/theme';
import { AppText, Icon, PressableScale } from '@/components/ui';

/**
 * Shared compact chrome for every car section screen: the car switcher on
 * the left, settings on the right.
 */
export function CarHeader({ vehicle }: { vehicle: Vehicle }) {
  const { colors } = useTheme();
  const name = vehicle.nickname ?? `${vehicle.make} ${vehicle.model}`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: space.sm,
        minHeight: 52,
      }}
    >
      <PressableScale
        accessibilityLabel={`${name}. Switch car`}
        onPress={() => router.push('/garage')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs }}
      >
        <Icon name="garage" size={18} color={colors.accentText} />
        <AppText variant="title">{name}</AppText>
        <Icon name="chevronDown" size={14} color={colors.textMuted} />
      </PressableScale>
      <PressableScale
        accessibilityLabel="Settings"
        onPress={() => router.push('/settings')}
        style={{ padding: space.sm }}
      >
        <Icon name="settings" size={20} color={colors.textSecondary} />
      </PressableScale>
    </View>
  );
}
