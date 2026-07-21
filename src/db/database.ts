import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Single shared connection. WAL + foreign keys, migrations gated on user_version. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('garage.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    nickname TEXT,
    photoUri TEXT,
    plate TEXT,
    vin TEXT,
    currentMileage INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS service_records (
    id TEXT PRIMARY KEY NOT NULL,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    customLabel TEXT,
    date TEXT NOT NULL,
    mileage INTEGER NOT NULL,
    cost REAL,
    shop TEXT,
    notes TEXT,
    photoUris TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS reminder_rules (
    id TEXT PRIMARY KEY NOT NULL,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    serviceType TEXT NOT NULL,
    customLabel TEXT,
    mileageInterval INTEGER,
    timeIntervalDays INTEGER,
    lastDoneMileage INTEGER,
    lastDoneDate TEXT
  );
  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY NOT NULL,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    photoUris TEXT NOT NULL DEFAULT '[]',
    createdAt TEXT NOT NULL,
    resolvedByServiceId TEXT,
    resolvedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mileage_logs (
    id TEXT PRIMARY KEY NOT NULL,
    vehicleId TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    mileage INTEGER NOT NULL,
    date TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_services_vehicle ON service_records(vehicleId);
  CREATE INDEX IF NOT EXISTS idx_reminders_vehicle ON reminder_rules(vehicleId);
  CREATE INDEX IF NOT EXISTS idx_issues_vehicle ON issues(vehicleId);
  CREATE INDEX IF NOT EXISTS idx_notes_vehicle ON notes(vehicleId);
  CREATE INDEX IF NOT EXISTS idx_mileage_vehicle ON mileage_logs(vehicleId);
  `,
  // Sync. Everything here is local bookkeeping and never leaves the phone.
  `
  -- One pending entry per row, not a log of every edit: the unique index below
  -- collapses repeated edits onto the entry that is already queued, which
  -- keeps the queue small and holds each row at its original position. The
  -- engine pushes by table first and sequence second, so a car always reaches
  -- the server before the service records that reference it. Replacing the
  -- upsert with delete-then-insert would break the ordering half of that.
  CREATE TABLE IF NOT EXISTS sync_outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    tableName TEXT NOT NULL,
    rowId TEXT NOT NULL,
    op TEXT NOT NULL,
    queuedAt TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_row ON sync_outbox(tableName, rowId);

  -- Pull cursors and the id of the account the local data belongs to.
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  -- Cars known to exist on the server. A car that is in here but no longer
  -- comes back from the membership pull is one this account lost access to,
  -- so it is removed locally. Without this table there is no way to tell that
  -- case apart from a car created offline that has never been pushed.
  CREATE TABLE IF NOT EXISTS synced_vehicles (
    vehicleId TEXT PRIMARY KEY NOT NULL
  );

  -- My access level for this car. Cars that predate sync are mine.
  ALTER TABLE vehicles ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
  `,
];

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(sql);
      await txn.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
