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
 * toggle) AND its layout: a panel docked to the right edge of the screen, full height, over a
 * dimmed backdrop, with Cancel/Save in the header row instead of a footer bar — this is a
 * deliberate exception to `FormModal.tsx`'s usual fixed-size centered-modal convention (see
 * CLAUDE.md), built custom for this one form on explicit request to match the reference
 * screenshot's own right-docked panel exactly, not the centered-modal shape every other form
 * in this app uses. `PART NO.` is never shown here as an input — the backend computes it
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
      <div
        style={{
          position: "relative",
          width: isMobile ? "100%" : "min(46vw, 620px)",
          minWidth: isMobile ? undefined : 460,
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
            gap: 16,
            padding: "18px var(--space)",
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>Raw Material SKU Form</h2>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <div style={{ padding: "0 var(--space)", borderBottom: "1px solid var(--color-border)" }}>
          <span
            style={{
              display: "inline-block",
              padding: "10px 4px",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-primary)",
              borderBottom: "2px solid var(--color-primary)",
            }}
          >
            Page 1
          </span>
        </div>

        <div style={{ padding: "24px var(--space)", overflowY: "auto", flex: 1 }}>
          <TextField label="PART NO." value="" placeholder="Generated on Save" disabled />
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
              not a ref into Vendor Master. Matches the reference form's own inline "+" — a name
              typed here that isn't already in Vendor Master just isn't one yet, not an error. */}
          <TextField label="Vendor Name" required value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          <SearchableSelect label="Paint" required value={paint} onChange={setPaint} options={paintOptions} placeholder="Select Paint…" />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
              Make By <span style={{ color: "var(--color-error)" }}>*</span>
            </label>
            <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
              {(["ZOTO", "SUPPLIER"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMakeBy(option)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
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
        </div>
      </div>
    </div>
  );
}
