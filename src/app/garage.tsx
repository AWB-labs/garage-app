import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CarSilhouette } from '@/components/signature/CarSilhouette';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
  Pill,
  PressableScale,
  Screen,
} from '@/components/ui';
import { formatMileage } from '@/lib/format';
import type { Vehicle } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { space, springs, useMotion, useTheme } from '@/theme';

export default function GarageScreen() {
  const { colors } = useTheme();
  const { reduced, stagger } = useMotion();
  const vehicles = useGarageStore((s) => s.vehicles);
  const activeVehicleId = useGarageStore((s) => s.activeVehicleId);
  const openSheet = useSheetsStore((s) => s.open);

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginTop: space.lg,
          marginBottom: space.xl,
        }}
      >
        <View>
          <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
            {vehicles.length === 1 ? '1 car' : `${vehicles.length} cars`}
          </AppText>
          <AppText variant="displayXL">Garage</AppText>
        </View>
        <PressableScale
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          style={{ padding: space.sm }}
        >
          <Icon name="settings" size={22} color={colors.textSecondary} />
        </PressableScale>
      </View>

      {vehicles.length === 0 ? (
        <EmptyState
          icon="car"
          title="Your garage is empty"
          body="Add your first car to start tracking services, issues, and mileage."
          actionLabel="Add your first car"
          onAction={() => openSheet({ kind: 'vehicle' })}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
          {vehicles.map((vehicle, index) => (
            <Animated.View
              key={vehicle.id}
              entering={
                reduced
                  ? FadeInDown.duration(120)
                  : FadeInDown.delay(stagger(index))
                      .springify()
                      .damping(springs.settle.damping)
                      .stiffness(springs.settle.stiffness)
              }
            >
              <GarageCard vehicle={vehicle} active={vehicle.id === activeVehicleId} />
            </Animated.View>
          ))}
          <Button label="Add car" icon="plus" variant="ghost" full onPress={() => openSheet({ kind: 'vehicle' })} />
        </ScrollView>
      )}
    </Screen>
  );
}

function GarageCard({ vehicle, active }: { vehicle: Vehicle; active: boolean }) {
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const setActiveVehicle = useGarageStore((s) => s.setActiveVehicle);
  const openSheet = useSheetsStore((s) => s.open);
  const name = vehicle.nickname ?? `${vehicle.make} ${vehicle.model}`;

  return (
    <Card
      accessibilityLabel={`${name}, ${vehicle.year} ${vehicle.make} ${vehicle.model}, ${formatMileage(vehicle.currentMileage, unit)}. Open dashboard. Long press to edit.`}
      onPress={() => {
        setActiveVehicle(vehicle.id);
        router.push({ pathname: '/car/[id]', params: { id: vehicle.id } });
      }}
      onLongPress={() => openSheet({ kind: 'vehicle', vehicle })}
      padding={0}
      style={{ marginBottom: space.lg, overflow: 'hidden', borderColor: active ? colors.accentText : colors.hairline }}
    >
      <View style={{ height: 150, backgroundColor: colors.inset, alignItems: 'center', justifyContent: 'center' }}>
        {vehicle.photoUri ? (
          <Image
            source={{ uri: vehicle.photoUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <CarSilhouette width={230} emphasis="hero" />
        )}
      </View>
      <View style={{ padding: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="displayL" numberOfLines={1} style={{ flex: 1, marginRight: space.sm }}>
            {name}
          </AppText>
          {active ? <Pill label="Active" icon="check" color="accentText" /> : null}
        </View>
        <AppText variant="small" color="textSecondary" style={{ marginTop: space.xs }}>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </AppText>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: space.md,
          }}
        >
          <AppText variant="numM" color="text">
            {formatMileage(vehicle.currentMileage, unit)}
          </AppText>
          {vehicle.plate ? <Pill label={vehicle.plate} color="textSecondary" /> : null}
        </View>
      </View>
    </Card>
  );
}
