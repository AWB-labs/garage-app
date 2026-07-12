import type { Issue, MileageLog, Note, ServiceRecord } from './types';

export type TimelineEventKind = 'service' | 'issue' | 'note' | 'mileage';

export type TimelineEvent =
  | { id: string; kind: 'service'; date: string; service: ServiceRecord }
  | { id: string; kind: 'issue'; date: string; issue: Issue }
  | { id: string; kind: 'note'; date: string; note: Note }
  | { id: string; kind: 'mileage'; date: string; mileage: MileageLog };

/** Unified per-car feed, newest first. */
export function buildTimeline(
  vehicleId: string,
  services: ServiceRecord[],
  issues: Issue[],
  notes: Note[],
  mileageLogs: MileageLog[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const s of services) {
    if (s.vehicleId === vehicleId) events.push({ id: `service-${s.id}`, kind: 'service', date: s.date, service: s });
  }
  for (const i of issues) {
    if (i.vehicleId === vehicleId) events.push({ id: `issue-${i.id}`, kind: 'issue', date: i.createdAt, issue: i });
  }
  for (const n of notes) {
    if (n.vehicleId === vehicleId) events.push({ id: `note-${n.id}`, kind: 'note', date: n.createdAt, note: n });
  }
  for (const m of mileageLogs) {
    if (m.vehicleId === vehicleId) events.push({ id: `mileage-${m.id}`, kind: 'mileage', date: m.date, mileage: m });
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
