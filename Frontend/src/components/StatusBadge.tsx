const COLORS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "#FFF3E0", fg: "#E65100" },
  COMPLETED: { bg: "#E8F5E9", fg: "#2E7D32" },
  REJECTED: { bg: "#FFEBEE", fg: "#C62828" },
  CANCELLED: { bg: "#FFEBEE", fg: "#C62828" },
  // The raw ORDER_PUNCH status stays the literal "SALE ORDER" everywhere in the backend
  // (revertOrphanedSaleOrder, SO Confirmation, etc. all key off that exact string) — this is
  // purely a display colour for it, keyed on the same literal.
  "SALE ORDER": { bg: "#E8F5E9", fg: "#2E7D32" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const c = COLORS[status] ?? COLORS.PENDING;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {label || status || "PENDING"}
    </span>
  );
}
