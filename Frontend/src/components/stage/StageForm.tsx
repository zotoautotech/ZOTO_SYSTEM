import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../form/TextField";
import { ToggleGroup } from "../form/ToggleGroup";
import { FileDropzone } from "../form/FileDropzone";
import { submitStageForm } from "../../lib/ordersApi";
import type { StageDef } from "../../lib/stages";
import { useIsMobile } from "../../lib/responsive";

interface Props {
  stage: StageDef;
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** One generic modal form for all 8 pipeline stages after Dispatch Approval, rendering
 * whichever fields the StageDef declares (text/number/date/datetime-local/yesno/file).
 * Saves via POST /orders/:id/:stageKey (Backend/src/routes/stageRoutes.ts). */
export function StageForm({ stage, orderId, onClose, onSaved }: Props) {
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
      await submitStageForm(stage.key, orderId, payload);
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17, 17, 20, 0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(560px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>{stage.label} Form</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)" }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            {stage.label} Details
          </div>
        </div>

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
      </div>
    </div>
  );
}
