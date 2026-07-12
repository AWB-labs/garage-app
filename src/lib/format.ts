import type { DistanceUnit } from './types';

const KM_PER_MILE = 1.609344;

export function kmToDisplay(km: number, unit: DistanceUnit): number {
  return unit === 'km' ? km : km / KM_PER_MILE;
}

export function displayToKm(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value : value * KM_PER_MILE;
}

function groupDigits(n: number): string {
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
  } catch {
    return Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

/** "48,250 km" or "29,982 mi". Input is always kilometers. */
export function formatMileage(km: number, unit: DistanceUnit): string {
  return `${groupDigits(Math.round(kmToDisplay(km, unit)))} ${unit}`;
}

/** Distance delta without unit conversion noise: "1,200 km left", handled by callers. */
export function formatDistance(km: number, unit: DistanceUnit): string {
  return formatMileage(km, unit);
}

/** "EGP 1,450". Whole units, no decimals: garage spend is not accounting. */
export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${groupDigits(amount)}`;
}
