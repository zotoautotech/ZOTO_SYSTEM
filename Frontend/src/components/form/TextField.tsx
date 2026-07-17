import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string;
}

export function TextField({ label, required, error, style, ...rest }: TextFieldProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: "var(--color-error)" }}> *</span>}
      </label>
      <input
        {...rest}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: "var(--radius)",
          border: `1px solid ${error ? "var(--color-error)" : "var(--color-border)"}`,
          fontSize: 14,
          ...style,
        }}
      />
      {error && (
        <p style={{ color: "var(--color-error)", fontSize: 12, marginTop: 4 }}>⚠ {error}</p>
      )}
    </div>
  );
}
