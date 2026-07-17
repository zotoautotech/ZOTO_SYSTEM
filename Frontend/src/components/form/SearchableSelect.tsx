import { useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SearchableSelectProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string, option?: SelectOption) => void;
  options: SelectOption[];
  placeholder?: string;
  loading?: boolean;
  addNewLabel?: string;
  onAddNew?: () => void;
}

export function SearchableSelect({
  label,
  required,
  value,
  onChange,
  options,
  placeholder = "Search…",
  loading,
  addNewLabel,
  onAddNew,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    `${o.label} ${o.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div style={{ marginBottom: 20, position: "relative" }} ref={rootRef}>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: "var(--color-error)" }}> *</span>}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--color-border)",
          background: "var(--color-bg)",
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: selected ? "var(--color-text)" : "var(--color-text-muted)" }}>
          {selected ? selected.label : loading ? "Loading…" : placeholder}
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>▾</span>
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            marginTop: 4,
            maxHeight: 280,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "none",
              borderBottom: "1px solid var(--color-border)",
              outline: "none",
              fontSize: 14,
            }}
          />
          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                background: "var(--color-primary-tint)",
                color: "var(--color-primary)",
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              + {addNewLabel ?? "Add New"}
            </button>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, color: "var(--color-text-muted)" }}>
              No matches
            </div>
          )}
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value, opt);
                setOpen(false);
                setQuery("");
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                background: opt.value === value ? "var(--color-primary-tint)" : "var(--color-bg)",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <div>{opt.label}</div>
              {opt.subtitle && (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{opt.subtitle}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
