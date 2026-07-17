interface QuantityStepperProps {
  label: string;
  required?: boolean;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export function QuantityStepper({ label, required, value, onChange }: QuantityStepperProps) {
  const v = value ?? 0;
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: "var(--color-error)" }}> *</span>}
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
        }}
      >
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          style={{ flex: 1, border: "none", outline: "none", padding: "12px 14px", fontSize: 14 }}
        />
        <button
          type="button"
          onClick={() => onChange(Math.max(0, v - 1))}
          style={{ border: "none", background: "none", padding: "0 14px", fontSize: 18, cursor: "pointer" }}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onChange(v + 1)}
          style={{ border: "none", background: "none", padding: "0 14px", fontSize: 18, cursor: "pointer" }}
        >
          +
        </button>
      </div>
    </div>
  );
}
