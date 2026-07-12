import { FlashList } from '@shopify/flash-list';
import { format } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { CarHeader } from '@/components/CarHeader';
import { AppText, Icon, Screen, type IconName } from '@/components/ui';
import { buildTimeline, type TimelineEvent } from '@/lib/timeline';
import { serviceLabel } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { space, useTheme } from '@/theme';

const KIND_ICONS: Record<TimelineEvent['kind'], IconName> = {
  service: 'wrench',
  issue: 'alert',
  note: 'note',
  mileage: 'odometer',
};

/** Baseline feed; the living rail and staggered entries land in the feature pass. */
export default function TimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const services = useGarageStore((s) => s.services);
  const issues = useGarageStore((s) => s.issues);
  const notes = useGarageStore((s) => s.notes);
  const mileageLogs = useGarageStore((s) => s.mileageLogs);
  const { colors } = useTheme();

  if (!vehicle) return null;
  const events = buildTimeline(vehicle.id, services, issues, notes, mileageLogs);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.lg }}>
        <CarHeader vehicle={vehicle} />
      </View>
      <FlashList
        data={events}
        keyExtractor={(e) => e.id}
        getItemType={(e) => e.kind}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl4 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.md }}>
            <Icon name={KIND_ICONS[item.kind]} size={18} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyMedium">
                {item.kind === 'service'
                  ? serviceLabel(item.service.type, item.service.customLabel)
                  : item.kind === 'issue'
                    ? item.issue.title
                    : item.kind === 'note'
                      ? item.note.body
                      : 'Mileage update'}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {format(new Date(item.date), 'd MMM yyyy')}
              </AppText>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
