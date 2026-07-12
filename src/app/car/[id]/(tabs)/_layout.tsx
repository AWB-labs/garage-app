import { Tabs } from 'expo-router/js-tabs';
import React from 'react';

import { CarTabBar } from '@/components/CarTabBar';
import { useTheme } from '@/theme';

export default function CarTabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <CarTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="timeline" options={{ title: 'Timeline' }} />
      <Tabs.Screen name="maintenance" options={{ title: 'Service' }} />
      <Tabs.Screen name="issues" options={{ title: 'Issues' }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
    </Tabs>
  );
}
