import { FlashList, type FlashListProps, type ListRenderItemInfo } from '@shopify/flash-list';
import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Platform, RefreshControl, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
  type ScrollHandlerProcessed,
} from 'react-native-reanimated';

import { CarHeader } from '@/components/CarHeader';
import { REFRESH_TRIGGER, RefreshGauge } from '@/components/signature/RefreshGauge';
import { RAIL_GUTTER, TimelineRail } from '@/components/signature/TimelineRail';
import {
  AppText,
  EmptyState,
  Icon,
  IssueStatusPill,
  PressableScale,
  Screen,
  SectionHeader,
  SeverityPill,
  type IconName,
} from '@/components/ui';
import { formatMileage, formatMoney } from '@/lib/format';
import { buildTimeline, type TimelineEvent } from '@/lib/timeline';
import {
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_LABELS,
  serviceLabel,
  type Issue,
  type IssueSeverity,
  type MileageLog,
  type Note,
  type ServiceRecord,
} from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import {
  durations,
  haptic,
  hitTarget,
  radius,
  space,
  springs,
  useMotion,
  useTheme,
  type ColorToken,
} from '@/theme';

/**
 * The living event timeline: every service, issue, note, and mileage update
 * on one odometer tape. One Skia canvas draws the rail behind the list; the
 * scroll offset lives in a shared value so the tape and the iOS refresh
 * gauge both run entirely on the UI thread.
 */

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as unknown as React.ComponentType<FlashListProps<TimelineEvent>>
) as unknown as React.ComponentType<
  Omit<FlashListProps<TimelineEvent>, 'onScroll'> & {
    onScroll?: ScrollHandlerProcessed | FlashListProps<TimelineEvent>['onScroll'];
  }
>;

const NODE_SIZE = 28;
/** Rows past this index enter together: deep scrolling is never delayed. */
const STAGGER_CAP = 8;
const LIST_BOTTOM_PAD = space.xl4;

const SEVERITY_TINT: Record<IssueSeverity, ColorToken> = {
  critical: 'statusOverdue',
  medium: 'statusDueSoon',
  low: 'textSecondary',
};

/** Entrance: staggered settle springs for the first screenful, plain fade when reduced. */
function useRowEntering(index: number) {
  const { reduced, stagger } = useMotion();
  if (reduced) return FadeIn.duration(durations.fadeFast);
  return FadeInDown.delay(stagger(Math.min(index, STAGGER_CAP)))
    .springify()
    .damping(springs.settle.damping)
    .stiffness(springs.settle.stiffness)
    .mass(springs.settle.mass);
}

/** Node glyph over the rail. Solid bg so the tape never bleeds through. */
function Node({ icon, tint, ring }: { icon: IconName; tint: string; ring: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: NODE_SIZE,
        height: NODE_SIZE,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: ring,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={14} color={tint} strokeWidth={1.8} />
    </View>
  );
}

interface RowShellProps {
  index: number;
  node: React.ReactNode;
  accessibilityLabel: string;
  /** Omitted for mileage rows: they are plain, not buttons. */
  onPress?: () => void;
  children: React.ReactNode;
}

function RowShell({ index, node, accessibilityLabel, onPress, children }: RowShellProps) {
  const entering = useRowEntering(index);
  const inner = (
    <>
      <View style={{ width: RAIL_GUTTER, alignItems: 'center', paddingTop: space.xs2 }}>{node}</View>
      <View style={{ flex: 1, gap: space.xs }}>{children}</View>
    </>
  );
  const rowStyle = {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: hitTarget,
  } as const;
  return (
    <Animated.View entering={entering}>
      {onPress ? (
        <PressableScale
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          pressedScale={0.98}
          style={rowStyle}
        >
          {inner}
        </PressableScale>
      ) : (
        <View accessible accessibilityLabel={accessibilityLabel} style={rowStyle}>
          {inner}
        </View>
      )}
    </Animated.View>
  );
}

/** Mono caption line: stamped date, plus the km reading where it matters. */
function RowCaption({ text }: { text: string }) {
  return (
    <AppText variant="label" color="textMuted">
      {text}
    </AppText>
  );
}

const ServiceRow = React.memo(function ServiceRow({
  service,
  vehicleId,
  index,
}: {
  service: ServiceRecord;
  vehicleId: string;
  index: number;
}) {
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const label = serviceLabel(service.type, service.customLabel);
  const dateText = format(new Date(service.date), 'd MMM yyyy');
  return (
    <RowShell
      index={index}
      accessibilityLabel={`${label}, ${dateText}. View service details`}
      onPress={() =>
        router.push({
          pathname: '/car/[id]/service/[serviceId]',
          params: { id: vehicleId, serviceId: service.id },
        })
      }
      node={<Node icon="wrench" tint={colors.accentText} ring={colors.accentText} />}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md }}
      >
        <AppText variant="bodySemi" style={{ flex: 1 }}>
          {label}
        </AppText>
        {service.cost != null ? (
          <AppText variant="numM" color="textSecondary">
            {formatMoney(service.cost, currency)}
          </AppText>
        ) : null}
      </View>
      {service.shop ? (
        <AppText variant="small" color="textSecondary">
          {service.shop}
        </AppText>
      ) : null}
      <RowCaption text={`${dateText} · ${formatMileage(service.mileage, unit)}`} />
    </RowShell>
  );
});

const IssueRow = React.memo(function IssueRow({
  issue,
  vehicleId,
  index,
}: {
  issue: Issue;
  vehicleId: string;
  index: number;
}) {
  const { colors } = useTheme();
  const dateText = format(new Date(issue.createdAt), 'd MMM yyyy');
  return (
    <RowShell
      index={index}
      accessibilityLabel={`${issue.title}. Severity ${ISSUE_SEVERITY_LABELS[issue.severity]}, status ${ISSUE_STATUS_LABELS[issue.status]}. View issue`}
      onPress={() =>
        router.push({
          pathname: '/car/[id]/issue/[issueId]',
          params: { id: vehicleId, issueId: issue.id },
        })
      }
      node={<Node icon="alert" tint={colors[SEVERITY_TINT[issue.severity]]} ring={colors.hairline} />}
    >
      <AppText variant="bodySemi">{issue.title}</AppText>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <SeverityPill severity={issue.severity} />
        <IssueStatusPill status={issue.status} />
      </View>
      <RowCaption text={dateText} />
    </RowShell>
  );
});

const NoteRow = React.memo(function NoteRow({
  note,
  vehicleId,
  index,
}: {
  note: Note;
  vehicleId: string;
  index: number;
}) {
  const { colors } = useTheme();
  const openSheet = useSheetsStore((s) => s.open);
  const dateText = format(new Date(note.createdAt), 'd MMM yyyy');
  return (
    <RowShell
      index={index}
      accessibilityLabel={`Note, ${dateText}. Edit note`}
      onPress={() => openSheet({ kind: 'note', vehicleId, note })}
      node={<Node icon="dot" tint={colors.textMuted} ring={colors.hairline} />}
    >
      <AppText numberOfLines={2}>{note.body}</AppText>
      <RowCaption text={dateText} />
    </RowShell>
  );
});

const MileageRow = React.memo(function MileageRow({ log, index }: { log: MileageLog; index: number }) {
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const reading = formatMileage(log.mileage, unit);
  const dateText = format(new Date(log.date), 'd MMM yyyy');
  return (
    <RowShell
      index={index}
      accessibilityLabel={`Mileage update, ${reading}, ${dateText}`}
      node={<Node icon="odometer" tint={colors.textMuted} ring={colors.hairline} />}
    >
      <AppText variant="numM">{reading}</AppText>
      <AppText variant="small" color="textSecondary">
        Mileage update
      </AppText>
      <RowCaption text={`${dateText} · ${reading}`} />
    </RowShell>
  );
});

const TimelineRow = React.memo(function TimelineRow({
  event,
  index,
  vehicleId,
}: {
  event: TimelineEvent;
  index: number;
  vehicleId: string;
}) {
  switch (event.kind) {
    case 'service':
      return <ServiceRow service={event.service} vehicleId={vehicleId} index={index} />;
    case 'issue':
      return <IssueRow issue={event.issue} vehicleId={vehicleId} index={index} />;
    case 'note':
      return <NoteRow note={event.note} vehicleId={vehicleId} index={index} />;
    case 'mileage':
      return <MileageRow log={event.mileage} index={index} />;
  }
});

export default function TimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const services = useGarageStore((s) => s.services);
  const issues = useGarageStore((s) => s.issues);
  const notes = useGarageStore((s) => s.notes);
  const mileageLogs = useGarageStore((s) => s.mileageLogs);
  const openSheet = useSheetsStore((s) => s.open);
  const { colors } = useTheme();
  const { reduced, fadeDuration, stagger } = useMotion();

  const events = React.useMemo(
    () => (vehicle ? buildTimeline(vehicle.id, services, issues, notes, mileageLogs) : []),
    [vehicle, services, issues, notes, mileageLogs]
  );

  const scrollY = useSharedValue(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 });
  const [contentHeight, setContentHeight] = React.useState(0);
  const [headerHeight, setHeaderHeight] = React.useState(0);
  const refreshBusy = React.useRef(false);

  /** Android and reduce-motion use the plain tinted RefreshControl; iOS gets the gauge. */
  const iosGauge = Platform.OS === 'ios' && !reduced;

  const startRefresh = React.useCallback(() => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    setRefreshError(null);
    setRefreshing(true);
    /** hydrate() is cheap and local; hold briefly so the gauge spin reads. */
    const settle = new Promise((resolve) => setTimeout(resolve, 650));
    void Promise.all([useGarageStore.getState().hydrate(), settle])
      .catch(() => setRefreshError("Couldn't refresh. Pull down to try again."))
      .finally(() => {
        refreshBusy.current = false;
        setRefreshing(false);
        haptic.tick();
      });
  }, []);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        scrollY.value = e.contentOffset.y;
      },
      onEndDrag: (e) => {
        if (iosGauge && e.contentOffset.y <= -REFRESH_TRIGGER) {
          runOnJS(startRefresh)();
        }
      },
    },
    [iosGauge, startRefresh]
  );

  const renderItem = React.useCallback(
    ({ item, index }: ListRenderItemInfo<TimelineEvent>) => (
      <TimelineRow event={item} index={index} vehicleId={id} />
    ),
    [id]
  );

  if (!vehicle) return null;

  const headerEntering = reduced
    ? FadeIn.duration(fadeDuration)
    : FadeInDown.delay(stagger(0))
        .springify()
        .damping(springs.settle.damping)
        .stiffness(springs.settle.stiffness)
        .mass(springs.settle.mass);

  const railTop = headerHeight + space.md;
  const railEnd = contentHeight - LIST_BOTTOM_PAD;
  const showRail = events.length > 0 && viewport.height > 0 && railEnd > railTop;

  return (
    <Screen padded={false}>
      <View
        style={{ flex: 1 }}
        onLayout={(e) =>
          setViewport({
            width: Math.round(e.nativeEvent.layout.width),
            height: Math.round(e.nativeEvent.layout.height),
          })
        }
      >
        {showRail ? (
          <TimelineRail
            scrollY={scrollY}
            x={space.lg + RAIL_GUTTER / 2}
            top={railTop}
            end={railEnd}
            width={viewport.width}
            viewportHeight={viewport.height}
          />
        ) : null}
        <AnimatedFlashList
          data={events}
          keyExtractor={(e: TimelineEvent) => e.id}
          getItemType={(e: TimelineEvent) => e.kind}
          renderItem={renderItem}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onContentSizeChange={(_w, h) => setContentHeight(Math.round(h))}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: LIST_BOTTOM_PAD }}
          refreshControl={
            !iosGauge ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={startRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
                progressBackgroundColor={colors.card}
              />
            ) : undefined
          }
          ListHeaderComponent={
            <View onLayout={(e) => setHeaderHeight(Math.round(e.nativeEvent.layout.height))}>
              <CarHeader vehicle={vehicle} />
              <Animated.View entering={headerEntering}>
                <SectionHeader
                  overline="Every event"
                  title="Timeline"
                  accessory={
                    events.length > 0 ? (
                      <AppText variant="label" color="textMuted">
                        {events.length === 1 ? '1 event' : `${events.length} events`}
                      </AppText>
                    ) : undefined
                  }
                />
              </Animated.View>
              {refreshError ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.xs,
                    marginBottom: space.md,
                  }}
                >
                  <Icon name="alert" size={14} color={colors.dangerText} />
                  <AppText variant="caption" color="dangerText">
                    {refreshError}
                  </AppText>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="timeline"
              title="Nothing logged yet"
              body="Services, issues, notes, and mileage updates will build this car's story."
              actionLabel="Log service"
              onAction={() => openSheet({ kind: 'logService', vehicleId: vehicle.id })}
            />
          }
        />
        {iosGauge ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: space.xs, left: 0, right: 0, alignItems: 'center' }}
          >
            <RefreshGauge scrollY={scrollY} refreshing={refreshing} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
