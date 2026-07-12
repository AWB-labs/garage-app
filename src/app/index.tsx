import { Redirect } from 'expo-router';
import React from 'react';

import { useGarageStore } from '@/stores/garage';

/** Straight to the active car's dashboard; the garage is one tap away. */
export default function Index() {
  const activeVehicleId = useGarageStore((s) => s.activeVehicleId);
  if (activeVehicleId) {
    return <Redirect href={{ pathname: '/car/[id]', params: { id: activeVehicleId } }} />;
  }
  return <Redirect href="/garage" />;
}
