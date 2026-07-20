import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface HeaderActionsContextValue {
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <HeaderActionsContext.Provider value={{ actions, setActions }}>{children}</HeaderActionsContext.Provider>
  );
}

export function useHeaderActions() {
  const ctx = useContext(HeaderActionsContext);
  if (!ctx) throw new Error("useHeaderActions must be used within HeaderActionsProvider");
  return ctx;
}

/** Page-local hook: registers `node` as the top-right breadcrumb-row actions while mounted. */
export function useSetHeaderActions(node: ReactNode) {
  const { setActions } = useHeaderActions();
  useEffect(() => {
    setActions(node);
    return () => setActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);
}
