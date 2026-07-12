import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { CarHeader } from '@/components/CarHeader';
import { AppText, Button, Card, IssueStatusPill, Screen, SectionHeader, SeverityPill } from '@/components/ui';
import { useGarageStore } from '@/stores/garage';
import { useSheetsStore } from '@/stores/sheets';
import { space } from '@/theme';

/** Baseline issues list; the severity dial and detail route land in the feature pass. */
export default function IssuesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const issues = useGarageStore((s) => s.issues);
  const openSheet = useSheetsStore((s) => s.open);

  if (!vehicle) return null;
  const list = issues.filter((i) => i.vehicleId === vehicle.id);

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <SectionHeader overline="Problems" title="Issues" />
        <View style={{ gap: space.md }}>
          {list.map((issue) => (
            <Card key={issue.id} onPress={() => openSheet({ kind: 'reportIssue', vehicleId: vehicle.id, issue })}>
              <AppText variant="bodyMedium">{issue.title}</AppText>
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                <SeverityPill severity={issue.severity} />
                <IssueStatusPill status={issue.status} />
              </View>
            </Card>
          ))}
          <Button label="Report issue" onPress={() => openSheet({ kind: 'reportIssue', vehicleId: vehicle.id })} full />
        </View>
      </ScrollView>
    </Screen>
  );
}
