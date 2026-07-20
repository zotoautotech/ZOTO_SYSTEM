import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface SyncContextValue {
  lastSyncAt: number | null;
  sync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const AUTO_SYNC_MS = 5 * 60_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const syncingRef = useRef(false);

  function sync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    queryClient.invalidateQueries().finally(() => {
      syncingRef.current = false;
      setLastSyncAt(Date.now());
    });
  }

  useEffect(() => {
    sync();
    const id = setInterval(sync, AUTO_SYNC_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SyncContext.Provider value={{ lastSyncAt, sync }}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
