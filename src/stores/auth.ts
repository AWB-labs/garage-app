import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * 'disabled' is the local-first path: the app was built without Supabase
 * credentials, so there are no accounts and no sync, exactly as Garage
 * shipped originally. Every gate treats it as "let them straight in".
 */
export type AuthStatus = 'loading' | 'disabled' | 'signedOut' | 'signedIn';

export interface AuthResult {
  ok: boolean;
  /** Present when ok is false. Already phrased for display. */
  error?: string;
  /** Sign up completed but the address still needs confirming. */
  needsConfirmation?: boolean;
}

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  userId: string | null;
  email: string | null;
  /** Set while a screen is waiting on the network. */
  busy: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

/** Supabase's wording leaks implementation. Garage speaks plainly. */
function readableError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password do not match.';
  if (m.includes('email not confirmed')) return 'Confirm your email address first, then sign in.';
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (m.includes('password should be at least')) return 'Use a password of at least 6 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid format')) {
    return 'That does not look like an email address.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Cannot reach the server. Check your connection.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return message;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  session: null,
  userId: null,
  email: null,
  busy: false,

  initialize: async () => {
    const supabase = getSupabase();
    if (!supabase || !isSupabaseConfigured) {
      set({ status: 'disabled', session: null, userId: null, email: null });
      return;
    }

    const apply = (session: Session | null) => {
      set({
        session,
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
        status: session ? 'signedIn' : 'signedOut',
      });
    };

    // Reads the persisted session from AsyncStorage, so a phone that is
    // offline still opens straight into the app after the first sign in.
    const { data } = await supabase.auth.getSession();
    apply(data.session);

    supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });
  },

  signIn: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Sync is not configured in this build.' };
    set({ busy: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return { ok: false, error: readableError(error.message) };
      return { ok: true };
    } finally {
      set({ busy: false });
    }
  },

  signUp: async (email, password) => {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, error: 'Sync is not configured in this build.' };
    set({ busy: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return { ok: false, error: readableError(error.message) };
      // With email confirmation switched on, Supabase returns a user but no
      // session. The caller shows "check your inbox" rather than dropping the
      // person into an app that cannot read anything.
      return { ok: true, needsConfirmation: data.session === null };
    } finally {
      set({ busy: false });
    }
  },

  signOut: async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    set({ busy: true });
    try {
      await supabase.auth.signOut();
    } finally {
      set({ busy: false });
    }
  },
}));
