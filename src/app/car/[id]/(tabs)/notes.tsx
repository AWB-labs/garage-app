import { format } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { CarHeader } from '@/components/CarHeader';
import { AppText, Button, Card, Icon, Screen, SectionHeader } from '@/components/ui';
import { useGarageStore } from '@/stores/garage';
import { useSheetsStore } from '@/stores/sheets';
import { space, useTheme } from '@/theme';

/** Baseline notes; search and pin choreography land in the feature pass. */
export default function NotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const notes = useGarageStore((s) => s.notes);
  const openSheet = useSheetsStore((s) => s.open);
  const { colors } = useTheme();

  if (!vehicle) return null;
  const list = notes
    .filter((n) => n.vehicleId === vehicle.id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1));

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <SectionHeader overline="Worth remembering" title="Notes" />
        <View style={{ gap: space.md }}>
          {list.map((note) => (
            <Card key={note.id} onPress={() => openSheet({ kind: 'note', vehicleId: vehicle.id, note })}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {note.pinned ? <Icon name="pin" size={14} color={colors.accentText} /> : null}
                <AppText style={{ flex: 1 }}>{note.body}</AppText>
              </View>
              <AppText variant="caption" color="textMuted" style={{ marginTop: space.sm }}>
                {format(new Date(note.updatedAt), 'd MMM yyyy')}
              </AppText>
            </Card>
          ))}
          <Button label="Add note" onPress={() => openSheet({ kind: 'note', vehicleId: vehicle.id })} full />
        </View>
      </ScrollView>
    </Screen>
  );
}
