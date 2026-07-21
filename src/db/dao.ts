import type {
  Issue,
  MileageLog,
  Note,
  ReminderRule,
  ServiceRecord,
  Settings,
  Vehicle,
  VehicleRole,
} from '@/lib/types';
import { nudgeSync } from '@/sync/nudge';
import { getDb } from './database';

/** Row mappers: SQLite stores photoUris as JSON text and pinned as 0/1. */

type ServiceRow = Omit<ServiceRecord, 'photoUris'> & { photoUris: string };
type IssueRow = Omit<Issue, 'photoUris'> & { photoUris: string };
type NoteRow = Omit<Note, 'pinned'> & { pinned: number };

const parseUris = (raw: string): string[] => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const mapService = (r: ServiceRow): ServiceRecord => ({ ...r, photoUris: parseUris(r.photoUris) });
const mapIssue = (r: IssueRow): Issue => ({ ...r, photoUris: parseUris(r.photoUris) });
const mapNote = (r: NoteRow): Note => ({ ...r, pinned: r.pinned === 1 });

// Outbox ---------------------------------------------------------------------

/** Local table names that mirror a Supabase table. */
export type SyncTable =
  | 'vehicles'
  | 'service_records'
  | 'reminder_rules'
  | 'issues'
  | 'notes'
  | 'mileage_logs'
  | 'user_settings';

export type OutboxOp = 'upsert' | 'delete';

export interface OutboxEntry {
  seq: number;
  tableName: SyncTable;
  rowId: string;
  op: OutboxOp;
  queuedAt: string;
}

/** Settings are one row per account, and the DAO does not know the account. */
export const SETTINGS_ROW_ID = 'settings';

let applyingRemote = false;

/**
 * Writes performed inside this callback are not queued for upload. Applying a
 * pulled row goes through the very same DAO functions a user edit does, so
 * without this guard every pull would immediately queue everything it just
 * received and push it straight back, forever.
 */
export async function withRemoteApply<T>(fn: () => Promise<T>): Promise<T> {
  const previous = applyingRemote;
  applyingRemote = true;
  try {
    return await fn();
  } finally {
    applyingRemote = previous;
  }
}

/**
 * ON CONFLICT keeps the entry already in the queue and only moves its op, so
 * the sequence number stays put. Push order is that sequence, and that is what
 * makes a car reach the server before the service records pointing at it.
 */
async function enqueue(tableName: SyncTable, rowId: string, op: OutboxOp): Promise<void> {
  if (applyingRemote) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_outbox (tableName, rowId, op, queuedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(tableName, rowId) DO UPDATE SET op = excluded.op, queuedAt = excluded.queuedAt`,
    [tableName, rowId, op, new Date().toISOString()]
  );
  // Every local change funnels through here, so this is the one place that
  // needs to tell the engine there is work. Debounced, and a no-op when no
  // engine is running.
  nudgeSync();
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxEntry>(
    'SELECT seq, tableName, rowId, op, queuedAt FROM sync_outbox ORDER BY seq ASC'
  );
}

/** Queues a row that already exists locally, used when adopting local data. */
export async function queueUpsert(tableName: SyncTable, rowId: string): Promise<void> {
  await enqueue(tableName, rowId, 'upsert');
}

export async function countOutbox(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox');
  return row?.n ?? 0;
}

/**
 * Clears the entry only if it has not been touched since it was read. A user
 * edit landing mid push must survive, otherwise the newer local value is lost
 * the moment the older one uploads.
 */
export async function clearOutboxEntry(seq: number, queuedBefore: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_outbox WHERE seq = ? AND queuedAt <= ?', [seq, queuedBefore]);
}

export async function readOutboxQueuedAt(seq: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ queuedAt: string }>(
    'SELECT queuedAt FROM sync_outbox WHERE seq = ?',
    [seq]
  );
  return row?.queuedAt ?? null;
}

export async function hasPendingWrite(tableName: SyncTable, rowId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sync_outbox WHERE tableName = ? AND rowId = ?',
    [tableName, rowId]
  );
  return (row?.n ?? 0) > 0;
}

export async function pendingRowIds(tableName: SyncTable): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ rowId: string }>(
    'SELECT rowId FROM sync_outbox WHERE tableName = ?',
    [tableName]
  );
  return new Set(rows.map((r) => r.rowId));
}

export async function clearOutbox(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_outbox');
}

// Sync state -----------------------------------------------------------------

export async function readSyncState(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function writeSyncState(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function clearSyncState(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_state');
}

// Server-known vehicles -------------------------------------------------------

export async function listSyncedVehicleIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ vehicleId: string }>('SELECT vehicleId FROM synced_vehicles');
  return rows.map((r) => r.vehicleId);
}

export async function markVehicleSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR IGNORE INTO synced_vehicles (vehicleId) VALUES (?)', [id]);
}

export async function unmarkVehicleSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM synced_vehicles WHERE vehicleId = ?', [id]);
}

export async function clearSyncedVehicles(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM synced_vehicles');
}

/**
 * Empties the garage and every trace of sync, leaving device preferences
 * (theme, units, currency) alone. Used when signing out and when a different
 * account signs in on a phone that still holds the previous one's cars.
 */
export async function wipeGarage(): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM mileage_logs;
      DELETE FROM notes;
      DELETE FROM issues;
      DELETE FROM reminder_rules;
      DELETE FROM service_records;
      DELETE FROM vehicles;
      DELETE FROM synced_vehicles;
      DELETE FROM sync_outbox;
      DELETE FROM sync_state;
      DELETE FROM settings WHERE key IN ('meta:activeVehicleId', 'meta:seedVehicleId', 'meta:seeded');
    `);
  });
}

// Vehicles -------------------------------------------------------------------

export async function listVehicles(): Promise<Vehicle[]> {
  const db = await getDb();
  return db.getAllAsync<Vehicle>('SELECT * FROM vehicles ORDER BY createdAt ASC');
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const db = await getDb();
  return (await db.getFirstAsync<Vehicle>('SELECT * FROM vehicles WHERE id = ?', [id])) ?? null;
}

export async function insertVehicle(v: Vehicle): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vehicles (id, make, model, year, nickname, photoUri, plate, vin, currentMileage, createdAt, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.id, v.make, v.model, v.year, v.nickname, v.photoUri, v.plate, v.vin, v.currentMileage, v.createdAt, v.role]
  );
  await enqueue('vehicles', v.id, 'upsert');
}

/** role is server derived and deliberately not writable here. */
export async function updateVehicle(v: Vehicle): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE vehicles SET make = ?, model = ?, year = ?, nickname = ?, photoUri = ?, plate = ?, vin = ?, currentMileage = ? WHERE id = ?`,
    [v.make, v.model, v.year, v.nickname, v.photoUri, v.plate, v.vin, v.currentMileage, v.id]
  );
  await enqueue('vehicles', v.id, 'upsert');
}

export async function deleteVehicle(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM vehicles WHERE id = ?', [id]);
  // SQLite cascades the children, which fires no JavaScript, so they get no
  // outbox entries of their own. That is correct: the server tombstones the
  // car and every other device cascades its own children the same way.
  await enqueue('vehicles', id, 'delete');
}

export async function setVehicleRole(id: string, role: VehicleRole): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE vehicles SET role = ? WHERE id = ?', [role, id]);
}

/**
 * photoUri is preserved rather than overwritten: it is a path on this device
 * and the server has no opinion about it. A pulled row that blanked it would
 * quietly erase the car's photo on every sync.
 */
export async function upsertVehicleFromRemote(v: Omit<Vehicle, 'photoUri'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vehicles (id, make, model, year, nickname, photoUri, plate, vin, currentMileage, createdAt, role)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       make = excluded.make, model = excluded.model, year = excluded.year,
       nickname = excluded.nickname, plate = excluded.plate, vin = excluded.vin,
       currentMileage = excluded.currentMileage, createdAt = excluded.createdAt`,
    [v.id, v.make, v.model, v.year, v.nickname, v.plate, v.vin, v.currentMileage, v.createdAt, v.role]
  );
}

// Service records -------------------------------------------------------------

export async function listServices(): Promise<ServiceRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ServiceRow>('SELECT * FROM service_records ORDER BY date DESC');
  return rows.map(mapService);
}

export async function getService(id: string): Promise<ServiceRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ServiceRow>('SELECT * FROM service_records WHERE id = ?', [id]);
  return row ? mapService(row) : null;
}

export async function insertService(s: ServiceRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO service_records (id, vehicleId, type, customLabel, date, mileage, cost, shop, notes, photoUris)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.vehicleId, s.type, s.customLabel, s.date, s.mileage, s.cost, s.shop, s.notes, JSON.stringify(s.photoUris)]
  );
  await enqueue('service_records', s.id, 'upsert');
}

export async function updateService(s: ServiceRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE service_records SET type = ?, customLabel = ?, date = ?, mileage = ?, cost = ?, shop = ?, notes = ?, photoUris = ? WHERE id = ?`,
    [s.type, s.customLabel, s.date, s.mileage, s.cost, s.shop, s.notes, JSON.stringify(s.photoUris), s.id]
  );
  await enqueue('service_records', s.id, 'upsert');
}

export async function deleteService(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM service_records WHERE id = ?', [id]);
  await enqueue('service_records', id, 'delete');
}

export async function upsertServiceFromRemote(s: Omit<ServiceRecord, 'photoUris'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO service_records (id, vehicleId, type, customLabel, date, mileage, cost, shop, notes, photoUris)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
     ON CONFLICT(id) DO UPDATE SET
       vehicleId = excluded.vehicleId, type = excluded.type, customLabel = excluded.customLabel,
       date = excluded.date, mileage = excluded.mileage, cost = excluded.cost,
       shop = excluded.shop, notes = excluded.notes`,
    [s.id, s.vehicleId, s.type, s.customLabel, s.date, s.mileage, s.cost, s.shop, s.notes]
  );
}

/**
 * issues.resolvedByServiceId is a plain column with no REFERENCES clause, so
 * SQLite will not clear it when the service goes. Deleting a service must call
 * this or the issue rehydrates pointing at a record that no longer exists.
 */
export async function clearResolvedByService(serviceId: string): Promise<void> {
  const db = await getDb();
  const affected = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM issues WHERE resolvedByServiceId = ?',
    [serviceId]
  );
  await db.runAsync('UPDATE issues SET resolvedByServiceId = NULL WHERE resolvedByServiceId = ?', [
    serviceId,
  ]);
  for (const row of affected) await enqueue('issues', row.id, 'upsert');
}

// Reminder rules ---------------------------------------------------------------

export async function listReminders(): Promise<ReminderRule[]> {
  const db = await getDb();
  return db.getAllAsync<ReminderRule>('SELECT * FROM reminder_rules');
}

export async function getReminder(id: string): Promise<ReminderRule | null> {
  const db = await getDb();
  return (await db.getFirstAsync<ReminderRule>('SELECT * FROM reminder_rules WHERE id = ?', [id])) ?? null;
}

export async function insertReminder(r: ReminderRule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminder_rules (id, vehicleId, serviceType, customLabel, mileageInterval, timeIntervalDays, lastDoneMileage, lastDoneDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.id, r.vehicleId, r.serviceType, r.customLabel, r.mileageInterval, r.timeIntervalDays, r.lastDoneMileage, r.lastDoneDate]
  );
  await enqueue('reminder_rules', r.id, 'upsert');
}

export async function updateReminder(r: ReminderRule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reminder_rules SET serviceType = ?, customLabel = ?, mileageInterval = ?, timeIntervalDays = ?, lastDoneMileage = ?, lastDoneDate = ? WHERE id = ?`,
    [r.serviceType, r.customLabel, r.mileageInterval, r.timeIntervalDays, r.lastDoneMileage, r.lastDoneDate, r.id]
  );
  await enqueue('reminder_rules', r.id, 'upsert');
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reminder_rules WHERE id = ?', [id]);
  await enqueue('reminder_rules', id, 'delete');
}

export async function upsertReminderFromRemote(r: ReminderRule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminder_rules (id, vehicleId, serviceType, customLabel, mileageInterval, timeIntervalDays, lastDoneMileage, lastDoneDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       vehicleId = excluded.vehicleId, serviceType = excluded.serviceType,
       customLabel = excluded.customLabel, mileageInterval = excluded.mileageInterval,
       timeIntervalDays = excluded.timeIntervalDays, lastDoneMileage = excluded.lastDoneMileage,
       lastDoneDate = excluded.lastDoneDate`,
    [r.id, r.vehicleId, r.serviceType, r.customLabel, r.mileageInterval, r.timeIntervalDays, r.lastDoneMileage, r.lastDoneDate]
  );
}

// Issues -----------------------------------------------------------------------

export async function listIssues(): Promise<Issue[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<IssueRow>('SELECT * FROM issues ORDER BY createdAt DESC');
  return rows.map(mapIssue);
}

export async function getIssue(id: string): Promise<Issue | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<IssueRow>('SELECT * FROM issues WHERE id = ?', [id]);
  return row ? mapIssue(row) : null;
}

export async function insertIssue(i: Issue): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO issues (id, vehicleId, title, description, severity, status, photoUris, createdAt, resolvedByServiceId, resolvedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [i.id, i.vehicleId, i.title, i.description, i.severity, i.status, JSON.stringify(i.photoUris), i.createdAt, i.resolvedByServiceId, i.resolvedAt]
  );
  await enqueue('issues', i.id, 'upsert');
}

export async function updateIssue(i: Issue): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE issues SET title = ?, description = ?, severity = ?, status = ?, photoUris = ?, resolvedByServiceId = ?, resolvedAt = ? WHERE id = ?`,
    [i.title, i.description, i.severity, i.status, JSON.stringify(i.photoUris), i.resolvedByServiceId, i.resolvedAt, i.id]
  );
  await enqueue('issues', i.id, 'upsert');
}

export async function deleteIssue(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM issues WHERE id = ?', [id]);
  await enqueue('issues', id, 'delete');
}

export async function upsertIssueFromRemote(i: Omit<Issue, 'photoUris'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO issues (id, vehicleId, title, description, severity, status, photoUris, createdAt, resolvedByServiceId, resolvedAt)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       vehicleId = excluded.vehicleId, title = excluded.title, description = excluded.description,
       severity = excluded.severity, status = excluded.status, createdAt = excluded.createdAt,
       resolvedByServiceId = excluded.resolvedByServiceId, resolvedAt = excluded.resolvedAt`,
    [i.id, i.vehicleId, i.title, i.description, i.severity, i.status, i.createdAt, i.resolvedByServiceId, i.resolvedAt]
  );
}

// Notes -------------------------------------------------------------------------

export async function listNotes(): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY updatedAt DESC');
  return rows.map(mapNote);
}

export async function getNote(id: string): Promise<Note | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', [id]);
  return row ? mapNote(row) : null;
}

export async function insertNote(n: Note): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO notes (id, vehicleId, body, pinned, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [n.id, n.vehicleId, n.body, n.pinned ? 1 : 0, n.createdAt, n.updatedAt]
  );
  await enqueue('notes', n.id, 'upsert');
}

export async function updateNote(n: Note): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notes SET body = ?, pinned = ?, updatedAt = ? WHERE id = ?`,
    [n.body, n.pinned ? 1 : 0, n.updatedAt, n.id]
  );
  await enqueue('notes', n.id, 'upsert');
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
  await enqueue('notes', id, 'delete');
}

export async function upsertNoteFromRemote(n: Note): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO notes (id, vehicleId, body, pinned, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       vehicleId = excluded.vehicleId, body = excluded.body, pinned = excluded.pinned,
       createdAt = excluded.createdAt, updatedAt = excluded.updatedAt`,
    [n.id, n.vehicleId, n.body, n.pinned ? 1 : 0, n.createdAt, n.updatedAt]
  );
}

// Mileage logs --------------------------------------------------------------------

export async function listMileageLogs(): Promise<MileageLog[]> {
  const db = await getDb();
  return db.getAllAsync<MileageLog>('SELECT * FROM mileage_logs ORDER BY date DESC');
}

export async function getMileageLog(id: string): Promise<MileageLog | null> {
  const db = await getDb();
  return (await db.getFirstAsync<MileageLog>('SELECT * FROM mileage_logs WHERE id = ?', [id])) ?? null;
}

export async function insertMileageLog(m: MileageLog): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mileage_logs (id, vehicleId, mileage, date) VALUES (?, ?, ?, ?)`,
    [m.id, m.vehicleId, m.mileage, m.date]
  );
  await enqueue('mileage_logs', m.id, 'upsert');
}

export async function deleteMileageLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM mileage_logs WHERE id = ?', [id]);
  await enqueue('mileage_logs', id, 'delete');
}

export async function upsertMileageLogFromRemote(m: MileageLog): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mileage_logs (id, vehicleId, mileage, date) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       vehicleId = excluded.vehicleId, mileage = excluded.mileage, date = excluded.date`,
    [m.id, m.vehicleId, m.mileage, m.date]
  );
}

// Settings and app meta (shared key-value table) --------------------------------

const SETTING_KEYS: (keyof Settings)[] = ['theme', 'unit', 'currency', 'carImageKey'];

export async function readSettings(): Promise<Partial<Settings>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT * FROM settings WHERE key IN (${SETTING_KEYS.map(() => '?').join(', ')})`,
    SETTING_KEYS
  );
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      // Skip unreadable values; defaults cover them.
    }
  }
  return out as Partial<Settings>;
}

export async function writeSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(value)]
  );
  await enqueue('user_settings', SETTINGS_ROW_ID, 'upsert');
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
    `meta:${key}`,
  ]);
  return row ? row.value : null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  if (value === null) {
    await db.runAsync('DELETE FROM settings WHERE key = ?', [`meta:${key}`]);
  } else {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [`meta:${key}`, value]
    );
  }
}
