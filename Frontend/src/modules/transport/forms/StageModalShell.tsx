import { useIsMobile } from "../../../lib/responsive";

/** Shared header/tab-bar chrome for the trip stage forms (Reached/Stock Release/Tax
 * Invoice/Dispatch/LR/Delivery) — same modal shell as StageForm.tsx, just reused directly
 * since each of these forms has enough bespoke conditional logic to not fit the single
 * config-driven StageForm pattern used for PDI. */
export function StageModalShell({
  title,
  tabLabel,
  onClose,
  children,
}: {
  title: string;
  tabLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17,17,20,0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            {tabLabel}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
