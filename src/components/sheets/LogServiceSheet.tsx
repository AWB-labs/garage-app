import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import React from 'react';
import { Platform, View } from 'react-native';

import { displayToKm, kmToDisplay } from '@/lib/format';
import type { ServiceRecord, ServiceType } from '@/lib/types';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { haptic, radius, space, useTheme } from '@/theme';
import { AppText, Button, Icon, PressableScale, SegmentedControl, type IconName } from '@/components/ui';
import { Field, FieldRow } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface LogServiceSheetProps {
  vehicleId: string;
  service?: ServiceRecord;
  resolvesIssueId?: string;
  prefillType?: ServiceType;
  onClose: () => void;
}

const TYPE_ICONS: Record<ServiceType, IconName> = {
  oil: 'oil',
  tires: 'tire',
  brakes: 'brake',
  filters: 'filter',
  battery: 'battery',
  inspection: 'inspection',
  custom: 'wrench',
};

export function LogServiceSheet({ vehicleId, service, resolvesIssueId, prefillType, onClose }: LogServiceSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === vehicleId));
  const issue = useGarageStore((s) => s.issues.find((i) => i.id === resolvesIssueId));
  const logService = useGarageStore((s) => s.logService);
  const updateService = useGarageStore((s) => s.updateService);

  const [type, setType] = React.useState<ServiceType>(service?.type ?? prefillType ?? 'oil');
  const [customLabel, setCustomLabel] = React.useState(service?.customLabel ?? '');
  const [date, setDate] = React.useState<Date>(service ? new Date(service.date) : new Date());
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [mileage, setMileage] = React.useState(
    String(Math.round(kmToDisplay(service?.mileage ?? vehicle?.currentMileage ?? 0, unit)))
  );
  const [cost, setCost] = React.useState(service?.cost != null ? String(service.cost) : '');
  const [shop, setShop] = React.useState(service?.shop ?? '');
  const [notes, setNotes] = React.useState(service?.notes ?? '');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const mileageNum = Number(mileage.replace(/[^0-9.]/g, ''));
    const costNum = cost.trim() === '' ? null : Number(cost.replace(/[^0-9.]/g, ''));
    if (type === 'custom' && !customLabel.trim()) nextErrors.customLabel = 'Name the service first.';
    if (mileage.trim() === '' || Number.isNaN(mileageNum) || mileageNum < 0) {
      nextErrors.mileage = 'Enter the odometer at service time.';
    }
    if (costNum != null && (Number.isNaN(costNum) || costNum < 0)) nextErrors.cost = 'Enter a cost like 1450.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const fields = {
      vehicleId,
      type,
      customLabel: type === 'custom' ? customLabel.trim() : null,
      date: date.toISOString(),
      mileage: Math.round(displayToKm(mileageNum, unit)),
      cost: costNum,
      shop: shop.trim() || null,
      notes: notes.trim() || null,
    };
    if (service) {
      await updateService({ ...service, ...fields });
    } else {
      await logService({ ...fields, photoUris: [], resolvesIssueId: resolvesIssueId ?? null });
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  return (
    <GarageSheet ref={sheetRef} title={service ? 'Edit service' : 'Log service'} onClose={onClose} snapPoints={['88%']}>
      {issue ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            padding: space.md,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.hairline,
            backgroundColor: colors.card,
            marginBottom: space.lg,
          }}
        >
          <Icon name="check" size={16} color={colors.successText} />
          <AppText variant="small" color="textSecondary" style={{ flex: 1 }}>
            Saving marks "{issue.title}" as fixed.
          </AppText>
        </View>
      ) : null}

      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        Type
      </AppText>
      <View style={{ marginBottom: space.lg }}>
        <SegmentedControl
          wrap
          options={SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t], icon: TYPE_ICONS[t] }))}
          value={type}
          onChange={setType}
        />
      </View>
      {type === 'custom' ? (
        <Field
          label="Service name"
          value={customLabel}
          onChangeText={setCustomLabel}
          placeholder="Brake fluid"
          error={errors.customLabel}
        />
      ) : null}

      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        Date
      </AppText>
      <PressableScale
        accessibilityLabel={`Date: ${format(date, 'd MMM yyyy')}`}
        onPress={() => setShowDatePicker(true)}
        style={{
          minHeight: 48,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.stroke,
          backgroundColor: colors.inset,
          paddingHorizontal: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space.lg,
        }}
      >
        <AppText>{format(date, 'd MMM yyyy')}</AppText>
        <Icon name="calendar" size={18} color={colors.textSecondary} />
      </PressableScale>
      {showDatePicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (event.type !== 'dismissed' && selected) setDate(selected);
            if (Platform.OS === 'ios') setShowDatePicker(false);
          }}
        />
      ) : null}

      <FieldRow>
        <Field
          label="Mileage"
          value={mileage}
          onChangeText={setMileage}
          keyboardType="number-pad"
          unit={unit}
          error={errors.mileage}
        />
        <Field
          label="Cost"
          value={cost}
          onChangeText={setCost}
          keyboardType="decimal-pad"
          placeholder="Optional"
          unit={currency}
          error={errors.cost}
        />
      </FieldRow>
      <Field label="Shop" value={shop} onChangeText={setShop} placeholder="Optional" />
      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Parts, brands, anything worth remembering"
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <Button label={service ? 'Save changes' : 'Log service'} onPress={save} full />
    </GarageSheet>
  );
}
