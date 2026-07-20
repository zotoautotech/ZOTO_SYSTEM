interface CustomerFilterPanelProps {
  customers: { name: string; count: number }[];
  active: string | null;
  onSelect: (name: string | null) => void;
}

export function CustomerFilterPanel({ customers, active, onSelect }: CustomerFilterPanelProps) {
  return (
    <div style={{ width: "var(--filter-width)", flexShrink: 0, padding: "8px 8px 8px 0" }}>
      <FilterRow label="All" active={active === null} onClick={() => onSelect(null)} />
      {customers.map((c) => (
        <FilterRow
          key={c.name}
          label={c.name}
          count={c.count}
          active={active === c.name}
          onClick={() => onSelect(c.name)}
        />
      ))}
    </div>
  );
}

function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        border: "none",
        borderRadius: 6,
        background: active ? "var(--color-primary-tint)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--color-text)",
        fontSize: 14,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          style={{
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: 12,
            color: "var(--color-text-muted)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
