import * as Haptics from 'expo-haptics';

/**
 * Semantic haptics. Haptics punctuate meaning: save, complete, detents,
 * destructive confirms. Never on scroll. All calls are fire-and-forget.
 */
const quiet = (p: Promise<void>) => {
  p.catch(() => {});
};

export const haptic = {
  /** Successful save or completion. */
  save: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Destructive confirmation moment. */
  warn: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Picker detents, segmented selections, dial stops. */
  select: () => quiet(Haptics.selectionAsync()),
  /** A single soft mechanical tick (odometer settle). */
  tick: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Primary press acknowledgment (FAB open, sheet confirm). */
  press: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
