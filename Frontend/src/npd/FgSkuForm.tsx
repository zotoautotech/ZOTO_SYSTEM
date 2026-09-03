import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { ToggleGroup } from "../components/form/ToggleGroup";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { listTaxonomyRows, createTaxonomyRow, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: (id: string) => void;
}

/** "FINAL GOOD SKU Form" — the create form the reference screenshot shows, built on this app's
 * own shared `FormModal.tsx` convention (unlike `RmSkuForm.tsx`'s deliberate custom-panel
 * exception — there was no pixel-match request for this one, so no reason to opt out of the
 * standard modal shape).
 *
 * **PART NO. is a plain required text field, not auto-computed** — confirmed directly off the
 * reference screenshot (its PART NO. input has no disabled/greyed "Auto Compute" styling the
 * way RM SKU's own PART NO. field does), and unlike RM SKU there's no verified real App
 * Formula for FG's part-code scheme to replicate server-side. The doer types it directly, same
 * as the reference.
 *
 * Segment/Category/Sub Category are real `SearchableSelect`s sourced from the FG taxonomy
 * tables already built in Sprint 1 (`fg-segment`/`fg-category`/`fg-category-dd`, all on
 * `env.sheets.fg`) — Sub Category filtered by the picked Category, matching `fg-category-dd`'s
 * own `Category` column. **No "+ New" inline-create flow for these three yet** (unlike RM
 * SKU's Category/Sub Category/Paint/Vendor, which each got one) — a doer who needs a brand-new
 * Segment/Category/Sub Category has no in-form way to add one yet; flagged as a follow-up, not
 * silently limited. */
export function FgSkuForm({ onClose, onSaved }: Props) {
  const [partNo, setPartNo] = useState("");
  const [segment, setSegment] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [name, setName] = useState("");
  const [standardPart, setStandardPart] = useState<"Yes" | "No" | null>(null);
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: segmentRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-segment"],
    queryFn: () => listTaxonomyRows("fg-segment"),
  });
  const { data: categoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-category"],
    queryFn: () => listTaxonomyRows("fg-category"),
  });
  const { data: subCategoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-category-dd"],
    queryFn: () => listTaxonomyRows("fg-category-dd"),
  });

  const segmentOptions: SelectOption[] = segmentRows.map((r: TaxonomyRow) => ({
    value: r.SEGMENT.trim(),
    label: r.SEGMENT.trim(),
  }));
  const categoryOptions: SelectOption[] = categoryRows.map((r: TaxonomyRow) => ({
    value: r.CATEGORY.trim(),
    label: r.CATEGORY.trim(),
  }));
  const subCategoryOptions: SelectOption[] = subCategoryRows
    .filter((r: TaxonomyRow) => !category || (r.Category ?? "").trim() === category.trim())
    .map((r: TaxonomyRow) => ({ value: r["SUB CATEGORY"].trim(), label: r["SUB CATEGORY"].trim() }));

  function canSave() {
    return !!partNo.trim() && !!segment && !!category && !!subCategory && !!name.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      const result = await createTaxonomyRow("fg-sku", {
        "PART NO.": partNo.trim(),
        SEGMENT: segment,
        CATEGORY: category,
        "SUB CATEGORY": subCategory,
        Name: name.trim(),
        ...(standardPart ? { "STANDARD PART": standardPart } : {}),
        ...(unit.trim() ? { UNIT: unit.trim() } : {}),
      });
      onSaved(result.id);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="FINAL GOOD SKU Form" onClose={onClose} size="standard" sectionLabel="FG SKU Details">
      <div style={{ padding: "20px var(--space)", overflowY: "auto", flex: 1 }}>
        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            ⚠ {error}
          </div>
        )}

        <TextField
          label="PART NO."
          required
          value={partNo}
          onChange={(e) => setPartNo(e.target.value)}
          placeholder="000"
        />
        <SearchableSelect
          label="SEGMENT"
          required
          value={segment}
          onChange={setSegment}
          options={segmentOptions}
          placeholder="Select Segment…"
        />
        <SearchableSelect
          label="Category"
          required
          value={category}
          onChange={(v) => {
            setCategory(v);
            setSubCategory("");
          }}
          options={categoryOptions}
          placeholder="Select Category…"
        />
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
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name…" />
        <ToggleGroup
          label="Standard Part"
          value={standardPart ?? ""}
          onChange={(v) => setStandardPart(v)}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" },
          ]}
        />
        <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. SET" />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px var(--space)",
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
