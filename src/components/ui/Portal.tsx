import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Root-level portal. Fullscreen overlays (radial FAB bloom, expanding-card
 * clones) must render here: Android clips touches to parent bounds, so
 * children positioned outside their parent are untappable anywhere else.
 */

interface PortalEntry {
  id: string;
  node: React.ReactNode;
  modal: boolean;
}

interface PortalContextValue {
  mount: (id: string, node: React.ReactNode, modal: boolean) => void;
  unmount: (id: string) => void;
}

const PortalContext = React.createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<PortalEntry[]>([]);

  const mount = React.useCallback((id: string, node: React.ReactNode, modal: boolean) => {
    setEntries((prev) => [...prev.filter((e) => e.id !== id), { id, node, modal }]);
  }, []);

  const unmount = React.useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const value = React.useMemo(() => ({ mount, unmount }), [mount, unmount]);

  // iOS honors accessibilityViewIsModal on the overlay itself, but TalkBack has
  // no equivalent: the app behind a modal overlay stays focusable unless the
  // host is explicitly hidden from assistive tech while one is mounted.
  const hasModal = entries.some((e) => e.modal);

  return (
    <PortalContext.Provider value={value}>
      <View
        style={styles.host}
        importantForAccessibility={hasModal ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hasModal}
      >
        {children}
      </View>
      {entries.map((entry) => (
        <View key={entry.id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {entry.node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

export interface PortalProps {
  id: string;
  /**
   * Traps assistive-tech focus in this overlay while it is mounted. Set it for
   * anything that reads as a modal (the FAB bloom), not for passive veneers
   * like the expanding-card clone.
   */
  modal?: boolean;
  children: React.ReactNode;
}

/** Renders children into the root overlay layer. */
export function Portal({ id, modal = false, children }: PortalProps) {
  const ctx = React.useContext(PortalContext);
  if (!ctx) throw new Error('Portal must be used inside PortalProvider');
  const { mount, unmount } = ctx;

  React.useEffect(() => {
    mount(id, children, modal);
    return () => unmount(id);
  }, [id, modal, children, mount, unmount]);

  return null;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
