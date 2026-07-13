import { router } from 'expo-router';
import React from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { AppText, Button, Icon, PressableScale, Screen, SectionHeader, SegmentedControl } from '@/components/ui';
import { DEMO_CAR_IMAGE_KEY } from '@/lib/carImage';
import { exportGarage } from '@/lib/export';
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

        <SectionHeader overline="Your data" title="Export" />
        <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
          Everything lives on this phone. Export the full garage as JSON any time.
        </AppText>
        <Button label="Export data as JSON" icon="share" variant="ghost" onPress={exportData} loading={exporting} full />

        <AppText variant="caption" color="textMuted" center style={{ marginTop: space.xl3 }}>
          Garage 1.0.0 · local-first, no accounts, no cloud
        </AppText>
      </ScrollView>
    </Screen>
  );
}
