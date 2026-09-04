import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { ToggleGroup } from "../components/form/ToggleGroup";
import { useIsMobile } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import {
  createTaxonomyRow,
  listTaxonomyRows,
  previewAssembleRmFg,
  previewPlainRandomId,
  type TaxonomyRow,
} from "./lib/npdApi";

interface Props {
  /** The FG SKU this BOM line belongs to — FG ID is fixed, FG CODE/CATEGORY/SUB CATEGORY/
   * PAINT/STANDARD are server-computed snapshots (see taxonomy.ts's assemble-rm-fg POST
   * handler), shown here as a live preview off the same helper. */
  fgRow: TaxonomyRow;
  onClose: () => void;
  onSaved: () => void;
}

const UNIT_OPTIONS: SelectOption[] = [
  { value: "PCS", label: "PCS" },
  { value: "KG", label: "KG" },
  { value: "SET", label: "SET" },
];
const LEVEL_OPTIONS: SelectOption[] = [
  { value: "L1", label: "L1" },
  { value: "L2", label: "L2" },
  { value: "L3", label: "L3" },
  { value: "L4", label: "L4" },
];

/** "ASSEMBLE RM FG Form" — matching the AppSheet reference screenshot field-for-field
 * (USEREMAIL/TIMESTAMP/Unique id/FG ID/FG CODE/FG CATEGORY/FG SUB CATEGORY/FG PAINT/
 * FG STANDARD/Category/Sub Category/RM ID/RM CODE/DUPLICATE/No. Of Qty Use/Units/Levels/
 * Part Specs.). Live on the real "ASSEMBLE RM FG" tab (FG_SHEET_ID) — a different tab from
 * `BomBuilder.tsx`'s own "ASSEMBLE RM FG (BOM)" (see taxonomy.ts's own comment on why these
 * aren't the same table).
 *
 * `Category`/`Sub Category` here are the RM side's own taxonomy (RM ref Category/Category DD),
 * used to narrow the RM ID picker — same "narrow the search first" pattern
 * `RmSkuForm.tsx`/`FgSkuForm.tsx` already use for their own Category → Sub Category chains. */
export function AssembleRmFgForm({ fgRow, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [rmId, setRmId] = useState("");
  const [qty, setQty] = useState("");
  const [units, setUnits] = useState<"PCS" | "KG" | "SET" | "">("");
  const [level, setLevel] = useState<"L1" | "L2" | "L3" | "L4" | "">("");
  const [partSpecs, setPartSpecs] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const [previewUniqueId] = useState(previewPlainRandomId);

  const { data: rmCategoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category"],
    queryFn: () => listTaxonomyRows("rm-category"),
  });
  const { data: rmSubCategoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category-dd"],
    queryFn: () => listTaxonomyRows("rm-category-dd"),
  });
  const { data: rmSkuRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const categoryOptions: SelectOption[] = rmCategoryRows.map((r) => ({ value: r.CATEGORY.trim(), label: r.CATEGORY.trim() }));
  const subCategoryOptions: SelectOption[] = rmSubCategoryRows
    .filter((r) => !category || (r.Category ?? "").trim() === category.trim())
    .map((r) => ({ value: r["SUB CATEGORY"].trim(), label: r["SUB CATEGORY"].trim() }));
  const rmIdOptions: SelectOption[] = rmSkuRows
    .filter(
      (r) =>
        (!category || (r.Category ?? "").trim() === category.trim()) &&
        (!subCategory || (r["Sub Category"] ?? "").trim() === subCategory.trim())
    )
    .map((r) => ({ value: r["ID'S"], label: `${r["PART NO."] || r["ID'S"]}` }));

  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "assemble-rm-fg", "preview", fgRow["FG ID"], rmId],
    queryFn: () => previewAssembleRmFg(fgRow["FG ID"] ?? "", rmId),
    enabled: !!fgRow["FG ID"],
    retry: 1,
  });

  function canSave() {
    return !!fgRow["FG ID"] && !!rmId && !!partSpecs.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      await createTaxonomyRow("assemble-rm-fg", {
        "FG ID": fgRow["FG ID"] ?? "",
        Category: category,
        "Sub Category": subCategory,
        "RM ID": rmId,
        "No. Of Qty Use": qty.trim(),
        Units: units,
        Levels: level,
        "Part Specs.": partSpecs.trim(),
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div
        style={{
          position: "relative",
          width: isMobile ? "100%" : "min(38vw, 700px)",
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap" }}>ASSEMBLE RM FG Form</h2>
        </div>

        <div style={{ padding: isMobile ? "24px var(--space)" : "32px 40px", overflowY: "auto", flex: 1 }}>
          <TextField label="USEREMAIL" value={user?.employeeId ?? ""} disabled />
          <TextField label="TIMESTAMP" value={now.toLocaleString()} disabled />
          <TextField label="Unique id" value={previewUniqueId} disabled />
          <TextField label="FG ID" value={fgRow["FG ID"] ?? ""} disabled />
          <TextField label="FG CODE" value={preview ? preview.fgCode || "—" : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="FG CATEGORY" value={preview ? preview.fgCategory || "—" : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="FG SUB CATEGORY" value={preview ? preview.fgSubCategory || "—" : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="FG PAINT" value={preview ? preview.fgPaint || "—" : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="FG STANDARD" value={preview ? preview.fgStandard || "—" : previewFailed ? "—" : "Loading…"} disabled />

          <SearchableSelect
            label="Category"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setSubCategory("");
              setRmId("");
            }}
            options={categoryOptions}
            placeholder="Select Category…"
          />
          <div style={{ opacity: category ? 1 : 0.6, pointerEvents: category ? "auto" : "none" }}>
            <SearchableSelect
              label="Sub Category"
              value={subCategory}
              onChange={(v) => {
                setSubCategory(v);
                setRmId("");
              }}
              options={subCategoryOptions}
              placeholder={category ? "Select Sub Category…" : "Pick a Category first"}
            />
          </div>
          <SearchableSelect
            label="RM ID"
            required
            value={rmId}
            onChange={setRmId}
            options={rmIdOptions}
            placeholder="Select RM…"
          />
          <TextField label="RM CODE" value={preview ? preview.rmCode || "—" : previewFailed ? "—" : "Loading…"} disabled />
          <TextField label="DUPLICATE" value={preview ? String(preview.duplicate) : previewFailed ? "—" : "Loading…"} disabled />

          <TextField
            label="No. Of Qty Use"
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0.0000"
          />
          <ToggleGroup label="Units" value={units} onChange={setUnits} options={UNIT_OPTIONS as { value: "PCS" | "KG" | "SET"; label: string }[]} />
          <ToggleGroup label="Levels" value={level} onChange={setLevel} options={LEVEL_OPTIONS as { value: "L1" | "L2" | "L3" | "L4"; label: string }[]} />
          <TextField
            label="Part Specs."
            required
            value={partSpecs}
            onChange={(e) => setPartSpecs(e.target.value)}
            placeholder="e.g. Additional Part"
          />
          {error && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{error}</p>}
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
