import React from 'react';
import { View } from 'react-native';

import { displayToKm, formatMileage, kmToDisplay } from '@/lib/format';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { haptic, space } from '@/theme';
import { AppText, Button } from '@/components/ui';
import { Field } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface UpdateMileageSheetProps {
  vehicleId: string;
  onClose: () => void;
}

/** The two-taps-from-home odometer update. */
export function UpdateMileageSheet({ vehicleId, onClose }: UpdateMileageSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const unit = useSettingsStore((s) => s.unit);
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === vehicleId));
  const logMileage = useGarageStore((s) => s.logMileage);

  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  if (!vehicle) return null;

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
    <GarageSheet ref={sheetRef} title="Update mileage" onClose={onClose} snapPoints={['52%']}>
      <View style={{ marginBottom: space.xl }}>
        <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
          Current
        </AppText>
        <AppText variant="numL">{formatMileage(vehicle.currentMileage, unit)}</AppText>
      </View>
      <Field
        label="New reading"
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(null);
        }}
        placeholder={String(Math.round(kmToDisplay(vehicle.currentMileage, unit)) + 100)}
        keyboardType="number-pad"
        unit={unit}
        error={error}
        autoFocus
      />
      <Button label="Log mileage" onPress={save} full />
    </GarageSheet>
  );
}
