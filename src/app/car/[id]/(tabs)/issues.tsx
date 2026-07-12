import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CarHeader } from '@/components/CarHeader';
import type { Issue, IssueSeverity } from '@/lib/types';
import { ISSUE_SEVERITY_LABELS, ISSUE_STATUS_LABELS } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSheetsStore } from '@/stores/sheets';
import { durations, radius, space, springs, useMotion, useTheme } from '@/theme';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
  IssueStatusPill,
  Screen,
  SectionHeader,
  SeverityPill,
} from '@/components/ui';

type Row = { kind: 'issue'; issue: Issue } | { kind: 'fixedHeader' };

const SEVERITY_RANK: Record<IssueSeverity, number> = { critical: 0, medium: 1, low: 2 };

/** Entrance choreography only greets the first paint, never mid-scroll mounts. */
const ENTRANCE_WINDOW_MS = 700;

/** Slow breathing pulse for the critical glyph, derived from the fade token. */
const PULSE_MS = durations.fade * 8;

/** The alert glyph on a critical open issue breathes slowly; static under reduce motion. */
const CriticalPulse = React.memo(function CriticalPulse() {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    if (reduced) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.45, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={style} accessible={false} importantForAccessibility="no">
      <Icon name="alert" size={16} color={colors.dangerText} />
    </Animated.View>
  );
});

/** Photo count chip, sized and shaped like a Pill. */
function PhotoChip({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`${count} ${count === 1 ? 'photo' : 'photos'}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.sm,
        paddingVertical: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      <Icon name="image" size={12} color={colors.textMuted} strokeWidth={2} />
      <AppText variant="label" color="textMuted">
        {count}
      </AppText>
    </View>
  );
}

/** Quiet mono subheader for the fixed group, sitting on a hairline. */
function FixedSubheader() {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="header"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
        paddingBottom: space.xs,
        marginTop: space.lg,
        marginBottom: space.md,
      }}
    >
      <AppText variant="label" color="textMuted">
        Fixed
      </AppText>
    </View>
  );
}

const IssueCard = React.memo(function IssueCard({
  issue,
  onPress,
}: {
  issue: Issue;
  onPress: (issue: Issue) => void;
}) {
  const { colors } = useTheme();
  const fixed = issue.status === 'fixed';
  const critical = issue.severity === 'critical' && !fixed;
  return (
    <Card
      onPress={() => onPress(issue)}
      accessibilityLabel={`${issue.title}. ${ISSUE_SEVERITY_LABELS[issue.severity]} severity, ${ISSUE_STATUS_LABELS[issue.status]}.`}
      style={[{ marginBottom: space.md }, critical && { borderColor: colors.danger }, fixed && { opacity: 0.92 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <AppText variant="bodyMedium" color={fixed ? 'textSecondary' : 'text'} numberOfLines={1} style={{ flex: 1 }}>
          {issue.title}
        </AppText>
        {critical ? <CriticalPulse /> : null}
      </View>
      {issue.description ? (
        <AppText variant="small" color="textSecondary" numberOfLines={2} style={{ marginTop: space.xs }}>
          {issue.description}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
        <SeverityPill severity={issue.severity} />
        <IssueStatusPill status={issue.status} />
        {issue.photoUris.length > 0 ? <PhotoChip count={issue.photoUris.length} /> : null}
      </View>
    </Card>
  );
});

export default function IssuesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const issues = useGarageStore((s) => s.issues);
  const openSheet = useSheetsStore((s) => s.open);
  const motion = useMotion();

  const vehicleId = vehicle?.id ?? '';

  const { rows, openCount } = React.useMemo(() => {
    const mine = issues.filter((i) => i.vehicleId === vehicleId);
    const open = mine
      .filter((i) => i.status !== 'fixed')
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt)
      );
    const fixed = mine
      .filter((i) => i.status === 'fixed')
      .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));
    const next: Row[] = open.map((issue) => ({ kind: 'issue' as const, issue }));
    if (fixed.length > 0) {
      next.push({ kind: 'fixedHeader' });
      next.push(...fixed.map((issue) => ({ kind: 'issue' as const, issue })));
    }
    return { rows: next, openCount: open.length };
  }, [issues, vehicleId]);

  const entranceOver = React.useRef(false);
  React.useEffect(() => {
    const t = setTimeout(() => {
      entranceOver.current = true;
    }, ENTRANCE_WINDOW_MS);
    return () => clearTimeout(t);
  }, []);

  const report = React.useCallback(
    () => openSheet({ kind: 'reportIssue', vehicleId }),
    [openSheet, vehicleId]
  );

  const openDetail = React.useCallback(
    (issue: Issue) => {
      router.push({ pathname: '/car/[id]/issue/[issueId]', params: { id: vehicleId, issueId: issue.id } });
    },
    [vehicleId]
  );

  const renderItem = React.useCallback(
    ({ item, index }: ListRenderItemInfo<Row>) => {
      const entering = entranceOver.current
        ? undefined
        : motion.reduced
          ? FadeIn.duration(motion.fadeDuration)
          : FadeInDown.delay(motion.stagger(Math.min(index + 1, 9)))
              .springify()
              .damping(springs.settle.damping)
              .stiffness(springs.settle.stiffness);
      return (
        <Animated.View entering={entering}>
          {item.kind === 'fixedHeader' ? <FixedSubheader /> : <IssueCard issue={item.issue} onPress={openDetail} />}
        </Animated.View>
      );
    },
    [motion, openDetail]
  );

  if (!vehicle) return null;

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <FlashList
        data={rows}
        keyExtractor={(row) => (row.kind === 'issue' ? row.issue.id : 'fixed-header')}
        getItemType={(row) => row.kind}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xl4 }}
        ListHeaderComponent={
          <Animated.View
            entering={
              motion.reduced
                ? FadeIn.duration(motion.fadeDuration)
                : FadeInDown.springify()
                    .damping(springs.settle.damping)
                    .stiffness(springs.settle.stiffness)
            }
            style={{ marginBottom: space.md }}
          >
            <SectionHeader
              overline="Problems"
              title="Issues"
              accessory={
                openCount > 0 ? (
                  <AppText variant="numM" color="textMuted" accessibilityLabel={`${openCount} open`}>
                    {openCount}
                  </AppText>
                ) : undefined
              }
            />
          </Animated.View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="check"
            title="No issues"
            body="When something feels off, report it here so it does not get forgotten."
            actionLabel="Report issue"
            onAction={report}
          />
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={{ marginTop: space.sm }}>
              <Button label="Report issue" icon="plus" onPress={report} full />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
