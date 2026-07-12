import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { useGarageStore } from '@/stores/garage';
import { useTheme } from '@/theme';

export default function CarLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const exists = useGarageStore((s) => s.vehicles.some((v) => v.id === id));

  if (!exists) return <Redirect href="/garage" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
