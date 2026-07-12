import { format } from 'date-fns';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText, Button, Card, Icon, PressableScale, Screen, type IconName } from '@/components/ui';
import { formatMileage, formatMoney } from '@/lib/format';
import { serviceLabel, type ServiceType } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { durations, haptic, hitTarget, radius, space, springs, useMotion, useTheme } from '@/theme';

/**
 * Service detail: a real expo-router route (the push target for the
 * expanding-card transition later). Root content is one full-width card
 * reading like a printed spec sheet: stamped mono labels, body values,
 * hairline rules.
 */

const TYPE_ICONS: Record<ServiceType, IconName> = {
  oil: 'oil',
  tires: 'tire',
  brakes: 'brake',
  filters: 'filter',
  battery: 'battery',
  inspection: 'inspection',
  custom: 'wrench',
};

export default function ServiceDetailScreen() {
  const { serviceId } = useLocalSearchParams<{ id: string; serviceId: string }>();
  const service = useGarageStore((s) => s.services.find((r) => r.id === serviceId));
  const fixedIssue = useGarageStore((s) => s.issues.find((i) => i.resolvedByServiceId === serviceId));
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const openSheet = useSheetsStore((s) => s.open);
  const { colors } = useTheme();
  const { reduced, stagger } = useMotion();
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const popped = React.useRef(false);

  /** The record can vanish while this screen is open (deleted elsewhere). */
  React.useEffect(() => {
    if (!service && !popped.current) {
      popped.current = true;
      router.back();
    }
  }, [service]);

  if (!service) return null;

  const label = serviceLabel(service.type, service.customLabel);

  const enter = (group: number) =>
    reduced
      ? FadeIn.duration(durations.fadeFast)
      : FadeInDown.delay(stagger(group))
          .springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness)
          .mass(springs.settle.mass);

  const specRows: { label: string; value: string }[] = [
    { label: 'Date', value: format(new Date(service.date), 'd MMM yyyy') },
    { label: 'Mileage', value: formatMileage(service.mileage, unit) },
  ];
  if (service.shop) specRows.push({ label: 'Shop', value: service.shop });
  if (service.cost != null) specRows.push({ label: 'Cost', value: formatMoney(service.cost, currency) });

  const confirmDelete = () => {
    haptic.warn();
    Alert.alert('Delete this service?', 'This removes it from the timeline. There is no undo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          useGarageStore
            .getState()
            .deleteService(service.id)
            .then(() => {
              if (!popped.current) {
                popped.current = true;
                router.back();
              }
            })
            .catch(() => setDeleteError("Couldn't delete. Try again."));
        },
      },
    ]);
  };

  return (
    <Screen>
      <Animated.View entering={enter(0)}>
        <PressableScale
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            minHeight: hitTarget,
            alignSelf: 'flex-start',
            paddingRight: space.lg,
          }}
        >
          <Icon name="chevronLeft" size={18} color={colors.accentText} />
          <AppText variant="smallMedium" color="accentText">
            Back
          </AppText>
        </PressableScale>
      </Animated.View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <Animated.View entering={enter(1)}>
          <Card padding={space.xl}>
            <AppText variant="label" color="textMuted">
              Service record
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
              <Icon name={TYPE_ICONS[service.type]} size={26} color={colors.accentText} />
              <AppText variant="displayL" style={{ flex: 1 }}>
                {label}
              </AppText>
            </View>

            <View style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: colors.hairline }}>
              {specRows.map((row) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingVertical: space.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.hairline,
                  }}
                >
                  <AppText variant="label" color="textMuted" style={{ width: 88 }}>
                    {row.label}
                  </AppText>
                  <AppText style={{ flex: 1, textAlign: 'right' }}>{row.value}</AppText>
                </View>
              ))}
            </View>

            {service.notes ? (
              <View style={{ marginTop: space.lg }}>
                <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
                  Notes
                </AppText>
                <AppText color="textSecondary">{service.notes}</AppText>
              </View>
            ) : null}

            {service.photoUris.length > 0 ? (
              <View style={{ marginTop: space.lg }}>
                <AppText variant="label" color="textMuted" style={{ marginBottom: space.sm }}>
                  Receipts
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                  {service.photoUris.map((uri, i) => (
                    <Image
                      key={uri}
                      source={{ uri }}
                      contentFit="cover"
                      style={{ width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.inset }}
                      accessible
                      accessibilityLabel={`Receipt photo ${i + 1} of ${service.photoUris.length}`}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {fixedIssue ? (
              <View
                accessible
                accessibilityLabel={`Fixed issue: ${fixedIssue.title}`}
                style={{
                  marginTop: space.lg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.sm,
                  padding: space.md,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: colors.successText,
                  backgroundColor: colors.surface,
                }}
              >
                <Icon name="check" size={16} color={colors.successText} strokeWidth={1.8} />
                <AppText variant="smallMedium" color="successText" style={{ flex: 1 }}>
                  Fixed: {fixedIssue.title}
                </AppText>
              </View>
            ) : null}
          </Card>
        </Animated.View>

        <Animated.View
          entering={enter(2)}
          style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}
        >
          <View style={{ flex: 1 }}>
            <Button
              label="Edit"
              variant="ghost"
              icon="edit"
              onPress={() => openSheet({ kind: 'logService', vehicleId: service.vehicleId, service })}
              full
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Delete" variant="danger" icon="trash" onPress={confirmDelete} full />
          </View>
        </Animated.View>

        {deleteError ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
            <Icon name="alert" size={14} color={colors.dangerText} />
            <AppText variant="caption" color="dangerText">
              {deleteError}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
