const COLORS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "#FFF3E0", fg: "#E65100" },
  COMPLETED: { bg: "#E8F5E9", fg: "#2E7D32" },
  REJECTED: { bg: "#FFEBEE", fg: "#C62828" },
  CANCELLED: { bg: "#F5F5F5", fg: "#757575" },
};

export function StatusBadge({ status }: { status: string }) {
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
      {status || "PENDING"}
    </span>
  );
}
