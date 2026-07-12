import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import React from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useSheetsStore, type SheetRequest } from '@/stores/sheets';
import { durations, haptic, radius, space, springs, useMotion, useTheme } from '@/theme';
import { AppText, Icon, Portal, PressableScale, type IconName } from '@/components/ui';

export interface RadialFabProps {
  vehicleId: string;
}

/**
 * Signature moment 7: the radial FAB. A 56pt amber lamp that blooms four
 * quick actions along a tachometer arc up-left of it. The open layer lives
 * in the root portal so the fullscreen scrim and the out-of-bounds action
 * buttons receive touches on Android. One open-progress shared value drives
 * the scrim, the arc ticks, the FAB rotation, and the per-action staggered
 * bloom. Reduce motion: actions fade in place.
 */

const FAB_SIZE = 56;
const ACTION_SIZE = 56;
/** Arc radius keeps at least 8pt of clearance between 56pt actions 30deg apart. */
const ARC_RADIUS = 128;
/** Canvas box around the FAB center that contains the arc and its ticks. */
const ARC_BOX = ARC_RADIUS + space.xl2;

interface QuickAction {
  icon: IconName;
  label: string;
  /** Screen angle in degrees: 180 is left of the FAB, 270 is straight up. */
  angleDeg: number;
  sheet: (vehicleId: string) => SheetRequest;
}

const ACTIONS: QuickAction[] = [
  { icon: 'wrench', label: 'Log service', angleDeg: 180, sheet: (vehicleId) => ({ kind: 'logService', vehicleId }) },
  { icon: 'odometer', label: 'Update mileage', angleDeg: 210, sheet: (vehicleId) => ({ kind: 'updateMileage', vehicleId }) },
  { icon: 'alert', label: 'Report issue', angleDeg: 240, sheet: (vehicleId) => ({ kind: 'reportIssue', vehicleId }) },
  { icon: 'note', label: 'Add note', angleDeg: 270, sheet: (vehicleId) => ({ kind: 'note', vehicleId }) },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface FabCircleProps {
  label: string;
  expanded: boolean;
  progress: SharedValue<number>;
  onPress: () => void;
}

/** The amber lamp itself. Pressing brightens toward glowCore, never dims. */
function FabCircle({ label, expanded, progress, onPress }: FabCircleProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = React.useState(false);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.glowCore : colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={iconStyle}>
        <Icon name="plus" size={24} color={colors.onAccent} strokeWidth={2} />
      </Animated.View>
    </PressableScale>
  );
}

interface ActionButtonProps {
  index: number;
  action: QuickAction;
  centerX: number;
  centerY: number;
  fabX: number;
  fabY: number;
  windowWidth: number;
  progress: SharedValue<number>;
  reduced: boolean;
  onPress: () => void;
}

const ActionButton = React.memo(function ActionButton({
  index,
  action,
  centerX,
  centerY,
  fabX,
  fabY,
  windowWidth,
  progress,
  reduced,
  onPress,
}: ActionButtonProps) {
  const { colors } = useTheme();

  const bloom = useAnimatedStyle(() => {
    if (reduced) {
      return {
        opacity: Math.max(0, Math.min(1, progress.value)),
        transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
      };
    }
    // Staggered input ranges off one master progress; the right side extends
    // so the master spring's overshoot blooms each action slightly past its
    // resting spot, later ones a touch harder.
    const s = interpolate(progress.value, [index * 0.12, 1], [0, 1], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.EXTEND,
    });
    return {
      opacity: Math.max(0, Math.min(1, s * 1.5)),
      transform: [
        { translateX: (fabX - centerX) * (1 - s) },
        { translateY: (fabY - centerY) * (1 - s) },
        { scale: 0.4 + 0.6 * Math.max(0, Math.min(s, 1.08)) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: centerY - ACTION_SIZE / 2,
          right: windowWidth - (centerX + ACTION_SIZE / 2),
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
        },
        bloom,
      ]}
    >
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.hairline,
          borderRadius: radius.xs,
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
        }}
      >
        <AppText variant="label" color="text">
          {action.label}
        </AppText>
      </View>
      <PressableScale
        accessibilityLabel={action.label}
        onPress={onPress}
        style={{
          width: ACTION_SIZE,
          height: ACTION_SIZE,
          borderRadius: radius.pill,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.hairline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={action.icon} size={22} color={colors.accentText} />
      </PressableScale>
    </Animated.View>
  );
});

export function RadialFab({ vehicleId }: RadialFabProps) {
  const { colors } = useTheme();
  const { reduced } = useMotion();
  const openSheet = useSheetsStore((s) => s.open);
  const { width: windowWidth } = useWindowDimensions();

  const fabRef = React.useRef<View>(null);
  const [anchor, setAnchor] = React.useState<{ x: number; y: number } | null>(null);
  const progress = useSharedValue(0);
  const mounted = anchor != null;

  const openBloom = () => {
    fabRef.current?.measureInWindow((x, y) => {
      haptic.press();
      setAnchor({ x, y });
    });
  };

  React.useEffect(() => {
    if (!mounted) return;
    progress.value = reduced
      ? withTiming(1, { duration: durations.fade })
      : withSpring(1, springs.bloom);
  }, [mounted, reduced, progress]);

  const unmountBloom = React.useCallback((after?: () => void) => {
    setAnchor(null);
    after?.();
  }, []);

  const closeBloom = React.useCallback(
    (after?: () => void) => {
      const finish = () => unmountBloom(after);
      if (reduced) {
        progress.value = withTiming(0, { duration: durations.fadeFast }, (finished) => {
          'worklet';
          if (finished) runOnJS(finish)();
        });
      } else {
        progress.value = withSpring(0, springs.snappy, (finished) => {
          'worklet';
          if (finished) runOnJS(finish)();
        });
      }
    },
    [reduced, progress, unmountBloom]
  );

  React.useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeBloom();
      return true;
    });
    return () => sub.remove();
  }, [mounted, closeBloom]);

  // The faint tachometer arc with tick marks between the four actions.
  const arcPaths = React.useMemo(() => {
    const arc = Skia.Path.Make();
    arc.addArc(
      { x: ARC_BOX - ARC_RADIUS, y: ARC_BOX - ARC_RADIUS, width: ARC_RADIUS * 2, height: ARC_RADIUS * 2 },
      180,
      90
    );
    const ticks = Skia.Path.Make();
    for (const deg of [195, 225, 255]) {
      const a = (deg * Math.PI) / 180;
      ticks.moveTo(ARC_BOX + Math.cos(a) * (ARC_RADIUS - space.xs), ARC_BOX + Math.sin(a) * (ARC_RADIUS - space.xs));
      ticks.lineTo(ARC_BOX + Math.cos(a) * (ARC_RADIUS + space.xs), ARC_BOX + Math.sin(a) * (ARC_RADIUS + space.xs));
    }
    return { arc, ticks };
  }, []);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, progress.value)),
  }));
  const arcOpacity = useDerivedValue(() => Math.max(0, Math.min(1, progress.value)) * 0.8, [progress]);

  const fabCenter = anchor
    ? { x: anchor.x + FAB_SIZE / 2, y: anchor.y + FAB_SIZE / 2 }
    : { x: 0, y: 0 };

  return (
    <>
      <View
        ref={fabRef}
        collapsable={false}
        pointerEvents={mounted ? 'none' : 'box-none'}
        style={{ opacity: mounted ? 0 : 1 }}
      >
        <FabCircle label="Quick actions" expanded={false} progress={progress} onPress={openBloom} />
      </View>
      {mounted && anchor ? (
        <Portal id="radial-fab-bloom">
          <AnimatedPressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            onPress={() => closeBloom()}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}
          />
          <Canvas
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: fabCenter.x - ARC_BOX,
              top: fabCenter.y - ARC_BOX,
              width: ARC_BOX * 2,
              height: ARC_BOX * 2,
            }}
          >
            <Group opacity={arcOpacity}>
              <Path path={arcPaths.arc} style="stroke" strokeWidth={1} color={colors.hairline} />
              <Path path={arcPaths.ticks} style="stroke" strokeWidth={1.5} color={colors.stroke} />
            </Group>
          </Canvas>
          {ACTIONS.map((action, index) => {
            const a = (action.angleDeg * Math.PI) / 180;
            const centerX = fabCenter.x + Math.cos(a) * ARC_RADIUS;
            const centerY = fabCenter.y + Math.sin(a) * ARC_RADIUS;
            return (
              <ActionButton
                key={action.label}
                index={index}
                action={action}
                centerX={centerX}
                centerY={centerY}
                fabX={fabCenter.x}
                fabY={fabCenter.y}
                windowWidth={windowWidth}
                progress={progress}
                reduced={reduced}
                onPress={() => {
                  haptic.select();
                  closeBloom(() => openSheet(action.sheet(vehicleId)));
                }}
              />
            );
          })}
          <View style={{ position: 'absolute', left: anchor.x, top: anchor.y }}>
            <FabCircle
              label="Close quick actions"
              expanded
              progress={progress}
              onPress={() => closeBloom()}
            />
          </View>
        </Portal>
      ) : null}
    </>
  );
}
