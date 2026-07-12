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
}

interface PortalContextValue {
  mount: (id: string, node: React.ReactNode) => void;
  unmount: (id: string) => void;
}

const PortalContext = React.createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<PortalEntry[]>([]);

  const mount = React.useCallback((id: string, node: React.ReactNode) => {
    setEntries((prev) => [...prev.filter((e) => e.id !== id), { id, node }]);
  }, []);

  const unmount = React.useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const value = React.useMemo(() => ({ mount, unmount }), [mount, unmount]);

  return (
    <PortalContext.Provider value={value}>
      <View style={styles.host}>{children}</View>
      {entries.map((entry) => (
        <View key={entry.id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {entry.node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

/** Renders children into the root overlay layer. */
export function Portal({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = React.useContext(PortalContext);
  if (!ctx) throw new Error('Portal must be used inside PortalProvider');
  const { mount, unmount } = ctx;

  React.useEffect(() => {
    mount(id, children);
    return () => unmount(id);
  }, [id, children, mount, unmount]);

  return null;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
