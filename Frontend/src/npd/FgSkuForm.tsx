import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createTaxonomyRow, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: (id: string) => void;
}

/** "FINAL GOOD SKU Form" — the reference screenshot's create form. Built on the EXACT same
 * right-docked panel chrome as `RmSkuForm.tsx` (not the shared `FormModal.tsx` centered-dialog
 * convention — a first pass here used `FormModal` and looked nothing like the Raw Material SKU
 * Form sitting right next to it in the same app, which the user immediately flagged: "are you
 * sure this look same"). Same literal-hex styling, same panel width/header/footer shape —
 * matching `RmSkuForm.tsx`'s own documented deliberate exception to `FormModal.tsx`'s usual
 * convention, for the same reason: visual consistency between the two SKU forms matters more
 * here than following the generic modal pattern.
 *
 * **PART NO. is a plain required text field, not auto-computed** — confirmed off the reference
 * screenshot (no disabled/greyed "Auto Compute" styling the way RM SKU's own PART NO. field
 * has), and there's no verified real App Formula for FG's own part-code scheme to replicate
 * server-side the way RM SKU's `generateRmPartCode()` exists. The doer types it directly.
 *
 * Segment/Category/Sub Category are real `SearchableSelect`s off the FG taxonomy tables already
 * built in Sprint 1 (`fg-segment`/`fg-category`/`fg-category-dd`), Sub Category filtered by the
 * picked Category. **No "+ New" inline-create flow for these three yet** (unlike RM SKU's
 * Category/Sub Category/Paint/Vendor, which each got one) — flagged as a follow-up. */
export function FgSkuForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [partNo, setPartNo] = useState("");
  const [segment, setSegment] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
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
    </div>
  );
}
