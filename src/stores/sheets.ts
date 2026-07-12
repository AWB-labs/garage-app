import { create } from 'zustand';

import type { Issue, Note, ReminderRule, ServiceRecord, ServiceType, Vehicle } from '@/lib/types';

/**
 * Every create/edit flow lives in a gesture-driven bottom sheet. Screens ask
 * for one by kind; the SheetHost in the root layout presents it.
 */
export type SheetRequest =
  | { kind: 'vehicle'; vehicle?: Vehicle }
  | {
      kind: 'logService';
      vehicleId: string;
      service?: ServiceRecord;
      /** Marks this issue fixed by the saved service. */
      resolvesIssueId?: string;
      prefillType?: ServiceType;
    }
  | { kind: 'updateMileage'; vehicleId: string }
  | { kind: 'reportIssue'; vehicleId: string; issue?: Issue }
  | { kind: 'note'; vehicleId: string; note?: Note }
  | { kind: 'reminder'; vehicleId: string; rule?: ReminderRule };

interface SheetsState {
  current: SheetRequest | null;
  open: (request: SheetRequest) => void;
  close: () => void;
}

export const useSheetsStore = create<SheetsState>((set) => ({
  current: null,
  open: (request) => set({ current: request }),
  close: () => set({ current: null }),
}));
