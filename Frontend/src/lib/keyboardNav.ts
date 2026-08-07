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

/** When focus is inside a modal, field-to-field navigation has to stay inside it. The page
 * behind the overlay is still full of focusable table rows/nav links, and since FormModal
 * renders inline (not through a portal), those can sit either side of the modal in DOM
 * order — so an unscoped scan would happily walk focus out of the form the doer is filling
 * in. `.modal-in` is FormModal's own card class. */
function navRoot(from: HTMLElement): ParentNode {
  return from.closest(".modal-in") ?? document;
}

function focusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null);
}

/** Cancel/Prev/Next/Save all carry `.btn`; every actual field control does not (ToggleGroup's
 * options, SearchableSelect's trigger and FileDropzone's upload area are all classless or
 * role-based), so this cleanly separates "a form field" from "a form action". */
function isActionButton(el: HTMLElement): boolean {
  return el.classList.contains("btn");
}

/** Jump to the next focusable field after `from` in the page's natural tab order.
 *
 * One special case: when no real field remains ahead, `from` was the form's last field, and
 * the very next focusable is whichever action button comes first in the DOM — which is
 * Cancel, since the footer lays out Cancel-left/Save-right. A doer finishing the last field
 * and pressing Enter twice (the Tally reflex) would land on Cancel and throw away everything
 * they just typed. Land on the primary action instead so Enter actually saves. */
export function focusNextField(from: HTMLElement) {
  const focusable = focusableElements(navRoot(from));
  const idx = focusable.indexOf(from);
  if (idx < 0 || idx >= focusable.length - 1) return;

  const rest = focusable.slice(idx + 1);
  if (!rest.some((el) => !isActionButton(el))) {
    const primary = rest.find((el) => el.classList.contains("btn-primary"));
    if (primary) {
      primary.focus();
      return;
    }
  }
  rest[0].focus();
}

/** Jump to the previous focusable field before `from` (PageUp). */
export function focusPrevField(from: HTMLElement) {
  const focusable = focusableElements(navRoot(from));
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
