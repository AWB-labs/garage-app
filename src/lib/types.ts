/** Domain model. Mileage is always stored in kilometers; display converts. */

export type ServiceType =
  | 'oil'
  | 'tires'
  | 'brakes'
  | 'filters'
  | 'battery'
  | 'inspection'
  | 'custom';

export const SERVICE_TYPES: ServiceType[] = [
  'oil',
  'tires',
  'brakes',
  'filters',
  'battery',
  'inspection',
  'custom',
];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  oil: 'Oil change',
  tires: 'Tires',
  brakes: 'Brakes',
  filters: 'Filters',
  battery: 'Battery',
  inspection: 'Inspection',
  custom: 'Custom',
};

export function serviceLabel(type: ServiceType, customLabel?: string | null): string {
  return type === 'custom' && customLabel ? customLabel : SERVICE_TYPE_LABELS[type];
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  nickname: string | null;
  photoUri: string | null;
  plate: string | null;
  vin: string | null;
  /** Kilometers. */
  currentMileage: number;
  createdAt: string;
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  type: ServiceType;
  customLabel: string | null;
  date: string;
  /** Kilometers at time of service. */
  mileage: number;
  cost: number | null;
  shop: string | null;
  notes: string | null;
  photoUris: string[];
}

export interface ReminderRule {
  id: string;
  vehicleId: string;
  serviceType: ServiceType;
  customLabel: string | null;
  /** Repeat every N kilometers. */
  mileageInterval: number | null;
  /** Repeat every N days. */
  timeIntervalDays: number | null;
  lastDoneMileage: number | null;
  lastDoneDate: string | null;
}

export type IssueSeverity = 'low' | 'medium' | 'critical';
export type IssueStatus = 'open' | 'monitoring' | 'fixed';

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  critical: 'Critical',
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  monitoring: 'Monitoring',
  fixed: 'Fixed',
};

export interface Issue {
  id: string;
  vehicleId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  photoUris: string[];
  createdAt: string;
  resolvedByServiceId: string | null;
  resolvedAt: string | null;
}

export interface Note {
  id: string;
  vehicleId: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MileageLog {
  id: string;
  vehicleId: string;
  /** Kilometers. */
  mileage: number;
  date: string;
}

export type ThemePreference = 'system' | 'dark' | 'light';
export type DistanceUnit = 'km' | 'mi';

export interface Settings {
  theme: ThemePreference;
  unit: DistanceUnit;
  /** ISO 4217 code, e.g. EGP, USD. */
  currency: string;
  /** Optional imagin.studio customer key for studio car renders. */
  carImageKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  unit: 'km',
  currency: 'EGP',
  carImageKey: '',
};
