import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  EmptyState,
  Icon,
  Pill,
  PressableScale,
  Screen,
  SectionHeader,
  SegmentedControl,
} from '@/components/ui';
import { useRouteVehicle } from '@/lib/useRouteVehicle';
import { VEHICLE_ROLE_LABELS } from '@/lib/types';
import {
  cancelInvite,
  inviteToVehicle,
  listInvites,
  listMembers,
  removeMember,
  setMemberRole,
  type Member,
  type PendingInvite,
  type ShareableRole,
} from '@/sync/sharing';
import { useAuthStore } from '@/stores/auth';
import { useGarageStore } from '@/stores/garage';
import { fonts, haptic, radius, space, useTheme } from '@/theme';

const ROLE_OPTIONS: { value: ShareableRole; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

/**
 * Who else can see this car. Owner only for every control: everybody can read
 * the list, which is what makes shared access legible rather than spooky.
 */
export default function MembersScreen() {
  const { colors } = useTheme();
  const { id, vehicle } = useRouteVehicle();
  const myUserId = useAuthStore((s) => s.userId);
  const focused = useIsFocused();

  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<PendingInvite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<ShareableRole>('editor');
  const [emailFocused, setEmailFocused] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const isOwner = vehicle?.role === 'owner';

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        listMembers(id),
        // Only the owner can read invitations, so do not ask on their behalf.
        vehicle?.role === 'owner' ? listInvites(id) : Promise.resolve<PendingInvite[]>([]),
      ]);
      setMembers(nextMembers);
      setInvites(nextInvites);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the people on this car.');
    } finally {
      setLoading(false);
    }
  }, [id, vehicle?.role]);

  React.useEffect(() => {
    if (focused) void load();
  }, [focused, load]);

  const submitInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    setNotice(null);
    setError(null);
    try {
      const outcome = await inviteToVehicle(id, trimmed, role);
      haptic.save();
      setNotice(
        outcome === 'added'
          ? `${trimmed} can see this car now.`
          : `Invitation saved for ${trimmed}. They get access when they create an account.`
      );
      setEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share the car.');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = (member: Member, next: ShareableRole) => {
    setMembers((list) => list.map((m) => (m.userId === member.userId ? { ...m, role: next } : m)));
    setMemberRole(id, member.userId, next).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Could not change that role.');
      void load();
    });
  };

  const confirmRemove = (member: Member) => {
    const who = member.displayName ?? member.email;
    Alert.alert('Remove this person?', `${who} loses access to this car on every device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeMember(id, member.userId)
            .then(load)
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'Could not remove them.')
            );
        },
      },
    ]);
  };

  const confirmLeave = () => {
    if (!myUserId) return;
    Alert.alert('Leave this car?', 'It disappears from your garage. The owner keeps it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          removeMember(id, myUserId)
            .then(async () => {
              // The next sync would notice too, but waiting for it would leave
              // the person staring at a car they no longer belong to.
              await useGarageStore.getState().deleteVehicle(id);
              router.replace('/garage');
            })
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'Could not leave the car.')
            );
        },
      },
    ]);
  };

  const carName = vehicle ? (vehicle.nickname ?? `${vehicle.make} ${vehicle.model}`) : 'This car';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
        <PressableScale
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{ padding: space.sm }}
        >
          <Icon name="chevronLeft" size={22} color={colors.textSecondary} />
        </PressableScale>
        <AppText variant="displayXL">Sharing</AppText>
      </View>
      <AppText variant="small" color="textSecondary" style={{ marginLeft: space.xl2 }}>
        {carName}
      </AppText>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xl4 }}
      >
        {error ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg, alignItems: 'flex-start' }}
          >
            <Icon name="alert" size={16} color={colors.dangerText} strokeWidth={1.8} />
            <AppText variant="small" color="dangerText" style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}

        <SectionHeader overline="Access" title="People" />

        {loading ? (
          <ActivityIndicator color={colors.accentText} style={{ marginTop: space.xl }} />
        ) : members.length === 0 ? (
          <EmptyState
            icon="garage"
            title="Nobody yet"
            body="This car has not been shared. Add someone by email below."
          />
        ) : (
          <View style={{ gap: space.sm }}>
            {members.map((member) => {
              const isMe = member.userId === myUserId;
              const canManage = isOwner && !isMe && member.role !== 'owner';
              return (
                <Card key={member.userId} accessible={false}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: space.sm,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodySemi" numberOfLines={1}>
                        {member.displayName ?? member.email}
                        {isMe ? ' (you)' : ''}
                      </AppText>
                      {member.displayName ? (
                        <AppText variant="caption" color="textMuted" numberOfLines={1}>
                          {member.email}
                        </AppText>
                      ) : null}
                    </View>
                    <Pill
                      label={VEHICLE_ROLE_LABELS[member.role]}
                      color={member.role === 'owner' ? 'accentText' : 'textSecondary'}
                    />
                  </View>

                  {canManage ? (
                    <View style={{ marginTop: space.md, gap: space.sm }}>
                      <SegmentedControl
                        options={ROLE_OPTIONS}
                        value={member.role === 'viewer' ? 'viewer' : 'editor'}
                        onChange={(next) => changeRole(member, next)}
                      />
                      <Button
                        label="Remove"
                        variant="danger"
                        icon="trash"
                        onPress={() => confirmRemove(member)}
                        full
                      />
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}

        {isOwner && invites.length > 0 ? (
          <>
            <SectionHeader overline="Waiting" title="Invitations" />
            <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
              These people have no account yet. They get access the moment they make one.
            </AppText>
            <View style={{ gap: space.sm }}>
              {invites.map((invite) => (
                <Card key={invite.id} accessible={false}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: space.sm,
                    }}
                  >
                    <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>
                      {invite.email}
                    </AppText>
                    <Pill label={VEHICLE_ROLE_LABELS[invite.role]} />
                    <PressableScale
                      accessibilityLabel={`Cancel the invitation for ${invite.email}`}
                      onPress={() => {
                        cancelInvite(invite.id)
                          .then(load)
                          .catch((e: unknown) =>
                            setError(e instanceof Error ? e.message : 'Could not cancel it.')
                          );
                      }}
                      style={{ padding: space.xs }}
                    >
                      <Icon name="close" size={18} color={colors.textMuted} />
                    </PressableScale>
                  </View>
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {isOwner ? (
          <>
            <SectionHeader overline="Add" title="Share this car" />
            <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
              An editor can log services, issues, and mileage. A viewer reads the record without
              changing it. Only you can share the car or delete it.
            </AppText>
            <TextInput
              accessibilityLabel="Email address"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="them@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={() => void submitInvite()}
              style={{
                minHeight: 48,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: emailFocused ? colors.accentText : colors.stroke,
                backgroundColor: colors.inset,
                paddingHorizontal: space.md,
                fontFamily: fonts.body,
                fontSize: 16,
                color: colors.text,
              }}
            />
            <View style={{ marginTop: space.md }}>
              <SegmentedControl options={ROLE_OPTIONS} value={role} onChange={setRole} />
            </View>
            <View style={{ marginTop: space.md }}>
              <Button
                label="Share the car"
                icon="plus"
                onPress={() => void submitInvite()}
                loading={inviting}
                disabled={email.trim() === ''}
                full
              />
            </View>
            {notice ? (
              <AppText
                variant="small"
                color="successText"
                accessibilityLiveRegion="polite"
                style={{ marginTop: space.md }}
              >
                {notice}
              </AppText>
            ) : null}
          </>
        ) : (
          <>
            <SectionHeader overline="Your access" title={VEHICLE_ROLE_LABELS[vehicle?.role ?? 'viewer']} />
            <AppText variant="small" color="textSecondary" style={{ marginBottom: space.md }}>
              {vehicle?.role === 'editor'
                ? 'You can log work on this car. Only the owner can share or delete it.'
                : "You can read this car's record. Ask the owner for editing access."}
            </AppText>
            <Button label="Leave this car" variant="danger" onPress={confirmLeave} full />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
