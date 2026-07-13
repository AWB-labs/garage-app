import { format } from 'date-fns';
import React from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CarHeader } from '@/components/CarHeader';
import { SpendChart } from '@/components/signature/SpendChart';
import {
  AppText,
  EmptyState,
  Icon,
  Screen,
  SectionHeader,
  type IconName,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { costByType, servicesPerYear, spendByMonth, totalSpent } from '@/lib/stats';
import type { ServiceType } from '@/lib/types';
import { useRouteVehicle } from '@/lib/useRouteVehicle';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { fonts, radius, space, springs, useMotion, useTheme } from '@/theme';

const TYPE_ICONS: Record<ServiceType, IconName> = {
  oil: 'oil',
  tires: 'tire',
  brakes: 'brake',
  filters: 'filter',
  battery: 'battery',
  inspection: 'inspection',
  custom: 'wrench',
};

/** Display-size hero numeral: numL is too small for the one oversized number this screen is built around. */
const HERO_SIZE = 48;
const HERO_LINE = 54;

export default function StatsScreen() {
  const { id, vehicle } = useRouteVehicle();
  const services = useGarageStore((s) => s.services);
  const currency = useSettingsStore((s) => s.currency);
  const openSheet = useSheetsStore((s) => s.open);
  const { colors } = useTheme();
  const { reduced, stagger } = useMotion();

  const history = React.useMemo(() => services.filter((s) => s.vehicleId === id), [services, id]);
  const months = React.useMemo(() => spendByMonth(history), [history]);
  const byType = React.useMemo(() => costByType(history), [history]);
  const years = React.useMemo(() => servicesPerYear(history), [history]);

  if (!vehicle) return null;

  const total = totalSpent(history);
  // formatMoney prints "EGP 14,250"; the hero composes the grouped amount and currency separately.
  const grouped = formatMoney(total, currency).slice(currency.length + 1);
  const count = history.length;
  // Local year, matching lib/stats and the Service log. The stored value is a
  // UTC instant, so slicing it would file a record under the wrong year.
  const firstYear = history.reduce(
    (min, s) => Math.min(min, Number(format(new Date(s.date), 'yyyy'))),
    Number.POSITIVE_INFINITY
  );
  const countPhrase = count === 1 ? '1 service' : `${count} services`;
  const costless = history.filter((s) => s.cost == null).length;
  const maxTypeTotal = byType.reduce((m, entry) => Math.max(m, entry.total), 0);

  const enter = (index: number) =>
    reduced
      ? undefined
      : FadeInDown.delay(stagger(index))
          .springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness);

  return (
    <Screen>
      <CarHeader vehicle={vehicle} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xl4 }}
      >
        <SectionHeader overline="All time" title="Spend" />
        {count === 0 ? (
          <EmptyState
            icon="stats"
            title="Nothing to count yet"
            body="Log services with costs and Garage will show where the money goes."
            actionLabel="Log service"
            onAction={() => openSheet({ kind: 'logService', vehicleId: id })}
          />
        ) : (
          <>
            <Animated.View
              entering={enter(0)}
              accessible
              accessibilityLabel={`Total spent ${formatMoney(total, currency)}, across ${countPhrase} since ${firstYear}`}
            >
              <AppText variant="label" color="textMuted" style={{ marginBottom: space.sm }}>
                Total spent
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                <AppText
                  variant="numL"
                  style={{ fontFamily: fonts.monoMedium, fontSize: HERO_SIZE, lineHeight: HERO_LINE }}
                >
                  {grouped}
                </AppText>
                <AppText variant="label" color="textMuted">
                  {currency}
                </AppText>
              </View>
              <AppText variant="caption" color="textSecondary" style={{ marginTop: space.xs }}>
                across {countPhrase} since {firstYear}
              </AppText>
            </Animated.View>

            <Animated.View entering={enter(1)} style={{ marginTop: space.xl2 }}>
              <SpendChart data={months} currency={currency} />
            </Animated.View>

            <Animated.View entering={enter(2)} style={{ marginTop: space.xl3 }}>
              <AppText variant="label" color="textMuted" style={{ marginBottom: space.md }}>
                Cost by category
              </AppText>
              <View style={{ gap: space.lg }}>
                {byType.map((entry, index) => {
                  const share = maxTypeTotal > 0 ? entry.total / maxTypeTotal : 0;
                  const fill = index === 0 && entry.total > 0 ? colors.accent : colors.accentDim;
                  const entryCount = entry.count === 1 ? '1 service' : `${entry.count} services`;
                  return (
                    <View
                      key={`${entry.type}:${entry.label}`}
                      accessible
                      accessibilityLabel={`${entry.label}, ${entryCount}, ${formatMoney(entry.total, currency)}`}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Icon name={TYPE_ICONS[entry.type]} size={16} color={colors.textSecondary} />
                        <AppText variant="smallMedium" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {entry.label}
                        </AppText>
                        <AppText variant="label" color="textMuted">
                          · {entry.count}
                        </AppText>
                        <View style={{ flex: 1 }} />
                        <AppText variant="smallMedium">{formatMoney(entry.total, currency)}</AppText>
                      </View>
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={{
                          height: space.xs,
                          borderRadius: radius.pill,
                          backgroundColor: colors.hairline,
                          marginTop: space.sm,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${Math.round(share * 100)}%`,
                            height: '100%',
                            borderRadius: radius.pill,
                            backgroundColor: fill,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Animated.View>

            <Animated.View entering={enter(3)} style={{ marginTop: space.xl3 }}>
              <AppText variant="label" color="textMuted" style={{ marginBottom: space.sm }}>
                Services per year
              </AppText>
              <View
                accessible
                accessibilityLabel={years
                  .map((y) => `${y.count === 1 ? '1 service' : `${y.count} services`} in ${y.year}`)
                  .join(', ')}
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  columnGap: space.xl,
                  rowGap: space.sm,
                  borderTopWidth: 1,
                  borderTopColor: colors.hairline,
                  paddingTop: space.md,
                }}
              >
                {years.map((y) => (
                  <AppText key={y.year} variant="label" color="textSecondary">
                    {y.year} · {y.count}
                  </AppText>
                ))}
              </View>
            </Animated.View>

            {costless > 0 ? (
              <Animated.View entering={enter(4)}>
                <AppText variant="caption" color="textMuted" style={{ marginTop: space.xl2 }}>
                  {costless === 1
                    ? '1 service has no recorded cost.'
                    : `${costless} services have no recorded cost.`}
                </AppText>
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
