import type {
  Issue,
  MileageLog,
  Note,
  ReminderRule,
  ServiceRecord,
  Settings,
  Vehicle,
} from '@/lib/types';
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

// Vehicles

export async function listVehicles(): Promise<Vehicle[]> {
  const db = await getDb();
  return db.getAllAsync<Vehicle>('SELECT * FROM vehicles ORDER BY createdAt ASC');
}

export async function insertVehicle(v: Vehicle): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO vehicles (id, make, model, year, nickname, photoUri, plate, vin, currentMileage, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.id, v.make, v.model, v.year, v.nickname, v.photoUri, v.plate, v.vin, v.currentMileage, v.createdAt]
  );
}

export async function updateVehicle(v: Vehicle): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE vehicles SET make = ?, model = ?, year = ?, nickname = ?, photoUri = ?, plate = ?, vin = ?, currentMileage = ? WHERE id = ?`,
    [v.make, v.model, v.year, v.nickname, v.photoUri, v.plate, v.vin, v.currentMileage, v.id]
  );
}

export async function deleteVehicle(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM vehicles WHERE id = ?', [id]);
}

// Service records

export async function listServices(): Promise<ServiceRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ServiceRow>('SELECT * FROM service_records ORDER BY date DESC');
  return rows.map(mapService);
}

export async function insertService(s: ServiceRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO service_records (id, vehicleId, type, customLabel, date, mileage, cost, shop, notes, photoUris)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.vehicleId, s.type, s.customLabel, s.date, s.mileage, s.cost, s.shop, s.notes, JSON.stringify(s.photoUris)]
  );
}

export async function updateService(s: ServiceRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE service_records SET type = ?, customLabel = ?, date = ?, mileage = ?, cost = ?, shop = ?, notes = ?, photoUris = ? WHERE id = ?`,
    [s.type, s.customLabel, s.date, s.mileage, s.cost, s.shop, s.notes, JSON.stringify(s.photoUris), s.id]
  );
}

export async function deleteService(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM service_records WHERE id = ?', [id]);
}

/**
 * issues.resolvedByServiceId is a plain column with no REFERENCES clause, so
 * SQLite will not clear it when the service goes. Deleting a service must call
 * this or the issue rehydrates pointing at a record that no longer exists.
 */
export async function clearResolvedByService(serviceId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE issues SET resolvedByServiceId = NULL WHERE resolvedByServiceId = ?', [
    serviceId,
  ]);
}

// Reminder rules

export async function listReminders(): Promise<ReminderRule[]> {
  const db = await getDb();
  return db.getAllAsync<ReminderRule>('SELECT * FROM reminder_rules');
}

export async function insertReminder(r: ReminderRule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminder_rules (id, vehicleId, serviceType, customLabel, mileageInterval, timeIntervalDays, lastDoneMileage, lastDoneDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.id, r.vehicleId, r.serviceType, r.customLabel, r.mileageInterval, r.timeIntervalDays, r.lastDoneMileage, r.lastDoneDate]
  );
}

export async function updateReminder(r: ReminderRule): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reminder_rules SET serviceType = ?, customLabel = ?, mileageInterval = ?, timeIntervalDays = ?, lastDoneMileage = ?, lastDoneDate = ? WHERE id = ?`,
    [r.serviceType, r.customLabel, r.mileageInterval, r.timeIntervalDays, r.lastDoneMileage, r.lastDoneDate, r.id]
  );
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reminder_rules WHERE id = ?', [id]);
}

// Issues

export async function listIssues(): Promise<Issue[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<IssueRow>('SELECT * FROM issues ORDER BY createdAt DESC');
  return rows.map(mapIssue);
}

export async function insertIssue(i: Issue): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO issues (id, vehicleId, title, description, severity, status, photoUris, createdAt, resolvedByServiceId, resolvedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [i.id, i.vehicleId, i.title, i.description, i.severity, i.status, JSON.stringify(i.photoUris), i.createdAt, i.resolvedByServiceId, i.resolvedAt]
  );
}

export async function updateIssue(i: Issue): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE issues SET title = ?, description = ?, severity = ?, status = ?, photoUris = ?, resolvedByServiceId = ?, resolvedAt = ? WHERE id = ?`,
    [i.title, i.description, i.severity, i.status, JSON.stringify(i.photoUris), i.resolvedByServiceId, i.resolvedAt, i.id]
  );
}

export async function deleteIssue(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM issues WHERE id = ?', [id]);
}

// Notes

export async function listNotes(): Promise<Note[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY updatedAt DESC');
  return rows.map(mapNote);
}

export async function insertNote(n: Note): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO notes (id, vehicleId, body, pinned, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [n.id, n.vehicleId, n.body, n.pinned ? 1 : 0, n.createdAt, n.updatedAt]
  );
}

export async function updateNote(n: Note): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE notes SET body = ?, pinned = ?, updatedAt = ? WHERE id = ?`,
    [n.body, n.pinned ? 1 : 0, n.updatedAt, n.id]
  );
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM notes WHERE id = ?', [id]);
}

// Mileage logs

export async function listMileageLogs(): Promise<MileageLog[]> {
  const db = await getDb();
  return db.getAllAsync<MileageLog>('SELECT * FROM mileage_logs ORDER BY date DESC');
}

export async function insertMileageLog(m: MileageLog): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mileage_logs (id, vehicleId, mileage, date) VALUES (?, ?, ?, ?)`,
    [m.id, m.vehicleId, m.mileage, m.date]
  );
}

export async function deleteMileageLog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM mileage_logs WHERE id = ?', [id]);
}

// Settings and app meta (shared key-value table)

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
