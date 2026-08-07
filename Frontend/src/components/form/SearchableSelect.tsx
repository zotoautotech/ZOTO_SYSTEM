import { useEffect, useRef, useState } from "react";
import { focusNextField, focusPrevField } from "../../lib/keyboardNav";

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

/** Keyboard support (so doers can fill this without a mouse): the trigger is a real
 * <button>, so Tab reaches it and Enter/Space already opens it natively. Once open, the
 * search input is autofocused and ArrowDown/ArrowUp move a highlighted row, Enter picks
 * the highlighted row (or the "Add New" row when nothing is highlighted and it's the only
 * option), and Escape closes the dropdown and returns focus to the trigger button so Tab
 * order continues exactly where it left off — no click ever required. */
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
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) =>
    `${o.label} ${o.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );
  // "Add New" occupies row 0 when present, pushing option rows down by one.
  const rowCount = filtered.length + (onAddNew ? 1 : 0);

  // Bug fixed here: this used to call closeAndReturnFocus() — which also calls
  // triggerRef.current?.focus() — for EVERY mousedown anywhere on the page, even when this
  // particular dropdown was never open (the listener is mounted per-instance and isn't
  // scoped to `open`). Focusing an off-screen field makes the browser auto-scroll the page
  // to it, so every click anywhere (e.g. an unrelated ToggleGroup button) yanked the page
  // down to wherever this field happened to sit and stole the click. A plain outside click
  // should just close quietly with no focus/scroll side effect — only an intentional
  // keyboard action (Escape, selecting a row) should return focus to the trigger.
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  useEffect(() => {
    optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function openDropdown() {
    setOpen(true);
  }

  function closeAndReturnFocus() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function selectRow(index: number) {
    if (onAddNew && index === 0) {
      setOpen(false);
      setQuery("");
      onAddNew();
      return;
    }
    const opt = filtered[onAddNew ? index - 1 : index];
    if (!opt) return;
    onChange(opt.value, opt);
    closeAndReturnFocus();
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      openDropdown();
    } else if (!open && e.key === "PageDown") {
      e.preventDefault();
      focusNextField(e.currentTarget);
    } else if (!open && e.key === "PageUp") {
      e.preventDefault();
      focusPrevField(e.currentTarget);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rowCount > 0) selectRow(highlighted);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndReturnFocus();
    } else if (e.key === "Tab") {
      // Let Tab move focus onward naturally instead of trapping it inside the dropdown.
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div style={{ marginBottom: 20, position: "relative" }} ref={rootRef}>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: "var(--color-error)" }}> *</span>}
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
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
          role="listbox"
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
            onKeyDown={handleInputKeyDown}
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
              ref={(el) => { optionRefs.current[0] = el; }}
              type="button"
              onClick={() => selectRow(0)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                background: highlighted === 0 ? "var(--color-primary-tint)" : "var(--color-bg)",
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
          {filtered.map((opt, i) => {
            const rowIndex = onAddNew ? i + 1 : i;
            return (
              <button
                key={opt.value}
                ref={(el) => { optionRefs.current[rowIndex] = el; }}
                type="button"
                onClick={() => selectRow(rowIndex)}
                role="option"
                aria-selected={opt.value === value}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  background:
                    highlighted === rowIndex
                      ? "var(--color-primary-tint)"
                      : opt.value === value
                      ? "var(--color-bg-page)"
                      : "var(--color-bg)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <div>{opt.label}</div>
                {opt.subtitle && (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{opt.subtitle}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
