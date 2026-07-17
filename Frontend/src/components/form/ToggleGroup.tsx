interface Option<T extends string> {
  value: T;
  label: string;
}

interface ToggleGroupProps<T extends string> {
  label: string;
  required?: boolean;
  value: T | "";
  onChange: (value: T) => void;
  options: Option<T>[];
}

export function ToggleGroup<T extends string>({
  label,
  required,
  value,
  onChange,
  options,
}: ToggleGroupProps<T>) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: "var(--color-error)" }}> *</span>}
      </label>
      <div style={{ display: "flex", gap: 0, borderRadius: "var(--radius)", overflow: "hidden" }}>
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1,
                padding: "12px 8px",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid var(--color-border)",
                borderLeft: i === 0 ? "1px solid var(--color-border)" : "none",
                background: active ? "var(--color-primary)" : "var(--color-bg)",
                color: active ? "#fff" : "var(--color-text)",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
