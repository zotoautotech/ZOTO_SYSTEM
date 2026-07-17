interface PercentInputProps {
  label: string;
  required?: boolean;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

export function PercentInput({ label, required, value, onChange }: PercentInputProps) {
  const invalid = value !== undefined && (value < 0 || value > 100);

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
          border: `1px solid ${invalid ? "var(--color-error)" : "var(--color-border)"}`,
          borderRadius: "var(--radius)",
          padding: "0 14px",
        }}
      >
        <span style={{ color: "var(--color-text-muted)", marginRight: 6 }}>%</span>
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          style={{ flex: 1, border: "none", outline: "none", padding: "12px 0", fontSize: 14 }}
        />
      </div>
      {invalid && <p className="field-error">⚠ This entry is invalid</p>}
    </div>
  );
}
