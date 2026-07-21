import { formatDistanceToNowStrict } from 'date-fns';
import { router } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';

import { AppText, Button, Icon, PressableScale, Screen, SectionHeader, SegmentedControl } from '@/components/ui';
import { DEMO_CAR_IMAGE_KEY } from '@/lib/carImage';
import { exportGarage } from '@/lib/export';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signOutAndClearLocal, syncNow, useSyncStore } from '@/sync/engine';
import { useAuthStore } from '@/stores/auth';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { fonts, radius, space, useTheme } from '@/theme';

type ImageryMode = 'off' | 'demo' | 'key';

const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED'] as const;

export default function SettingsScreen() {
  const { colors } = useTheme();
  const settings = useSettingsStore();
  const [exporting, setExporting] = React.useState(false);
  const [keyFocused, setKeyFocused] = React.useState(false);

  // Imagery is one setting with three faces: no key, the demo key, or your own.
  const storedKey = settings.carImageKey;
  const imageryMode: ImageryMode =
    storedKey === '' ? 'off' : storedKey === DEMO_CAR_IMAGE_KEY ? 'demo' : 'key';
  const [keyDraft, setKeyDraft] = React.useState(imageryMode === 'key' ? storedKey : '');

  const setImageryMode = (mode: ImageryMode) => {
    if (mode === 'off') settings.setCarImageKey('');
    else if (mode === 'demo') settings.setCarImageKey(DEMO_CAR_IMAGE_KEY);
    else settings.setCarImageKey(keyDraft.trim());
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const s = useGarageStore.getState();
      await exportGarage({
        settings: {
          theme: settings.theme,
          unit: settings.unit,
          currency: settings.currency,
          carImageKey: settings.carImageKey,
        },
        vehicles: s.vehicles,
        services: s.services,
        reminders: s.reminders,
        issues: s.issues,
        notes: s.notes,
        mileageLogs: s.mileageLogs,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
        <PressableScale accessibilityLabel="Back" onPress={() => router.back()} style={{ padding: space.sm }}>
          <Icon name="chevronLeft" size={22} color={colors.textSecondary} />
        </PressableScale>
        <AppText variant="displayXL">Settings</AppText>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <SectionHeader overline="Appearance" title="Theme" />
        <SegmentedControl
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          value={settings.theme}
          onChange={settings.setTheme}
        />

        <SectionHeader overline="Measurement" title="Units" />
        <SegmentedControl
          options={[
            { value: 'km', label: 'Kilometers' },
            { value: 'mi', label: 'Miles' },
          ]}
          value={settings.unit}
          onChange={settings.setUnit}
        />

        <SectionHeader overline="Spend" title="Currency" />
        <SegmentedControl
          wrap
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={CURRENCIES.includes(settings.currency as (typeof CURRENCIES)[number]) ? settings.currency : 'EGP'}
          onChange={settings.setCurrency}
        />

        <SectionHeader overline="Optional" title="Car imagery" />
        <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
          Garage can fetch a studio render of a car from its make, model, and year. Drawn keeps the hand-drawn
          silhouette and stays fully offline. Demo uses imagin.studio's public key, so renders arrive watermarked.
          Your own key renders them clean.
        </AppText>
        <SegmentedControl
          options={[
            { value: 'off', label: 'Drawn' },
            { value: 'demo', label: 'Demo' },
            { value: 'key', label: 'My key' },
          ]}
          value={imageryMode}
          onChange={setImageryMode}
        />
        {imageryMode === 'key' ? (
          <TextInput
            accessibilityLabel="imagin.studio customer key"
            value={keyDraft}
            onChangeText={setKeyDraft}
            onFocus={() => setKeyFocused(true)}
            onBlur={() => {
              setKeyFocused(false);
              settings.setCarImageKey(keyDraft.trim());
            }}
            placeholder="customer-key"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              marginTop: space.md,
              minHeight: 48,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: keyFocused ? colors.accentText : colors.stroke,
              backgroundColor: colors.inset,
              paddingHorizontal: space.md,
              fontFamily: fonts.mono,
              fontSize: 14,
              color: colors.text,
            }}
          />
        ) : null}

        {isSupabaseConfigured ? <AccountSection /> : null}

        <SectionHeader overline="Your data" title="Export" />
        <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
          {isSupabaseConfigured
            ? 'The garage lives on this phone and in your account. Export the whole thing as JSON any time.'
            : 'Everything lives on this phone. Export the full garage as JSON any time.'}
        </AppText>
        <Button label="Export data as JSON" icon="share" variant="ghost" onPress={exportData} loading={exporting} full />

        <AppText variant="caption" color="textMuted" center style={{ marginTop: space.xl3 }}>
          {isSupabaseConfigured
            ? 'Garage 1.0.0 · works offline, syncs when it can'
            : 'Garage 1.0.0 · local-first, no accounts, no cloud'}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

/**
 * Only rendered when the build carries Supabase credentials. Shows the account,
 * whether anything is still waiting to upload, and the way out.
 */
function AccountSection() {
  const { colors } = useTheme();
  const email = useAuthStore((s) => s.email);
  const { phase, pending, lastSyncedAt, error } = useSyncStore();
  const [leaving, setLeaving] = React.useState(false);

  const status =
    phase === 'syncing'
      ? 'Syncing now'
      : pending > 0
        ? `${pending} ${pending === 1 ? 'change' : 'changes'} waiting to upload`
        : lastSyncedAt
          ? `Synced ${formatDistanceToNowStrict(new Date(lastSyncedAt), { addSuffix: true })}`
          : 'Not synced yet';

  const confirmSignOut = () => {
    const warning =
      pending > 0
        ? `${pending} ${pending === 1 ? 'change has' : 'changes have'} not reached the server yet. Garage will try to upload them first, and they are lost if it cannot.`
        : 'Your cars stay in your account. They come back the next time you sign in.';

    Alert.alert('Sign out?', `${warning} This phone is left with an empty garage.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          // Best effort push before the local copy goes. A failure here is not
          // a reason to trap somebody in an account they want to leave.
          syncNow()
            .catch(() => {})
            .then(() => useAuthStore.getState().signOut())
            .then(() => signOutAndClearLocal())
            .catch(() => {})
            .finally(() => setLeaving(false));
        },
      },
    ]);
  };

  return (
    <>
      <SectionHeader overline="Account" title="Sync" />
      <View style={{ gap: space.xs, marginBottom: space.md }}>
        <AppText variant="body" numberOfLines={1}>
          {email ?? 'Signed in'}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon
            name={error ? 'alert' : phase === 'syncing' ? 'clock' : 'check'}
            size={14}
            color={error ? colors.dangerText : colors.textMuted}
            strokeWidth={1.8}
          />
          <AppText variant="caption" color={error ? 'dangerText' : 'textMuted'} style={{ flex: 1 }}>
            {error ?? status}
          </AppText>
        </View>
      </View>
      <View style={{ gap: space.md }}>
        <Button
          label="Sync now"
          icon="clock"
          variant="ghost"
          onPress={() => void syncNow()}
          loading={phase === 'syncing'}
          full
        />
        <Button label="Sign out" variant="danger" onPress={confirmSignOut} loading={leaving} full />
      </View>
    </>
  );
}
