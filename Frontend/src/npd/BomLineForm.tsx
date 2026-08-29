import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createBomLine, updateBomLine, type BomLine } from "./lib/npdApi";

interface Props {
  fgId: string;
  /** Present when editing an existing line's Rate/Quantity/Units/Level. */
  line?: BomLine;
  onClose: () => void;
  onSaved: () => void;
}

/** Add/edit a BOM line against one FG SKU (build-prompt §5.3). RM SKU is picked from the RM
 * catalog (SearchableSelect, not free-typed) so the line always references a real row — the
 * backend snapshots that row's Category/Sub Category/Code onto the BOM line itself at create
 * time (denormalized, see bom.ts), so RM SKU can't be changed on an existing line without
 * deleting and re-adding it; editing only covers Quantity/Units/Level/Rate. */
export function BomLineForm({ fgId, line, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const isEdit = !!line;
  const [rmId, setRmId] = useState(line?.["RM ID"] ?? "");
  const [quantity, setQuantity] = useState(line?.Quantity ?? "");
  const [units, setUnits] = useState(line?.Units ?? "PCS");
  const [level, setLevel] = useState(line?.Levels ?? "");
  const [levelSorting, setLevelSorting] = useState(line?.["Level Sorting"] ?? "0");
  const [rate, setRate] = useState(line?.Rate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: rmRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
    enabled: !isEdit,
  });

  const rmOptions: SelectOption[] = rmRows.map((r) => ({
    value: r["ID'S"],
    label: `${r["PART NO."] || r["ID'S"]} — ${r.Category} / ${r["Sub Category"]}`,
  }));

  function canSave() {
    return (isEdit || !!rmId) && Number(quantity) > 0 && units.trim() !== "";
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await updateBomLine(line!["Unique ID"], {
          quantity: Number(quantity),
          units,
          level: level || undefined,
          levelSorting: levelSorting ? Number(levelSorting) : undefined,
          rate: rate === "" ? undefined : Number(rate),
        });
      } else {
        await createBomLine({
          fgId,
          rmId,
          quantity: Number(quantity),
          units,
          level: level || undefined,
          levelSorting: levelSorting ? Number(levelSorting) : undefined,
          rate: rate === "" ? undefined : Number(rate),
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
    <FormModal title={isEdit ? "Edit BOM Line" : "Add BOM Line"} onClose={onClose} size="small" sectionLabel="BOM Line">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        {isEdit ? (
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            RM: {line!["RM Code"] || line!["RM ID"]}
          </p>
        ) : (
          <SearchableSelect
            label="RM SKU"
            required
            value={rmId}
            onChange={(value) => setRmId(value)}
            options={rmOptions}
            placeholder="Search RM SKU…"
          />
        )}
        <TextField label="Quantity" required type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <TextField label="Units" required value={units} onChange={(e) => setUnits(e.target.value)} />
        <TextField label="Level" value={level} onChange={(e) => setLevel(e.target.value)} />
        <TextField label="Level Sorting" type="number" value={levelSorting} onChange={(e) => setLevelSorting(e.target.value)} />
        <TextField label="Rate" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
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
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </FormModal>
  );
}
