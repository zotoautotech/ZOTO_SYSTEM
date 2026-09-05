import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createTaxonomyRow, updateTaxonomyRow, type TaxonomyRow } from "./lib/npdApi";
import { FgQuickCreateForm } from "./FgQuickCreateForm";
import { AssembleRmFgForm, type QueuedBomLine } from "./AssembleRmFgForm";

interface Props {
  onClose: () => void;
  onSaved: (id: string) => void;
  /** Present only when opened from FgSkuDetail.tsx's "Edit" action — the existing row to
   * prefill from and PUT back to on Save, matching RmSkuForm.tsx's own real Edit flow (this
   * form had none until now — Edit was a disabled "Coming soon" button). BOM ITEMS is hidden
   * entirely in edit mode: this row already has real BOM lines of its own (visible on its own
   * detail page), and editing basic fields here has no business also silently attaching new
   * BOM lines in the same action. */
  editRow?: TaxonomyRow;
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

export function FgSkuForm({ onClose, onSaved, editRow }: Props) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSubCategory, setCreatingSubCategory] = useState(false);
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [creatingStandardPart, setCreatingStandardPart] = useState(false);
  const [segment] = useState(FIXED_SEGMENT);
  const [category, setCategory] = useState(editRow?.CATEGORY ?? "");
  const [subCategory, setSubCategory] = useState(editRow?.["SUB CATEGORY"] ?? "");
  const [brand, setBrand] = useState(editRow?.Brand ?? "");
  const [standardPart, setStandardPart] = useState(editRow?.["STANDARD PART"] ?? "");
  const [name, setName] = useState(editRow?.Name ?? "");
  // Live column confirmed directly ("Description", column L on FINAL GOOD SKU) — plain
  // optional doer-typed text, added per explicit instruction.
  const [description, setDescription] = useState(editRow?.Description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Local-only queue of BOM lines — nothing about this SKU or its BOM is written to the
  // backend until the doer clicks THIS form's own Save button (see handleSave()'s own doc
  // comment: an earlier version wrote the FG SKU early the moment a BOM line was queued,
  // which was corrected per explicit, emphatic follow-up — "PERMANET SAVE ONLY WHEN I CLICK
  // FINAL GOOD SKU Form SAVE BUTTON"). Matches the reference AppSheet form's own BOM ITEMS
  // table (rows shown immediately, nothing truly saved until the parent form's own Save).
  const [bomQueue, setBomQueue] = useState<QueuedBomLine[]>([]);
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

  /** THE ONLY place this form writes anything to the backend — one atomic action on Save:
   * create the FG SKU row, then create one `assemble-rm-fg` row per locally-queued BOM line
   * against the resulting real FG ID, then close. Two earlier versions of this file each
   * wrote something (the FG SKU, or the BOM lines) BEFORE this button was ever clicked — both
   * corrected per explicit, emphatic follow-up ("PERMANET SAVE ONLY WHEN I CLICK FINAL GOOD
   * SKU Form SAVE BUTTON... MAKE STRONG BIG BIG FINAL COMMAND"). BOM ITEMS' "New" button
   * (`handleAddBom`) only ever queues locally via `AssembleRmFgForm`'s own `onQueue` — never
   * touches the network — so nothing is written anywhere until this one function runs. */
  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        SEGMENT: segment,
        CATEGORY: category,
        "SUB CATEGORY": subCategory,
        Name: name.trim(),
        "STANDARD PART": standardPart,
        Brand: brand,
        ...(description.trim() ? { Description: description.trim() } : {}),
      };
      if (editRow) {
        // Edit mode — plain field update, no PART NO./BOM ITEMS involved (this row already
        // has its own real BOM lines, edited from its own detail page, not silently
        // re-attached here — see this file's own Props doc comment on `editRow`).
        const id = editRow["FG ID"];
        await updateTaxonomyRow("fg-sku", id, body);
        onSaved(id);
        return;
      }
      const result = await createTaxonomyRow("fg-sku", body);
      // Sequential (not Promise.all) — matches AssembleRmFgForm's own bulk-save reasoning:
      // each line's random Unique ID is minted against an up-to-date read of the tab rather
      // than several requests racing off the same stale snapshot.
      for (const line of bomQueue) {
        await createTaxonomyRow("assemble-rm-fg", {
          "FG ID": result.id,
          Category: line.category,
          "Sub Category": line.subCategory,
          "RM ID": line.rmId,
          "No. Of Qty Use": line.qty,
        });
      }
      onSaved(result.id);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  function handleAddBom() {
    if (canSave()) setShowBomForm(true);
  }

  // The virtual (not-yet-saved, and — with this form's local-queue-only BOM flow — NEVER
  // saved from inside the BOM form itself) FG row shown inside Assemble RM FG Form, so its
  // FG CATEGORY/SUB CATEGORY/BRAND/STANDARD/PART NO. fields show real values instead of
  // "Loading…" while the doer is still picking RM lines to queue.
  const virtualFgRow: TaxonomyRow = {
    SEGMENT: segment,
    CATEGORY: category,
    "SUB CATEGORY": subCategory,
    Name: name.trim(),
    "STANDARD PART": standardPart,
    Brand: brand,
    "PART NO.": livePartNo,
    "FG ID": "",
  };

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
            {editRow ? "Edit FINAL GOOD SKU" : "FINAL GOOD SKU Form"}
          </h2>
        </div>

        <div style={{ padding: isMobile ? "24px var(--space)" : "32px 40px 40px", overflowY: "auto", flex: 1 }}>
          <div className="fg-sku-fields" style={{ width: "100%" }}>
            {/* In edit mode, PART NO. keeps its real saved value verbatim — this form doesn't
                recompute the running-count part-code formula on edit (that's a create-only
                computed field server-side, see taxonomy.ts), matching RmSkuForm.tsx's own
                "unchanged fields keep the real saved PART NO." convention. */}
            <TextField
              label="PART NO."
              required
              value={editRow ? editRow["PART NO."] ?? "" : livePartNo}
              disabled
              placeholder="000"
            />
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
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
            />
            {/* Hidden entirely in edit mode — this row already has its own real BOM lines,
                managed from its own detail page, not silently re-attached from here (see this
                file's own Props doc comment on `editRow`). Matches the reference's own
                "BOM ITEMS* / New" nested-list bar for CREATE: New opens Assemble RM FG Form
                right away, pre-filled from this form's own in-progress fields (a "virtual"
                preview, nothing saved yet) — clicking that form's own "Add to BOM" only queues
                the picked lines locally in `bomQueue`; nothing is written to the backend until
                THIS form's own Save button runs, see handleSave()'s own doc comment. */}
            {!editRow && (
              <>
                <NestedListField label="BOM ITEMS" onAddNew={handleAddBom} disabled={!canSave()} />
                {bomQueue.length > 0 && (
                  <div style={{ marginTop: -14, marginBottom: 10 }}>
                    {bomQueue.map((line, i) => (
                      <div
                        key={`${line.rmId}-${i}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          border: "1px solid #E5E7EB",
                          borderTop: i === 0 ? "1px solid #E5E7EB" : "none",
                          fontSize: 13,
                        }}
                      >
                        <span>
                          {line.partNo} — Qty {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBomQueue((prev) => prev.filter((_, idx) => idx !== i))}
                          style={{ border: "none", background: "none", color: "#DC2626", cursor: "pointer", fontSize: 13 }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!canSave() && (
                  <p className="text-muted" style={{ fontSize: 12, marginTop: -20 }}>
                    Fill in Category, Sub Category, Brand, Standard Part and Name above to add BOM Items.
                  </p>
                )}
              </>
            )}
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
      {showBomForm && (
        <AssembleRmFgForm
          fgRow={virtualFgRow}
          onClose={() => setShowBomForm(false)}
          onQueue={(lines: QueuedBomLine[]) => setBomQueue((prev) => [...prev, ...lines])}
          alreadyQueuedRmIds={bomQueue.map((l) => l.rmId)}
        />
      )}
    </div>
  );
}

/** Matches the reference's own grey "SECTION* / New" nested-list bar — a static count (this
 * form doesn't track how many child rows exist yet, since the parent FG SKU row itself may
 * not even be saved) plus a "New" button. */
function NestedListField({
  label,
  onAddNew,
  disabled,
}: {
  label: string;
  onAddNew: () => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
        {label}
        <span style={{ color: "var(--color-error)" }}> *</span>
      </label>
      <button
        type="button"
        onClick={onAddNew}
        disabled={disabled}
        title={disabled ? "Fill in the required fields above first" : undefined}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 6,
          border: "1px solid #D1D5DB",
          background: "#F3F4F6",
          color: "#2563EB",
          fontSize: 14,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        New
      </button>
    </div>
  );
}
