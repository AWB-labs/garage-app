import React from 'react';
import { View } from 'react-native';

import type { Issue, IssueSeverity } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { haptic, space } from '@/theme';
import { AppText, Button, SegmentedControl } from '@/components/ui';
import { Field } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface ReportIssueSheetProps {
  vehicleId: string;
  issue?: Issue;
  onClose: () => void;
}

export function ReportIssueSheet({ vehicleId, issue, onClose }: ReportIssueSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const reportIssue = useGarageStore((s) => s.reportIssue);
  const updateIssue = useGarageStore((s) => s.updateIssue);

  const [title, setTitle] = React.useState(issue?.title ?? '');
  const [description, setDescription] = React.useState(issue?.description ?? '');
  const [severity, setSeverity] = React.useState<IssueSeverity>(issue?.severity ?? 'low');
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError('Add a title first.');
      return;
    }
    if (issue) {
      await updateIssue({ ...issue, title: title.trim(), description: description.trim(), severity });
    } else {
      await reportIssue({ vehicleId, title: title.trim(), description: description.trim(), severity, photoUris: [] });
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  return (
    <GarageSheet ref={sheetRef} title={issue ? 'Edit issue' : 'Report issue'} onClose={onClose} snapPoints={['78%']}>
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
      <View style={{ marginBottom: space.xl }}>
        <SegmentedControl
          options={[
            { value: 'low', label: 'Low', icon: 'dot' },
            { value: 'medium', label: 'Medium', icon: 'clock' },
            { value: 'critical', label: 'Critical', icon: 'alert' },
          ]}
          value={severity}
          onChange={setSeverity}
        />
      </View>
      <Button label={issue ? 'Save changes' : 'Report issue'} onPress={save} full />
    </GarageSheet>
  );
}
