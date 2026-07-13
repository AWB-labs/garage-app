import { create } from 'zustand';

import * as dao from '@/db/dao';
import { seedIfEmpty } from '@/db/seed';
import { newId } from '@/lib/id';
import type {
  Issue,
  IssueSeverity,
  MileageLog,
  Note,
  ReminderRule,
  ServiceRecord,
  ServiceType,
  Vehicle,
} from '@/lib/types';

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  nickname: string | null;
  photoUri: string | null;
  plate: string | null;
  vin: string | null;
  currentMileage: number;
}

export interface ServiceInput {
  vehicleId: string;
  type: ServiceType;
  customLabel: string | null;
  date: string;
  mileage: number;
  cost: number | null;
  shop: string | null;
  notes: string | null;
  photoUris: string[];
  /** When set, marks this issue fixed by the new service. */
  resolvesIssueId?: string | null;
}

export interface ReminderInput {
  vehicleId: string;
  serviceType: ServiceType;
  customLabel: string | null;
  mileageInterval: number | null;
  timeIntervalDays: number | null;
  lastDoneMileage: number | null;
  lastDoneDate: string | null;
}

export interface IssueInput {
  vehicleId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  photoUris: string[];
}

interface GarageState {
  hydrated: boolean;
  vehicles: Vehicle[];
  activeVehicleId: string | null;
  services: ServiceRecord[];
  reminders: ReminderRule[];
  issues: Issue[];
  notes: Note[];
  mileageLogs: MileageLog[];

  hydrate: () => Promise<void>;

  addVehicle: (input: VehicleInput) => Promise<Vehicle>;
  updateVehicle: (vehicle: Vehicle) => Promise<void>;
  deleteVehicle: (id: string) => Promise<void>;
  setActiveVehicle: (id: string) => void;

  logService: (input: ServiceInput) => Promise<ServiceRecord>;
  updateService: (service: ServiceRecord) => Promise<void>;
  deleteService: (id: string) => Promise<void>;

  addReminder: (input: ReminderInput) => Promise<ReminderRule>;
  updateReminder: (rule: ReminderRule) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;

  reportIssue: (input: IssueInput) => Promise<Issue>;
  updateIssue: (issue: Issue) => Promise<void>;
  resolveIssue: (issueId: string, serviceId: string | null) => Promise<void>;
  deleteIssue: (id: string) => Promise<void>;

  addNote: (vehicleId: string, body: string) => Promise<Note>;
  updateNote: (id: string, body: string) => Promise<void>;
  togglePinNote: (id: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  logMileage: (vehicleId: string, mileage: number, date?: string) => Promise<void>;
}

/**
 * SQLite is the source of truth. This store hydrates once behind the splash,
 * then every mutation writes to the DAO first and mirrors the change in
 * memory. Components never touch the database directly.
 */
export const useGarageStore = create<GarageState>((set, get) => {
  /**
   * Reminder anchors are derived from the service history, never stamped from
   * whatever was just written: back-dating, editing or deleting a record has to
   * move the anchor onto whatever service actually satisfies the rule now. A
   * rule with no matching service keeps the anchor it was created with, since
   * seeded and hand-entered rules carry anchors that no record backs.
   */
  const reanchorReminders = async (vehicleId: string): Promise<void> => {
    const { services, reminders } = get();
    const history = services.filter((s) => s.vehicleId === vehicleId);
    const updates: ReminderRule[] = [];

    for (const rule of reminders) {
      if (rule.vehicleId !== vehicleId) continue;
      const matching = history.filter(
        (s) =>
          s.type === rule.serviceType &&
          (rule.serviceType !== 'custom' || s.customLabel === rule.customLabel)
      );
      if (matching.length === 0) continue;

      const newest = matching.reduce((best, s) => {
        const delta = new Date(s.date).getTime() - new Date(best.date).getTime();
        if (delta !== 0) return delta > 0 ? s : best;
        return s.mileage > best.mileage ? s : best;
      });
      if (rule.lastDoneMileage === newest.mileage && rule.lastDoneDate === newest.date) continue;
      updates.push({ ...rule, lastDoneMileage: newest.mileage, lastDoneDate: newest.date });
    }

    if (updates.length === 0) return;
    for (const rule of updates) await dao.updateReminder(rule);
    const byId = new Map(updates.map((r) => [r.id, r]));
    set((s) => ({ reminders: s.reminders.map((r) => byId.get(r.id) ?? r) }));
  };

  return {
    hydrated: false,
    vehicles: [],
    activeVehicleId: null,
    services: [],
    reminders: [],
    issues: [],
    notes: [],
    mileageLogs: [],

    hydrate: async () => {
      await seedIfEmpty();
      const [vehicles, services, reminders, issues, notes, mileageLogs, storedActive] =
        await Promise.all([
          dao.listVehicles(),
          dao.listServices(),
          dao.listReminders(),
          dao.listIssues(),
          dao.listNotes(),
          dao.listMileageLogs(),
          dao.getMeta('activeVehicleId'),
        ]);
      const activeVehicleId =
        storedActive && vehicles.some((v) => v.id === storedActive)
          ? storedActive
          : (vehicles[0]?.id ?? null);
      set({ hydrated: true, vehicles, services, reminders, issues, notes, mileageLogs, activeVehicleId });
    },

    addVehicle: async (input) => {
      const vehicle: Vehicle = { ...input, id: newId(), createdAt: new Date().toISOString() };
      await dao.insertVehicle(vehicle);
      set((s) => ({ vehicles: [...s.vehicles, vehicle], activeVehicleId: vehicle.id }));
      void dao.setMeta('activeVehicleId', vehicle.id);
      return vehicle;
    },

    updateVehicle: async (vehicle) => {
      await dao.updateVehicle(vehicle);
      set((s) => ({ vehicles: s.vehicles.map((v) => (v.id === vehicle.id ? vehicle : v)) }));
    },

    deleteVehicle: async (id) => {
      await dao.deleteVehicle(id);
      set((s) => {
        const vehicles = s.vehicles.filter((v) => v.id !== id);
        const activeVehicleId = s.activeVehicleId === id ? (vehicles[0]?.id ?? null) : s.activeVehicleId;
        void dao.setMeta('activeVehicleId', activeVehicleId);
        return {
          vehicles,
          activeVehicleId,
          services: s.services.filter((r) => r.vehicleId !== id),
          reminders: s.reminders.filter((r) => r.vehicleId !== id),
          issues: s.issues.filter((r) => r.vehicleId !== id),
          notes: s.notes.filter((r) => r.vehicleId !== id),
          mileageLogs: s.mileageLogs.filter((r) => r.vehicleId !== id),
        };
      });
    },

    setActiveVehicle: (id) => {
      set({ activeVehicleId: id });
      void dao.setMeta('activeVehicleId', id);
    },

    logService: async (input) => {
      const { resolvesIssueId, ...fields } = input;
      const service: ServiceRecord = { ...fields, id: newId() };
      await dao.insertService(service);
      set((s) => ({ services: [service, ...s.services] }));

      await reanchorReminders(service.vehicleId);

      // Odometer can only move forward.
      const vehicle = get().vehicles.find((v) => v.id === service.vehicleId);
      if (vehicle && service.mileage > vehicle.currentMileage) {
        await get().updateVehicle({ ...vehicle, currentMileage: service.mileage });
      }

      if (resolvesIssueId) {
        await get().resolveIssue(resolvesIssueId, service.id);
      }
      return service;
    },

    updateService: async (service) => {
      await dao.updateService(service);
      set((s) => ({ services: s.services.map((r) => (r.id === service.id ? service : r)) }));
      // The edit may have changed type, label, date or mileage, so every rule of
      // the vehicle is re-derived, not just the one this record used to satisfy.
      await reanchorReminders(service.vehicleId);
    },

    deleteService: async (id) => {
      const service = get().services.find((r) => r.id === id);
      // issues.resolvedByServiceId has no foreign key, so the unlink is persisted
      // by hand or the issue rehydrates pointing at a deleted record. Unlink
      // first: a failure between the two statements can then never dangle.
      await dao.clearResolvedByService(id);
      await dao.deleteService(id);
      set((s) => ({
        services: s.services.filter((r) => r.id !== id),
        issues: s.issues.map((i) =>
          i.resolvedByServiceId === id ? { ...i, resolvedByServiceId: null } : i
        ),
      }));
      if (service) await reanchorReminders(service.vehicleId);
    },

    addReminder: async (input) => {
      const rule: ReminderRule = { ...input, id: newId() };
      await dao.insertReminder(rule);
      set((s) => ({ reminders: [...s.reminders, rule] }));
      return rule;
    },

    updateReminder: async (rule) => {
      await dao.updateReminder(rule);
      set((s) => ({ reminders: s.reminders.map((r) => (r.id === rule.id ? rule : r)) }));
    },

    deleteReminder: async (id) => {
      await dao.deleteReminder(id);
      set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }));
    },

    reportIssue: async (input) => {
      const issue: Issue = {
        ...input,
        id: newId(),
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedByServiceId: null,
        resolvedAt: null,
      };
      await dao.insertIssue(issue);
      set((s) => ({ issues: [issue, ...s.issues] }));
      return issue;
    },

    updateIssue: async (issue) => {
      await dao.updateIssue(issue);
      set((s) => ({ issues: s.issues.map((i) => (i.id === issue.id ? issue : i)) }));
    },

    resolveIssue: async (issueId, serviceId) => {
      const issue = get().issues.find((i) => i.id === issueId);
      if (!issue) return;
      const fixed: Issue = {
        ...issue,
        status: 'fixed',
        resolvedByServiceId: serviceId,
        resolvedAt: new Date().toISOString(),
      };
      await dao.updateIssue(fixed);
      set((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? fixed : i)) }));
    },

    deleteIssue: async (id) => {
      await dao.deleteIssue(id);
      set((s) => ({ issues: s.issues.filter((i) => i.id !== id) }));
    },

    addNote: async (vehicleId, body) => {
      const now = new Date().toISOString();
      const note: Note = { id: newId(), vehicleId, body, pinned: false, createdAt: now, updatedAt: now };
      await dao.insertNote(note);
      set((s) => ({ notes: [note, ...s.notes] }));
      return note;
    },

    updateNote: async (id, body) => {
      const note = get().notes.find((n) => n.id === id);
      if (!note) return;
      const updated: Note = { ...note, body, updatedAt: new Date().toISOString() };
      await dao.updateNote(updated);
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }));
    },

    togglePinNote: async (id) => {
      const note = get().notes.find((n) => n.id === id);
      if (!note) return;
      const updated: Note = { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() };
      await dao.updateNote(updated);
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }));
    },

    deleteNote: async (id) => {
      await dao.deleteNote(id);
      set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    },

    logMileage: async (vehicleId, mileage, date) => {
      const log: MileageLog = { id: newId(), vehicleId, mileage, date: date ?? new Date().toISOString() };
      await dao.insertMileageLog(log);
      set((s) => ({ mileageLogs: [log, ...s.mileageLogs] }));
      const vehicle = get().vehicles.find((v) => v.id === vehicleId);
      if (vehicle && mileage > vehicle.currentMileage) {
        await get().updateVehicle({ ...vehicle, currentMileage: mileage });
      }
    },
  };
});

/** Convenience selectors for per-vehicle slices. */
export const selectActiveVehicle = (s: GarageState): Vehicle | null =>
  s.vehicles.find((v) => v.id === s.activeVehicleId) ?? null;
