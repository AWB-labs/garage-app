import { toIso, toIsoRequired } from '@/lib/supabase';
import type {
  Issue,
  IssueSeverity,
  IssueStatus,
  MileageLog,
  Note,
  ReminderRule,
  ServiceRecord,
  ServiceType,
  Vehicle,
  VehicleRole,
} from '@/lib/types';

/**
 * The wire shapes. Postgres is snake_case and carries two columns the domain
 * model has no use for: updated_at drives the pull cursor, deleted_at is the
 * tombstone that lets a delete on one phone reach another.
 *
 * Photo columns are absent by design. A file:// path is meaningless on another
 * device, so photos stay where they were taken. See the core schema migration.
 */

interface Tracked {
  updated_at: string;
  deleted_at: string | null;
}

export interface RemoteVehicle extends Tracked {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number;
  nickname: string | null;
  plate: string | null;
  vin: string | null;
  current_mileage: number;
  created_at: string;
}

export interface RemoteService extends Tracked {
  id: string;
  vehicle_id: string;
  type: ServiceType;
  custom_label: string | null;
  date: string;
  mileage: number;
  cost: number | null;
  shop: string | null;
  notes: string | null;
}

export interface RemoteReminder extends Tracked {
  id: string;
  vehicle_id: string;
  service_type: ServiceType;
  custom_label: string | null;
  mileage_interval: number | null;
  time_interval_days: number | null;
  last_done_mileage: number | null;
  last_done_date: string | null;
}

export interface RemoteIssue extends Tracked {
  id: string;
  vehicle_id: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  created_at: string;
  resolved_by_service_id: string | null;
  resolved_at: string | null;
}

export interface RemoteNote extends Tracked {
  id: string;
  vehicle_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

export interface RemoteMileageLog extends Tracked {
  id: string;
  vehicle_id: string;
  mileage: number;
  date: string;
}

export interface RemoteMembership {
  vehicle_id: string;
  user_id: string;
  role: VehicleRole;
}

export interface RemoteSettings {
  user_id: string;
  theme: string;
  unit: string;
  currency: string;
  car_image_key: string;
  updated_at: string;
}

/** Every timestamp is normalized to the ISO instant the app stores locally. */
const EPOCH = '1970-01-01T00:00:00.000Z';

// Remote to local ---------------------------------------------------------------

export function vehicleToLocal(r: RemoteVehicle, role: VehicleRole): Omit<Vehicle, 'photoUri'> {
  return {
    id: r.id,
    make: r.make,
    model: r.model,
    year: r.year,
    nickname: r.nickname,
    plate: r.plate,
    vin: r.vin,
    currentMileage: r.current_mileage,
    createdAt: toIsoRequired(r.created_at, EPOCH),
    role,
  };
}

export function serviceToLocal(r: RemoteService): Omit<ServiceRecord, 'photoUris'> {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    type: r.type,
    customLabel: r.custom_label,
    date: toIsoRequired(r.date, EPOCH),
    mileage: r.mileage,
    cost: r.cost,
    shop: r.shop,
    notes: r.notes,
  };
}

export function reminderToLocal(r: RemoteReminder): ReminderRule {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    serviceType: r.service_type,
    customLabel: r.custom_label,
    mileageInterval: r.mileage_interval,
    timeIntervalDays: r.time_interval_days,
    lastDoneMileage: r.last_done_mileage,
    lastDoneDate: toIso(r.last_done_date),
  };
}

export function issueToLocal(r: RemoteIssue): Omit<Issue, 'photoUris'> {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    title: r.title,
    description: r.description,
    severity: r.severity,
    status: r.status,
    createdAt: toIsoRequired(r.created_at, EPOCH),
    resolvedByServiceId: r.resolved_by_service_id,
    resolvedAt: toIso(r.resolved_at),
  };
}

export function noteToLocal(r: RemoteNote): Note {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    body: r.body,
    pinned: r.pinned,
    createdAt: toIsoRequired(r.created_at, EPOCH),
    updatedAt: toIsoRequired(r.updated_at, EPOCH),
  };
}

export function mileageLogToLocal(r: RemoteMileageLog): MileageLog {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    mileage: r.mileage,
    date: toIsoRequired(r.date, EPOCH),
  };
}

// Local to remote ---------------------------------------------------------------

/**
 * owner_id is omitted for a car somebody else shared with us. The column is
 * frozen server side after insert, so sending our own id would be rejected,
 * and sending the real owner's would mean tracking it locally for no reason.
 */
export function vehicleToRemote(v: Vehicle, ownerId: string | null): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    nickname: v.nickname,
    plate: v.plate,
    vin: v.vin,
    current_mileage: v.currentMileage,
    created_at: v.createdAt,
    deleted_at: null,
  };
  if (ownerId) row.owner_id = ownerId;
  return row;
}

export function serviceToRemote(s: ServiceRecord): Record<string, unknown> {
  return {
    id: s.id,
    vehicle_id: s.vehicleId,
    type: s.type,
    custom_label: s.customLabel,
    date: s.date,
    mileage: s.mileage,
    cost: s.cost,
    shop: s.shop,
    notes: s.notes,
    deleted_at: null,
  };
}

export function reminderToRemote(r: ReminderRule): Record<string, unknown> {
  return {
    id: r.id,
    vehicle_id: r.vehicleId,
    service_type: r.serviceType,
    custom_label: r.customLabel,
    mileage_interval: r.mileageInterval,
    time_interval_days: r.timeIntervalDays,
    last_done_mileage: r.lastDoneMileage,
    last_done_date: r.lastDoneDate,
    deleted_at: null,
  };
}

export function issueToRemote(i: Issue): Record<string, unknown> {
  return {
    id: i.id,
    vehicle_id: i.vehicleId,
    title: i.title,
    description: i.description,
    severity: i.severity,
    status: i.status,
    created_at: i.createdAt,
    resolved_by_service_id: i.resolvedByServiceId,
    resolved_at: i.resolvedAt,
    deleted_at: null,
  };
}

export function noteToRemote(n: Note): Record<string, unknown> {
  return {
    id: n.id,
    vehicle_id: n.vehicleId,
    body: n.body,
    pinned: n.pinned,
    created_at: n.createdAt,
    deleted_at: null,
  };
}

export function mileageLogToRemote(m: MileageLog): Record<string, unknown> {
  return {
    id: m.id,
    vehicle_id: m.vehicleId,
    mileage: m.mileage,
    date: m.date,
    deleted_at: null,
  };
}
