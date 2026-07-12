import { format, startOfMonth, subMonths } from 'date-fns';

import type { ServiceRecord, ServiceType } from './types';
import { serviceLabel } from './types';

export interface MonthSpend {
  /** 'yyyy-MM'. */
  month: string;
  /** Short display label, e.g. 'Jul'. */
  label: string;
  total: number;
}

export interface TypeSpend {
  type: ServiceType;
  label: string;
  total: number;
  count: number;
}

export interface YearCount {
  year: number;
  count: number;
}

export function totalSpent(services: ServiceRecord[]): number {
  return services.reduce((sum, s) => sum + (s.cost ?? 0), 0);
}

/** Last `months` calendar months including the current one, oldest first. */
export function spendByMonth(services: ServiceRecord[], months = 12, now: Date = new Date()): MonthSpend[] {
  const buckets: MonthSpend[] = [];
  const index = new Map<string, MonthSpend>();
  for (let i = months - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(now, i));
    const key = format(d, 'yyyy-MM');
    const bucket: MonthSpend = { month: key, label: format(d, 'MMM'), total: 0 };
    buckets.push(bucket);
    index.set(key, bucket);
  }
  for (const s of services) {
    if (s.cost == null) continue;
    const bucket = index.get(s.date.slice(0, 7));
    if (bucket) bucket.total += s.cost;
  }
  return buckets;
}

export function servicesPerYear(services: ServiceRecord[]): YearCount[] {
  const byYear = new Map<number, number>();
  for (const s of services) {
    const year = Number(s.date.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  return [...byYear.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

/** Spend grouped by service type, largest first. Custom types group by their label. */
export function costByType(services: ServiceRecord[]): TypeSpend[] {
  const byKey = new Map<string, TypeSpend>();
  for (const s of services) {
    const label = serviceLabel(s.type, s.customLabel);
    const key = `${s.type}:${label}`;
    const entry = byKey.get(key) ?? { type: s.type, label, total: 0, count: 0 };
    entry.total += s.cost ?? 0;
    entry.count += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total);
}
