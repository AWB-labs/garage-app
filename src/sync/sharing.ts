import { getSupabase } from '@/lib/supabase';
import type { VehicleRole } from '@/lib/types';

/**
 * Sharing is the one part of Garage that is online only.
 *
 * Everything else works offline because it is the person's own record of their
 * own car. Membership is not: it is a claim about somebody else's account, and
 * queueing "add this stranger" for later would mean showing access that may
 * never be granted. So these calls talk to Postgres directly and say so when
 * they cannot.
 */

export type ShareableRole = Exclude<VehicleRole, 'owner'>;

export interface Member {
  userId: string;
  role: VehicleRole;
  email: string;
  displayName: string | null;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: ShareableRole;
}

/**
 * Shape PostgREST returns for the embedded profile.
 *
 * The embed is named after the foreign key, not the table. vehicle_members
 * points at profiles twice, through user_id and through invited_by, so a plain
 * `profiles(...)` is ambiguous and PostgREST refuses it outright with "more
 * than one relationship was found". Naming the constraint picks the one we
 * mean: the person the row is about, not whoever added them.
 */
const MEMBER_SELECT = 'user_id, role, profiles!vehicle_members_user_id_fkey(email, display_name)';

interface MemberRow {
  user_id: string;
  role: VehicleRole;
  profiles: { email: string; display_name: string | null } | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: ShareableRole;
}

export class SharingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharingError';
  }
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new SharingError('Sharing needs the backend, which this build has no key for.');
  return supabase;
}

function readable(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('network request failed') || m.includes('failed to fetch')) {
    return 'Cannot reach the server. Sharing needs a connection.';
  }
  return message;
}

export async function listMembers(vehicleId: string): Promise<Member[]> {
  const { data, error } = await client()
    .from('vehicle_members')
    .select(MEMBER_SELECT)
    .eq('vehicle_id', vehicleId)
    .returns<MemberRow[]>();
  if (error) throw new SharingError(readable(error.message));

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    role: row.role,
    email: row.profiles?.email ?? 'Unknown',
    displayName: row.profiles?.display_name ?? null,
  }));
}

export async function listInvites(vehicleId: string): Promise<PendingInvite[]> {
  const { data, error } = await client()
    .from('vehicle_invites')
    .select('id, email, role')
    .eq('vehicle_id', vehicleId)
    .returns<InviteRow[]>();
  if (error) throw new SharingError(readable(error.message));
  return data ?? [];
}

export type InviteOutcome = 'added' | 'invited';

/**
 * One call for both shapes. The server adds the person straight away if the
 * email already has an account, and parks an invitation if it does not, which
 * is also why it never says which happened in a way that would leak whether a
 * stranger has an account here.
 */
export async function inviteToVehicle(
  vehicleId: string,
  email: string,
  role: ShareableRole
): Promise<InviteOutcome> {
  const { data, error } = await client().rpc('invite_to_vehicle', {
    p_vehicle_id: vehicleId,
    p_email: email,
    p_role: role,
  });
  if (error) throw new SharingError(readable(error.message));
  const status = (data as { status?: string } | null)?.status;
  return status === 'added' ? 'added' : 'invited';
}

export async function setMemberRole(
  vehicleId: string,
  userId: string,
  role: ShareableRole
): Promise<void> {
  const { error } = await client()
    .from('vehicle_members')
    .update({ role })
    .eq('vehicle_id', vehicleId)
    .eq('user_id', userId);
  if (error) throw new SharingError(readable(error.message));
}

export async function removeMember(vehicleId: string, userId: string): Promise<void> {
  const { error } = await client()
    .from('vehicle_members')
    .delete()
    .eq('vehicle_id', vehicleId)
    .eq('user_id', userId);
  if (error) throw new SharingError(readable(error.message));
}

export async function cancelInvite(inviteId: string): Promise<void> {
  const { error } = await client().from('vehicle_invites').delete().eq('id', inviteId);
  if (error) throw new SharingError(readable(error.message));
}
