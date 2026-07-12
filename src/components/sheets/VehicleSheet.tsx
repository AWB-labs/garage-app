import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import { buildCarImageUrl, downloadCarImage } from '@/lib/carImage';
import { persistPhoto } from '@/lib/photos';
import { displayToKm, kmToDisplay } from '@/lib/format';
import type { Vehicle } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import { haptic, radius, space, useTheme } from '@/theme';
import { AppText, Button, Icon, PressableScale } from '@/components/ui';
import { CarSilhouette } from '@/components/signature/CarSilhouette';
import { Field, FieldRow } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface VehicleSheetProps {
  vehicle?: Vehicle;
  onClose: () => void;
}

export function VehicleSheet({ vehicle, onClose }: VehicleSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const { colors } = useTheme();
  const unit = useSettingsStore((s) => s.unit);
  const carImageKey = useSettingsStore((s) => s.carImageKey);
  const addVehicle = useGarageStore((s) => s.addVehicle);
  const updateVehicle = useGarageStore((s) => s.updateVehicle);

  const [make, setMake] = React.useState(vehicle?.make ?? '');
  const [model, setModel] = React.useState(vehicle?.model ?? '');
  const [year, setYear] = React.useState(vehicle ? String(vehicle.year) : '');
  const [nickname, setNickname] = React.useState(vehicle?.nickname ?? '');
  const [plate, setPlate] = React.useState(vehicle?.plate ?? '');
  const [vin, setVin] = React.useState(vehicle?.vin ?? '');
  const [mileage, setMileage] = React.useState(
    vehicle ? String(Math.round(kmToDisplay(vehicle.currentMileage, unit))) : ''
  );
  const [photoUri, setPhotoUri] = React.useState<string | null>(vehicle?.photoUri ?? null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    const asset = result.assets?.[0];
    if (asset) setPhotoUri(persistPhoto(asset.uri));
  };

  const canFetchStudio = !!carImageKey && !!make.trim() && !!model.trim();
  const isStudioUrl = !!photoUri && photoUri.startsWith('https://');

  const useStudioImage = () => {
    setPhotoUri(
      buildCarImageUrl({
        key: carImageKey,
        make: make.trim(),
        model: model.trim(),
        year: Number(year) || undefined,
      })
    );
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const yearNum = Number(year);
    const mileageNum = Number(mileage.replace(/[^0-9.]/g, ''));
    if (!make.trim()) nextErrors.make = 'Add the make first.';
    if (!model.trim()) nextErrors.model = 'Add the model first.';
    if (!year.trim() || !Number.isInteger(yearNum) || yearNum < 1950 || yearNum > new Date().getFullYear() + 1) {
      nextErrors.year = 'Enter a year like 2021.';
    }
    if (mileage.trim() === '' || Number.isNaN(mileageNum) || mileageNum < 0) {
      nextErrors.mileage = 'Enter the current odometer reading.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Studio renders are downloaded so the garage stays local-first; if the
    // download fails we keep the URL and expo-image caches it when online.
    let finalPhotoUri = photoUri;
    if (isStudioUrl && photoUri) {
      finalPhotoUri = (await downloadCarImage(photoUri)) ?? photoUri;
    }

    const fields = {
      make: make.trim(),
      model: model.trim(),
      year: yearNum,
      nickname: nickname.trim() || null,
      plate: plate.trim() || null,
      vin: vin.trim() || null,
      photoUri: finalPhotoUri,
      currentMileage: Math.round(displayToKm(mileageNum, unit)),
    };
    if (vehicle) {
      await updateVehicle({ ...vehicle, ...fields });
    } else {
      await addVehicle(fields);
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  return (
    <GarageSheet ref={sheetRef} title={vehicle ? 'Edit car' : 'Add car'} onClose={onClose} snapPoints={['88%']}>
      <PressableScale
        accessibilityLabel={photoUri ? 'Change photo' : 'Add photo'}
        onPress={pickPhoto}
        style={{
          height: 150,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.stroke,
          borderStyle: 'dashed',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.xl,
          overflow: 'hidden',
          backgroundColor: colors.inset,
        }}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <CarSilhouette width={150} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Icon name="camera" size={14} color={colors.accentText} />
              <AppText variant="label" color="accentText">
                Add photo
              </AppText>
            </View>
          </View>
        )}
      </PressableScale>

      {canFetchStudio && !photoUri ? (
        <View style={{ marginTop: -space.md, marginBottom: space.xl }}>
          <Button label="Use studio image" icon="image" variant="ghost" onPress={useStudioImage} full />
        </View>
      ) : null}

      <FieldRow>
        <Field label="Make" value={make} onChangeText={setMake} placeholder="BMW" error={errors.make} />
        <Field label="Model" value={model} onChangeText={setModel} placeholder="330i" error={errors.model} />
      </FieldRow>
      <FieldRow>
        <Field
          label="Year"
          value={year}
          onChangeText={setYear}
          placeholder="2021"
          keyboardType="number-pad"
          error={errors.year}
        />
        <Field
          label={`Mileage`}
          value={mileage}
          onChangeText={setMileage}
          placeholder="62400"
          keyboardType="number-pad"
          unit={unit}
          error={errors.mileage}
        />
      </FieldRow>
      <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="The Daily" />
      <FieldRow>
        <Field label="Plate" value={plate} onChangeText={setPlate} placeholder="STR 5301" autoCapitalize="characters" />
        <Field label="VIN" value={vin} onChangeText={setVin} placeholder="Optional" autoCapitalize="characters" />
      </FieldRow>
      <Button label={vehicle ? 'Save changes' : 'Add car'} onPress={save} full />
    </GarageSheet>
  );
}
