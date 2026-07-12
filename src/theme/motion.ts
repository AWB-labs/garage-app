import { useReducedMotion } from 'react-native-reanimated';

import { durations, springs, staggerStep } from './tokens';

/**
 * Central motion policy. Every signature moment reads its reduce-motion
 * fallback from here so the behavior table in DESIGN.md stays enforced
 * in one place.
 */
export interface Motion {
  /** True when the OS asks for reduced motion. */
  reduced: boolean;
  /** Spring configs; callers pass these to withSpring. */
  springs: typeof springs;
  /** Entrance delay for the item at `index` in a choreographed group. 0 when reduced. */
  stagger: (index: number) => number;
  /** Fade duration for non-touched transitions. Fast when reduced. */
  fadeDuration: number;
}

export function useMotion(): Motion {
  const reduced = useReducedMotion();
  return {
    reduced,
    springs,
    stagger: (index: number) => (reduced ? 0 : index * staggerStep),
    fadeDuration: reduced ? durations.fadeFast : durations.fade,
  };
}

export { springs, staggerStep, durations };
