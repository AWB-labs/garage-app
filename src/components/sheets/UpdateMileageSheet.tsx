import React from 'react';
import { View } from 'react-native';

import { displayToKm, formatMileage, kmToDisplay } from '@/lib/format';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { haptic, radius, space, useTheme } from '@/theme';
import { AppText, Button, PressableScale } from '@/components/ui';
import { Field } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface UpdateMileageSheetProps {
  vehicleId: string;
  onClose: () => void;
}

/** Quick-add increments, in the user's display unit. */
const QUICK_ADDS = [50, 100, 500];

function groupDigits(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The two-taps-from-home odometer update: a static mini odometer readout of
 * the current reading, the new reading autofocused, and quick-add chips.
 */
export function UpdateMileageSheet({ vehicleId, onClose }: UpdateMileageSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === vehicleId));
  const logMileage = useGarageStore((s) => s.logMileage);

  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  if (!vehicle) return null;

  const currentDisplay = Math.round(kmToDisplay(vehicle.currentMileage, unit));
  const grouped = groupDigits(currentDisplay);

  const bump = (increment: number) => {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    const base = value.trim() === '' || Number.isNaN(parsed) ? currentDisplay : parsed;
    setValue(String(Math.round(base + increment)));
    setError(null);
    haptic.select();
  };

  const save = async () => {
    const num = Number(value.replace(/[^0-9.]/g, ''));
    if (value.trim() === '' || Number.isNaN(num) || num <= 0) {
      setError('Enter the odometer reading.');
      return;
    }
    const km = Math.round(displayToKm(num, unit));
    if (km < vehicle.currentMileage) {
      setError(`That's below the current ${formatMileage(vehicle.currentMileage, unit)}.`);
      return;
    }
    await logMileage(vehicleId, km);
    haptic.save();
    sheetRef.current?.dismiss();
  };

  return (
    <GarageSheet ref={sheetRef} title="Update mileage" onClose={onClose} snapPoints={['55%']}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Current, ${formatMileage(vehicle.currentMileage, unit)}`}
        style={{ marginBottom: space.xl }}
      >
        <AppText variant="label" color="textMuted" style={{ marginBottom: space.sm }}>
          Current
        </AppText>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', alignItems: 'flex-end' }}
        >
          {grouped.split('').map((char, index) =>
            char === ',' ? (
              <AppText key={`s${index}`} variant="numL" color="textMuted" style={{ marginHorizontal: space.xs2 }}>
                ,
              </AppText>
            ) : (
              <View
                key={`d${index}`}
                style={{
                  backgroundColor: colors.inset,
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  borderRadius: radius.xs,
                  paddingHorizontal: space.xs,
                  paddingVertical: space.xs2,
                  marginRight: space.xs2,
                }}
              >
                <AppText variant="numL">{char}</AppText>
              </View>
            )
          )}
          <AppText variant="label" color="textMuted" style={{ marginLeft: space.xs, marginBottom: space.sm }}>
            {unit}
          </AppText>
        </View>
      </View>
      <Field
        label="New reading"
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(null);
        }}
        placeholder={String(currentDisplay + 100)}
        keyboardType="number-pad"
        unit={unit}
        error={error}
        autoFocus
      />
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.xl }}>
        {QUICK_ADDS.map((increment) => (
          <PressableScale
            key={increment}
            accessibilityLabel={`Add ${increment} ${unit}`}
            hitSlop={space.sm}
            onPress={() => bump(increment)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 36,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.stroke,
              backgroundColor: colors.inset,
            }}
          >
            <AppText variant="smallMedium" color="accentText">
              {`+${groupDigits(increment)}`}
            </AppText>
          </PressableScale>
        ))}
      </View>
      <Button label="Update mileage" onPress={save} full />
    </GarageSheet>
  );
}
