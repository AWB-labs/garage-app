// URL and structuredClone shims that supabase-js expects. Must be first.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * Garage stays local-first. Supabase is optional: with no credentials the app
 * behaves exactly as it always has, everything on the phone and no accounts.
 * Every caller must therefore handle a null client rather than assume one.
 */

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/** The placeholders shipped in .env.example must not count as configured. */
const isPlaceholder = (value: string): boolean =>
  value === '' || value.includes('your-project') || value.includes('YOUR_');

export const isSupabaseConfigured: boolean = !isPlaceholder(url) && !isPlaceholder(anonKey);

// A missing key and a deliberate local-only build behave identically: no sign
// in screen, no sync, everything on the phone. That is the intended design, and
// it is also the perfect way to lose an afternoon wondering where the login
// screen went. So say which one this is, once, at startup.
if (__DEV__) {
  if (isSupabaseConfigured) {
    console.log(`[garage] backend configured, sign in enabled: ${url}`);
  } else {
    console.log(
      '[garage] no backend: local only, no sign in screen, no sync. ' +
        'Put EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, ' +
        'then restart with: npx expo start --clear. ' +
        'These are read when the bundler starts, so a running Metro will not pick them up.'
    );
  }
}

let client: SupabaseClient | null = null;

/** Null when the app was built without Supabase credentials. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // No browser redirect ever lands in a React Native bundle, and leaving
        // this on makes supabase-js poke at window.location on startup.
        detectSessionInUrl: false,
        // Serializes token refreshes. Without it a cold start that fires
        // several requests at once can run concurrent refreshes and one of
        // them loses the race, signing the user out for no reason.
        lock: processLock,
      },
    });
    watchAppState(client);
  }
  return client;
}

/**
 * supabase-js refreshes on a timer that a suspended app does not run. Tying
 * the timer to foreground state means a phone that sat in a pocket overnight
 * refreshes on the way back in rather than serving one failed request first.
 */
function watchAppState(supabase: SupabaseClient): void {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
  if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh();
}

/**
 * Postgres hands back timestamps as "2026-07-21 09:30:00+00". The app persists
 * and compares ISO instants everywhere, and DESIGN.md's date rule depends on
 * that exact shape, so every timestamp crossing the boundary is normalized
 * back to it rather than stored in whatever format the wire happened to use.
 */
export function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Same as toIso but for columns the domain model declares non-null. */
export function toIsoRequired(value: string | null | undefined, fallback: string): string {
  return toIso(value) ?? fallback;
}
