import React from 'react';
import { Alert, View } from 'react-native';

import { displayToKm, kmToDisplay } from '@/lib/format';
import type { ReminderRule, ServiceType } from '@/lib/types';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, serviceLabel } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { haptic, hitTarget, space, useTheme } from '@/theme';
import { AppText, Button, Icon, PressableScale, SegmentedControl } from '@/components/ui';
import { Field, FieldRow } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface ReminderSheetProps {
  vehicleId: string;
  rule?: ReminderRule;
  onClose: () => void;
}

/** Recurring service reminder: by km, by days, or both. */
export function ReminderSheet({ vehicleId, rule, onClose }: ReminderSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === vehicleId));
  const addReminder = useGarageStore((s) => s.addReminder);
  const updateReminder = useGarageStore((s) => s.updateReminder);
  const deleteReminder = useGarageStore((s) => s.deleteReminder);

  const [serviceType, setServiceType] = React.useState<ServiceType>(rule?.serviceType ?? 'oil');
  const [customLabel, setCustomLabel] = React.useState(rule?.customLabel ?? '');
  const [mileageInterval, setMileageInterval] = React.useState(
    rule?.mileageInterval != null ? String(Math.round(kmToDisplay(rule.mileageInterval, unit))) : ''
  );
  const [months, setMonths] = React.useState(
    rule?.timeIntervalDays != null ? String(Math.round(rule.timeIntervalDays / 30)) : ''
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const kmNum = mileageInterval.trim() === '' ? null : Number(mileageInterval.replace(/[^0-9]/g, ''));
    const monthsNum = months.trim() === '' ? null : Number(months.replace(/[^0-9]/g, ''));
    if (serviceType === 'custom' && !customLabel.trim()) nextErrors.customLabel = 'Name the service first.';
    if (kmNum == null && monthsNum == null) {
      nextErrors.mileageInterval = 'Set a distance or time interval, or both.';
    }
    if (kmNum != null && kmNum <= 0) nextErrors.mileageInterval = 'Enter a distance like 10000.';
    if (monthsNum != null && monthsNum <= 0) nextErrors.months = 'Enter months like 6.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const fields = {
      vehicleId,
      serviceType,
      customLabel: serviceType === 'custom' ? customLabel.trim() : null,
      mileageInterval: kmNum != null ? Math.round(displayToKm(kmNum, unit)) : null,
      timeIntervalDays: monthsNum != null ? monthsNum * 30 : null,
    };
    if (rule) {
      await updateReminder({ ...rule, ...fields });
    } else {
      await addReminder({
        ...fields,
        lastDoneMileage: vehicle?.currentMileage ?? null,
        lastDoneDate: new Date().toISOString(),
      });
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  const confirmDelete = () => {
    if (!rule) return;
    Alert.alert('Delete reminder', 'Garage stops tracking this service. Logged history stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptic.warn();
          void deleteReminder(rule.id).then(() => sheetRef.current?.dismiss());
        },
      },
    ]);
  };

  return (
    <GarageSheet ref={sheetRef} title={rule ? 'Edit reminder' : 'Add reminder'} onClose={onClose} snapPoints={['72%']}>
      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        Service
      </AppText>
      <View style={{ marginBottom: space.lg }}>
        <SegmentedControl
          wrap
          options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t] }))}
          value={serviceType}
          onChange={setServiceType}
        />
      </View>
      {serviceType === 'custom' ? (
        <Field
          label="Service name"
          value={customLabel}
          onChangeText={setCustomLabel}
          placeholder="Brake fluid"
          error={errors.customLabel}
        />
      ) : null}
      <FieldRow>
        <Field
          label="Every"
          value={mileageInterval}
          onChangeText={setMileageInterval}
          keyboardType="number-pad"
          placeholder="10000"
          unit={unit}
          error={errors.mileageInterval}
        />
        <Field
          label="And / or every"
          value={months}
          onChangeText={setMonths}
          keyboardType="number-pad"
          placeholder="6"
          unit="months"
          error={errors.months}
        />
      </FieldRow>
      <AppText variant="caption" color="textMuted" style={{ marginBottom: space.xl }}>
        Counted from the last time this service was logged. Logging a matching service resets it automatically.
      </AppText>
      <Button label={rule ? 'Save changes' : 'Add reminder'} onPress={save} full />
      {rule ? (
        <PressableScale
          accessibilityLabel={`Delete the ${serviceLabel(rule.serviceType, rule.customLabel)} reminder`}
          onPress={confirmDelete}
          style={{
            minHeight: hitTarget,
            marginTop: space.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
          }}
        >
          <Icon name="trash" size={16} color={colors.dangerText} />
          <AppText variant="smallMedium" color="dangerText">
            Delete reminder
          </AppText>
        </PressableScale>
      ) : null}
    </GarageSheet>
  );
}
