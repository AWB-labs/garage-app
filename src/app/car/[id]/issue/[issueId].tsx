import { format } from 'date-fns';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { RewardPulse } from '@/components/signature/RewardPulse';
import { formatMileage, formatMoney } from '@/lib/format';
import type { DistanceUnit, Issue, IssueStatus, ServiceRecord, Vehicle } from '@/lib/types';
import { ISSUE_SEVERITY_LABELS, ISSUE_STATUS_LABELS, serviceLabel } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { haptic, hitTarget, radius, space, springs, useMotion, useTheme } from '@/theme';
import {
  AppText,
  Button,
  Card,
  Icon,
  IssueStatusPill,
  PressableScale,
  Screen,
  SegmentedControl,
  SeverityPill,
} from '@/components/ui';

const PHOTO_SIZE = 88;

/** One choreographed entrance group: staggered spring, plain fade when reduced. */
function Entrance({ index, children }: { index: number; children: React.ReactNode }) {
  const motion = useMotion();
  return (
    <Animated.View
      entering={
        motion.reduced
          ? FadeIn.duration(motion.fadeDuration)
          : FadeInDown.delay(motion.stagger(index))
              .springify()
              .damping(springs.settle.damping)
              .stiffness(springs.settle.stiffness)
              .overshootClamping(1)
      }
    >
      {children}
    </Animated.View>
  );
}

/** Compact selectable service row inside the link-existing expander. */
const ServiceLinkRow = React.memo(function ServiceLinkRow({
  service,
  unit,
  last,
  onLink,
}: {
  service: ServiceRecord;
  unit: DistanceUnit;
  last: boolean;
  onLink: (service: ServiceRecord) => void;
}) {
  const { colors } = useTheme();
  const label = serviceLabel(service.type, service.customLabel);
  return (
    <PressableScale
      accessibilityLabel={`Link ${label}, ${format(new Date(service.date), 'd MMM yyyy')}, ${formatMileage(service.mileage, unit)}`}
      onPress={() => onLink(service)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: hitTarget + 8,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <Icon name="wrench" size={16} color={colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <AppText variant="smallMedium">{label}</AppText>
        <AppText variant="caption" color="textMuted">
          {format(new Date(service.date), 'd MMM yyyy')} · {formatMileage(service.mileage, unit)}
        </AppText>
      </View>
      <Icon name="chevronRight" size={14} color={colors.textMuted} />
    </PressableScale>
  );
});

export default function IssueDetailScreen() {
  const { id, issueId } = useLocalSearchParams<{ id: string; issueId: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const issue = useGarageStore((s) => s.issues.find((i) => i.id === issueId));

  React.useEffect(() => {
    if (!issue) router.back();
  }, [issue]);

  if (!issue || !vehicle) return null;
  return <IssueDetail issue={issue} vehicle={vehicle} />;
}

function IssueDetail({ issue, vehicle }: { issue: Issue; vehicle: Vehicle }) {
  const { colors } = useTheme();
  const { reduced, fadeDuration } = useMotion();
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const services = useGarageStore((s) => s.services);
  const updateIssue = useGarageStore((s) => s.updateIssue);
  const resolveIssue = useGarageStore((s) => s.resolveIssue);
  const deleteIssue = useGarageStore((s) => s.deleteIssue);
  const openSheet = useSheetsStore((s) => s.open);

  const vehicleServices = React.useMemo(
    () =>
      services
        .filter((s) => s.vehicleId === vehicle.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [services, vehicle.id]
  );
  const linkedService = React.useMemo(
    () => services.find((s) => s.id === issue.resolvedByServiceId) ?? null,
    [services, issue.resolvedByServiceId]
  );

  // Inline expander for the resolve-by-service flow: animated height,
  // fade only when reduced.
  const [expanded, setExpanded] = React.useState(false);
  const expandProgress = useSharedValue(0);
  const contentH = useSharedValue(0);

  // The phosphor moment: fires once whenever the issue transitions to fixed,
  // whatever path got it there. Static highlight under reduce motion.
  //
  // A fixed issue also puts the resolve expander away. Its subtree unmounts
  // the moment the issue is fixed, so there is nothing left to animate: the
  // state is reset outright, and the assignment cancels any in-flight spring.
  // Without this the panel stays latched open and comes back already expanded,
  // offering to fix an issue that is already fixed.
  const [glowTrigger, setGlowTrigger] = React.useState(0);
  const prevStatus = React.useRef(issue.status);
  React.useEffect(() => {
    if (prevStatus.current !== 'fixed' && issue.status === 'fixed') {
      setGlowTrigger((t) => t + 1);
    }
    if (issue.status === 'fixed') {
      setExpanded(false);
      expandProgress.value = 0;
    }
    prevStatus.current = issue.status;
  }, [issue.status, expandProgress]);

  const toggleResolve = () => {
    const next = !expanded;
    setExpanded(next);
    expandProgress.value = reduced
      ? withTiming(next ? 1 : 0, { duration: fadeDuration })
      : withSpring(next ? 1 : 0, { ...springs.settle, overshootClamping: true });
  };

  const expandStyle = useAnimatedStyle(() => {
    if (reduced) {
      return {
        height: expandProgress.value > 0.01 ? contentH.value : 0,
        opacity: expandProgress.value,
      };
    }
    return { height: expandProgress.value * contentH.value, opacity: expandProgress.value };
  }, [reduced]);

  const setStatus = (status: IssueStatus) => {
    if (status === issue.status) return;
    if (status === 'fixed') {
      // The reward moment is a phosphor pulse plus a success haptic, on every
      // route to Fixed. RewardPulse fires no haptic of its own, and the other
      // two routes get theirs from their callers, so this path fires it here.
      haptic.save();
      // Marking fixed by hand: stamp the date, keep no linked service.
      void updateIssue({
        ...issue,
        status,
        resolvedAt: new Date().toISOString(),
        resolvedByServiceId: null,
      });
    } else {
      void updateIssue({ ...issue, status, resolvedAt: null, resolvedByServiceId: null });
    }
  };

  const linkService = React.useCallback(
    (service: ServiceRecord) => {
      haptic.save();
      void resolveIssue(issue.id, service.id);
    },
    [resolveIssue, issue.id]
  );

  const goToService = () => {
    if (!linkedService) return;
    // typedRoutes can lag while the service detail route lands in a parallel
    // pass; the object form keeps this safe to retype later.
    router.push({
      pathname: '/car/[id]/service/[serviceId]',
      params: { id: vehicle.id, serviceId: linkedService.id },
    });
  };

  const confirmDelete = () => {
    Alert.alert('Delete issue?', 'This removes the issue and its photos from the record.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptic.warn();
          // The parent screen pops back once the issue leaves the store.
          void deleteIssue(issue.id);
        },
      },
    ]);
  };

  const metaCells: { label: string; value: string }[] = [
    { label: 'Reported', value: format(new Date(issue.createdAt), 'd MMM yyyy') },
    { label: 'Severity', value: ISSUE_SEVERITY_LABELS[issue.severity] },
    { label: 'Status', value: ISSUE_STATUS_LABELS[issue.status] },
    { label: 'Photos', value: String(issue.photoUris.length) },
  ];
  if (issue.status === 'fixed') {
    metaCells.push({
      label: 'Fixed',
      value: issue.resolvedAt ? format(new Date(issue.resolvedAt), 'd MMM yyyy') : '·',
    });
    metaCells.push({
      label: 'Fixed by',
      value: linkedService ? serviceLabel(linkedService.type, linkedService.customLabel) : 'Marked by hand',
    });
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl4 }}>
        <Entrance index={0}>
          <PressableScale
            accessibilityLabel="Back to issues"
            onPress={() => router.back()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              alignSelf: 'flex-start',
              minHeight: hitTarget,
              paddingRight: space.md,
            }}
          >
            <Icon name="chevronLeft" size={18} color={colors.accentText} />
            <AppText variant="label" color="accentText">
              Issues
            </AppText>
          </PressableScale>
        </Entrance>

        <Entrance index={1}>
          <AppText variant="displayL" style={{ marginTop: space.sm }}>
            {issue.title}
          </AppText>
          <View style={{ alignSelf: 'flex-start', marginTop: space.md, padding: space.xs }}>
            <RewardPulse trigger={glowTrigger} borderRadius={radius.sm} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <SeverityPill severity={issue.severity} />
              <IssueStatusPill status={issue.status} />
            </View>
          </View>
        </Entrance>

        {issue.description ? (
          <Entrance index={2}>
            <AppText color="textSecondary" style={{ marginTop: space.lg }}>
              {issue.description}
            </AppText>
          </Entrance>
        ) : null}

        {issue.photoUris.length > 0 ? (
          <Entrance index={3}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: space.xl }}
              contentContainerStyle={{ gap: space.sm }}
            >
              {issue.photoUris.map((uri, index) => (
                <Image
                  key={`${uri}-${index}`}
                  source={{ uri }}
                  contentFit="cover"
                  accessibilityLabel={`Photo ${index + 1} of ${issue.photoUris.length}`}
                  style={{
                    width: PHOTO_SIZE,
                    height: PHOTO_SIZE,
                    borderRadius: radius.sm,
                    backgroundColor: colors.inset,
                  }}
                />
              ))}
            </ScrollView>
          </Entrance>
        ) : null}

        <Entrance index={4}>
          <View
            style={{
              marginTop: space.xl,
              borderTopWidth: 1,
              borderTopColor: colors.hairline,
              flexDirection: 'row',
              flexWrap: 'wrap',
            }}
          >
            {metaCells.map((cell) => (
              <View
                key={cell.label}
                style={{
                  width: '50%',
                  paddingVertical: space.md,
                  paddingRight: space.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.hairline,
                }}
              >
                <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs2 }}>
                  {cell.label}
                </AppText>
                <AppText variant="smallMedium">{cell.value}</AppText>
              </View>
            ))}
          </View>
        </Entrance>

        <Entrance index={5}>
          <AppText variant="label" color="textMuted" style={{ marginTop: space.xl2, marginBottom: space.xs }}>
            Status
          </AppText>
          <SegmentedControl
            options={[
              { value: 'open', label: 'Open', icon: 'alert' },
              { value: 'monitoring', label: 'Monitoring', icon: 'clock' },
              { value: 'fixed', label: 'Fixed', icon: 'check' },
            ]}
            value={issue.status}
            onChange={setStatus}
            hapticFor={(status) => (status === 'fixed' ? null : haptic.select)}
          />

          {issue.status !== 'fixed' ? (
            <>
              <View style={{ marginTop: space.lg }}>
                <Button label="Fix with a service" icon="wrench" onPress={toggleResolve} full />
              </View>
              <Animated.View
                style={[{ overflow: 'hidden' }, expandStyle]}
                pointerEvents={expanded ? 'auto' : 'none'}
              >
                <View
                  style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
                  onLayout={(e) => {
                    contentH.value = e.nativeEvent.layout.height;
                  }}
                >
                  <View style={{ paddingTop: space.md }}>
                    <Button
                      label="Log new service"
                      variant="ghost"
                      icon="plus"
                      onPress={() =>
                        openSheet({ kind: 'logService', vehicleId: vehicle.id, resolvesIssueId: issue.id })
                      }
                      full
                    />
                    <AppText
                      variant="label"
                      color="textMuted"
                      style={{ marginTop: space.lg, marginBottom: space.xs }}
                    >
                      Or link one you logged
                    </AppText>
                    <View style={{ borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.sm }}>
                      {vehicleServices.length === 0 ? (
                        <AppText variant="small" color="textMuted" style={{ padding: space.md }}>
                          No services logged yet. Log one and it links here.
                        </AppText>
                      ) : (
                        vehicleServices.map((service, index) => (
                          <ServiceLinkRow
                            key={service.id}
                            service={service}
                            unit={unit}
                            last={index === vehicleServices.length - 1}
                            onLink={linkService}
                          />
                        ))
                      )}
                    </View>
                  </View>
                </View>
              </Animated.View>
            </>
          ) : linkedService ? (
            <Card
              onPress={goToService}
              accessibilityLabel={`Fixed by ${serviceLabel(linkedService.type, linkedService.customLabel)}. View service`}
              style={{ marginTop: space.lg, borderColor: colors.success, overflow: 'hidden' }}
            >
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.success, opacity: 0.07 }]}
              />
              <AppText variant="label" color="successText" style={{ marginBottom: space.xs }}>
                Fixed by
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Icon name="wrench" size={18} color={colors.successText} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyMedium">
                    {serviceLabel(linkedService.type, linkedService.customLabel)}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {format(new Date(linkedService.date), 'd MMM yyyy')} ·{' '}
                    {formatMileage(linkedService.mileage, unit)}
                    {linkedService.cost != null ? ` · ${formatMoney(linkedService.cost, currency)}` : ''}
                  </AppText>
                </View>
                <Icon name="chevronRight" size={16} color={colors.textMuted} />
              </View>
            </Card>
          ) : null}
        </Entrance>

        <Entrance index={6}>
          <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.xl2 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Edit issue"
                variant="ghost"
                icon="edit"
                onPress={() => openSheet({ kind: 'reportIssue', vehicleId: vehicle.id, issue })}
                full
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Delete issue" variant="danger" icon="trash" onPress={confirmDelete} full />
            </View>
          </View>
        </Entrance>
      </ScrollView>
    </Screen>
  );
}
