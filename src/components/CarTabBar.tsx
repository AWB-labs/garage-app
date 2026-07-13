import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, springs, useMotion, useTheme } from '@/theme';
import { AppText, Icon, PressableScale, type IconName } from '@/components/ui';

const TAB_ICONS: Record<string, IconName> = {
  index: 'gauge',
  timeline: 'timeline',
  maintenance: 'wrench',
  issues: 'alert',
  notes: 'note',
  stats: 'stats',
};

/**
 * Custom section bar: icons for every section, and the active one expands
 * into a stamped pill with its label, settling on a spring.
 */
export function CarTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        paddingBottom: Math.max(insets.bottom, space.sm),
        paddingTop: space.sm,
        paddingHorizontal: space.sm,
        gap: space.xs,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const active = state.index === index;
        const icon = TAB_ICONS[route.name] ?? 'dot';

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Animated.View
            key={route.key}
            layout={reduced ? undefined : LinearTransition.springify().damping(springs.settle.damping).stiffness(springs.settle.stiffness)}
            style={{ flex: active ? 2.2 : 1 }}
          >
            <PressableScale
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={onPress}
              style={{
                minHeight: 44,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: active ? colors.accentText : 'transparent',
                backgroundColor: active ? colors.card : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: space.xs,
                paddingHorizontal: space.xs,
              }}
            >
              <Icon name={icon} size={20} color={active ? colors.accentText : colors.textMuted} />
              {active ? (
                <Animated.View entering={reduced ? undefined : FadeIn.duration(150)}>
                  <AppText variant="label" color="accentText" numberOfLines={1}>
                    {label}
                  </AppText>
                </Animated.View>
              ) : null}
            </PressableScale>
          </Animated.View>
        );
      })}
    </View>
  );
}
