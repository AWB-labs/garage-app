import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React from 'react';
import { BackHandler, View } from 'react-native';

import { radius, space, useTheme } from '@/theme';
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
 * Shared shell for every create/edit sheet: presents on mount, tracks the
 * finger 1:1, dims the screen behind, restores the keyboard properly on
 * Android, and lets hardware back dismiss the sheet before navigation.
 */
export const GarageSheet = React.forwardRef<GarageSheetHandle, GarageSheetProps>(function GarageSheet(
  { title, onClose, snapPoints = ['72%'], children },
  ref
) {
  const modalRef = React.useRef<BottomSheetModal>(null);
  const { colors } = useTheme();

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
    </BottomSheetModal>
  );
});
