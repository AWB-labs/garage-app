import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import * as dao from '@/db/dao';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { DistanceUnit, ThemePreference, VehicleRole } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { useGarageStore } from '@/stores/garage';
import { useSettingsStore } from '@/stores/settings';
import * as map from './mapping';
import { setSyncListener } from './nudge';

/**
 * Offline-first sync.
 *
 * SQLite stays the source of truth and the only thing the screens read. A
 * cycle is: claim invitations, pull membership (which is also the list of cars
 * this account can see), push everything queued locally, pull each table, then
 * ask the stores to re-read SQLite.
 *
 * Conflict resolution is "a pending local write wins". Push runs before pull,
 * and any row still sitting in the outbox when the pull lands is skipped, so a
 * change made on this phone is never overwritten by the copy it just replaced.
 * Between two devices the later write wins, which is what last-write-wins
 * means and is the right answer for a single person's maintenance log.
 */

const EPOCH = '1970-01-01T00:00:00.000Z';
const PAGE = 500;
const AUTO_INTERVAL_MS = 60_000;

/**
 * Rows are pulled with "updated_at > cursor", and updated_at is stamped at
 * statement time while visibility arrives at commit time. Two overlapping
 * transactions can therefore become visible in the opposite order to their
 * timestamps, and a strict cursor would step over the slower one forever.
 * Re-reading a minute of history each cycle closes that window. Applying a row
 * is idempotent, so the only cost is a few redundant upserts.
 */
const CURSOR_OVERLAP_MS = 60_000;

/** Push order. Cars first so a service record never arrives before its car. */
const PUSH_ORDER: dao.SyncTable[] = [
  'vehicles',
  'service_records',
  'reminder_rules',
  'issues',
  'notes',
  'mileage_logs',
  'user_settings',
];

export type SyncPhase = 'idle' | 'syncing' | 'error';

interface SyncStoreState {
  phase: SyncPhase;
  lastSyncedAt: string | null;
  /** Local changes not yet accepted by the server. */
  pending: number;
  error: string | null;
}

export const useSyncStore = create<SyncStoreState>(() => ({
  phase: 'idle',
  lastSyncedAt: null,
  pending: 0,
  error: null,
}));

class SyncError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'SyncError';
    this.retryable = retryable;
  }
}

/**
 * A dropped connection is worth retrying. A rejected write is not: permission
 * and constraint failures are deterministic, so retrying one forever would
 * wedge the queue behind a row that can never land.
 */
function classify(error: { message?: string; code?: string } | Error): SyncError {
  const message = error.message ?? 'Sync failed';
  const code = 'code' in error ? (error.code ?? '') : '';
  const lower = message.toLowerCase();
  const networkish =
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('econnrefused') ||
    lower.includes('socket');
  // PostgREST reports upstream trouble in the 5xx family; those are transient.
  const serverBlip = code.startsWith('5') || code === 'PGRST301';
  return new SyncError(message, networkish || serverBlip);
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new SyncError('Sync is not configured in this build.', false);
  return supabase;
}

// Cycle -------------------------------------------------------------------------

let running: Promise<void> | null = null;
let currentUserId: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribeNet: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;

async function refreshPendingCount(): Promise<void> {
  useSyncStore.setState({ pending: await dao.countOutbox() });
}

/** Single flight: a second caller joins the cycle already in progress. */
export function syncNow(): Promise<void> {
  if (!isSupabaseConfigured || !currentUserId) return Promise.resolve();
  if (running) return running;
  const userId = currentUserId;
  running = cycle(userId)
    .catch((error: unknown) => {
      const wrapped = error instanceof SyncError ? error : classify(error as Error);
      useSyncStore.setState({ phase: 'error', error: wrapped.message });
    })
    .finally(() => {
      running = null;
      void refreshPendingCount();
    });
  return running;
}

async function cycle(userId: string): Promise<void> {
  const net = await NetInfo.fetch();
  // isInternetReachable is null while the probe is still out. Only a definite
  // false means offline; treating null as offline would skip the first sync
  // after a cold start on a slow connection.
  if (net.isConnected === false || net.isInternetReachable === false) return;

  useSyncStore.setState({ phase: 'syncing', error: null });

  await claimInvites();

  const roles = await pullMemberships(userId);
  let changed = await reconcileVehicles(roles);

  await pushOutbox(userId, roles);

  if (await pullAll(roles)) changed = true;
  if (await pullSettings(userId)) changed = true;

  if (changed) await useGarageStore.getState().reloadFromDb();

  useSyncStore.setState({
    phase: 'idle',
    error: null,
    lastSyncedAt: new Date().toISOString(),
  });
}

// Invitations --------------------------------------------------------------------

async function claimInvites(): Promise<void> {
  const { error } = await client().rpc('claim_pending_invites');
  if (error) throw classify(error);
}

// Membership ---------------------------------------------------------------------

/**
 * Doubles as the visibility list: a car this account can see is exactly a car
 * it has a membership row for, so one query answers both "what may I read" and
 * "may I write to it".
 */
async function pullMemberships(userId: string): Promise<Map<string, VehicleRole>> {
  const { data, error } = await client()
    .from('vehicle_members')
    .select('vehicle_id, user_id, role')
    .eq('user_id', userId)
    .returns<map.RemoteMembership[]>();
  if (error) throw classify(error);
  return new Map((data ?? []).map((m) => [m.vehicle_id, m.role]));
}

/**
 * A car that the server knew about and no longer returns was either deleted
 * outright or shared with us and then taken back. Either way it leaves this
 * phone. Cars created offline are never in synced_vehicles, so they survive.
 */
async function reconcileVehicles(visible: Map<string, VehicleRole>): Promise<boolean> {
  let changed = false;

  for (const id of await dao.listSyncedVehicleIds()) {
    if (visible.has(id)) continue;
    if (await dao.hasPendingWrite('vehicles', id)) continue;
    await dao.withRemoteApply(() => dao.deleteVehicle(id));
    await dao.unmarkVehicleSynced(id);
    changed = true;
  }

  for (const [id, role] of visible) {
    const local = await dao.getVehicle(id);
    if (local && local.role !== role) {
      await dao.setVehicleRole(id, role);
      changed = true;
    }
  }

  return changed;
}

// Push -----------------------------------------------------------------------------

async function pushOutbox(userId: string, roles: Map<string, VehicleRole>): Promise<void> {
  const entries = await dao.listOutbox();
  const ordered = [...entries].sort((a, b) => {
    const table = PUSH_ORDER.indexOf(a.tableName) - PUSH_ORDER.indexOf(b.tableName);
    return table !== 0 ? table : a.seq - b.seq;
  });

  for (const entry of ordered) {
    try {
      await pushEntry(entry, userId, roles);
    } catch (error) {
      const wrapped = error instanceof SyncError ? error : classify(error as Error);
      if (wrapped.retryable) throw wrapped;
      // Deterministic rejection. Drop it so the rest of the queue can drain,
      // and keep the reason visible rather than failing silently.
      useSyncStore.setState({ error: wrapped.message });
    }
    // Cleared only if untouched since it was read, so an edit made while the
    // push was in flight stays queued instead of being lost.
    await dao.clearOutboxEntry(entry.seq, entry.queuedAt);
  }
}

async function pushEntry(
  entry: dao.OutboxEntry,
  userId: string,
  roles: Map<string, VehicleRole>
): Promise<void> {
  const supabase = client();
  const stamp = new Date().toISOString();

  if (entry.tableName === 'user_settings') {
    const stored = await dao.readSettings();
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: userId,
        theme: merged.theme,
        unit: merged.unit,
        currency: merged.currency,
        car_image_key: merged.carImageKey,
      },
      { onConflict: 'user_id' }
    );
    if (error) throw classify(error);
    return;
  }

  if (entry.tableName === 'vehicles') {
    if (entry.op === 'delete') {
      const { error } = await supabase
        .from('vehicles')
        .update({ deleted_at: stamp })
        .eq('id', entry.rowId);
      if (error) throw classify(error);
      await dao.unmarkVehicleSynced(entry.rowId);
      return;
    }
    const vehicle = await dao.getVehicle(entry.rowId);
    // Gone since it was queued. The delete entry that replaced it does the work.
    if (!vehicle) return;
    if (vehicle.role === 'viewer') return;

    if (vehicle.role === 'owner') {
      const { error } = await supabase
        .from('vehicles')
        .upsert(map.vehicleToRemote(vehicle, userId), { onConflict: 'id' });
      if (error) throw classify(error);
    } else {
      // An editor updates in place: the row already exists, and owner_id plus
      // deleted_at are the owner's to set.
      const { error } = await supabase
        .from('vehicles')
        .update(map.vehicleToRemote(vehicle, null))
        .eq('id', vehicle.id);
      if (error) throw classify(error);
    }
    await dao.markVehicleSynced(vehicle.id);
    return;
  }

  if (entry.op === 'delete') {
    const { error } = await supabase
      .from(entry.tableName)
      .update({ deleted_at: stamp })
      .eq('id', entry.rowId);
    if (error) throw classify(error);
    return;
  }

  const payload = await buildChildPayload(entry.tableName, entry.rowId);
  if (!payload) return;
  const { error } = await supabase.from(entry.tableName).upsert(payload, { onConflict: 'id' });
  if (error) throw classify(error);
}

async function buildChildPayload(
  table: dao.SyncTable,
  id: string
): Promise<Record<string, unknown> | null> {
  switch (table) {
    case 'service_records': {
      const row = await dao.getService(id);
      return row ? map.serviceToRemote(row) : null;
    }
    case 'reminder_rules': {
      const row = await dao.getReminder(id);
      return row ? map.reminderToRemote(row) : null;
    }
    case 'issues': {
      const row = await dao.getIssue(id);
      return row ? map.issueToRemote(row) : null;
    }
    case 'notes': {
      const row = await dao.getNote(id);
      return row ? map.noteToRemote(row) : null;
    }
    case 'mileage_logs': {
      const row = await dao.getMileageLog(id);
      return row ? map.mileageLogToRemote(row) : null;
    }
    default:
      return null;
  }
}

// Pull -------------------------------------------------------------------------------

interface TrackedRow {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

async function pullTable<T extends TrackedRow>(
  table: dao.SyncTable,
  apply: (row: T) => Promise<void>,
  remove: (id: string) => Promise<void>
): Promise<boolean> {
  const supabase = client();
  const pending = await dao.pendingRowIds(table);
  const cursorKey = `cursor:${table}`;
  const stored = (await dao.readSyncState(cursorKey)) ?? EPOCH;
  const storedTime = new Date(stored).getTime();
  const since = new Date(storedTime - CURSOR_OVERLAP_MS).toISOString();

  let cursor = stored;
  let changed = false;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
      .returns<T[]>();
    if (error) throw classify(error);

    const rows = data ?? [];
    for (const row of rows) {
      if (new Date(row.updated_at).getTime() > new Date(cursor).getTime()) cursor = row.updated_at;
      // A row we are still trying to upload is newer here than there.
      if (pending.has(row.id)) continue;
      // Rows inside the overlap window were applied on an earlier cycle. Apply
      // them again anyway for idempotence, but do not call that a change, or
      // every cycle would rebuild the stores for nothing.
      if (new Date(row.updated_at).getTime() > storedTime) changed = true;
      await dao.withRemoteApply(() => (row.deleted_at ? remove(row.id) : apply(row)));
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  await dao.writeSyncState(cursorKey, cursor);
  return changed;
}

async function pullAll(roles: Map<string, VehicleRole>): Promise<boolean> {
  let changed = false;

  const vehicles = await pullTable<map.RemoteVehicle>(
    'vehicles',
    async (row) => {
      await dao.upsertVehicleFromRemote(map.vehicleToLocal(row, roles.get(row.id) ?? 'viewer'));
      await dao.markVehicleSynced(row.id);
    },
    async (id) => {
      await dao.deleteVehicle(id);
      await dao.unmarkVehicleSynced(id);
    }
  );
  if (vehicles) changed = true;

  const tables: (() => Promise<boolean>)[] = [
    () =>
      pullTable<map.RemoteService>(
        'service_records',
        (row) => dao.upsertServiceFromRemote(map.serviceToLocal(row)),
        (id) => dao.deleteService(id)
      ),
    () =>
      pullTable<map.RemoteReminder>(
        'reminder_rules',
        (row) => dao.upsertReminderFromRemote(map.reminderToLocal(row)),
        (id) => dao.deleteReminder(id)
      ),
    () =>
      pullTable<map.RemoteIssue>(
        'issues',
        (row) => dao.upsertIssueFromRemote(map.issueToLocal(row)),
        (id) => dao.deleteIssue(id)
      ),
    () =>
      pullTable<map.RemoteNote>(
        'notes',
        (row) => dao.upsertNoteFromRemote(map.noteToLocal(row)),
        (id) => dao.deleteNote(id)
      ),
    () =>
      pullTable<map.RemoteMileageLog>(
        'mileage_logs',
        (row) => dao.upsertMileageLogFromRemote(map.mileageLogToLocal(row)),
        (id) => dao.deleteMileageLog(id)
      ),
  ];

  for (const pull of tables) {
    if (await pull()) changed = true;
  }

  return changed;
}

const THEMES: ThemePreference[] = ['system', 'dark', 'light'];
const UNITS: DistanceUnit[] = ['km', 'mi'];

async function pullSettings(userId: string): Promise<boolean> {
  if (await dao.hasPendingWrite('user_settings', dao.SETTINGS_ROW_ID)) return false;

  const { data, error } = await client()
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .returns<map.RemoteSettings[]>();
  if (error) throw classify(error);

  const row = data?.[0];
  if (!row) return false;

  const cursorKey = 'cursor:user_settings';
  const stored = await dao.readSyncState(cursorKey);
  if (stored && new Date(row.updated_at).getTime() <= new Date(stored).getTime()) return false;

  await dao.withRemoteApply(async () => {
    const theme = THEMES.find((t) => t === row.theme);
    const unit = UNITS.find((u) => u === row.unit);
    if (theme) await dao.writeSetting('theme', theme);
    if (unit) await dao.writeSetting('unit', unit);
    if (row.currency) await dao.writeSetting('currency', row.currency);
    await dao.writeSetting('carImageKey', row.car_image_key ?? '');
  });
  await dao.writeSyncState(cursorKey, row.updated_at);
  await useSettingsStore.getState().hydrate();
  return true;
}

// Account lifecycle -----------------------------------------------------------------

const ACCOUNT_KEY = 'accountId';

/**
 * Cars that exist on this phone before it has ever synced were made without an
 * account, so signing in adopts them. The demo car is the exception: a seeded
 * BMW is scenery, and letting it become a real car in a real account, on every
 * device, forever, is worse than losing it.
 */
async function adoptLocalData(): Promise<void> {
  const seedVehicleId = await dao.getMeta('seedVehicleId');
  if (seedVehicleId) {
    await dao.withRemoteApply(() => dao.deleteVehicle(seedVehicleId));
    await dao.setMeta('seedVehicleId', null);
    const remaining = await dao.listVehicles();
    await dao.setMeta('activeVehicleId', remaining[0]?.id ?? null);
  }

  for (const v of await dao.listVehicles()) await dao.queueUpsert('vehicles', v.id);
  for (const r of await dao.listServices()) await dao.queueUpsert('service_records', r.id);
  for (const r of await dao.listReminders()) await dao.queueUpsert('reminder_rules', r.id);
  for (const r of await dao.listIssues()) await dao.queueUpsert('issues', r.id);
  for (const r of await dao.listNotes()) await dao.queueUpsert('notes', r.id);
  for (const r of await dao.listMileageLogs()) await dao.queueUpsert('mileage_logs', r.id);
  await dao.queueUpsert('user_settings', dao.SETTINGS_ROW_ID);
}

/**
 * Starts syncing for an account, adopting or clearing whatever the previous
 * session left behind. Safe to call repeatedly with the same id.
 */
export async function startSync(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (currentUserId === userId && timer) return;

  currentUserId = userId;

  const previous = await dao.readSyncState(ACCOUNT_KEY);
  if (previous === null) {
    if ((await dao.listVehicles()).length > 0) await adoptLocalData();
    await dao.writeSyncState(ACCOUNT_KEY, userId);
  } else if (previous !== userId) {
    // The local copy belongs to somebody else's account, and it is already on
    // the server under that account. Start this one from a clean phone.
    await dao.wipeGarage();
    await dao.writeSyncState(ACCOUNT_KEY, userId);
    await useGarageStore.getState().reloadFromDb();
  }

  await refreshPendingCount();

  setSyncListener(() => void syncNow());
  if (!timer) timer = setInterval(() => void syncNow(), AUTO_INTERVAL_MS);

  if (!unsubscribeNet) {
    unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void syncNow();
    });
  }

  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void syncNow();
    });
  }

  await syncNow();
}

export function stopSync(): void {
  currentUserId = null;
  setSyncListener(null);
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  unsubscribeNet?.();
  unsubscribeNet = null;
  appStateSub?.remove();
  appStateSub = null;
  useSyncStore.setState({ phase: 'idle', error: null, pending: 0, lastSyncedAt: null });
}

/**
 * Signing out takes the cars off this phone. They are safe in the account and
 * come back on the next sign in, and leaving them would mean the next person
 * to use the phone opens somebody else's garage.
 */
export async function signOutAndClearLocal(): Promise<void> {
  stopSync();
  await dao.wipeGarage();
  await useGarageStore.getState().reloadFromDb();
}

/** How many local changes have not reached the server yet. */
export async function pendingChangeCount(): Promise<number> {
  return dao.countOutbox();
}
