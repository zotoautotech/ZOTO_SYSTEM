import { useIsMobile } from "../lib/responsive";

interface CustomerFilterPanelProps {
  customers: { name: string; count: number }[];
  active: string | null;
  onSelect: (name: string | null) => void;
  width?: number;
}

export function CustomerFilterPanel({ customers, active, onSelect, width }: CustomerFilterPanelProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="sheet-scroll" style={{ display: "flex", overflowX: "auto", width: "100%", gap: 8, padding: "8px 12px" }}>
        <FilterRow label="All" active={active === null} onClick={() => onSelect(null)} mobile />
        {customers.map((c) => (
          <FilterRow
            key={c.name}
            label={c.name}
            count={c.count}
            active={active === c.name}
            onClick={() => onSelect(c.name)}
            mobile
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: width ?? "var(--filter-width)", flexShrink: 0, padding: "8px 8px 8px 0" }}>
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
  mobile,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  mobile?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: mobile ? "auto" : "100%",
        flexShrink: mobile ? 0 : undefined,
        whiteSpace: mobile ? "nowrap" : undefined,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: mobile ? 6 : undefined,
        padding: "10px 12px",
        border: mobile ? "1px solid var(--color-border)" : "none",
        borderRadius: mobile ? 999 : 6,
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
