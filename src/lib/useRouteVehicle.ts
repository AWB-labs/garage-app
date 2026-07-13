import { useLocalSearchParams } from 'expo-router';

import { useGarageStore } from '@/stores/garage';
import type { Vehicle } from './types';

/**
 * Resolves the car a section screen is about.
 *
 * The [id] segment belongs to the parent car route, so a tab screen only sees
 * it when the navigator hands the param down. Falling back to the active car
 * keeps every section populated even if that param goes missing, instead of
 * rendering an empty screen.
 */
export function useRouteVehicle(): { id: string; vehicle: Vehicle | null } {
  const params = useLocalSearchParams<{ id?: string }>();
  const activeVehicleId = useGarageStore((s) => s.activeVehicleId);
  const vehicles = useGarageStore((s) => s.vehicles);

  const id = params.id ?? activeVehicleId ?? '';
  const vehicle = vehicles.find((v) => v.id === id) ?? null;
  return { id: vehicle?.id ?? id, vehicle };
}
