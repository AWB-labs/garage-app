import { create } from 'zustand';

import * as dao from '@/db/dao';
import type { DistanceUnit, Settings, ThemePreference } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';

interface SettingsState extends Settings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: ThemePreference) => void;
  setUnit: (unit: DistanceUnit) => void;
  setCurrency: (currency: string) => void;
  setCarImageKey: (carImageKey: string) => void;
}

/** Hydrated once at startup; every mutation writes through to SQLite. */
export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    const stored = await dao.readSettings();
    set({ ...DEFAULT_SETTINGS, ...stored, hydrated: true });
  },

  setTheme: (theme) => {
    set({ theme });
    void dao.writeSetting('theme', theme);
  },

  setUnit: (unit) => {
    set({ unit });
    void dao.writeSetting('unit', unit);
  },

  setCurrency: (currency) => {
    set({ currency });
    void dao.writeSetting('currency', currency);
  },

  setCarImageKey: (carImageKey) => {
    set({ carImageKey });
    void dao.writeSetting('carImageKey', carImageKey);
  },
}));
