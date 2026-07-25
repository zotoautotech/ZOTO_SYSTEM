import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { submitTripStage } from "../../../lib/tripsApi";
import { useIsMobile } from "../../../lib/responsive";
import { StageModalShell } from "./StageModalShell";

interface Props {
  transportId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Matches the reference "Transport Reached Form" (docs/04-UIUX-BRIEF.md §9.3). The
 * "Same Vehicle = No" branch's Vehicle Details tab isn't wired to the backend yet (the
 * /reached endpoint always uses the trip's existing vehicle for the Transport_Reached
 * rows) — captured here as flags only, not yet able to actually swap the trip's vehicle. */
export function ReachedForm({ transportId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [reached, setReached] = useState<"Yes" | "No" | "">("");
  const [sameVehicle, setSameVehicle] = useState<"Yes" | "No" | "">("");
  const [expectedDateTime, setExpectedDateTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function canSave() {
    if (!reached) return false;
    if (reached === "No") return !!expectedDateTime && !!reason.trim();
    return !!sameVehicle;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "reached", {
        reached,
        sameVehicle: reached === "Yes" ? sameVehicle : "",
        expectedDateTime: reached === "No" ? expectedDateTime : "",
        reason: reached === "No" ? reason : "",
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  return (
    <StageModalShell title="Transport Reached Form" tabLabel="Transport Reach Details" onClose={onClose}>
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <ToggleGroup label="Transport Reached" required value={reached} onChange={setReached} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />

        {reached === "No" && (
          <>
            <TextField label="Expected DateTime" required type="datetime-local" value={expectedDateTime} onChange={(e) => setExpectedDateTime(e.target.value)} />
            <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          </>
        )}

        {reached === "Yes" && (
          <ToggleGroup label="Same Vehicle" required value={sameVehicle} onChange={setSameVehicle} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
        )}

        {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
        <button className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </StageModalShell>
  );
}
