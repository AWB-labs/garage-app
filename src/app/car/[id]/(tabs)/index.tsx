import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { CarHeader } from '@/components/CarHeader';
import { CarSilhouette } from '@/components/signature/CarSilhouette';
import { HealthGauge } from '@/components/signature/HealthGauge';
import { Odometer } from '@/components/signature/Odometer';
import { RadialFab } from '@/components/signature/RadialFab';
import { AppText, Card, Icon, Pill, ReminderPill, Screen } from '@/components/ui';
import { formatMileage, kmToDisplay } from '@/lib/format';
import { healthScore } from '@/lib/health';
import {
  REMINDER_STATE_LABELS,
  reminderStatus,
  sortByUrgency,
  type ReminderStatus,
} from '@/lib/reminders';
import type { DistanceUnit } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { space, springs, useMotion, useTheme } from '@/theme';

/**
 * The per-car home: an instrument cluster. Full-bleed hero over a dot-matrix
 * backdrop, the odometer roll, the health gauge, the next-up strip, and the
 * radial FAB. Layout is deliberately asymmetric: no two adjacent cards share
 * a width.
 */

/** Fine pixel-LCD dot grid behind the hero cluster. One canvas for the region. */
const DotMatrix = React.memo(function DotMatrix({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  const path = React.useMemo(() => {
    const p = Skia.Path.Make();
    const gap = space.lg;
    for (let y = gap / 2; y < height; y += gap) {
      for (let x = gap / 2; x < width; x += gap) {
        p.addCircle(x, y, 1);
      }
    }
    return p;
  }, [width, height]);
  return (
    <Canvas
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width, height, opacity: 0.5 }}
    >
      <Path path={path} color={color} />
    </Canvas>
  );
});

/** "1,000 km or 10 days left", or "Overdue by 35 days". */
function dueCopy(status: ReminderStatus, unit: DistanceUnit): string {
  const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
  if (status.state === 'overdue') {
    if (status.daysLeft != null && status.daysLeft < 0) return `Overdue by ${days(-status.daysLeft)}`;
    if (status.kmLeft != null && status.kmLeft < 0) return `Overdue by ${formatMileage(-status.kmLeft, unit)}`;
    return 'Overdue';
  }
  const parts: string[] = [];
  if (status.kmLeft != null && status.kmLeft >= 0) parts.push(formatMileage(status.kmLeft, unit));
  if (status.daysLeft != null && status.daysLeft >= 0) parts.push(days(status.daysLeft));
  return parts.length > 0 ? `${parts.join(' or ')} left` : 'Scheduled';
}

export default function DashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const reminders = useGarageStore((s) => s.reminders);
  const issues = useGarageStore((s) => s.issues);
  const unit = useSettingsStore((s) => s.unit);
  const { colors } = useTheme();
  const { reduced, stagger, fadeDuration } = useMotion();
  const { width: windowWidth } = useWindowDimensions();
  const [cluster, setCluster] = React.useState({ w: 0, h: 0 });

  const statuses = React.useMemo(() => {
    if (!vehicle) return [] as ReminderStatus[];
    return sortByUrgency(
      reminders.filter((r) => r.vehicleId === vehicle.id).map((r) => reminderStatus(r, vehicle))
    );
  }, [reminders, vehicle]);
  const openIssues = React.useMemo(
    () => (vehicle ? issues.filter((i) => i.vehicleId === vehicle.id && i.status !== 'fixed') : []),
    [issues, vehicle]
  );
  const health = React.useMemo(() => healthScore(statuses, openIssues), [statuses, openIssues]);

  if (!vehicle) return null;

  const name = vehicle.nickname ?? `${vehicle.make} ${vehicle.model}`;
  const displayMileage = Math.round(kmToDisplay(vehicle.currentMileage, unit));
  const gaugeWidth = Math.max(180, Math.min(300, windowWidth - space.lg * 2 - space.lg * 2));
  const topStatus: ReminderStatus | undefined = statuses[0];

  const enter = (index: number) =>
    reduced
      ? FadeIn.duration(fadeDuration).reduceMotion(ReduceMotion.Never)
      : FadeInDown.springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness)
          .delay(stagger(index));
  const shift = reduced
    ? undefined
    : LinearTransition.springify().damping(springs.settle.damping).stiffness(springs.settle.stiffness);

  const onClusterLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    const h = Math.round(e.nativeEvent.layout.height);
    setCluster((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  };

  const goService = () => {
    router.navigate({ pathname: '/car/[id]/maintenance', params: { id: vehicle.id } } as never);
  };
  const goIssues = () => {
    router.navigate({ pathname: '/car/[id]/issues', params: { id: vehicle.id } } as never);
  };

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.lg }}>
        <CarHeader vehicle={vehicle} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xl5 + space.xl4 }}
      >
        {/* The full-bleed hero cluster: car, name, plate, odometer, all over one dot grid. */}
        <View onLayout={onClusterLayout} style={{ position: 'relative' }}>
          {cluster.w > 0 ? <DotMatrix width={cluster.w} height={cluster.h} color={colors.hairline} /> : null}
          <Animated.View entering={enter(0)}>
            {vehicle.photoUri ? (
              <Image
                source={{ uri: vehicle.photoUri }}
                contentFit="cover"
                style={{ width: '100%', height: 190 }}
                accessibilityLabel={`Photo of ${name}`}
              />
            ) : (
              <View style={{ alignItems: 'center', paddingTop: space.lg }}>
                <CarSilhouette width={Math.min(windowWidth - space.xl3 * 2, 340)} emphasis="hero" />
              </View>
            )}
            <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: space.md,
                }}
              >
                <AppText variant="displayXL" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {name}
                </AppText>
                {vehicle.plate ? (
                  <View style={{ marginBottom: space.xs }}>
                    <Pill label={vehicle.plate} />
                  </View>
                ) : null}
              </View>
              <AppText variant="label" color="textMuted" style={{ marginTop: space.xs }}>
                {vehicle.year} · {vehicle.make} {vehicle.model}
              </AppText>
            </View>
          </Animated.View>
          <Animated.View
            entering={enter(1)}
            style={{ paddingHorizontal: space.lg, marginTop: space.xl, paddingBottom: space.xl }}
          >
            <AppText variant="label" color="textMuted" style={{ marginBottom: space.sm }}>
              Odometer
            </AppText>
            <Odometer value={displayMileage} unit={unit} />
          </Animated.View>
        </View>

        <Animated.View entering={enter(2)} style={{ paddingHorizontal: space.lg, marginTop: space.sm }}>
          <Card>
            <HealthGauge score={health.score} deductions={health.deductions} width={gaugeWidth} />
          </Card>
        </Animated.View>

        {/* Next up strip: one wide card, one narrow. Different widths, always. */}
        <Animated.View
          entering={enter(3)}
          layout={shift}
          style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, marginTop: space.lg }}
        >
          <Card
            onPress={goService}
            accessibilityLabel={
              topStatus
                ? `Next up: ${topStatus.label}, ${REMINDER_STATE_LABELS[topStatus.state]}, ${dueCopy(topStatus, unit)}. Opens Service`
                : 'No reminders yet. Opens Service to add one'
            }
            style={{ flex: 1.7 }}
          >
            <AppText variant="label" color="textMuted">
              Next up
            </AppText>
            {topStatus ? (
              <>
                <AppText variant="title" numberOfLines={1} style={{ marginTop: space.xs }}>
                  {topStatus.label}
                </AppText>
                <View style={{ flexDirection: 'row', marginTop: space.sm }}>
                  <ReminderPill state={topStatus.state} />
                </View>
                <AppText variant="small" color="textSecondary" style={{ marginTop: space.sm }}>
                  {dueCopy(topStatus, unit)}
                </AppText>
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
                <Icon name="clock" size={18} color={colors.textMuted} />
                <AppText variant="small" color="textSecondary" style={{ flexShrink: 1 }}>
                  No reminders yet. Add one from Service.
                </AppText>
              </View>
            )}
          </Card>
          <Card
            onPress={goIssues}
            accessibilityLabel={
              openIssues.length > 0
                ? `${openIssues.length} open ${openIssues.length === 1 ? 'issue' : 'issues'}. Opens Issues`
                : 'No open issues. Opens Issues'
            }
            style={{ flex: 1 }}
          >
            <AppText variant="label" color="textMuted">
              Issues
            </AppText>
            {openIssues.length > 0 ? (
              <>
                <AppText variant="numL" style={{ marginTop: space.xs }}>
                  {openIssues.length}
                </AppText>
                <AppText variant="small" color="textSecondary" style={{ marginTop: space.xs }}>
                  open issue{openIssues.length === 1 ? '' : 's'}
                </AppText>
              </>
            ) : (
              <>
                <View style={{ marginTop: space.sm }}>
                  <Icon name="check" size={20} color={colors.successText} />
                </View>
                <AppText variant="small" color="textSecondary" style={{ marginTop: space.xs }}>
                  No open issues
                </AppText>
              </>
            )}
          </Card>
        </Animated.View>
      </ScrollView>
      <Animated.View
        entering={enter(4)}
        pointerEvents="box-none"
        style={{ position: 'absolute', right: space.lg, bottom: space.xl2 }}
      >
        <RadialFab vehicleId={vehicle.id} />
      </Animated.View>
    </Screen>
  );
}
