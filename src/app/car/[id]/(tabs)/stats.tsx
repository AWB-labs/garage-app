import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { CarHeader } from '@/components/CarHeader';
import { AppText, Card, Screen, SectionHeader } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { costByType, totalSpent } from '@/lib/stats';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { space } from '@/theme';

/** Baseline stats; the Skia charts land in the feature pass. */
export default function StatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const services = useGarageStore((s) => s.services);
  const currency = useSettingsStore((s) => s.currency);

  if (!vehicle) return null;
  const history = services.filter((s) => s.vehicleId === vehicle.id);
  const byType = costByType(history);

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <SectionHeader overline="All time" title="Spend" />
        <Card>
          <AppText variant="label" color="textMuted">
            Total spent
          </AppText>
          <AppText variant="numL" style={{ marginTop: space.xs }}>
            {formatMoney(totalSpent(history), currency)}
          </AppText>
        </Card>
        <View style={{ gap: space.md, marginTop: space.lg }}>
          {byType.map((entry) => (
            <View key={`${entry.type}-${entry.label}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="small" color="textSecondary">
                {entry.label} · {entry.count}
              </AppText>
              <AppText variant="smallMedium">{formatMoney(entry.total, currency)}</AppText>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
