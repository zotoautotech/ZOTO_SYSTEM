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
 * segmented control) AND its exact styling per a detailed 12-point spec: a panel docked to
 * the right edge, `min(48.18vw, 925px)` wide (≈925/1920), a 64px title-only header, a 64px
 * footer bar for Cancel/Save (moved there, then briefly back to the header per the spec,
 * then back to the footer again on direct follow-up — footer is where they've landed),
 * 48px-tall rounded (6px) fields, ~30px gap between them. A deliberate exception to
 * `FormModal.tsx`'s usual fixed-size centered-modal convention (see CLAUDE.md), built custom
 * for this one form to match the reference.
 *
 * Colors here are literal hex from the spec, not this app's `--color-*` design tokens — the
 * spec calls out exact values (`#1A1A1A` text, `#D1D5DB` borders, `#C0392B` the selected/
 * primary red, `#F3F4F6`/`#F9FAFB` light greys) that don't necessarily match this app's own
 * theme variables (light vs dark mode, `--color-primary`'s actual red). Matches the
 * reference exactly in light mode; doesn't adapt to dark mode the way every other form in
 * this app does — a known, deliberate tradeoff of pixel-matching an external reference
 * rather than staying on this app's own theming system.
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
  // No default selection — a preselected ZOTO/SUPPLIER would have contributed its digit to
  // `livePartNo` below before the doer touched anything, showing a premature "0" with a
  // validation error on an otherwise-untouched form. Matches the reference's own required
  // (no default) Make By state.
  const [makeBy, setMakeBy] = useState<"ZOTO" | "SUPPLIER" | null>(null);
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
  // Needed only to compute PART NO.'s live preview below (the running per-prefix count) —
  // same table RmSkuCatalog.tsx already reads.
  const { data: rmSkuRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const categoryOptions: SelectOption[] = categoryRows.map((r) => ({ value: r.CATEGORY, label: r.CATEGORY }));
  // Sub Category is scoped to the picked Category, same dependent-dropdown pattern as the
  // punch form's own Category/Sub Category selects elsewhere in this app.
  const subCategoryOptions: SelectOption[] = subCategoryRows
    .filter((r) => !category || r.Category === category)
    .map((r) => ({ value: r["SUB CATEGORY"], label: r["SUB CATEGORY"] }));
  const paintOptions: SelectOption[] = paintRows.map((r) => ({ value: r["Paint Description"], label: r["Paint Description"] }));

  // PART NO. live preview — client-side mirror of the real, verified App Formula
  // (services/npdPartCode.ts's generateRmPartCode() on the backend is the actual source of
  // truth; this recomputes the same pieces from data already loaded for the dropdowns above,
  // purely so the field updates live as the doer picks Category/Sub Category/Paint/Make By,
  // matching the reference form's own "Auto Compute... instead of allowing user input"
  // behavior — confirmed directly off the reference's own field config screenshot). Each
  // piece resolves independently and concatenates as soon as its own inputs are picked, same
  // progressive fill the reference shows (e.g. "AA000" once only Category/Sub Category are
  // in, growing to the full 9 chars as Paint/Make By are picked too) — never sent to the
  // server; the actual create payload only ever carries the picked field values themselves
  // (see handleSave below), and the backend computes the real, final PART NO. independently.
  const categoryCode = categoryRows.find((r) => r.CATEGORY === category)?.CODE ?? "";
  const subCategoryCode =
    subCategoryRows.find((r) => r.Category === category && r["SUB CATEGORY"] === subCategory)?.CODE ?? "";
  const paintCode = paintRows.find((r) => r["Paint Description"] === paint)?.Code ?? "";
  // Matches the live `Alphabet` tab's own MAKED BY/MAKED CODE rows (ZOTO -> "0",
  // SUPPLIER -> "1") — see this file's module doc comment for how that was confirmed.
  const designByDigit = makeBy === "ZOTO" ? "0" : makeBy === "SUPPLIER" ? "1" : "";
  const prefix = categoryCode && subCategoryCode ? categoryCode + subCategoryCode : "";
  const count = prefix
    ? String(rmSkuRows.filter((r) => (r["PART NO."] ?? "").startsWith(prefix)).length).padStart(3, "0")
    : "";
  const livePartNo = categoryCode + subCategoryCode + count + paintCode + designByDigit;

  function canSave() {
    return !!category && !!subCategory && !!vendorName && !!paint && !!makeBy && !saving;
  }

  async function handleSave() {
    if (!canSave() || !makeBy) return;
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
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <style>{`
        .rm-sku-form input,
        .rm-sku-form button[aria-haspopup="listbox"] {
          height: 48px !important;
          border-radius: 6px !important;
          border: 1px solid #D1D5DB !important;
          padding: 12px 16px !important;
          font-size: 14px !important;
          box-sizing: border-box;
        }
        .rm-sku-form input:focus,
        .rm-sku-form button[aria-haspopup="listbox"]:focus-visible {
          outline: none;
          border-color: #C0392B !important;
        }
        /* The SearchableSelect's own open dropdown panel has an unrelated search input with
           its own borderless/bottom-border-only design — excluded from the rules above, not
           just left to lose the specificity fight against them. */
        .rm-sku-form [role="listbox"] input {
          border: none !important;
          border-radius: 0 !important;
          border-bottom: 1px solid #D1D5DB !important;
          height: auto !important;
          padding: 10px 14px !important;
        }
        .rm-sku-fields > div {
          margin-bottom: 30px !important;
        }
        .rm-sku-fields > div > label {
          margin-bottom: 11px !important;
          color: #1A1A1A !important;
        }
      `}</style>
      <div
        className="rm-sku-form"
        style={{
          position: "relative",
          width: isMobile ? "100%" : "min(48.18vw, 925px)",
          height: "100%",
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 64,
            flexShrink: 0,
            padding: "0 24px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 20,
              height: 20,
              border: "none",
              background: "transparent",
              color: "#6B7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>
            Raw Material SKU Form
          </h2>
        </div>

        <div style={{ padding: isMobile ? "24px var(--space)" : "32px 40px 40px", overflowY: "auto", flex: 1 }}>
        <div className="rm-sku-fields" style={{ width: "100%" }}>
          {/* PART NO. is disabled/read-only, not manually typed — the reference form's own
              field config (confirmed directly off its "Auto Compute" section) says exactly
              this: "Compute the value for this column instead of allowing user input." It
              updates live as `livePartNo` recomputes above, growing progressively as
              Category/Sub Category/Paint/Make By are picked, same as the reference. */}
          <TextField
            label="PART NO."
            required
            value={livePartNo}
            disabled
            placeholder="000"
            error={livePartNo.length > 0 && livePartNo.length !== 9 ? "PART CODE LENGTH IS NOT EQUAL TO 9 DIGIT" : undefined}
          />
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
          {/* Greyed and inert until a Category is picked, matching the reference's own
              disabled Sub Category state — SearchableSelect has no built-in disabled prop, so
              this wraps it instead of adding one just for this single form's use. */}
          <div style={{ opacity: category ? 1 : 0.6, pointerEvents: category ? "auto" : "none" }}>
            <SearchableSelect
              label="Sub Category"
              required
              value={subCategory}
              onChange={setSubCategory}
              options={subCategoryOptions}
              placeholder={category ? "Select Sub Category…" : "Pick a Category first"}
            />
          </div>
          {/* Free text, not a SearchableSelect off the `vendor-master` taxonomy table — that
              table has no rows yet in production, and the real RM SKU rows' own VENDOR NAME
              values (e.g. "NISIKI INDIA PRIVATE LIMITED") are plain text on the SKU row itself,
              not a ref into Vendor Master. Label matches the live sheet's own ALL-CAPS header
              text exactly (unlike Category/Sub Category/Paint, which are real Title Case
              headers) — same discipline as every other field label in this app. The circular
              "+" is decorative, matching the reference form's own icon — there's no separate
              "add a new vendor" flow to open, since typing a new name here already works. */}
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 11, color: "#1A1A1A" }}>
              VENDOR NAME<span style={{ color: "#DC2626" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                style={{ width: "100%", paddingRight: 48 }}
              />
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "1px solid #D1D5DB",
                  color: "#6B7280",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  lineHeight: 1,
                  pointerEvents: "none",
                }}
              >
                +
              </span>
            </div>
          </div>
          <SearchableSelect label="Paint" required value={paint} onChange={setPaint} options={paintOptions} placeholder="Select Paint…" />
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 11, color: "#1A1A1A" }}>
              MAKE BY<span style={{ color: "#DC2626" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 2, width: "100%", height: 48 }}>
              {(["ZOTO", "SUPPLIER"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMakeBy(option)}
                  style={{
                    flex: 1,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: makeBy === option ? "#C0392B" : "#F3F4F6",
                    color: makeBy === option ? "#fff" : "#374151",
                    fontWeight: makeBy === option ? 700 : 500,
                    fontSize: 14,
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          {error && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{error}</p>}

          {/* The reference form's "Drawing RM entries that reference this entry in the
              AGAINST ID column" reverse-ref block, kept for visual parity. Purely decorative
              here — AGAINST ID is the dead-pointer formula documented on RM ref Category/
              Category DD above (a live, constantly-shifting pointer to "whichever SKU was
              created most recently app-wide", not a real link to THIS SKU), and this is a
              brand-new row that can't have anything pointing at it yet regardless — same
              reasoning the reference form's own "New" button always starts empty here too. */}
          <div style={{ marginTop: 12, paddingTop: 20, borderTop: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: 12, fontStyle: "italic", color: "#DC2626", margin: "0 0 10px" }}>
              Drawing RM entries that reference this entry in the AGAINST ID column
            </p>
            <div
              style={{
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                padding: "10px 0",
                textAlign: "center",
                background: "#F9FAFB",
                color: "#6B7280",
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
            height: 64,
            flexShrink: 0,
            padding: "0 24px",
            borderTop: "1px solid #E5E7EB",
            background: "#fff",
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#1A1A1A",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave()}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: "#C0392B",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: canSave() ? "pointer" : "default",
              opacity: canSave() ? 1 : 0.6,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
