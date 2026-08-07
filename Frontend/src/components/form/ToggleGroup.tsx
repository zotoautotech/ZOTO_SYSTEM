import { useRef, useState } from "react";

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

/** Find the next focusable element in the page's natural tab order after `from`, and focus
 * it. Only queried once, at the moment Enter is pressed inside a ToggleGroup — this is NOT
 * a persistent/global listener, so it can't repeat the bug that broke SearchableSelect
 * earlier (a document-level mousedown listener that fired — and stole focus — on every
 * click anywhere on the page, even when its own dropdown was closed). `.tabIndex !== -1`
 * excludes this same ToggleGroup's own non-active roving-tabindex siblings (see below). */
function focusNextTabbable(from: HTMLElement) {
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
  const idx = focusable.indexOf(from);
  if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1].focus();
}

/** Tally-style keyboard navigation, mouse unchanged: Left/Right (or Up/Down) arrows move a
 * "roving" highlight between options without selecting anything yet (standard ARIA
 * radiogroup pattern — only the highlighted option is a Tab stop at any given time, via
 * tabIndex 0/-1, so Tab moves straight to/from the group instead of stepping through every
 * option). Enter or Space commits the highlighted option (calls onChange, same as a mouse
 * click) and then jumps focus to the next field in the form — so a doer can fill an entire
 * multi-toggle tab without ever touching the mouse, exactly like Tally. */
export function ToggleGroup<T extends string>({
  label,
  required,
  value,
  onChange,
  options,
}: ToggleGroupProps<T>) {
  const committedIndex = options.findIndex((o) => o.value === value);
  const [focusedIndex, setFocusedIndex] = useState(committedIndex >= 0 ? committedIndex : 0);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(nextIndex: number) {
    const clamped = Math.max(0, Math.min(options.length - 1, nextIndex));
    setFocusedIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(i - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(options[i].value);
      // Selecting an option can conditionally reveal a new field right after this group
      // (e.g. "Advance Payment (%)" only appears once Payment Type = Advance) — that field
      // doesn't exist in the DOM yet at this exact synchronous instant, since React hasn't
      // committed the re-render triggered by the onChange() call above. Deferring one frame
      // lets that render land first, so the newly-revealed field is actually there to jump to.
      const target = e.currentTarget;
      requestAnimationFrame(() => focusNextTabbable(target));
    }
  }

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
              ref={(el) => { buttonRefs.current[i] = el; }}
              type="button"
              tabIndex={i === focusedIndex ? 0 : -1}
              onClick={() => {
                setFocusedIndex(i);
                onChange(opt.value);
              }}
              onKeyDown={(e) => handleKeyDown(e, i)}
              style={{
                flex: 1,
                padding: "12px 8px",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid var(--color-border)",
                borderLeft: i === 0 ? "1px solid var(--color-border)" : "none",
                outline: i === focusedIndex ? undefined : "none",
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
