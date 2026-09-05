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
  /** The FG SKU this BOM line belongs to. Two shapes: a REAL already-saved row (has a real
   * `FG ID`) — FG CODE/CATEGORY/SUB CATEGORY/BRAND/STANDARD are then shown as a live
   * server-computed preview (see taxonomy.ts's assemble-rm-fg POST handler); or a VIRTUAL
   * not-yet-saved row (`FG ID` blank — `FgSkuForm.tsx` passes one built straight from its own
   * in-progress field values while the doer is still filling in the parent form) — those same
   * fields are then shown directly from `fgRow` itself instead of a server preview, since
   * there's no real FG ID yet to look one up by. */
  fgRow: TaxonomyRow;
  /** Present only when `fgRow` may be virtual — actually saves the parent FG SKU (idempotent,
   * see `FgSkuForm.tsx`'s `doSave()`) and returns the real row. Called from THIS form's own
   * Save button, the instant the doer takes an explicit save action here — never before. */
  ensureFgSaved?: () => Promise<TaxonomyRow>;
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
 * (USEREMAIL/TIMESTAMP/Unique id/FG ID/FG CODE/FG CATEGORY/FG SUB CATEGORY/FG BRAND/
 * FG STANDARD/Category/Sub Category/RM ID/RM CODE/DUPLICATE/No. Of Qty Use/Units/Levels/
 * Part Specs.). Live on the real "ASSEMBLE RM FG" tab (FG_SHEET_ID) — a different tab from
 * `BomBuilder.tsx`'s own "ASSEMBLE RM FG (BOM)" (see taxonomy.ts's own comment on why these
 * aren't the same table).
 *
 * `Category`/`Sub Category` here are the RM side's own taxonomy (RM ref Category/Category DD),
 * used to narrow the RM ID picker — same "narrow the search first" pattern
 * `RmSkuForm.tsx`/`FgSkuForm.tsx` already use for their own Category → Sub Category chains.
 * Their own dropdown labels show quantity+unit (e.g. "CONTROLLER SET - 1 SET"), matching
 * `RmSkuForm.tsx`'s own `withQuantity()` pattern, per explicit instruction.
 *
 * **RM ID is now a bulk checkbox list, not a single picker** — the real reference sheet has
 * many RM rows sharing one FG CODE (confirmed against the legacy "Copy of ADC/PRODUCT
 * MASTER-FG" spreadsheet's own `ASSEMBLE RM FG` tab: one FG CODE like `BI003C2` has 6+ RM
 * rows — BUSH, STUDS, BEARING, DRUM RING, PACKAGING POLY, PACKAGING BOX, …), so a doer
 * building a BOM needs to add many RM lines at once, not repeat this whole form one RM at a
 * time. Ticking several RM checkboxes and clicking Save once creates one row per ticked RM
 * (`selectedQty` holds each one's own "No. Of Qty Use") — same "queue several picks, then one
 * Save creates every row" bulk pattern `CreateTripModal.tsx`'s own "Select Sale Orders"
 * checkbox table already uses elsewhere in this app (see CLAUDE.md's Transport section). */
export function AssembleRmFgForm({ fgRow, ensureFgSaved, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  // One qty string per ticked RM ID — presence as a key IS the "selected" flag (an RM ID with
  // no key isn't ticked), so unticking just deletes its key rather than tracking a separate
  // boolean set alongside it.
  const [selectedQty, setSelectedQty] = useState<Record<string, string>>({});
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

  // Label suffixed with "- <QUANTITY> <UNIT>" when the ref row has both (e.g.
  // "CONTROLLER SET - 1 SET") — matches RmSkuForm.tsx's own `withQuantity()`, per explicit
  // instruction. `value` stays the bare trimmed name either way.
  function withQuantity(name: string, r: TaxonomyRow): string {
    const qty = (r.QUANTITY ?? "").trim();
    const unit = (r.UNIT ?? "").trim();
    return qty ? `${name} - ${qty}${unit ? ` ${unit}` : ""}` : name;
  }
  const categoryOptions: SelectOption[] = rmCategoryRows.map((r) => ({
    value: r.CATEGORY.trim(),
    label: withQuantity(r.CATEGORY.trim(), r),
  }));
  const subCategoryOptions: SelectOption[] = rmSubCategoryRows
    .filter((r) => !category || (r.Category ?? "").trim() === category.trim())
    .map((r) => ({ value: r["SUB CATEGORY"].trim(), label: withQuantity(r["SUB CATEGORY"].trim(), r) }));
  const rmIdRows = rmSkuRows.filter(
    (r) =>
      (!category || (r.Category ?? "").trim() === category.trim()) &&
      (!subCategory || (r["Sub Category"] ?? "").trim() === subCategory.trim())
  );

  const hasRealFgId = !!fgRow["FG ID"];
  const selectedIds = Object.keys(selectedQty);

  // FG-side snapshot fields only (FG CODE/CATEGORY/SUB CATEGORY/BRAND/STANDARD) — no single
  // RM ID to pass anymore (bulk checkbox list below replaces the old one-at-a-time picker),
  // so this is always called with a blank rmId; the backend endpoint tolerates that (just
  // skips the RM-half of its lookup, which this form no longer needs displayed per-line).
  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ["npd", "taxonomy", "assemble-rm-fg", "preview", fgRow["FG ID"]],
    queryFn: () => previewAssembleRmFg(fgRow["FG ID"] ?? "", ""),
    enabled: hasRealFgId,
    retry: 1,
  });

  function toggleRm(id: string) {
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = "";
      return next;
    });
  }

  function canSave() {
    return selectedIds.length > 0 && selectedIds.every((id) => selectedQty[id].trim()) && !!partSpecs.trim() && !saving;
  }

  async function handleSave() {
    if (!canSave()) return;
    setSaving(true);
    setError("");
    try {
      // Resolve the real FG ID now, at THIS explicit Save click — if the parent FG SKU is
      // still virtual (unsaved), `ensureFgSaved()` saves it for real right here (idempotent
      // if it's already been saved by some other path). Never fires before this point.
      const resolvedFgRow = hasRealFgId ? fgRow : ensureFgSaved ? await ensureFgSaved() : fgRow;
      // One row per ticked RM — sequential (not Promise.all), matching CreateTripModal.tsx's
      // own bulk-attach pattern, so each row's random Unique ID is minted against an
      // up-to-date read of the tab rather than several requests racing off the same stale
      // snapshot.
      for (const id of selectedIds) {
        await createTaxonomyRow("assemble-rm-fg", {
          "FG ID": resolvedFgRow["FG ID"] ?? "",
          Category: category,
          "Sub Category": subCategory,
          "RM ID": id,
          "No. Of Qty Use": selectedQty[id].trim(),
          Units: units,
          Levels: level,
          "Part Specs.": partSpecs.trim(),
        });
      }
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
          <TextField label="FG ID" value={hasRealFgId ? fgRow["FG ID"] ?? "" : "Not saved yet"} disabled />
          <TextField
            label="FG CODE"
            value={hasRealFgId ? (preview ? preview.fgCode || "—" : previewFailed ? "—" : "Loading…") : fgRow["PART NO."] || "—"}
            disabled
          />
          <TextField
            label="FG CATEGORY"
            value={hasRealFgId ? (preview ? preview.fgCategory || "—" : previewFailed ? "—" : "Loading…") : fgRow.CATEGORY || "—"}
            disabled
          />
          <TextField
            label="FG SUB CATEGORY"
            value={
              hasRealFgId
                ? preview
                  ? preview.fgSubCategory || "—"
                  : previewFailed
                    ? "—"
                    : "Loading…"
                : fgRow["SUB CATEGORY"] || "—"
            }
            disabled
          />
          <TextField
            label="FG BRAND"
            value={hasRealFgId ? (preview ? preview.fgBrand || "—" : previewFailed ? "—" : "Loading…") : fgRow.Brand || "—"}
            disabled
          />
          <TextField
            label="FG STANDARD"
            value={
              hasRealFgId
                ? preview
                  ? preview.fgStandard || "—"
                  : previewFailed
                    ? "—"
                    : "Loading…"
                : fgRow["STANDARD PART"] || "—"
            }
            disabled
          />

          <SearchableSelect
            label="Category"
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
              value={subCategory}
              onChange={setSubCategory}
              options={subCategoryOptions}
              placeholder={category ? "Select Sub Category…" : "Pick a Category first"}
            />
          </div>

          {/* Bulk checkbox list, replacing the old one-RM-at-a-time picker — see this file's
              own module doc comment for why. Each ticked row gets its own "No. Of Qty Use"
              input inline; Save creates one row per ticked RM. */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
              RM ID<span style={{ color: "#DC2626" }}> *</span>
            </label>
            <div
              style={{
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {rmIdRows.length === 0 && (
                <p style={{ margin: 0, padding: 16, fontSize: 13, color: "#6B7280" }}>
                  {category ? "No RM SKUs match this Category/Sub Category." : "Pick a Category to narrow the list, or scroll to browse everything."}
                </p>
              )}
              {rmIdRows.map((r) => {
                const id = r["ID'S"];
                const checked = id in selectedQty;
                return (
                  <div
                    key={id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderBottom: "1px solid #F3F4F6",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRm(id)}
                      style={{ width: 16, height: 16, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: 14, color: "#1A1A1A" }}>{r["PART NO."] || id}</span>
                    {checked && (
                      <input
                        type="number"
                        value={selectedQty[id]}
                        onChange={(e) => setSelectedQty((prev) => ({ ...prev, [id]: e.target.value }))}
                        placeholder="Qty"
                        style={{
                          width: 90,
                          height: 32,
                          borderRadius: 6,
                          border: "1px solid #D1D5DB",
                          padding: "4px 8px",
                          fontSize: 13,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

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
