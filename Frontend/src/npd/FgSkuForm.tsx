import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createTaxonomyRow, type TaxonomyRow } from "./lib/npdApi";
import { FgQuickCreateForm } from "./FgQuickCreateForm";

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
 * truth and the full reasoning behind each piece (why Standard Part's contribution is best-
 * effort/likely blank, why "Paint" became "Brand", etc.).
 *
 * Segment/Category/Sub Category are real `SearchableSelect`s off the FG taxonomy tables,
 * **now each with their own "+ New" inline-create flow** (`FgQuickCreateForm.tsx`) — per the
 * user's explicit follow-up request, matching RM SKU's own Category/Sub Category/Paint/Vendor
 * pattern. Brand is the FG-side equivalent of RM SKU's own Brand field (`fg-paint` taxonomy
 * table, tab literally renamed `FG ref Brand` the same day) — no "+ New" flow for it yet
 * (not asked for this pass), a plain `SearchableSelect`. */
export function FgSkuForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [creatingSegment, setCreatingSegment] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSubCategory, setCreatingSubCategory] = useState(false);
  const [segment, setSegment] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [standardPart, setStandardPart] = useState<"Yes" | "No" | null>(null);
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
  const { data: brandRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-paint"],
    queryFn: () => listTaxonomyRows("fg-paint"),
  });
  // Needed only to compute PART NO.'s live preview below (the running per-SEGMENT+CATEGORY+
  // SUB CATEGORY count) — same table FgSkuCatalog.tsx already reads.
  const { data: fgSkuRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sku"],
    queryFn: () => listTaxonomyRows("fg-sku"),
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
  const brandOptions: SelectOption[] = brandRows.map((r: TaxonomyRow) => ({
    value: (r["Brand Description"] ?? "").trim(),
    label: (r["Brand Description"] ?? "").trim(),
  }));

  // PART NO. live preview — client-side mirror of generateFgPartCode()'s real formula, using
  // data already loaded for the dropdowns above (same "live preview from already-loaded data"
  // approach RmSkuForm.tsx's own PART NO. preview uses). Standard Part's own contribution is
  // omitted here (see generateFgPartCode()'s own comment on why it's best-effort/usually
  // blank — this form's Standard Part is a plain Yes/No, not a ref into FG Sub sub parts).
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
  const livePartNo = categoryDdCode + count + brandCode;

  function canSave() {
    return !!segment && !!category && !!subCategory && !!name.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      const result = await createTaxonomyRow("fg-sku", {
        SEGMENT: segment,
        CATEGORY: category,
        "SUB CATEGORY": subCategory,
        Name: name.trim(),
        ...(standardPart ? { "STANDARD PART": standardPart } : {}),
        ...(brand ? { Brand: brand } : {}),
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
            <SearchableSelect
              label="SEGMENT"
              required
              value={segment}
              onChange={setSegment}
              options={segmentOptions}
              placeholder="Select Segment…"
              addNewLabel="New"
              onAddNew={() => setCreatingSegment(true)}
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
            <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name…" />
            <div>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 11, color: "#1A1A1A" }}>
                Standard Part
              </label>
              <div style={{ display: "flex", gap: 2, width: "100%", height: 48 }}>
                {(["Yes", "No"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStandardPart(option)}
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background: standardPart === option ? "#C0392B" : "#F3F4F6",
                      color: standardPart === option ? "#fff" : "#374151",
                      fontWeight: standardPart === option ? 700 : 500,
                      fontSize: 14,
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <SearchableSelect
              label="Brand"
              value={brand}
              onChange={setBrand}
              options={brandOptions}
              placeholder="Select Brand…"
            />
            <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. SET" />
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

      {creatingSegment && (
        <FgQuickCreateForm
          kind="segment"
          onClose={() => setCreatingSegment(false)}
          onSaved={(v) => {
            setCreatingSegment(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-segment"] });
            setSegment(v);
          }}
        />
      )}
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
          onClose={() => setCreatingSubCategory(false)}
          onSaved={(v) => {
            setCreatingSubCategory(false);
            queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-category-dd"] });
            setSubCategory(v);
          }}
        />
      )}
    </div>
  );
}
