import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createTaxonomyRow, type TaxonomyRow } from "./lib/npdApi";
import { FgQuickCreateForm } from "./FgQuickCreateForm";
import { DrawingFgForm } from "./DrawingFgForm";
import { AssembleRmFgForm } from "./AssembleRmFgForm";

interface Props {
  onClose: () => void;
  onSaved: (id: string) => void;
}

/** "FINAL GOOD SKU Form" — the reference screenshot's create form. Built on the EXACT same
 * right-docked panel chrome as `RmSkuForm.tsx` (see that file's own doc comment for why —
 * visual consistency between the app's two SKU forms, not `FormModal.tsx`'s generic dialog).
 *
 * **PART NO. is now server-computed** — the user pasted the real live App Formula directly
 * (a correction from this file's earlier "plain doer-typed field" state, which was written
 * before the real formula was available). Live-previewed client-side the same way RM SKU's
 * own PART NO. is, using data already loaded for the dropdowns below — see
 * `services/npdPartCode.ts`'s `generateFgPartCode()` for the actual server-side source of
 * truth.
 *
 * Category/Sub Category/Brand/Standard Part are all real `SearchableSelect`s off the FG
 * taxonomy tables, **each with their own "+ New" inline-create flow**
 * (`FgQuickCreateForm.tsx`) — per the user's explicit follow-up requests, matching RM SKU's
 * own Category/Sub Category/Paint/Vendor pattern. **Standard Part is now a real ref into
 * `FG Sub sub parts`** (was a plain Yes/No toggle in an earlier pass) — matching the
 * reference's own field type (confirmed off the field-config screenshot: type Ref, source
 * table `FG Sub sub parts`), filtered by SEGMENT+Category+SUB CATEGORY, greyed/inert until
 * Sub Category is picked. This also means `generateFgPartCode()`'s own `FG Sub sub parts`
 * CODE component now resolves for real whenever a genuine Standard Part is picked, instead of
 * the earlier pass's near-always-blank Yes/No guess. **Field order matches the reference**:
 * Category → Sub Category → Brand → Standard Part → Name → Unit (Brand/Standard Part moved up
 * from the bottom in an earlier pass, per explicit instruction).
 *
 * **SEGMENT is fixed to "Car Accessories"** — per explicit instruction ("SEGMENT is fixed for
 * every time so auto select, not one can edit this"), this app's product line is entirely
 * Car Accessories, so the field is a disabled, pre-filled value rather than a dropdown a doer
 * could accidentally change. No "+ New Segment" flow either, for the same reason — there's
 * only ever meant to be this one segment. */
const FIXED_SEGMENT = "Car Accessories";

export function FgSkuForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSubCategory, setCreatingSubCategory] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [creatingStandardPart, setCreatingStandardPart] = useState(false);
  const [segment] = useState(FIXED_SEGMENT);
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [standardPart, setStandardPart] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set once the FG SKU row has actually been saved (either via the "New" button under
  // DRAWINGS OR VIDEO/BOM ITEMS below auto-saving it first, or via the form's own Save button)
  // — the reference form lets a doer add child Drawing/BOM rows against an in-progress unsaved
  // row (an AppSheet-only "virtual row" mechanism); this app's stateless REST backend has no
  // equivalent, so the FG SKU is saved for real the first time either child section is opened,
  // then reused for every subsequent child add and for the form's own Save button (never
  // double-creates the row).
  const [createdRow, setCreatedRow] = useState<TaxonomyRow | null>(null);
  const [showDrawingForm, setShowDrawingForm] = useState(false);
  const [showBomForm, setShowBomForm] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const { data: categoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-category"],
    queryFn: () => listTaxonomyRows("fg-category"),
  });
  const { data: subCategoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-category-dd"],
    queryFn: () => listTaxonomyRows("fg-category-dd"),
  });
  const { data: brandRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-paint"],
    queryFn: () => listTaxonomyRows("fg-paint"),
  });
  const { data: standardPartRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sub-sub-parts"],
    queryFn: () => listTaxonomyRows("fg-sub-sub-parts"),
  });
  // Needed only to compute PART NO.'s live preview below (the running per-SEGMENT+CATEGORY+
  // SUB CATEGORY count) — same table FgSkuCatalog.tsx already reads.
  const { data: fgSkuRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sku"],
    queryFn: () => listTaxonomyRows("fg-sku"),
  });

  const categoryOptions: SelectOption[] = categoryRows.map((r: TaxonomyRow) => ({
    value: r.CATEGORY.trim(),
    label: r.CATEGORY.trim(),
  }));
  const subCategoryOptions: SelectOption[] = subCategoryRows
    .filter((r: TaxonomyRow) => !category || (r.Category ?? "").trim() === category.trim())
    .map((r: TaxonomyRow) => ({ value: r["SUB CATEGORY"].trim(), label: r["SUB CATEGORY"].trim() }));
  const brandOptions: SelectOption[] = brandRows.map((r: TaxonomyRow) => ({
    value: (r["Brand Description"] ?? "").trim(),
    label: (r["Brand Description"] ?? "").trim(),
  }));
  // Filtered by SEGMENT+Category+SUB CATEGORY match, same shape as Sub Category's own filter —
  // Standard Part is now a real ref into FG Sub sub parts (was a plain Yes/No toggle), matching
  // the reference's own field type (confirmed off the field-config screenshot: type Ref,
  // source table FG Sub sub parts).
  const standardPartOptions: SelectOption[] = standardPartRows
    .filter(
      (r: TaxonomyRow) =>
        !subCategory ||
        ((r.SEGMENT ?? "").trim() === segment.trim() &&
          (r.Category ?? "").trim() === category.trim() &&
          (r["SUB CATEGORY"] ?? "").trim() === subCategory.trim())
    )
    .map((r: TaxonomyRow) => ({ value: (r.STANDARD ?? "").trim(), label: (r.STANDARD ?? "").trim() }));

  // PART NO. live preview — client-side mirror of generateFgPartCode()'s real formula, using
  // data already loaded for the dropdowns above (same "live preview from already-loaded data"
  // approach RmSkuForm.tsx's own PART NO. preview uses). Standard Part's own contribution now
  // resolves for real (it's a genuine ref match, not a Yes/No guess) whenever a value is picked.
  const standardPartCode =
    standardPartRows.find(
      (r: TaxonomyRow) =>
        (r.SEGMENT ?? "").trim() === segment.trim() &&
        (r.Category ?? "").trim() === category.trim() &&
        (r["SUB CATEGORY"] ?? "").trim() === subCategory.trim() &&
        (r.STANDARD ?? "").trim() === standardPart.trim()
    )?.CODE ?? "";
  const categoryDdCode =
    subCategoryRows.find(
      (r: TaxonomyRow) =>
        (r.SEGMENT ?? "").trim() === segment.trim() &&
        (r.Category ?? "").trim() === category.trim() &&
        (r["SUB CATEGORY"] ?? "").trim() === subCategory.trim()
    )?.CODE ?? "";
  const brandCode = brandRows.find((r: TaxonomyRow) => (r["Brand Description"] ?? "").trim() === brand.trim())?.Code ?? "";
  const count =
    segment && category && subCategory
      ? String(
          fgSkuRows.filter(
            (r: TaxonomyRow) =>
              (r.SEGMENT ?? "").trim() === segment.trim() &&
              (r.CATEGORY ?? "").trim() === category.trim() &&
              (r["SUB CATEGORY"] ?? "").trim() === subCategory.trim()
          ).length
        ).padStart(3, "0")
      : "";
  const livePartNo = categoryDdCode + count + standardPartCode + brandCode;

  // Brand/Standard Part are now required — matches taxonomy.ts's fg-sku requiredFields
  // (per explicit follow-up request), not just optional extras like Unit.
  function canSave() {
    return !!segment && !!category && !!subCategory && !!brand && !!standardPart && !!name.trim() && !saving;
  }

  /** Saves the FG SKU row for real if it hasn't been already, returning it either way — shared
   * by the form's own Save button and by the DRAWINGS OR VIDEO/BOM ITEMS "New" buttons below
   * (see `createdRow`'s own doc comment for why a real save happens the first time either is
   * opened, not just on the form's own Save). */
  async function ensureSaved(): Promise<TaxonomyRow> {
    if (createdRow) return createdRow;
    const body = {
      SEGMENT: segment,
      CATEGORY: category,
      "SUB CATEGORY": subCategory,
      Name: name.trim(),
      "STANDARD PART": standardPart,
      Brand: brand,
    };
    const result = await createTaxonomyRow("fg-sku", body);
    const row: TaxonomyRow = { ...body, "FG ID": result.id };
    setCreatedRow(row);
    return row;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      const row = await ensureSaved();
      onSaved(row["FG ID"]);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  async function handleAddDrawing() {
    if (!canSave() && !createdRow) return;
    setError("");
    try {
      await ensureSaved();
      setShowDrawingForm(true);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
    }
  }

  async function handleAddBom() {
    if (!canSave() && !createdRow) return;
    setError("");
    try {
      await ensureSaved();
      setShowBomForm(true);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <style>{`
        .fg-sku-form input,
        .fg-sku-form button[aria-haspopup="listbox"] {
          height: 48px !important;
          border-radius: 6px !important;
          border: 1px solid #D1D5DB !important;
          padding: 12px 16px !important;
          font-size: 14px !important;
          box-sizing: border-box;
        }
        .fg-sku-form input:focus,
        .fg-sku-form button[aria-haspopup="listbox"]:focus-visible {
          outline: none;
          border-color: #C0392B !important;
        }
        .fg-sku-form [role="listbox"] input {
          border: none !important;
          border-radius: 0 !important;
          border-bottom: 1px solid #D1D5DB !important;
          height: auto !important;
          padding: 10px 14px !important;
        }
        .fg-sku-fields > div {
          margin-bottom: 30px !important;
        }
        .fg-sku-fields > div > label {
          margin-bottom: 11px !important;
          color: #1A1A1A !important;
        }
      `}</style>
      <div
        className="fg-sku-form"
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
            FINAL GOOD SKU Form
          </h2>
        </div>

        <div style={{ padding: isMobile ? "24px var(--space)" : "32px 40px 40px", overflowY: "auto", flex: 1 }}>
          <div className="fg-sku-fields" style={{ width: "100%" }}>
            <TextField label="PART NO." required value={livePartNo} disabled placeholder="000" />
            {/* Fixed, not a dropdown — see this file's own module doc comment for why. */}
            <TextField label="SEGMENT" required value={segment} disabled />
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
              addNewLabel="New"
              onAddNew={() => setCreatingCategory(true)}
            />
            <div style={{ opacity: category ? 1 : 0.6, pointerEvents: category ? "auto" : "none" }}>
              <SearchableSelect
                label="Sub Category"
                required
                value={subCategory}
                onChange={setSubCategory}
                options={subCategoryOptions}
                placeholder={category ? "Select Sub Category…" : "Pick a Category first"}
                addNewLabel={category && segment ? "New" : undefined}
                onAddNew={category && segment ? () => setCreatingSubCategory(true) : undefined}
              />
            </div>
            {/* Brand right after Sub Category, matching the reference's own field order (per
                the user's explicit "after Sub Category show Brand instead of paint, then show
                standard Part" instruction) — was previously placed near the bottom. */}
            <SearchableSelect
              label="Brand"
              required
              value={brand}
              onChange={setBrand}
              options={brandOptions}
              placeholder="Select Brand…"
              addNewLabel="New"
              onAddNew={() => setCreatingBrand(true)}
            />
            {/* Standard Part is now a real ref SearchableSelect into FG Sub sub parts (was a
                plain Yes/No toggle) — matching the reference's own field type. Greyed/inert
                until Sub Category is picked, same pattern as Sub Category's own dependency on
                Category above. */}
            <div style={{ opacity: subCategory ? 1 : 0.6, pointerEvents: subCategory ? "auto" : "none" }}>
              <SearchableSelect
                label="Standard Part"
                required
                value={standardPart}
                onChange={setStandardPart}
                options={standardPartOptions}
                placeholder={subCategory ? "Select Standard Part…" : "Pick a Sub Category first"}
                addNewLabel={subCategory ? "New" : undefined}
                onAddNew={subCategory ? () => setCreatingStandardPart(true) : undefined}
              />
            </div>
            <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name…" />
            {/* Matches the reference's own "DRAWINGS OR VIDEO* / New" and "BOM ITEMS* / New"
                nested-list bars — clicking New saves this FG SKU first if it hasn't been saved
                yet (see ensureSaved()'s own doc comment), then opens Drawing FG Form / Assemble
                RM FG Form for the resulting row. */}
            <NestedListField label="DRAWINGS OR VIDEO" onAddNew={handleAddDrawing} />
            <NestedListField label="BOM ITEMS" onAddNew={handleAddBom} />
            {error && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{error}</p>}
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

      {creatingCategory && (
        <FgQuickCreateForm
          kind="category"
          onClose={() => setCreatingCategory(false)}
          onSaved={(v) => {
            setCreatingCategory(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-category"] });
            setCategory(v);
            setSubCategory("");
          }}
        />
      )}
      {creatingSubCategory && (
        <FgQuickCreateForm
          kind="sub-category"
          segment={segment}
          category={category}
          subCategoryRows={subCategoryRows}
          onClose={() => setCreatingSubCategory(false)}
          onSaved={(v) => {
            setCreatingSubCategory(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-category-dd"] });
            setSubCategory(v);
          }}
        />
      )}
      {creatingBrand && (
        <FgQuickCreateForm
          kind="brand"
          brandRows={brandRows}
          onClose={() => setCreatingBrand(false)}
          onSaved={(v) => {
            setCreatingBrand(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-paint"] });
            setBrand(v);
          }}
        />
      )}
      {creatingStandardPart && (
        <FgQuickCreateForm
          kind="standard-part"
          segment={segment}
          category={category}
          subCategory={subCategory}
          standardPartRows={standardPartRows}
          onClose={() => setCreatingStandardPart(false)}
          onSaved={(v) => {
            setCreatingStandardPart(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-sub-sub-parts"] });
            setStandardPart(v);
          }}
        />
      )}
      {showDrawingForm && createdRow && (
        <DrawingFgForm
          fgRow={createdRow}
          onClose={() => setShowDrawingForm(false)}
          onSaved={() => {
            setShowDrawingForm(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "drawing-fg"] });
          }}
        />
      )}
      {showBomForm && createdRow && (
        <AssembleRmFgForm
          fgRow={createdRow}
          onClose={() => setShowBomForm(false)}
          onSaved={() => {
            setShowBomForm(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "assemble-rm-fg"] });
          }}
        />
      )}
    </div>
  );
}

/** Matches the reference's own grey "SECTION* / New" nested-list bar — a static count (this
 * form doesn't track how many child rows exist yet, since the parent FG SKU row itself may
 * not even be saved) plus a "New" button. */
function NestedListField({ label, onAddNew }: { label: string; onAddNew: () => void }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        <span style={{ color: "var(--color-error)" }}> *</span>
      </label>
      <button
        type="button"
        onClick={onAddNew}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 6,
          border: "1px solid #D1D5DB",
          background: "#F3F4F6",
          color: "#2563EB",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        New
      </button>
    </div>
  );
}
