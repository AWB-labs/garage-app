/**
 * A one line seam between the write path and the sync engine.
 *
 * The DAO queues a row and wants to say "there is something to push", but the
 * engine already imports the stores that call the DAO. Importing it back would
 * close a cycle. Instead the engine registers itself here while it is running
 * and the DAO calls a function that does nothing when no engine is listening,
 * which is exactly the behaviour a build with no backend needs anyway.
 */

type Listener = () => void;

const DEBOUNCE_MS = 1500;

let listener: Listener | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function setSyncListener(fn: Listener | null): void {
  listener = fn;
  if (!fn && timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * Coalesces a burst of writes into one sync. Logging a service touches the
 * record, the reminder anchors, and the odometer in quick succession, and
 * those should leave as a single push rather than three.
 */
export function nudgeSync(): void {
  if (!listener) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    listener?.();
  }, DEBOUNCE_MS);
}
