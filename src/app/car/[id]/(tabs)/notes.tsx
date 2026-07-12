import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { format } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { CarHeader } from '@/components/CarHeader';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
  PressableScale,
  Screen,
  SectionHeader,
} from '@/components/ui';
import type { Note } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSheetsStore } from '@/stores/sheets';
import {
  fonts,
  haptic,
  hitTarget,
  radius,
  space,
  springs,
  type,
  useMotion,
  useTheme,
} from '@/theme';

type Row = { key: string; kind: 'stamp' } | { key: string; kind: 'note'; note: Note };

/** Spring reorder transition; plain layout change (no transition) when reduced. */
function springLayout(reduced: boolean) {
  return reduced
    ? undefined
    : LinearTransition.springify()
        .damping(springs.settle.damping)
        .stiffness(springs.settle.stiffness);
}

/** Small mono stamp above the pinned group. */
const PinnedStamp = React.memo(function PinnedStamp() {
  const { reduced } = useMotion();
  return (
    <Animated.View layout={springLayout(reduced)} style={{ paddingTop: space.xs, paddingBottom: space.sm }}>
      <AppText variant="label" color="textMuted">
        Pinned
      </AppText>
    </Animated.View>
  );
});

interface NoteRowProps {
  note: Note;
  index: number;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onDelete: (note: Note) => void;
}

const NoteRow = React.memo(function NoteRow({ note, index, onOpen, onTogglePin, onDelete }: NoteRowProps) {
  const { colors } = useTheme();
  const { reduced, stagger } = useMotion();

  const dateCaption = `${note.createdAt === note.updatedAt ? 'Added' : 'Edited'} ${format(
    new Date(note.updatedAt),
    'd MMM yyyy'
  )}`;
  const entering = reduced
    ? undefined
    : FadeInDown.delay(stagger(Math.min(index + 2, 8)))
        .springify()
        .damping(springs.settle.damping)
        .stiffness(springs.settle.stiffness);

  return (
    <Animated.View entering={entering} layout={springLayout(reduced)} style={{ marginBottom: space.md }}>
      <Card
        onPress={() => onOpen(note)}
        onLongPress={() => onDelete(note)}
        accessibilityLabel={`${note.pinned ? 'Pinned note' : 'Note'}: ${note.body}. ${dateCaption}. Long press to delete.`}
        accessibilityHint="Opens the note editor."
        accessibilityActions={[
          { name: 'longpress', label: 'Delete note' },
          { name: 'delete', label: 'Delete note' },
        ]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === 'longpress' || action === 'delete') onDelete(note);
        }}
      >
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <AppText numberOfLines={6}>{note.body}</AppText>
            <AppText variant="label" color="textMuted" style={{ marginTop: space.sm }}>
              {dateCaption}
            </AppText>
          </View>
          <PressableScale
            onPress={() => onTogglePin(note)}
            accessibilityLabel={note.pinned ? 'Unpin note' : 'Pin note'}
            accessibilityState={{ selected: note.pinned }}
            style={{
              width: hitTarget,
              height: hitTarget,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: -space.sm,
              marginRight: -space.sm,
            }}
          >
            <Icon
              name="pin"
              size={18}
              color={note.pinned ? colors.accentText : colors.textMuted}
              strokeWidth={note.pinned ? 2 : 1.5}
            />
          </PressableScale>
        </View>
      </Card>
    </Animated.View>
  );
});

export default function NotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useGarageStore((s) => s.vehicles.find((v) => v.id === id));
  const notes = useGarageStore((s) => s.notes);
  const togglePinNote = useGarageStore((s) => s.togglePinNote);
  const deleteNote = useGarageStore((s) => s.deleteNote);
  const openSheet = useSheetsStore((s) => s.open);
  const { colors } = useTheme();
  const { reduced, stagger } = useMotion();

  const [query, setQuery] = React.useState('');
  const [focused, setFocused] = React.useState(false);

  const vehicleNotes = React.useMemo(() => notes.filter((n) => n.vehicleId === id), [notes, id]);
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;

  const rows = React.useMemo<Row[]>(() => {
    const matches = searching
      ? vehicleNotes.filter((n) => n.body.toLowerCase().includes(needle))
      : vehicleNotes;
    const byRecency = (a: Note, b: Note) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
    const pinned = matches.filter((n) => n.pinned).sort(byRecency);
    const rest = matches.filter((n) => !n.pinned).sort(byRecency);
    const out: Row[] = [];
    if (pinned.length > 0) {
      out.push({ key: 'stamp:pinned', kind: 'stamp' });
      for (const n of pinned) out.push({ key: n.id, kind: 'note', note: n });
    }
    for (const n of rest) out.push({ key: n.id, kind: 'note', note: n });
    return out;
  }, [vehicleNotes, needle, searching]);

  const matchCount = React.useMemo(() => rows.filter((r) => r.kind === 'note').length, [rows]);

  const openNote = React.useCallback(
    (note?: Note) => openSheet({ kind: 'note', vehicleId: id, note }),
    [openSheet, id]
  );
  const togglePin = React.useCallback(
    (note: Note) => {
      haptic.select();
      void togglePinNote(note.id);
    },
    [togglePinNote]
  );
  const confirmDelete = React.useCallback(
    (note: Note) => {
      haptic.warn();
      Alert.alert('Delete note', 'This removes the note for good.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteNote(note.id) },
      ]);
    },
    [deleteNote]
  );

  const renderItem = React.useCallback(
    ({ item, index }: ListRenderItemInfo<Row>) => {
      if (item.kind === 'stamp') return <PinnedStamp />;
      return (
        <NoteRow
          note={item.note}
          index={index}
          onOpen={openNote}
          onTogglePin={togglePin}
          onDelete={confirmDelete}
        />
      );
    },
    [openNote, togglePin, confirmDelete]
  );

  if (!vehicle) return null;

  const count = vehicleNotes.length;
  const enter = (index: number) =>
    reduced
      ? undefined
      : FadeInDown.delay(stagger(index))
          .springify()
          .damping(springs.settle.damping)
          .stiffness(springs.settle.stiffness);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: space.lg }}>
        <CarHeader vehicle={vehicle} />
        <Animated.View entering={enter(0)}>
          <SectionHeader
            overline="Worth remembering"
            title="Notes"
            accessory={
              <AppText variant="label" color="textMuted">
                {count === 1 ? '1 note' : `${count} notes`}
              </AppText>
            }
          />
        </Animated.View>
        <Animated.View entering={enter(1)} style={{ marginBottom: space.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.inset,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: focused ? colors.accentText : colors.stroke,
              minHeight: 48,
              paddingLeft: space.md,
            }}
          >
            <Icon name="search" size={18} color={focused ? colors.accentText : colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search notes"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              selectionColor={colors.accent}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                flex: 1,
                minHeight: 48,
                paddingHorizontal: space.md,
                paddingVertical: space.md,
                fontFamily: fonts.body,
                fontSize: type.body.fontSize,
                color: colors.text,
              }}
            />
            {query.length > 0 ? (
              <PressableScale
                onPress={() => setQuery('')}
                accessibilityLabel="Clear search"
                style={{
                  width: hitTarget,
                  height: hitTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="close" size={16} color={colors.textMuted} />
              </PressableScale>
            ) : null}
          </View>
          {searching ? (
            <AppText
              variant="label"
              color="textMuted"
              accessibilityLiveRegion="polite"
              style={{ marginTop: space.sm }}
            >
              {matchCount === 1 ? '1 result' : `${matchCount} results`}
            </AppText>
          ) : null}
        </Animated.View>
      </View>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => (row.kind === 'stamp' ? 'stamp' : row.note.pinned ? 'pinned' : 'note')}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: space.xs,
          paddingBottom: space.xl4,
        }}
        ListEmptyComponent={
          searching ? (
            <View style={{ alignItems: 'center', paddingVertical: space.xl3, gap: space.sm }}>
              <Icon name="search" size={28} color={colors.textMuted} />
              <AppText variant="bodyMedium">No notes match</AppText>
              <AppText variant="small" color="textSecondary">
                Try fewer words.
              </AppText>
            </View>
          ) : (
            <EmptyState
              icon="note"
              title="No notes yet"
              body="Parking spots, part numbers, that noise you keep forgetting to mention."
              actionLabel="Add note"
              onAction={() => openNote()}
            />
          )
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={{ marginTop: space.xs }}>
              <Button label="Add note" icon="plus" variant="ghost" onPress={() => openNote()} full />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
