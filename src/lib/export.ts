import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Issue, MileageLog, Note, ReminderRule, ServiceRecord, Settings, Vehicle } from './types';

export interface GarageExport {
  app: 'garage';
  exportedAt: string;
  settings: Settings;
  vehicles: Vehicle[];
  services: ServiceRecord[];
  reminders: ReminderRule[];
  issues: Issue[];
  notes: Note[];
  mileageLogs: MileageLog[];
}

/** Writes the full garage to a JSON file and opens the share sheet. */
export async function exportGarage(data: Omit<GarageExport, 'app' | 'exportedAt'>): Promise<void> {
  const payload: GarageExport = {
    app: 'garage',
    exportedAt: new Date().toISOString(),
    ...data,
  };
  const stamp = payload.exportedAt.slice(0, 10);
  const file = new File(Paths.cache, `garage-export-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(payload, null, 2));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export garage data',
  });
}
