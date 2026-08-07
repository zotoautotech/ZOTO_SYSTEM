/** Shared Tally-style field-to-field keyboard navigation, used by every form field
 * component (TextField, PercentInput, QuantityStepper, SearchableSelect, ToggleGroup) so
 * the behavior is identical everywhere instead of being reimplemented per component.
 *
 * Deliberately NOT a persistent/global listener — every function here is called only once,
 * synchronously inside a specific field's own onKeyDown handler, in direct response to that
 * keypress. That's the one hard rule this module exists to enforce: a document-level
 * listener that runs on its own (e.g. on every click anywhere on the page) is exactly what
 * broke SearchableSelect's outside-click handler once already — it fired unconditionally on
 * every mousedown, even when its own dropdown was closed, and stole focus/scrolled the page
 * on unrelated clicks. Nothing here persists past the keypress that triggered it. */

function focusableElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
}

/** Jump to the next focusable field after `from` in the page's natural tab order. */
export function focusNextField(from: HTMLElement) {
  const focusable = focusableElements();
  const idx = focusable.indexOf(from);
  if (idx >= 0 && idx < focusable.length - 1) focusable[idx + 1].focus();
}

/** Jump to the previous focusable field before `from` (PageUp). */
export function focusPrevField(from: HTMLElement) {
  const focusable = focusableElements();
  const idx = focusable.indexOf(from);
  if (idx > 0) focusable[idx - 1].focus();
}

/** Standard onKeyDown handler for plain single-line fields (TextField, PercentInput,
 * QuantityStepper's own number input): Enter moves to the next field (matching Tally —
 * there's no "select" step needed for a plain text/number input, unlike ToggleGroup/
 * SearchableSelect, so Enter can advance immediately instead of needing a frame-deferred
 * jump). PageUp/PageDown move back/forward without needing Enter at all. Attach as
 * `onKeyDown={handleFieldNavKeyDown}` on any single-line `<input>`. */
export function handleFieldNavKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    focusNextField(e.currentTarget);
  } else if (e.key === "PageDown") {
    e.preventDefault();
    focusNextField(e.currentTarget);
  } else if (e.key === "PageUp") {
    e.preventDefault();
    focusPrevField(e.currentTarget);
  }
}

/** PageUp/PageDown only, generic over any focusable element — for custom controls (like
 * FileDropzone's upload area) that need Enter for their own action instead of "advance to
 * next field", but should still support the same field-to-field paging every other field
 * in the app does. */
export function handlePageNavKeyDown<T extends HTMLElement>(e: React.KeyboardEvent<T>) {
  if (e.key === "PageDown") {
    e.preventDefault();
    focusNextField(e.currentTarget);
  } else if (e.key === "PageUp") {
    e.preventDefault();
    focusPrevField(e.currentTarget);
  }
}
