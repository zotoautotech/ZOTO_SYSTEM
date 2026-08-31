import { useState } from "react";
import { isAxiosError } from "axios";
import { FormModal } from "../components/form/FormModal";
import { TextField } from "../components/form/TextField";
import { useIsMobile } from "../lib/responsive";
import { createTaxonomyRow, updateTaxonomyRow, type TaxonomyTableMeta, type TaxonomyRow } from "./lib/npdApi";

interface Props {
  table: TaxonomyTableMeta;
  /** Present when editing an existing row; absent when creating. */
  row?: TaxonomyRow;
  onClose: () => void;
  onSaved: () => void;
}

/** Generic create/edit form for any NPD taxonomy table — fields are entirely driven by the
 * table's own metadata (see TaxonomyAdmin.tsx), matching this project's existing field-list-
 * driven form pattern (StageForm.tsx) rather than one hand-coded form per table.
 *
 * `table.computedFields` are hidden on CREATE — the backend always computes them itself (see
 * Backend/src/routes/npd/taxonomy.ts's POST handler and npdPartCode.ts), so there's nothing
 * meaningful for a doer to type; showing an input that gets silently overwritten would be
 * actively misleading. They're still shown on EDIT, for a manual correction afterward — the
 * PUT path doesn't auto-compute anything, it only writes what's submitted. */
export function TaxonomyRowForm({ table, row, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const isEdit = !!row;
  const visibleFields = table.fields.filter((f) => isEdit || !table.computedFields.includes(f));
  const [values, setValues] = useState<TaxonomyRow>(() => {
    const initial: TaxonomyRow = {};
    for (const f of table.fields) initial[f] = row?.[f] ?? "";
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    return table.requiredFields.every((f) => values[f]?.trim());
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await updateTaxonomyRow(table.key, row![table.idColumn], values);
      } else {
        await createTaxonomyRow(table.key, values);
      }
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={isEdit ? `Edit ${table.label}` : `Add ${table.label}`}
      onClose={onClose}
      size="small"
      sectionLabel={table.label}
    >
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        {!isEdit && table.computedFields.length > 0 && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: -12, marginBottom: 16 }}>
            {table.computedFields.join(", ")} {table.computedFields.length === 1 ? "is" : "are"} generated
            automatically once saved.
          </p>
        )}
        {visibleFields.map((f) => (
          <TextField
            key={f}
            label={f}
            required={table.requiredFields.includes(f)}
            value={values[f] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
          />
        ))}
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
