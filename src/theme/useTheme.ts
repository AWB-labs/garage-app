import { useColorScheme } from 'react-native';

import { useSettingsStore } from '@/stores/settings';
import { darkColors, lightColors, type ThemeColors } from './tokens';

export type ResolvedScheme = 'dark' | 'light';

export interface Theme {
  colors: ThemeColors;
  scheme: ResolvedScheme;
  isDark: boolean;
}

/**
 * Resolves the active theme from the user's preference (system, dark, light)
 * and the OS scheme. Dark is the design default and the fallback.
 */
export function useTheme(): Theme {
  const preference = useSettingsStore((s) => s.theme);
  const systemScheme = useColorScheme();
  const scheme: ResolvedScheme =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
  return {
    colors: scheme === 'dark' ? darkColors : lightColors,
    scheme,
    isDark: scheme === 'dark',
  };
}
