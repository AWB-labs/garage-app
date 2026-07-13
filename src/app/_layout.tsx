import {
  BigShouldersDisplay_600SemiBold,
  BigShouldersDisplay_700Bold,
} from '@expo-google-fonts/big-shoulders-display';
import { ChivoMono_400Regular, ChivoMono_500Medium } from '@expo-google-fonts/chivo-mono';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  useFonts,
} from '@expo-google-fonts/instrument-sans';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SheetHost } from '@/components/sheets/SheetHost';
import { PortalProvider } from '@/components/ui';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BigShouldersDisplay_600SemiBold,
    BigShouldersDisplay_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    ChivoMono_400Regular,
    ChivoMono_500Medium,
  });
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const garageHydrated = useGarageStore((s) => s.hydrated);
  const { colors, isDark } = useTheme();

  React.useEffect(() => {
    useSettingsStore
      .getState()
      .hydrate()
      .catch((error) => console.error('Settings hydration failed', error));
    useGarageStore
      .getState()
      .hydrate()
      .catch((error) => console.error('Garage hydration failed', error));
  }, []);

  React.useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  const ready = fontsLoaded && settingsHydrated && garageHydrated;

  React.useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // The native splash stays up until fonts and data are in, so every first
  // frame is the real, fully styled screen: no flash of fallback fonts.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <BottomSheetModalProvider>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
            {/* The garage-to-car transition fades under the ExpandingHero clone. */}
            <Stack.Screen name="car/[id]" options={{ animation: 'fade' }} />
          </Stack>
          <SheetHost />
        </BottomSheetModalProvider>
      </PortalProvider>
    </GestureHandlerRootView>
  );
}
