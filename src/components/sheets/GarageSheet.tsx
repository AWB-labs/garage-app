import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React from 'react';
import { BackHandler, View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import { Easing, ReduceMotion } from 'react-native-reanimated';

import { durations, radius, space, useMotion, useTheme } from '@/theme';
import { AppText, Icon, PressableScale } from '@/components/ui';

export interface GarageSheetProps {
  title: string;
  /** Fired when the sheet finishes dismissing (drag, backdrop, back, or code). */
  onClose: () => void;
  /** Fixed snap points; keyboarded sheets must not use dynamic sizing. */
  snapPoints?: (string | number)[];
  children: React.ReactNode;
}

export interface GarageSheetHandle {
  dismiss: () => void;
}

/**
 * Lets a direct-manipulation control inside the sheet block the sheet's
 * content-panning gesture. DESIGN.md signature moment 6 locks this ("Gauge
 * blocks the sheet's content-panning gesture") so the severity dial can be
 * arced in any direction, including vertically, without the drag being stolen
 * to move the sheet.
 *
 * Mechanism: the control parks its own gesture in `contentPanBlockerRef`, and
 * the sheet passes that ref as `waitFor`, so gesture-handler makes the content
 * pan require the control's gesture to fail before it can activate. The
 * relation is inert while the ref is empty (an unresolvable ref extracts no
 * handler tag), so every other sheet is unaffected, and unlike toggling
 * `enableContentPanningGesture` it does not swap the content component type,
 * which would remount the whole sheet body.
 *
 * The control's gesture must be stable for the life of the control: the ref is
 * read once, when the sheet's own gesture attaches.
 */
export interface SheetGestures {
  contentPanBlockerRef: React.MutableRefObject<GestureType | undefined>;
}

export const SheetGesturesContext = React.createContext<SheetGestures | null>(null);

/** Null outside a GarageSheet, so dial-like controls also work on plain screens. */
export function useSheetGestures(): SheetGestures | null {
  return React.useContext(SheetGesturesContext);
}

/**
 * Shared shell for every create/edit sheet: presents on mount, tracks the
 * finger 1:1, dims the screen behind, restores the keyboard properly on
 * Android, and lets hardware back dismiss the sheet before navigation.
 *
 * Motion: the sheet opts into the project motion policy rather than the
 * library's defaults. Normal path is the settle token spring; under OS reduce
 * motion it is a short non-spring translate (DESIGN.md fallback table), never
 * an instant snap, which is what happens if the sheet is left to Reanimated's
 * ReduceMotion.System default.
 */
export const GarageSheet = React.forwardRef<GarageSheetHandle, GarageSheetProps>(function GarageSheet(
  { title, onClose, snapPoints = ['72%'], children },
  ref
) {
  const modalRef = React.useRef<BottomSheetModal>(null);
  const { colors } = useTheme();
  const { reduced, springs } = useMotion();

  // Both hooks always run; the reduce-motion branch only picks between them.
  const springConfigs = useBottomSheetSpringConfigs({
    ...springs.settle,
    reduceMotion: ReduceMotion.Never,
  });
  const timingConfigs = useBottomSheetTimingConfigs({
    duration: durations.fade,
    easing: Easing.out(Easing.quad),
    reduceMotion: ReduceMotion.Never,
  });

  // overrideReduceMotion is what actually lets the short translate run: without
  // it the library never writes reduceMotion into the config and Reanimated
  // cancels the animation outright under the OS flag.
  const animationConfigs = reduced ? timingConfigs : springConfigs;

  const contentPanBlockerRef = React.useRef<GestureType | undefined>(undefined);
  const sheetGestures = React.useMemo<SheetGestures>(() => ({ contentPanBlockerRef }), []);

  React.useImperativeHandle(ref, () => ({ dismiss: () => modalRef.current?.dismiss() }), []);

  React.useEffect(() => {
    modalRef.current?.present();
  }, []);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      modalRef.current?.dismiss();
      return true;
    });
    return () => sub.remove();
  }, []);

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        style={[props.style, { backgroundColor: colors.scrim }]}
      />
    ),
    [colors.scrim]
  );

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      waitFor={contentPanBlockerRef}
      animationConfigs={animationConfigs}
      overrideReduceMotion={ReduceMotion.Never}
      onDismiss={onClose}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.stroke, width: 44 }}
    >
      <SheetGesturesContext.Provider value={sheetGestures}>
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xl4 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space.xl,
            }}
          >
            <AppText variant="displayL">{title}</AppText>
            <PressableScale
              accessibilityLabel="Close"
              onPress={() => modalRef.current?.dismiss()}
              style={{ padding: space.sm }}
            >
              <Icon name="close" size={22} color={colors.textSecondary} />
            </PressableScale>
          </View>
          {children}
        </BottomSheetScrollView>
      </SheetGesturesContext.Provider>
    </BottomSheetModal>
  );
});
