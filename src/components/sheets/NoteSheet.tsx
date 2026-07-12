import React from 'react';

import type { Note } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { haptic } from '@/theme';
import { Button } from '@/components/ui';
import { Field } from './Field';
import { GarageSheet, type GarageSheetHandle } from './GarageSheet';

export interface NoteSheetProps {
  vehicleId: string;
  note?: Note;
  onClose: () => void;
}

export function NoteSheet({ vehicleId, note, onClose }: NoteSheetProps) {
  const sheetRef = React.useRef<GarageSheetHandle>(null);
  const addNote = useGarageStore((s) => s.addNote);
  const updateNote = useGarageStore((s) => s.updateNote);

  const [body, setBody] = React.useState(note?.body ?? '');
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    if (!body.trim()) {
      setError('Write the note first.');
      return;
    }
    if (note) {
      await updateNote(note.id, body.trim());
    } else {
      await addNote(vehicleId, body.trim());
    }
    haptic.save();
    sheetRef.current?.dismiss();
  };

  return (
    <GarageSheet ref={sheetRef} title={note ? 'Edit note' : 'Add note'} onClose={onClose} snapPoints={['60%']}>
      <Field
        label="Note"
        value={body}
        onChangeText={(t) => {
          setBody(t);
          setError(null);
        }}
        placeholder="Anything worth remembering about this car"
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
        error={error}
        autoFocus={!note}
      />
      <Button label={note ? 'Save note' : 'Add note'} onPress={save} full />
    </GarageSheet>
  );
}
