import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { durations, radius, space, springs, useMotion, useTheme } from '@/theme';
import { AppText, Icon, PressableScale, type IconName } from '@/components/ui';

const TAB_ICONS: Record<string, IconName> = {
  index: 'gauge',
  timeline: 'timeline',
  maintenance: 'wrench',
  issues: 'alert',
  notes: 'note',
  stats: 'stats',
};

/** Height of the amber tick that marks the live section. */
const TICK_HEIGHT = 2;

/**
 * Section bar, built like a gauge scale: six evenly spaced tick marks with one
 * amber needle sliding between them.
 *
 * Tabs are equal, fixed-width cells. The only thing that moves is the tick, on
 * one spring driven by a single shared value: nothing in this bar animates a
 * layout property, so the icons cannot shove each other around mid-transition.
 */
export function CarTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = React.useState(0);

  const count = state.routes.length;
  const cellWidth = barWidth > 0 ? barWidth / count : 0;
  const tickX = useSharedValue(0);

  React.useEffect(() => {
    if (cellWidth === 0) return;
    const target = state.index * cellWidth;
    // First measure lands the tick without a slide; later switches spring.
    if (tickX.value === 0 && state.index === 0) {
      tickX.value = target;
      return;
    }
    tickX.value = reduced
      ? withTiming(target, { duration: durations.fadeFast })
      : withSpring(target, springs.settle);
  }, [state.index, cellWidth, reduced, tickX]);

  const tickStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tickX.value }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    setBarWidth((prev) => (prev === width ? prev : width));
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        paddingBottom: Math.max(insets.bottom, space.sm),
      }}
    >
      <View onLayout={onLayout} style={{ flexDirection: 'row' }}>
        {cellWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: cellWidth,
                alignItems: 'center',
              },
              tickStyle,
            ]}
          >
            <View
              style={{
                width: space.xl2,
                height: TICK_HEIGHT,
                borderBottomLeftRadius: radius.pill,
                borderBottomRightRadius: radius.pill,
                backgroundColor: colors.accent,
              }}
            />
          </Animated.View>
        ) : null}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;
          const active = state.index === index;
          const icon = TAB_ICONS[route.name] ?? 'dot';

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (active || event.defaultPrevented) return;
            // The [id] lives on the parent car route, so carry it across or the
            // target section has no car to render.
            navigation.navigate(route.name, { ...route.params, ...state.routes[state.index].params });
          };

          return (
            <PressableScale
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={onPress}
              pressedScale={0.92}
              style={{
                width: cellWidth || undefined,
                flex: cellWidth ? undefined : 1,
                minHeight: 52,
                paddingTop: space.md,
                paddingBottom: space.xs,
                alignItems: 'center',
                justifyContent: 'center',
                gap: space.xs,
              }}
            >
              <Icon name={icon} size={20} color={active ? colors.accentText : colors.textMuted} />
              <AppText
                variant="label"
                color={active ? 'accentText' : 'textMuted'}
                numberOfLines={1}
                style={{ fontSize: 9, letterSpacing: 0.3 }}
              >
                {label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
