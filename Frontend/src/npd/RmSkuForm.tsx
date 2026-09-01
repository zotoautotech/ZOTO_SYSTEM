import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createTaxonomyRow } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: (id: string) => void;
}

/** "Raw Material SKU Form" — matches the real legacy AppSheet reference field-for-field
 * (PART NO. auto-computed/read-only, Category, Sub Category, Vendor Name, Paint, Make By
 * toggle) AND its measured layout: a panel docked to the right edge of the screen, X +
 * left-aligned title in a 72px header, fields in a column with 120px-equivalent left padding
 * from the drawer edge (NOT centered), 53px field height, ~28px gap between fields, Cancel/
 * Save in a footer bar — a deliberate exception to `FormModal.tsx`'s usual fixed-size
 * centered-modal convention (see CLAUDE.md), built custom for this one form to match the
 * reference screenshot, not the centered-modal shape every other form in this app uses.
 *
 * **Horizontal sizing is `vw`-based, not fixed px** — verified against a live DevTools
 * `getBoundingClientRect()` measurement (via a temporary unauthenticated route, since this
 * form normally sits behind login — added, measured, and removed in the same pass, never
 * shipped), not another screenshot read. At `window.innerWidth: 1917`: drawer
 * `min(55.45vw, 1120px)` measures `1062.97px` (target `1063px`) starting at `x: 854.03`
 * (target `854`); the field column starts at `x: 974.03` (target `974`, i.e. the drawer's
 * own `11.29%` left padding lands exactly right). **The field column itself was the one
 * genuinely broken value** — `width: "51%"` measured only `468.67px`, not the intended
 * `≈542px`, because CSS `%` width resolves against the element's own immediate containing
 * block (the *padded* content wrapper, already narrowed by the drawer's left/right padding),
 * not the drawer two levels up — the same trap a plain `%` will hit again if reintroduced
 * anywhere in this form. Fixed by sizing the field column directly off the viewport instead
 * (`min(28.27vw, 571px)`, the equivalent `542/1917` ratio, re-verified to measure
 * `541.92px` — matches). `PART NO.` is
 * never shown here as an input — the backend computes it
 * server-side from the real, verified App Formula (services/npdPartCode.ts's
 * generateRmPartCode()) once the row is created, matching `computedFields` on the `rm-sku`
 * taxonomy table entry the same way every other computed-field table already works.
 *
 * **Make By's two options are "ZOTO"/"SUPPLIER", not "ADC"/"SUPPLIER"** — the old reference
 * screenshot (from the legacy "Copy of ADC" spreadsheet, ADC being this business's old company
 * name before its ZOTO rebrand) shows a button labelled "ADC", but the live production
 * `Alphabet` tab this formula actually looks up against (`MAKED BY`/`MAKED CODE` columns) has
 * already been updated to store `"ZOTO"` for that same row (`MAKED CODE: "0"`) — confirmed by
 * reading the live tab directly, not assumed from the stale screenshot. Sending "ADC" 422s:
 * neither of the real formula's two lookup branches can resolve it. */
export function RmSkuForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [paint, setPaint] = useState("");
  const [makeBy, setMakeBy] = useState<"ZOTO" | "SUPPLIER">("ZOTO");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Escape closes the panel from anywhere inside it, matching FormModal.tsx's own convention.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const { data: categoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category"],
    queryFn: () => listTaxonomyRows("rm-category"),
  });
  const { data: subCategoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category-dd"],
    queryFn: () => listTaxonomyRows("rm-category-dd"),
  });
  const { data: paintRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-paint"],
    queryFn: () => listTaxonomyRows("rm-paint"),
  });

  const categoryOptions: SelectOption[] = categoryRows.map((r) => ({ value: r.CATEGORY, label: r.CATEGORY }));
  // Sub Category is scoped to the picked Category, same dependent-dropdown pattern as the
  // punch form's own Category/Sub Category selects elsewhere in this app.
  const subCategoryOptions: SelectOption[] = subCategoryRows
    .filter((r) => !category || r.Category === category)
    .map((r) => ({ value: r["SUB CATEGORY"], label: r["SUB CATEGORY"] }));
  const paintOptions: SelectOption[] = paintRows.map((r) => ({ value: r["Paint Description"], label: r["Paint Description"] }));

  function canSave() {
    return !!category && !!subCategory && !!vendorName && !!paint && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      const result = await createTaxonomyRow("rm-sku", {
        Category: category,
        "Sub Category": subCategory,
        "VENDOR NAME": vendorName,
        Paint: paint,
        "MAKE BY": makeBy,
      });
      onSaved(result.id);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
      {/* Scoped to this one form, not the shared TextField/SearchableSelect components
          themselves (those are used app-wide — changing their defaults globally would be a
          much bigger, unrequested visual change). Square corners (no border-radius, unlike
          this app's usual rounded fields) matching the reference form's own field boxes —
          but the bold border is ONLY on focus/touch, same idle border as every other form in
          this app the rest of the time (an earlier pass here wrongly made it always-on). */}
      <style>{`
        .rm-sku-form input,
        .rm-sku-form button[aria-haspopup="listbox"] {
          border-radius: 0 !important;
          height: 53px !important;
          box-sizing: border-box;
        }
        .rm-sku-form input:focus,
        .rm-sku-form button[aria-haspopup="listbox"]:focus-visible {
          outline: none;
          border: 1.5px solid var(--color-text) !important;
        }
        /* The SearchableSelect's own open dropdown panel has an unrelated search input with
           its own borderless/bottom-border-only design — excluded from the rules above, not
           just left to lose the specificity fight against them. */
        .rm-sku-form [role="listbox"] input {
          border: none !important;
          border-bottom: 1px solid var(--color-border) !important;
          border-radius: 0 !important;
          height: auto !important;
        }
        /* Vertical gap between fields (~28px) and label-to-field gap (~11px) — measured off
           the real reference form, overriding TextField's/SearchableSelect's own shared
           20px/8px defaults. Each field call renders one div as its own root element with one
           label inside, both direct children of .rm-sku-fields, so this catches all of them
           uniformly without needing to touch either shared component. */
        .rm-sku-fields > div {
          margin-bottom: 28px !important;
        }
        .rm-sku-fields > div > label {
          margin-bottom: 11px !important;
        }
      `}</style>
      <div
        className="rm-sku-form"
        style={{
          position: "relative",
          // Percentage-based, not a fixed px width — the previous fixed-px pass (1063px)
          // still didn't match on re-check, and there's no reliable way from here to tell
          // whether that was a real bug or a screenshot-scaling artifact (the user couldn't
          // confirm via DevTools). Using the same ratio (1063/1917 ≈ 55.45% of the viewport,
          // the exact numbers the user originally measured) makes this scale-correct
          // regardless of the actual screen/window size, which a fixed px value can't do.
          width: isMobile ? "100%" : "min(55.45vw, 1120px)",
          height: "100%",
          background: "var(--color-bg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            height: 72,
            flexShrink: 0,
            padding: "0 24px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
          {/* Left-aligned next to the close icon, matching the reference — not centered in
              the browser (an earlier pass here wrongly absolute-centered it). */}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, whiteSpace: "nowrap" }}>Raw Material SKU Form</h2>
        </div>

        {/* Left-padded-not-centered was matched pixel-for-pixel to the AppSheet reference on
            request, but left a visibly lopsided empty gap on the right that the user then
            asked to fix by centering instead — reverted to centering the field column in the
            available width rather than pinning it to a fixed left offset. */}
        <div style={{ padding: isMobile ? "24px var(--space)" : "24px", overflowY: "auto", flex: 1 }}>
        <div className="rm-sku-fields" style={{ width: isMobile ? "100%" : "min(28.27vw, 571px)", minWidth: isMobile ? undefined : 420, maxWidth: "100%", margin: isMobile ? undefined : "0 auto" }}>
          {/* PART NO. is required on the real live column even though this form never lets a
              doer type it — server-computed on Save (see this file's module doc comment) — so
              it gets the same red-asterisk "required" treatment as the reference form's own
              read-only PART NO. field, just without a fake length-validation message: this
              form's PART NO. is never invalid, since it's never hand-typed here. */}
          <TextField label="PART NO." required value="" placeholder="Generated on Save" disabled />
          <SearchableSelect
            label="Category"
            required
            value={category}
            onChange={(value) => {
              setCategory(value);
              setSubCategory("");
            }}
            options={categoryOptions}
            placeholder="Select Category…"
          />
          <SearchableSelect
            label="Sub Category"
            required
            value={subCategory}
            onChange={setSubCategory}
            options={subCategoryOptions}
            placeholder={category ? "Select Sub Category…" : "Pick a Category first"}
          />
          {/* Free text, not a SearchableSelect off the `vendor-master` taxonomy table — that
              table has no rows yet in production, and the real RM SKU rows' own VENDOR NAME
              values (e.g. "NISIKI INDIA PRIVATE LIMITED") are plain text on the SKU row itself,
              not a ref into Vendor Master. Label matches the live sheet's own ALL-CAPS header
              text exactly (unlike Category/Sub Category/Paint, which are real Title Case
              headers) — same discipline as every other field label in this app. The inline "+"
              is decorative, matching the reference form's own icon — there's no separate
              "add a new vendor" flow to open, since typing a new name here already works. */}
          <div>
            <label style={{ display: "block", fontSize: 14, marginBottom: 11 }}>
              VENDOR NAME<span style={{ color: "var(--color-error)" }}> *</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 40px 12px 14px",
                  borderRadius: 0,
                  border: "1px solid var(--color-border)",
                  fontSize: 14,
                }}
              />
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-text-muted)",
                  fontSize: 16,
                  pointerEvents: "none",
                }}
              >
                +
              </span>
            </div>
          </div>
          <SearchableSelect label="Paint" required value={paint} onChange={setPaint} options={paintOptions} placeholder="Select Paint…" />
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 11 }}>
              MAKE BY <span style={{ color: "var(--color-error)" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 1, width: "100%", height: 47, background: "var(--color-border)", border: "1px solid var(--color-border)" }}>
              {(["ZOTO", "SUPPLIER"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMakeBy(option)}
                  style={{
                    flex: 1,
                    border: "none",
                    cursor: "pointer",
                    background: makeBy === option ? "var(--color-primary)" : "var(--color-bg)",
                    color: makeBy === option ? "#fff" : "var(--color-text)",
                    fontWeight: 500,
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          {error && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{error}</p>}

          {/* The reference form's "Drawing RM entries that reference this entry in the
              AGAINST ID column" reverse-ref block, kept for visual parity. Purely decorative
              here — AGAINST ID is the dead-pointer formula documented on RM ref Category/
              Category DD above (a live, constantly-shifting pointer to "whichever SKU was
              created most recently app-wide", not a real link to THIS SKU), and this is a
              brand-new row that can't have anything pointing at it yet regardless — same
              reasoning the reference form's own "New" button always starts empty here too. */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
              Drawing RM entries that reference this entry in the AGAINST ID column
            </p>
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
                padding: "10px 0",
                textAlign: "center",
                background: "var(--color-bg-page)",
                color: "var(--color-text-muted)",
                fontSize: 14,
              }}
            >
              New
            </div>
          </div>
        </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 54,
            padding: "0 var(--space)",
            boxSizing: "border-box",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-page)",
          }}
        >
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
