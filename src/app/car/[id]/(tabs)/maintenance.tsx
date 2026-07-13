import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { addDays, format } from 'date-fns';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CarHeader } from '@/components/CarHeader';
import { RewardPulse } from '@/components/signature/RewardPulse';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
  PressableScale,
  ReminderPill,
  Screen,
  SectionHeader,
  type IconName,
} from '@/components/ui';
import { formatMileage, formatMoney } from '@/lib/format';
import {
  REMINDER_STATE_LABELS,
  reminderStatus,
  sortByUrgency,
  type ReminderState,
  type ReminderStatus,
} from '@/lib/reminders';
import type { DistanceUnit, ServiceRecord, ServiceType } from '@/lib/types';
import { serviceLabel } from '@/lib/types';
import { useRouteVehicle } from '@/lib/useRouteVehicle';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import {
  durations,
  fonts,
  hitTarget,
  radius,
  space,
  springs,
  staggerStep,
  useMotion,
  useTheme,
} from '@/theme';

/**
 * The Service section: reminders escalating like one bulb brightening
 * (dim amber, amber, redline), the full history grouped by year, and the
 * phosphor reward pulse when an urgent reminder is cleared.
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

/** Spec: the escalation track is a 3pt bar. */
const TRACK_HEIGHT = 3;
/** Overdue glyph pulse: a slow opacity loop, period derived from the fade token. */
const GLYPH_PULSE_MS = durations.fade * 5;
const GLYPH_PULSE_MIN = 0.45;
/** Entrance stagger caps here so long lists never queue forever. */
const ENTRANCE_CAP = 8;
/** After this window the mount choreography is over; late rows enter plain. */
const ENTRANCE_WINDOW_MS = staggerStep * 16;
/** Quiet ring around history row glyphs. */
const ICON_RING = 36;

type Row =
  | { key: string; kind: 'remindersHeader' }
  | { key: string; kind: 'reminder'; status: ReminderStatus; pulse: number }
  | { key: string; kind: 'remindersEmpty' }
  | { key: string; kind: 'historyHeader' }
  | { key: string; kind: 'year'; year: number }
  | { key: string; kind: 'service'; service: ServiceRecord }
  | { key: string; kind: 'historyEmpty' };

type Entering = React.ComponentProps<typeof Animated.View>['entering'];

/**
 * What the reward watcher remembers about a rule between renders: its state
 * plus its completion anchor. The anchor is what separates "a service cleared
 * this" from "the rule was edited into a healthier state".
 */
interface ReminderSignature {
  state: ReminderState;
  doneKm: number | null;
  doneAt: string | null;
}

/** Concrete urgency copy: "1,000 km or 10 days left", "Overdue by 35 days". */
function reminderCopy(status: ReminderStatus, unit: DistanceUnit): string {
  const { rule, state, kmLeft, daysLeft } = status;
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  if (state === 'overdue') {
    const parts: string[] = [];
    if (kmLeft != null && kmLeft < 0) parts.push(formatMileage(-kmLeft, unit));
    if (daysLeft != null && daysLeft < 0) parts.push(days(-daysLeft));
    return parts.length > 0 ? `Overdue by ${parts.join(' and ')}` : 'Overdue';
  }
  if (daysLeft === 0) {
    return kmLeft != null ? `Due today · ${formatMileage(Math.max(0, kmLeft), unit)} left` : 'Due today';
  }
  if (kmLeft != null && daysLeft != null) {
    return `${formatMileage(Math.max(0, kmLeft), unit)} or ${days(Math.max(0, daysLeft))} left`;
  }
  if (kmLeft != null && rule.mileageInterval != null && rule.lastDoneMileage != null) {
    const dueAt = rule.lastDoneMileage + rule.mileageInterval;
    return `${formatMileage(Math.max(0, kmLeft), unit)} left · due at ${formatMileage(dueAt, unit)}`;
  }
  if (daysLeft != null && rule.timeIntervalDays != null && rule.lastDoneDate != null) {
    const dueDate = addDays(new Date(rule.lastDoneDate), rule.timeIntervalDays);
    return `${days(Math.max(0, daysLeft))} left · due ${format(dueDate, 'd MMM yyyy')}`;
  }
  return 'Counts from the next matching service';
}

/** Compact header accessory action: plus glyph and an accent verb. */
function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.sm,
      }}
    >
      <Icon name="plus" size={14} color={colors.accentText} strokeWidth={1.8} />
      <AppText variant="smallMedium" color="accentText">
        {label}
      </AppText>
    </PressableScale>
  );
}

interface ReminderCardProps {
  status: ReminderStatus;
  pulse: number;
}

/**
 * One reminder, escalating visually with urgency: type glyph, title, state
 * pill, concrete copy, and a thin progress track whose fill brightens from
 * dim amber through amber to redline. Overdue cards get a danger hairline
 * and a gently pulsing glyph.
 */
const ReminderCard = React.memo(function ReminderCard({ status, pulse }: ReminderCardProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const unit = useSettingsStore((s) => s.unit);
  const openSheet = useSheetsStore((s) => s.open);
  const { rule, state, progress } = status;
  const copy = reminderCopy(status, unit);
  const overdue = state === 'overdue';
  const trackColor =
    state === 'overdue'
      ? colors.statusOverdue
      : state === 'dueSoon'
        ? colors.statusDueSoon
        : colors.statusUpcoming;

  // Springs on mount and on real progress changes; snaps when the recycled
  // cell is handed a different rule so scroll never replays fills.
  const progressValue = useSharedValue(0);
  const lastRuleId = React.useRef<string | null>(null);
  React.useEffect(() => {
    const recycled = lastRuleId.current !== null && lastRuleId.current !== rule.id;
    lastRuleId.current = rule.id;
    if (reduced || recycled) {
      progressValue.value = progress;
      return;
    }
    progressValue.value = withSpring(progress, springs.settle);
  }, [progress, rule.id, reduced, progressValue]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progressValue.value }] }));

  const glyphOpacity = useSharedValue(1);
  React.useEffect(() => {
    if (overdue && !reduced) {
      glyphOpacity.value = withRepeat(withTiming(GLYPH_PULSE_MIN, { duration: GLYPH_PULSE_MS }), -1, true);
    } else {
      cancelAnimation(glyphOpacity);
      glyphOpacity.value = 1;
    }
    return () => cancelAnimation(glyphOpacity);
  }, [overdue, reduced, glyphOpacity]);
  const glyphStyle = useAnimatedStyle(() => ({ opacity: glyphOpacity.value }));

  const openEdit = () => openSheet({ kind: 'reminder', vehicleId: rule.vehicleId, rule });
  // Custom reminders are matched by their name, so carry it into the sheet:
  // without it the saved service resets nothing.
  const markDone = () =>
    openSheet({
      kind: 'logService',
      vehicleId: rule.vehicleId,
      prefillType: rule.serviceType,
      prefillCustomLabel: rule.customLabel ?? undefined,
    });

  return (
    <Card
      // The card nests its own actions, so it must not swallow them into one
      // accessibility element: screen readers reach "Mark done" and the edit
      // button through their own labels below.
      accessible={false}
      onPress={openEdit}
      onLongPress={openEdit}
      accessibilityLabel={`${status.label}. ${REMINDER_STATE_LABELS[state]}. ${copy}. Opens the reminder editor`}
      style={[{ marginBottom: space.md }, overdue && { borderColor: colors.danger }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Animated.View style={glyphStyle}>
          <Icon
            name={TYPE_ICONS[rule.serviceType]}
            size={20}
            color={overdue ? colors.dangerText : colors.textSecondary}
          />
        </Animated.View>
        <AppText variant="title" numberOfLines={1} style={{ flex: 1, marginRight: space.sm }}>
          {status.label}
        </AppText>
        <ReminderPill state={state} />
      </View>

      <AppText variant="small" color="textSecondary" style={{ marginTop: space.xs }}>
        {copy}
      </AppText>

      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          height: TRACK_HEIGHT,
          borderRadius: radius.pill,
          backgroundColor: colors.inset,
          overflow: 'hidden',
          marginTop: space.md,
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: trackColor,
              transformOrigin: 'left',
            },
            fillStyle,
          ]}
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: space.xs,
        }}
      >
        <PressableScale
          accessibilityLabel={`Mark ${status.label} done`}
          onPress={markDone}
          style={{
            minHeight: hitTarget,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            paddingRight: space.sm,
          }}
        >
          <Icon name="check" size={16} color={colors.accentText} strokeWidth={1.8} />
          <AppText variant="smallMedium" color="accentText">
            Mark done
          </AppText>
        </PressableScale>
        <PressableScale
          accessibilityLabel={`Edit ${status.label} reminder`}
          onPress={openEdit}
          style={{ minWidth: hitTarget, minHeight: hitTarget, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="edit" size={16} color={colors.textMuted} />
        </PressableScale>
      </View>

      {/* Keyed by rule so a recycled cell never inherits another row's pulse. */}
      <RewardPulse key={rule.id} trigger={pulse} borderRadius={radius.lg} />
    </Card>
  );
});

/** Small mono year stamped on a hairline rule. */
const YearHeader = React.memo(function YearHeader({ year }: { year: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        marginTop: space.lg,
        marginBottom: space.xs,
      }}
    >
      <AppText variant="label" color="textMuted">
        {String(year)}
      </AppText>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.hairline }} />
    </View>
  );
});

/** One logged service: glyph in a quiet ring, label, mono stamp, cost. */
const ServiceRow = React.memo(function ServiceRow({ service }: { service: ServiceRecord }) {
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const label = serviceLabel(service.type, service.customLabel);
  const dateStr = format(new Date(service.date), 'd MMM yyyy');
  const kmStr = formatMileage(service.mileage, unit);
  const costStr = service.cost != null ? formatMoney(service.cost, currency) : null;

  const openDetail = () => {
    // The detail route belongs to the timeline feature. During concurrent
    // work typedRoutes may not have generated it yet, so the href is cast.
    router.push({
      pathname: '/car/[id]/service/[serviceId]',
      params: { id: service.vehicleId, serviceId: service.id },
    } as never);
  };

  return (
    <PressableScale
      accessibilityLabel={`${label}, ${dateStr}, ${kmStr}${costStr ? `, ${costStr}` : ''}. Opens service details`}
      onPress={openDetail}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        minHeight: hitTarget + space.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <View
        style={{
          width: ICON_RING,
          height: ICON_RING,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={TYPE_ICONS[service.type]} size={18} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {label}
        </AppText>
        <AppText
          variant="caption"
          color="textMuted"
          style={{ fontFamily: fonts.mono, marginTop: space.xs2 }}
        >
          {dateStr} · {kmStr}
        </AppText>
      </View>
      {costStr ? (
        <AppText variant="smallMedium" color="textSecondary">
          {costStr}
        </AppText>
      ) : null}
      <Icon name="chevronRight" size={14} color={colors.textMuted} />
    </PressableScale>
  );
});

/** Inline empty state for the reminders block, lighter than a full-screen one. */
function RemindersEmptyCard({ onAdd }: { onAdd: () => void }) {
  const { colors } = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl2 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.hairline,
          backgroundColor: colors.inset,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.md,
        }}
      >
        <Icon name="clock" size={24} color={colors.accentText} />
      </View>
      <AppText variant="title" center style={{ marginBottom: space.xs }}>
        No reminders yet
      </AppText>
      <AppText
        variant="small"
        color="textSecondary"
        center
        style={{ marginBottom: space.lg, maxWidth: 280 }}
      >
        Set one and Garage will nag you at the right mileage or date.
      </AppText>
      <Button label="Add reminder" variant="ghost" onPress={onAdd} />
    </Card>
  );
}

export default function MaintenanceScreen() {
  const { id, vehicle } = useRouteVehicle();
  const reminders = useGarageStore((s) => s.reminders);
  const services = useGarageStore((s) => s.services);
  const openSheet = useSheetsStore((s) => s.open);
  const { reduced, stagger, fadeDuration } = useMotion();
  // Tabs stay mounted once visited, so the reward moment has to know whether
  // this screen is the one on screen.
  const focused = useIsFocused();

  const statuses = React.useMemo(
    () =>
      vehicle
        ? sortByUrgency(
            reminders.filter((r) => r.vehicleId === vehicle.id).map((r) => reminderStatus(r, vehicle))
          )
        : [],
    [reminders, vehicle]
  );

  const history = React.useMemo(
    () =>
      vehicle
        ? services
            .filter((s) => s.vehicleId === vehicle.id)
            .sort((a, b) => +new Date(b.date) - +new Date(a.date) || b.mileage - a.mileage)
        : [],
    [services, vehicle]
  );

  // The reward moment: watch each rule across renders. A card earns its
  // phosphor pulse only when it settles back to upcoming AND its completion
  // anchor moved, which means a service actually cleared it. Widening the
  // interval in the reminder editor improves the state without touching the
  // anchor, so it stays quiet: nothing was serviced.
  //
  // The success haptic belongs to the save itself (LogServiceSheet fires it),
  // so the pulse is purely visual here. Firing another one would buzz twice
  // for one save, and would buzz on a screen the user is not even looking at.
  const prevStates = React.useRef<Map<string, ReminderSignature>>(new Map());
  // Rewards earned while another screen is on top wait here: the pulse plays
  // where it can be seen, not on the unfocused tab.
  const pendingRewards = React.useRef<Set<string>>(new Set());
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  React.useEffect(() => {
    const next = new Map<string, ReminderSignature>();
    for (const st of statuses) {
      const signature: ReminderSignature = {
        state: st.state,
        doneKm: st.rule.lastDoneMileage,
        doneAt: st.rule.lastDoneDate,
      };
      next.set(st.rule.id, signature);
      const prev = prevStates.current.get(st.rule.id);
      if (!prev) continue;
      const cleared = (prev.state === 'overdue' || prev.state === 'dueSoon') && st.state === 'upcoming';
      const serviced = prev.doneKm !== signature.doneKm || prev.doneAt !== signature.doneAt;
      if (cleared && serviced) pendingRewards.current.add(st.rule.id);
    }
    prevStates.current = next;

    if (!focused || pendingRewards.current.size === 0) return;
    const rewarded = [...pendingRewards.current];
    pendingRewards.current.clear();
    setPulses((p) => {
      const nextPulses = { ...p };
      for (const ruleId of rewarded) nextPulses[ruleId] = (nextPulses[ruleId] ?? 0) + 1;
      return nextPulses;
    });
  }, [statuses, focused]);

  // Entrance choreography runs once per mount; rows mounted later (scroll,
  // recycling) skip it so the list never re-staggers mid-session.
  const entranceActive = React.useRef(true);
  React.useEffect(() => {
    const t = setTimeout(() => {
      entranceActive.current = false;
    }, ENTRANCE_WINDOW_MS);
    return () => clearTimeout(t);
  }, []);

  const makeEntering = (index: number): Entering =>
    reduced
      ? FadeIn.duration(fadeDuration)
      : FadeInDown.delay(stagger(Math.min(index, ENTRANCE_CAP)))
          .springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness)
          .mass(springs.settle.mass);

  const rows = React.useMemo<Row[]>(() => {
    if (!vehicle) return [];
    const list: Row[] = [{ kind: 'remindersHeader', key: 'reminders-header' }];
    if (statuses.length === 0) {
      list.push({ kind: 'remindersEmpty', key: 'reminders-empty' });
    } else {
      for (const st of statuses) {
        list.push({
          kind: 'reminder',
          key: `reminder-${st.rule.id}`,
          status: st,
          pulse: pulses[st.rule.id] ?? 0,
        });
      }
    }
    list.push({ kind: 'historyHeader', key: 'history-header' });
    if (history.length === 0) {
      list.push({ kind: 'historyEmpty', key: 'history-empty' });
    } else {
      let year: number | null = null;
      for (const svc of history) {
        const y = new Date(svc.date).getFullYear();
        if (y !== year) {
          year = y;
          list.push({ kind: 'year', key: `year-${y}`, year: y });
        }
        list.push({ kind: 'service', key: `service-${svc.id}`, service: svc });
      }
    }
    return list;
  }, [vehicle, statuses, history, pulses]);

  const addReminder = () => {
    if (vehicle) openSheet({ kind: 'reminder', vehicleId: vehicle.id });
  };
  const logService = () => {
    if (vehicle) openSheet({ kind: 'logService', vehicleId: vehicle.id });
  };

  const renderRow = (item: Row) => {
    switch (item.kind) {
      case 'remindersHeader':
        return (
          <SectionHeader
            overline="Reminders"
            title="Coming up"
            accessory={statuses.length > 0 ? <HeaderAction label="Add reminder" onPress={addReminder} /> : undefined}
          />
        );
      case 'reminder':
        return <ReminderCard status={item.status} pulse={item.pulse} />;
      case 'remindersEmpty':
        return <RemindersEmptyCard onAdd={addReminder} />;
      case 'historyHeader':
        return (
          <SectionHeader
            overline="History"
            title="Service log"
            accessory={history.length > 0 ? <HeaderAction label="Log service" onPress={logService} /> : undefined}
          />
        );
      case 'year':
        return <YearHeader year={item.year} />;
      case 'service':
        return <ServiceRow service={item.service} />;
      case 'historyEmpty':
        return (
          <EmptyState
            icon="wrench"
            title="No services logged"
            body="Log the first service to start this car's record."
            actionLabel="Log service"
            onAction={logService}
          />
        );
    }
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<Row>) => (
    <Animated.View entering={entranceActive.current ? makeEntering(index) : undefined}>
      {renderRow(item)}
    </Animated.View>
  );

  if (!vehicle) return null;

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <View style={{ flex: 1 }}>
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.kind}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xl4 }}
        />
      </View>
    </Screen>
  );
}
