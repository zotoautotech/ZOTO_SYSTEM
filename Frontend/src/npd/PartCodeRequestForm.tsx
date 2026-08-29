import { useState } from "react";
import { isAxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { useIsMobile } from "../lib/responsive";
import { listTaxonomyRows, createPartCodeRequest, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

/** New Part Code Request form (build-prompt §5.2). Category/Sub Category is picked from the
 * matching *-category-dd taxonomy table (RM ref Category DD / FG ref Category DD) rather than
 * free-typed — those rows are exactly what npdPartCode.ts looks up for the generation base
 * code at approval time, so picking from real rows here (instead of a free-text field) avoids
 * a doer typing a Category/Sub Category combo whose taxonomy row doesn't exist, or exists but
 * has no CODE set yet — either of which fails at approval time (MISSING_TAXONOMY_CODE), which
 * is a much later, more confusing point to discover a typo. */
export function PartCodeRequestForm({ onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [partType, setPartType] = useState<"FG" | "RM">("FG");
  const [comboKey, setComboKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [oldPartCode, setOldPartCode] = useState("");
  const [partName, setPartName] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: combos = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", partType === "FG" ? "fg-category-dd" : "rm-category-dd"],
    queryFn: () => listTaxonomyRows(partType === "FG" ? "fg-category-dd" : "rm-category-dd"),
  });

  // The select's `value` is the row's own index into `filteredCombos`, NOT a composite of
  // Category/Sub Category text — those routinely contain spaces ("LED Modules & Drivers"), so
  // joining them into one delimited string and splitting it back apart on save would silently
  // corrupt the lookup for any multi-word category. An index is unambiguous.
  const filteredCombos = combos.filter((c) => c.Category && c["SUB CATEGORY"]);
  const comboOptions: SelectOption[] = filteredCombos.map((c, i) => ({
    value: String(i),
    label: `${c.Category} → ${c["SUB CATEGORY"]}`,
    subtitle: c.CODE ? `Code base: ${c.CODE}` : "No CODE set yet — approval will fail until one is added",
  }));

  const selectedCombo: TaxonomyRow | undefined = comboKey ? filteredCombos[Number(comboKey)] : undefined;
  const category = selectedCombo?.Category ?? "";
  const subCategory = selectedCombo?.["SUB CATEGORY"] ?? "";

  function canSave() {
    return !!category && !!subCategory && partName.trim() !== "";
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createPartCodeRequest({
        partType,
        category,
        subCategory,
        partName,
        customerName: customerName || undefined,
        oldPartCode: oldPartCode || undefined,
        partDescription: partDescription || undefined,
        remarks: remarks || undefined,
        segment: partType === "FG" ? (selectedCombo?.SEGMENT ?? undefined) : undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="New Part Code Request" onClose={onClose} size="standard" sectionLabel="Request Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
            Part Type <span style={{ color: "var(--color-error)" }}>*</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["FG", "RM"] as const).map((t) => (
              <button
                key={t}
                className="btn"
                onClick={() => {
                  setPartType(t);
                  setComboKey("");
                }}
                style={{
                  flex: 1,
                  background: partType === t ? "var(--color-primary)" : undefined,
                  color: partType === t ? "#fff" : undefined,
                }}
              >
                {t === "FG" ? "Finished Good" : "Raw Material"}
              </button>
            ))}
          </div>
        </div>

        <SearchableSelect
          label="Category / Sub Category"
          required
          value={comboKey}
          onChange={(value) => setComboKey(value)}
          options={comboOptions}
          placeholder="Search category…"
        />

        <TextField label="Part Name" required value={partName} onChange={(e) => setPartName(e.target.value)} />
        <TextField label="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        <TextField label="Old Part Code (if replacement)" value={oldPartCode} onChange={(e) => setOldPartCode(e.target.value)} />
        <TextField label="Part Description" value={partDescription} onChange={(e) => setPartDescription(e.target.value)} />
        <TextField label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />

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
          {saving ? "Saving…" : "Submit Request"}
        </button>
      </div>
    </FormModal>
  );
}
