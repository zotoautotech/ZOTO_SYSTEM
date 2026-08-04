import { useIsMobile } from "../lib/responsive";

/** Mobile-only "+" action, fixed to the bottom-right corner — matches the old AppSheet
 * reference's own floating add button instead of squeezing another small square icon button
 * into the already-crowded header actions row (Completed…/Filter/Select all competing for
 * space there on a phone-width screen). Desktop keeps the inline header button as-is.
 * `stackIndex` lets a page with more than one simultaneously-visible FAB (e.g. TripDetail's
 * "Attach Orders" + "Give Stage Form") stack them vertically instead of overlapping. */
export function FloatingActionButton({
  onClick,
  ariaLabel = "New",
  icon,
  stackIndex = 0,
}: {
  onClick: () => void;
  ariaLabel?: string;
  icon?: React.ReactNode;
  stackIndex?: number;
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        position: "fixed",
        right: 20,
        bottom: 24 + stackIndex * 68,
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "none",
        background: "var(--color-primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 14px rgba(229, 57, 53, 0.4)",
        zIndex: 20,
      }}
    >
      {icon ?? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  );
}

/** Shared "Give X Form"-style detail-page action, used by OrderDetail/PdiItemDetail/
 * DispatchApprovalItemDetail/TripDetail. Desktop keeps the old inline stacked
 * icon-circle-plus-label button near the top of the page (matches the reference AppSheet's
 * desktop-equivalent layout); mobile instead renders a fixed bottom-right circular FAB
 * (matches the AppSheet mobile reference's pencil-in-a-circle detail-view button) so the
 * action is reachable with a thumb instead of requiring a scroll back to the top. */
export function QuickAction({
  label,
  onClick,
  children,
  stackIndex = 0,
}: {
  label: string;
  onClick: () => void;
  children?: React.ReactNode;
  stackIndex?: number;
}) {
  const isMobile = useIsMobile();
  const iconPaths = children ?? (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  );

  if (isMobile) {
    return (
      <FloatingActionButton
        onClick={onClick}
        ariaLabel={label}
        stackIndex={stackIndex}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            {iconPaths}
          </svg>
        }
      />
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", width: 76 }}
    >
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {iconPaths}
        </svg>
      </span>
      <span style={{ fontSize: 12, color: "var(--color-text)", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
    </button>
  );
}
