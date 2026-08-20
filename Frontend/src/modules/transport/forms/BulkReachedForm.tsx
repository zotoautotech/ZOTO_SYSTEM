import { useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../../components/form/TextField";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { SearchableSelect } from "../../../components/form/SearchableSelect";
import { FormModal } from "../../../components/form/FormModal";
import { submitTripStage } from "../../../lib/tripsApi";

interface Props {
  items: Record<string, string>[];
  onClose: () => void;
  onSaved: () => void;
}

const VEHICLE_TYPES = ["2 Wheeler", "3 Wheeler", "4 Wheeler", "6 Wheeler", "8 Wheeler", "10 Wheeler", "12 Wheeler"].map((v) => ({
  value: v,
  label: v,
}));

type Tab = "reach" | "vehicle";

interface TripResult {
  transportId: string;
  status: "pending" | "success" | "error";
  message?: string;
}

/**
 * Applies ONE Transport Reached decision to every trip behind the selected pending items at
 * once — a second, additional entry point alongside the existing single-trip ReachedForm,
 * which this never touches or calls into. Reuses the exact same POST
 * /transport-trips/:transportId/reached endpoint (via submitTripStage), once per DISTINCT
 * trip, run sequentially so two calls can't race each other.
 *
 * The pending list is item-level (one row per Transport_Products item), but Reached is a
 * trip-level action — several selected items can belong to the same trip (see the Sai
 * Traders example with 12 item rows on one trip), so this dedupes selected items down to
 * their distinct Transport_IDs before submitting, and shows that deduped trip list rather
 * than the raw item list, so the doer sees exactly how many trips (not items) are about to
 * be decided.
 */
export function BulkReachedForm({ items, onClose, onSaved }: Props) {
  // Snapshot the selection at mount time — `items` is bound to the parent's live pending-item
  // query, and onSaved() invalidates that query mid-flow, which shrinks the pending list (a
  // just-decided trip drops off it). Without this snapshot, the prop update would reactively
  // shrink `trips` to fewer/zero entries WHILE this modal is still open showing its own
  // results, so "1 succeeded" would end up next to "0 selected trips" — confusing and wrong,
  // since the decision already went through. The form's own view of what it's deciding must
  // stay fixed once opened, regardless of what the background list does afterward.
  const [snapshotItems] = useState(items);
  const trips = useMemo(() => {
    const map = new Map<string, Record<string, string>[]>();
    for (const item of snapshotItems) {
      const id = item.Transport_ID;
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(item);
    }
    return Array.from(map, ([transportId, rows]) => ({ transportId, rows }));
  }, [items]);

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
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<TripResult[] | null>(null);

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

  function canSave() {
    return needsVehicleTab ? canSaveVehicle() : canSaveDirect();
  }

  async function handleSave() {
    if (!canSave() || submitting) return;
    setSubmitting(true);
    const running: TripResult[] = trips.map((t) => ({ transportId: t.transportId, status: "pending" }));
    setResults([...running]);

    const payload = {
      reached,
      sameVehicle: reached === "Yes" ? sameVehicle : "",
      expectedDateTime: reached === "No" ? expectedDateTime : "",
      reason: reached === "No" ? reason : "",
      ...(needsVehicleTab ? { vehicleType, vehicleNo, vehicleSize, driverName, driverContactNo } : {}),
    };

    for (let i = 0; i < trips.length; i++) {
      try {
        await submitTripStage(trips[i].transportId, "reached", payload);
        running[i] = { transportId: trips[i].transportId, status: "success" };
      } catch (err) {
        const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
        running[i] = { transportId: trips[i].transportId, status: "error", message: detail ?? "Could not save." };
      }
      setResults([...running]);
    }

    setSubmitting(false);
    onSaved();
    // Auto-close on a clean sweep — nothing left for the doer to review. A partial failure
    // keeps the modal open so the per-trip Saved/Failed list (and the hover reason) stays
    // visible instead of vanishing along with the one thing they'd need to retry.
    if (running.every((r) => r.status === "success")) onClose();
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;
  const done = results !== null && !submitting;

  return (
    <FormModal
      title="Bulk Transport Reached Form"
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
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
          Applying one decision to {trips.length} selected trip{trips.length === 1 ? "" : "s"} ({snapshotItems.length} item
          {snapshotItems.length === 1 ? "" : "s"}).
        </p>

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            marginBottom: 20,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {trips.map((trip, i) => {
            const result = results?.[i];
            const first = trip.rows[0];
            return (
              <div
                key={trip.transportId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: i < trips.length - 1 ? "1px solid var(--color-border)" : undefined,
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {trip.transportId} · {first?.["Customer Name"] || "—"}
                  </div>
                  <div className="text-muted">
                    {trip.rows.length} item{trip.rows.length === 1 ? "" : "s"}
                  </div>
                </div>
                {result && (
                  <span
                    style={{
                      flexShrink: 0,
                      color:
                        result.status === "success"
                          ? "var(--color-success, #2e7d32)"
                          : result.status === "error"
                            ? "#d32f2f"
                            : "var(--color-text-muted)",
                      fontSize: 12,
                      alignSelf: "center",
                    }}
                    title={result.message}
                  >
                    {result.status === "success" ? "Saved" : result.status === "error" ? "Failed" : "…"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {(!needsVehicleTab || tab === "reach") && (
          <>
            <ToggleGroup
              label="Transport Reached"
              required
              value={reached}
              onChange={setReached}
              options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]}
            />

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
            <TextField label="Vehicle Size (Ft)" value={vehicleSize} onChange={(e) => setVehicleSize(e.target.value)} />
            <TextField label="Driver Name" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            <TextField label="Driver Contact No." required value={driverContactNo} onChange={(e) => setDriverContactNo(e.target.value)} />
          </>
        )}

        {done && (
          <p style={{ fontSize: 13, marginTop: 12 }}>
            {successCount} succeeded{errorCount > 0 ? `, ${errorCount} failed — hover a trip above for the reason.` : "."}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px var(--space)",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-bg-page)",
        }}
      >
        {needsVehicleTab && tab === "vehicle" ? (
          <button className="btn" onClick={() => setTab("reach")} disabled={submitting}>
            Prev
          </button>
        ) : (
          <button className="btn" onClick={onClose} disabled={submitting}>
            {done ? "Close" : "Cancel"}
          </button>
        )}
        {needsVehicleTab && tab === "reach" ? (
          <button className="btn btn-primary" onClick={() => setTab("vehicle")} disabled={!canGoNext()}>
            Next
          </button>
        ) : (
          !done && (
            <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || submitting}>
              {submitting ? `Saving… (${results?.filter((r) => r.status !== "pending").length ?? 0}/${trips.length})` : "Save"}
            </button>
          )
        )}
      </div>
    </FormModal>
  );
}
