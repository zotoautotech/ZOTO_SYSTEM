import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../form/TextField";
import { ToggleGroup } from "../form/ToggleGroup";
import { FileDropzone } from "../form/FileDropzone";
import { FormModal } from "../form/FormModal";
import { submitStageForm, submitPdiItemForm } from "../../lib/ordersApi";
import type { StageDef } from "../../lib/stages";
import { useIsMobile } from "../../lib/responsive";

interface Props {
  stage: StageDef;
  orderId: string;
  /** When given, submits per-item (currently only PDI works this way — see
   * submitPdiItemForm) instead of the order-level POST /orders/:id/:stageKey. */
  itemId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/** One generic modal form for all 8 pipeline stages after Dispatch Approval, rendering
 * whichever fields the StageDef declares (text/number/date/datetime-local/yesno/file).
 * Saves via POST /orders/:id/:stageKey (Backend/src/routes/stageRoutes.ts). */
export function StageForm({ stage, orderId, itemId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function canSave() {
    return stage.fields.every((f) => !f.required || (values[f.key] ?? "").trim() !== "");
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, string | number> = {};
      for (const field of stage.fields) {
        const raw = values[field.key];
        if (raw === undefined || raw === "") continue;
        payload[field.key] = field.type === "number" ? Number(raw) : raw;
      }
      if (itemId) {
        await submitPdiItemForm(orderId, itemId, payload);
      } else {
        await submitStageForm(stage.key, orderId, payload);
      }
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title={`${stage.label} Form`} onClose={onClose} size="standard" sectionLabel={`${stage.label} Details`}>
        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
          {stage.fields.map((field) => {
            const value = values[field.key] ?? "";
            if (field.type === "yesno") {
              return (
                <ToggleGroup
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  value={value as "Yes" | "No" | ""}
                  onChange={(v) => set(field.key, v)}
                  options={[
                    { value: "Yes", label: "Yes" },
                    { value: "No", label: "No" },
                  ]}
                />
              );
            }
            if (field.type === "file") {
              return (
                <FileDropzone
                  key={field.key}
                  label={field.label + (field.required ? " *" : "")}
                  value={value}
                  onChange={(v) => set(field.key, v)}
                  context={`${stage.key}_${orderId}`}
                />
              );
            }
            return (
              <TextField
                key={field.key}
                label={field.label}
                required={field.required}
                type={field.type === "text" ? "text" : field.type}
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
              />
            );
          })}

          {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
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
