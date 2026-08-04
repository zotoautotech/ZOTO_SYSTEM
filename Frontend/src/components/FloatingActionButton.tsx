/** Mobile-only "+" action, fixed to the bottom-right corner — matches the old AppSheet
 * reference's own floating add button instead of squeezing another small square icon button
 * into the already-crowded header actions row (Completed…/Filter/Select all competing for
 * space there on a phone-width screen). Desktop keeps the inline header button as-is. */
export function FloatingActionButton({ onClick, ariaLabel = "New" }: { onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        position: "fixed",
        right: 20,
        bottom: 24,
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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
