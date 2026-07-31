import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { SearchableSelect } from "../../../components/form/SearchableSelect";
import { FormModal } from "../../../components/form/FormModal";
import { submitTripStage } from "../../../lib/tripsApi";

interface Props {
  transportId: string;
  onClose: () => void;
  onSaved: () => void;
}

const VEHICLE_TYPES = ["2 Wheeler", "3 Wheeler", "4 Wheeler", "6 Wheeler", "8 Wheeler", "10 Wheeler", "12 Wheeler"].map((v) => ({
  value: v,
  label: v,
}));

type Tab = "reach" | "vehicle";

/** Matches the old CRR reference "Transport Reached Form" exactly: a single-tab form when
 * Reached=No (Expected DateTime/Reason) or Reached=Yes+Same Vehicle=Yes (nothing else to
 * fill), but Reached=Yes+Same Vehicle=No reveals a second "Vehicle Details" tab and the
 * footer swaps Save for Next — Next is disabled until Same Vehicle is actually answered,
 * and only the Vehicle Details tab's own Save (gated on its own required fields) submits.
 * The picked vehicle here is submitted to the backend and both logs against this reach event
 * AND updates the trip's own vehicle going forward (see POST /:transportId/reached). */
export function ReachedForm({ transportId, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>("reach");
  const [reached, setReached] = useState<"Yes" | "No" | "">("");
  const [sameVehicle, setSameVehicle] = useState<"Yes" | "No" | "">("");
  const [expectedDateTime, setExpectedDateTime] = useState("");
  const [reason, setReason] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [vehicleSize, setVehicleSize] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContactNo, setDriverContactNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsVehicleTab = reached === "Yes" && sameVehicle === "No";

  function canGoNext() {
    return reached === "Yes" && !!sameVehicle;
  }

  function canSaveDirect() {
    if (!reached) return false;
    if (reached === "No") return !!expectedDateTime && !!reason.trim();
    if (reached === "Yes" && sameVehicle === "Yes") return true;
    return false;
  }

  function canSaveVehicle() {
    return !!vehicleType && !!vehicleNo && !!driverContactNo;
  }

  async function handleSave() {
    const valid = needsVehicleTab ? canSaveVehicle() : canSaveDirect();
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitTripStage(transportId, "reached", {
        reached,
        sameVehicle: reached === "Yes" ? sameVehicle : "",
        expectedDateTime: reached === "No" ? expectedDateTime : "",
        reason: reached === "No" ? reason : "",
        ...(needsVehicleTab
          ? {
              vehicleType,
              vehicleNo,
              vehicleSize,
              driverName,
              driverContactNo,
            }
          : {}),
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not save.");
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Transport Reached Form"
      onClose={onClose}
      size="standard"
      sectionLabel={needsVehicleTab ? undefined : "Transport Reach Details"}
    >
      {needsVehicleTab && (
        <div style={{ display: "flex", padding: "0 var(--space)", borderBottom: "1px solid var(--color-border)" }}>
          {(["reach", "vehicle"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              disabled={t === "vehicle" && !canGoNext()}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "none",
                border: "none",
                fontWeight: 600,
                fontSize: 14,
                color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
                cursor: t === "vehicle" && !canGoNext() ? "default" : "pointer",
              }}
            >
              {t === "reach" ? "Transport Reach Details" : "Vehicle Details"}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        {(!needsVehicleTab || tab === "reach") && (
          <>
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
          </>
        )}

        {needsVehicleTab && tab === "vehicle" && (
          <>
            <SearchableSelect label="Vehicle type" required value={vehicleType} onChange={(v) => setVehicleType(v)} options={VEHICLE_TYPES} placeholder="Search" />
            <TextField label="Vehicle No." required value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
            <TextField label="Vehicle Size (Ft)" type="number" value={vehicleSize} onChange={(e) => setVehicleSize(e.target.value)} />
            <TextField label="Driver Name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            <TextField label="Driver Contact No." required value={driverContactNo} onChange={(e) => setDriverContactNo(e.target.value)} />
          </>
        )}

        {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
        {needsVehicleTab && tab === "vehicle" ? (
          <button className="btn" onClick={() => setTab("reach")} disabled={saving}>
            Prev
          </button>
        ) : (
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        )}
        {needsVehicleTab && tab === "reach" ? (
          <button className="btn btn-primary" onClick={() => setTab("vehicle")} disabled={!canGoNext()}>
            Next
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={(needsVehicleTab ? !canSaveVehicle() : !canSaveDirect()) || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </FormModal>
  );
}
