import { format } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { CarHeader } from '@/components/CarHeader';
import { AppText, Button, Card, ReminderPill, Screen, SectionHeader } from '@/components/ui';
import { formatMileage } from '@/lib/format';
import { reminderStatus, sortByUrgency } from '@/lib/reminders';
import { serviceLabel } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { space } from '@/theme';

/** Baseline service screen; escalation visuals and the reward moment land in the feature pass. */
export default function MaintenanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const services = useGarageStore((s) => s.services);
  const reminders = useGarageStore((s) => s.reminders);
  const unit = useSettingsStore((s) => s.unit);
  const openSheet = useSheetsStore((s) => s.open);

  if (!vehicle) return null;
  const history = services.filter((s) => s.vehicleId === vehicle.id);
  const statuses = sortByUrgency(
    reminders.filter((r) => r.vehicleId === vehicle.id).map((r) => reminderStatus(r, vehicle))
  );

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <SectionHeader overline="Reminders" title="Coming up" />
        <View style={{ gap: space.md }}>
          {statuses.map((status) => (
            <Card key={status.rule.id} onPress={() => openSheet({ kind: 'reminder', vehicleId: vehicle.id, rule: status.rule })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="bodyMedium">{status.label}</AppText>
                <ReminderPill state={status.state} />
              </View>
            </Card>
          ))}
          <Button label="Add reminder" variant="ghost" onPress={() => openSheet({ kind: 'reminder', vehicleId: vehicle.id })} full />
        </View>

        <SectionHeader overline="History" title="Service log" />
        <View style={{ gap: space.md }}>
          {history.map((service) => (
            <Card key={service.id} onPress={() => openSheet({ kind: 'logService', vehicleId: vehicle.id, service })}>
              <AppText variant="bodyMedium">{serviceLabel(service.type, service.customLabel)}</AppText>
              <AppText variant="caption" color="textMuted">
                {format(new Date(service.date), 'd MMM yyyy')} · {formatMileage(service.mileage, unit)}
              </AppText>
            </Card>
          ))}
          <Button label="Log service" onPress={() => openSheet({ kind: 'logService', vehicleId: vehicle.id })} full />
        </View>
      </ScrollView>
    </Screen>
  );
}
