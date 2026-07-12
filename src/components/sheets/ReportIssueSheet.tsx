import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { View } from 'react-native';

import { SeverityDial } from '@/components/signature/SeverityDial';
import { persistPhoto } from '@/lib/photos';
import type { Issue, IssueSeverity } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { haptic, radius, space, useTheme } from '@/theme';
import { AppText, Button, Icon, PressableScale } from '@/components/ui';
import { Field } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface ReportIssueSheetProps {
  vehicleId: string;
  issue?: Issue;
  onClose: () => void;
}

const THUMB = 64;

export function ReportIssueSheet({ vehicleId, issue, onClose }: ReportIssueSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const { colors } = useTheme();
  const reportIssue = useGarageStore((s) => s.reportIssue);
  const updateIssue = useGarageStore((s) => s.updateIssue);

  const [title, setTitle] = React.useState(issue?.title ?? '');
  const [description, setDescription] = React.useState(issue?.description ?? '');
  const [severity, setSeverity] = React.useState<IssueSeverity>(issue?.severity ?? 'low');
  const [photoUris, setPhotoUris] = React.useState<string[]>(issue?.photoUris ?? []);
  const [error, setError] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const pickPhotos = async () => {
    setPhotoError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 6,
      });
      if (result.canceled) return;
      const persisted = result.assets.map((asset) => persistPhoto(asset.uri));
      setPhotoUris((prev) => [...prev, ...persisted]);
    } catch {
      setPhotoError("Couldn't open your photos. Try again.");
    }
  };

  const removePhoto = (index: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!title.trim()) {
      setError('Add a title first.');
      return;
    }
    if (issue) {
      await updateIssue({
        ...issue,
        title: title.trim(),
        description: description.trim(),
        severity,
        photoUris,
      });
    } else {
      await reportIssue({
        vehicleId,
        title: title.trim(),
        description: description.trim(),
        severity,
        photoUris,
      });
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  return (
    <GarageSheet ref={sheetRef} title={issue ? 'Edit issue' : 'Report issue'} onClose={onClose} snapPoints={['88%']}>
      <Field
        label="Title"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setError(null);
        }}
        placeholder="Grinding when braking"
        error={error}
        autoFocus={!issue}
      />
      <Field
        label="What's happening"
        value={description}
        onChangeText={setDescription}
        placeholder="When it started, when it shows up, what it sounds like"
        multiline
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />

      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        Severity
      </AppText>
      <View style={{ marginBottom: space.lg }}>
        <SeverityDial value={severity} onChange={setSeverity} />
      </View>

      <AppText variant="label" color="textMuted" style={{ marginBottom: space.xs }}>
        Photos
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {photoUris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={{ width: THUMB, height: THUMB }}>
            <Image
              source={{ uri }}
              contentFit="cover"
              accessibilityLabel={`Photo ${index + 1}`}
              style={{ width: THUMB, height: THUMB, borderRadius: radius.xs, backgroundColor: colors.inset }}
            />
            <PressableScale
              accessibilityLabel={`Remove photo ${index + 1}`}
              hitSlop={12}
              onPress={() => removePhoto(index)}
              style={{
                position: 'absolute',
                top: space.xs2,
                right: space.xs2,
                width: 20,
                height: 20,
                borderRadius: radius.pill,
                backgroundColor: colors.scrim,
                borderWidth: 1,
                borderColor: colors.hairline,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="close" size={10} color={colors.text} strokeWidth={2} />
            </PressableScale>
          </View>
        ))}
        <PressableScale
          accessibilityLabel="Add photos"
          onPress={pickPhotos}
          style={{
            width: THUMB,
            height: THUMB,
            borderRadius: radius.xs,
            borderWidth: 1,
            borderColor: colors.stroke,
            borderStyle: 'dashed',
            backgroundColor: colors.inset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="camera" size={20} color={colors.textSecondary} />
        </PressableScale>
      </View>
      {photoError ? (
        <AppText variant="caption" color="dangerText" style={{ marginTop: space.xs }}>
          {photoError}
        </AppText>
      ) : null}

      <View style={{ marginTop: space.xl }}>
        <Button label={issue ? 'Save changes' : 'Report issue'} onPress={save} full />
      </View>
    </GarageSheet>
  );
}
