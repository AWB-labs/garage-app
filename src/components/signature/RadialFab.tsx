import React from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
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
 * Signature moment 7: the quick-action lamp. A 56pt amber FAB that blooms four
 * actions upward on staggered springs, each flying out of the lamp and settling
 * onto its own row.
 *
 * The actions sit on a fixed vertical grid rather than on a polar arc: an arc
 * packs labelled rows close enough that a long label ("Update mileage") runs
 * under its neighbour's button. One row per action makes overlap impossible at
 * any label length or text size, and the rows still fan out of the lamp, so the
 * bloom reads the same.
 *
 * The open layer lives in the root portal: Android clips touches to parent
 * bounds, so buttons drawn outside the FAB's own box would be untappable
 * anywhere else. Reduce motion: actions fade in place.
 */

const FAB_SIZE = 56;
const ACTION_SIZE = 48;
/** One action per band. The band is the button plus the gap under it. */
const ROW_GAP = space.md;
const ROW_PITCH = ACTION_SIZE + ROW_GAP;

interface QuickAction {
  icon: IconName;
  label: string;
  sheet: (vehicleId: string) => SheetRequest;
}

/** Nearest the lamp first: the actions rise in this order. */
const ACTIONS: QuickAction[] = [
  { icon: 'wrench', label: 'Log service', sheet: (vehicleId) => ({ kind: 'logService', vehicleId }) },
  { icon: 'odometer', label: 'Update mileage', sheet: (vehicleId) => ({ kind: 'updateMileage', vehicleId }) },
  { icon: 'alert', label: 'Report issue', sheet: (vehicleId) => ({ kind: 'reportIssue', vehicleId }) },
  { icon: 'note', label: 'Add note', sheet: (vehicleId) => ({ kind: 'note', vehicleId }) },
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

interface ActionRowProps {
  index: number;
  action: QuickAction;
  /** Window coordinates of the lamp's own box. */
  fabX: number;
  fabY: number;
  windowWidth: number;
  progress: SharedValue<number>;
  reduced: boolean;
  onPress: () => void;
}

const ActionRow = React.memo(function ActionRow({
  index,
  action,
  fabX,
  fabY,
  windowWidth,
  progress,
  reduced,
  onPress,
}: ActionRowProps) {
  const { colors } = useTheme();
  /** Distance this row travels up out of the lamp. */
  const rise = (index + 1) * ROW_PITCH;

  const bloom = useAnimatedStyle(() => {
    if (reduced) {
      return { opacity: Math.max(0, Math.min(1, progress.value)), transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    // Staggered slices of one master progress. The right edge extends so the
    // master spring's overshoot carries each row slightly past its rest.
    const s = interpolate(progress.value, [index * 0.1, 1], [0, 1], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.EXTEND,
    });
    return {
      opacity: Math.max(0, Math.min(s, 1)),
      transform: [
        { translateY: interpolate(s, [0, 1], [rise, 0]) },
        { scale: 0.6 + 0.4 * Math.max(0, Math.min(s, 1.06)) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          // Right-aligned to the lamp, so every row shares one clean edge.
          right: windowWidth - (fabX + FAB_SIZE),
          top: fabY + (FAB_SIZE - ACTION_SIZE) / 2 - rise,
          height: ACTION_SIZE,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
        },
        bloom,
      ]}
    >
      {/* The chip repeats the button's own label, so it is decorative to a reader. */}
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.hairline,
          borderRadius: radius.xs,
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
        }}
      >
        <AppText variant="label" color="text" numberOfLines={1}>
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
          borderColor: colors.accentText,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={action.icon} size={20} color={colors.accentText} />
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

  /** measureInWindow is async: the screen can be popped before it calls back. */
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // A close is never re-entrant. Reanimated cancels an in-flight animation when
  // its shared value is re-assigned and calls the previous callback with
  // finished=false, so a second closeBloom used to swallow the first one's
  // queued action (the tapped quick action never opened its sheet). The bloom
  // also stops taking touches the moment a close begins, so a second tap on the
  // still-visible scrim or action row cannot land at all.
  const closingRef = React.useRef(false);
  const [closing, setClosing] = React.useState(false);

  const openBloom = () => {
    fabRef.current?.measureInWindow((x, y) => {
      if (!aliveRef.current) return;
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

  const closeBloom = React.useCallback(
    (after?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setClosing(true);
      // Runs whether or not the exit settled: an interruption must never lose
      // the user's action.
      const finish = () => {
        closingRef.current = false;
        setClosing(false);
        if (aliveRef.current) setAnchor(null);
        after?.();
      };
      if (reduced) {
        progress.value = withTiming(0, { duration: durations.fadeFast }, () => {
          'worklet';
          runOnJS(finish)();
        });
      } else {
        progress.value = withSpring(0, springs.snappy, () => {
          'worklet';
          runOnJS(finish)();
        });
      }
    },
    [reduced, progress]
  );

  React.useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeBloom();
      return true;
    });
    return () => sub.remove();
  }, [mounted, closeBloom]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, progress.value)),
  }));

  return (
    <>
      {/*
        The base lamp stays mounted at opacity 0 while the bloom is up (the
        portal draws its own copy at the same anchor). Alpha means nothing to
        TalkBack, so it has to be pulled out of the accessibility tree or the
        reader announces a second, invisible "Quick actions" button.
      */}
      <View
        ref={fabRef}
        collapsable={false}
        pointerEvents={mounted ? 'none' : 'box-none'}
        accessibilityElementsHidden={mounted}
        importantForAccessibility={mounted ? 'no-hide-descendants' : 'auto'}
        style={{ opacity: mounted ? 0 : 1 }}
      >
        <FabCircle label="Quick actions" expanded={false} progress={progress} onPress={openBloom} />
      </View>
      {mounted && anchor ? (
        <Portal id="radial-fab-bloom" modal>
          {/*
            The open bloom is a modal, not just a dim: accessibilityViewIsModal
            takes the layer's siblings out of the iOS accessibility tree, and the
            scrim is a real dismiss target rather than a hidden decoration, so a
            reader always has a way out of the layer.

            box-only during the exit: the layer keeps swallowing touches, so a
            second tap can neither re-enter the close nor fall through to the
            dashboard underneath, but no fading control can fire either.
          */}
          <View
            accessibilityViewIsModal
            pointerEvents={closing ? 'box-only' : 'box-none'}
            style={StyleSheet.absoluteFill}
          >
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="Close quick actions"
              onPress={() => closeBloom()}
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}
            />
            {ACTIONS.map((action, index) => (
              <ActionRow
                key={action.label}
                index={index}
                action={action}
                fabX={anchor.x}
                fabY={anchor.y}
                windowWidth={windowWidth}
                progress={progress}
                reduced={reduced}
                onPress={() => {
                  haptic.select();
                  closeBloom(() => openSheet(action.sheet(vehicleId)));
                }}
              />
            ))}
            <View style={{ position: 'absolute', left: anchor.x, top: anchor.y }}>
              <FabCircle
                label="Close quick actions"
                expanded
                progress={progress}
                onPress={() => closeBloom()}
              />
            </View>
          </View>
        </Portal>
      ) : null}
    </>
  );
}
