import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { CarHeader } from '@/components/CarHeader';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { formatMileage } from '@/lib/format';
import { healthScore } from '@/lib/health';
import { reminderStatus, sortByUrgency } from '@/lib/reminders';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { space } from '@/theme';

/** Baseline dashboard; the hero cluster, gauge, odometer, and radial FAB land in the feature pass. */
export default function DashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const reminders = useGarageStore((s) => s.reminders);
  const issues = useGarageStore((s) => s.issues);
  const unit = useSettingsStore((s) => s.unit);
  const openSheet = useSheetsStore((s) => s.open);

  if (!vehicle) return null;

  const statuses = sortByUrgency(
    reminders.filter((r) => r.vehicleId === vehicle.id).map((r) => reminderStatus(r, vehicle))
  );
  const vehicleIssues = issues.filter((i) => i.vehicleId === vehicle.id && i.status !== 'fixed');
  const health = healthScore(statuses, vehicleIssues);

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <Card style={{ marginTop: space.lg }}>
          <AppText variant="label" color="textMuted">
            Odometer
          </AppText>
          <AppText variant="numL" style={{ marginTop: space.xs }}>
            {formatMileage(vehicle.currentMileage, unit)}
          </AppText>
          <AppText variant="small" color="textSecondary" style={{ marginTop: space.md }}>
            Health {health.score} · {vehicleIssues.length} open issue{vehicleIssues.length === 1 ? '' : 's'} ·{' '}
            {statuses.filter((s) => s.state !== 'upcoming').length} due
          </AppText>
        </Card>
        <View style={{ gap: space.md, marginTop: space.lg }}>
          <Button label="Update mileage" onPress={() => openSheet({ kind: 'updateMileage', vehicleId: vehicle.id })} full />
          <Button
            label="Log service"
            variant="ghost"
            onPress={() => openSheet({ kind: 'logService', vehicleId: vehicle.id })}
            full
          />
          <Button
            label="Report issue"
            variant="ghost"
            onPress={() => openSheet({ kind: 'reportIssue', vehicleId: vehicle.id })}
            full
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
