import { addDays, differenceInCalendarDays } from 'date-fns';

import type { ReminderRule, Vehicle } from './types';
import { serviceLabel } from './types';

export type ReminderState = 'upcoming' | 'dueSoon' | 'overdue';

export const REMINDER_STATE_LABELS: Record<ReminderState, string> = {
  upcoming: 'Upcoming',
  dueSoon: 'Due soon',
  overdue: 'Overdue',
};

/** Due soon inside these windows. */
export const DUE_SOON_KM = 1000;
export const DUE_SOON_DAYS = 14;

export interface ReminderStatus {
  rule: ReminderRule;
  state: ReminderState;
  /** Km until due (negative when overdue). Null when no mileage anchor. */
  kmLeft: number | null;
  /** Days until due (negative when overdue). Null when no time anchor. */
  daysLeft: number | null;
  /** 0..1 progress toward due, the max of the two tracks, clamped. */
  progress: number;
  label: string;
}

export function reminderStatus(rule: ReminderRule, vehicle: Vehicle, now: Date = new Date()): ReminderStatus {
  let kmLeft: number | null = null;
  let kmProgress = 0;
  if (rule.mileageInterval != null && rule.lastDoneMileage != null) {
    const dueAt = rule.lastDoneMileage + rule.mileageInterval;
    kmLeft = dueAt - vehicle.currentMileage;
    kmProgress = (vehicle.currentMileage - rule.lastDoneMileage) / rule.mileageInterval;
  }

  let daysLeft: number | null = null;
  let timeProgress = 0;
  if (rule.timeIntervalDays != null && rule.lastDoneDate != null) {
    const last = new Date(rule.lastDoneDate);
    const dueDate = addDays(last, rule.timeIntervalDays);
    daysLeft = differenceInCalendarDays(dueDate, now);
    timeProgress = differenceInCalendarDays(now, last) / rule.timeIntervalDays;
  }

  const overdue = (kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0);
  const dueSoon =
    !overdue &&
    ((kmLeft != null && kmLeft <= DUE_SOON_KM) || (daysLeft != null && daysLeft <= DUE_SOON_DAYS));

  return {
    rule,
    state: overdue ? 'overdue' : dueSoon ? 'dueSoon' : 'upcoming',
    kmLeft,
    daysLeft,
    progress: Math.min(1, Math.max(0, Math.max(kmProgress, timeProgress))),
    label: serviceLabel(rule.serviceType, rule.customLabel),
  };
}

/** Sorted most-urgent first: overdue, due soon, then by progress. */
export function sortByUrgency(statuses: ReminderStatus[]): ReminderStatus[] {
  const rank: Record<ReminderState, number> = { overdue: 0, dueSoon: 1, upcoming: 2 };
  return [...statuses].sort((a, b) => rank[a.state] - rank[b.state] || b.progress - a.progress);
}
