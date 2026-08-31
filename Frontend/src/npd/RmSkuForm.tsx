import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
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
 * toggle). `PART NO.` is never shown here as an input — the backend computes it server-side
 * from the real, verified App Formula (services/npdPartCode.ts's generateRmPartCode()) once
 * the row is created, matching `computedFields` on the `rm-sku` taxonomy table entry the same
 * way every other computed-field table already works.
 *
 * **Make By's two options are "ZOTO"/"SUPPLIER", not "ADC"/"SUPPLIER"** — the old reference
 * screenshot (from the legacy "Copy of ADC" spreadsheet, ADC being this business's old company
 * name before its ZOTO rebrand) shows a button labelled "ADC", but the live production
 * `Alphabet` tab this formula actually looks up against (`MAKED BY`/`MAKED CODE` columns) has
 * already been updated to store `"ZOTO"` for that same row (`MAKED CODE: "0"`) — confirmed by
 * reading the live tab directly, not assumed from the stale screenshot. Sending "ADC" 500s:
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
    <FormModal title="Raw Material SKU Form" onClose={onClose} sectionLabel="Page 1">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)",
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
    </FormModal>
  );
}
