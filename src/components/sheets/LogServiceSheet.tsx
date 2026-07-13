import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Alert, Platform, View } from 'react-native';

import { displayToKm, kmToDisplay } from '@/lib/format';
import { persistPhoto } from '@/lib/photos';
import type { ServiceRecord, ServiceType } from '@/lib/types';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, serviceLabel } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { useSheetsStore } from '@/stores/sheets';
import { haptic, hitTarget, radius, space, useTheme } from '@/theme';
import { AppText, Button, Icon, PressableScale, SegmentedControl, type IconName } from '@/components/ui';
import { Field, FieldRow } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface LogServiceSheetProps {
  vehicleId: string;
  service?: ServiceRecord;
  resolvesIssueId?: string;
  prefillType?: ServiceType;
  /** Seeds the Service name when a custom reminder was marked done. */
  prefillCustomLabel?: string;
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

/** Receipt thumbnails are 64pt squares. */
const PHOTO_TILE = 64;
/** Visible remove chip; hitSlop pads it out to the 44pt target. */
const REMOVE_SIZE = 22;
const REMOVE_HIT_SLOP = (hitTarget - REMOVE_SIZE) / 2;

export function LogServiceSheet({
  vehicleId,
  service,
  resolvesIssueId,
  prefillType,
  prefillCustomLabel,
  onClose,
}: LogServiceSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === vehicleId));
  const issue = useGarageStore((s) => s.issues.find((i) => i.id === resolvesIssueId));
  const reminders = useGarageStore((s) => s.reminders);
  const logService = useGarageStore((s) => s.logService);
  const updateService = useGarageStore((s) => s.updateService);
  const deleteService = useGarageStore((s) => s.deleteService);

  // "Mark done" on a custom reminder carries the rule's name on the request.
  // Read it straight off the request as well as the prop, so the label lands
  // here whichever way the host wires it: without the name the saved service
  // cannot match the rule, and the reminder would never reset.
  const requestedLabel = useSheetsStore((s) =>
    s.current?.kind === 'logService' ? s.current.prefillCustomLabel : undefined
  );

  const [type, setType] = React.useState<ServiceType>(service?.type ?? prefillType ?? 'oil');
  const [customLabel, setCustomLabel] = React.useState(
    service?.customLabel ?? prefillCustomLabel ?? requestedLabel ?? ''
  );
  const [date, setDate] = React.useState<Date>(service ? new Date(service.date) : new Date());
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [mileage, setMileage] = React.useState(
    String(Math.round(kmToDisplay(service?.mileage ?? vehicle?.currentMileage ?? 0, unit)))
  );
  const [cost, setCost] = React.useState(service?.cost != null ? String(service.cost) : '');
  const [shop, setShop] = React.useState(service?.shop ?? '');
  const [notes, setNotes] = React.useState(service?.notes ?? '');
  const [photoUris, setPhotoUris] = React.useState<string[]>(service?.photoUris ?? []);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Honest copy: logging a matching service resets its reminder in the store.
  const matchingReminder = React.useMemo(() => {
    if (service) return undefined;
    return reminders.find(
      (r) =>
        r.vehicleId === vehicleId &&
        r.serviceType === type &&
        (type !== 'custom' || (r.customLabel ?? '') === customLabel.trim())
    );
  }, [service, reminders, vehicleId, type, customLabel]);

  const addPhotos = async () => {
    try {
      setPhotoError(null);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.7,
        allowsMultipleSelection: true,
      });
      if (result.canceled || !result.assets) return;
      const persisted = result.assets.map((asset) => persistPhoto(asset.uri));
      setPhotoUris((prev) => [...prev, ...persisted]);
    } catch {
      setPhotoError("Couldn't open your photo library. Try again.");
    }
  };

  const removePhoto = (index: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

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
      await updateService({ ...service, ...fields, photoUris });
    } else {
      await logService({ ...fields, photoUris, resolvesIssueId: resolvesIssueId ?? null });
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  const confirmDelete = () => {
    if (!service) return;
    Alert.alert('Delete service', "Removes this record from the car's history. This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptic.warn();
          void deleteService(service.id).then(() => sheetRef.current?.dismiss());
        },
      },
    ]);
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
      {matchingReminder ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
            marginTop: -space.sm,
            marginBottom: space.lg,
          }}
        >
          <Icon name="clock" size={12} color={colors.textMuted} />
          <AppText variant="caption" color="textMuted">
            Resets the {serviceLabel(matchingReminder.serviceType, matchingReminder.customLabel)} reminder.
          </AppText>
        </View>
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

      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        Receipts
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: space.sm,
          marginBottom: photoError ? space.xs : space.xl,
        }}
      >
        {photoUris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={{ width: PHOTO_TILE, height: PHOTO_TILE }}>
            <Image
              source={{ uri }}
              contentFit="cover"
              accessibilityLabel={`Receipt photo ${index + 1}`}
              style={{
                width: PHOTO_TILE,
                height: PHOTO_TILE,
                borderRadius: radius.xs,
                backgroundColor: colors.inset,
              }}
            />
            <PressableScale
              accessibilityLabel={`Remove receipt photo ${index + 1}`}
              hitSlop={REMOVE_HIT_SLOP}
              onPress={() => removePhoto(index)}
              style={{
                position: 'absolute',
                top: -space.xs,
                right: -space.xs,
                width: REMOVE_SIZE,
                height: REMOVE_SIZE,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.stroke,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="close" size={12} color={colors.text} strokeWidth={1.8} />
            </PressableScale>
          </View>
        ))}
        <PressableScale
          accessibilityLabel="Add photo"
          onPress={addPhotos}
          style={{
            width: PHOTO_TILE,
            height: PHOTO_TILE,
            borderRadius: radius.xs,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.stroke,
            backgroundColor: colors.inset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="camera" size={20} color={colors.textSecondary} />
        </PressableScale>
      </View>
      {photoError ? (
        <AppText variant="caption" color="dangerText" style={{ marginBottom: space.lg }}>
          {photoError}
        </AppText>
      ) : null}

      <Button label={service ? 'Save changes' : 'Log service'} onPress={save} full />
      {service ? (
        <PressableScale
          accessibilityLabel={`Delete this ${serviceLabel(service.type, service.customLabel)} record`}
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
            Delete service
          </AppText>
        </PressableScale>
      ) : null}
    </GarageSheet>
  );
}
