import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { useIsMobile } from "../../lib/responsive";
import { createTrip } from "../../lib/tripsApi";
import { listTransporters, transportersToOptions } from "../../lib/mastersApi";

interface Props {
  onClose: () => void;
  onCreated: (transportId: string) => void;
}

const SEND_THROUGH_OPTIONS = ["Courier", "Porter", "Transporter", "Cust. Vehicle", "Local Vehicle"] as const;
const VEHICLE_ARRANGE_OPTIONS = ["Customer", "Transporter booking", "Multi Location"] as const;
const VEHICLE_TYPES = ["2 Wheeler", "3 Wheeler", "4 Wheeler", "6 Wheeler", "8 Wheeler", "10 Wheeler", "12 Wheeler"].map((v) => ({
  value: v,
  label: v,
}));

/** Matches the old "Transport Main Form" reference (docs/04-UIUX-BRIEF.md §9.1): Send
 * Through / Vehicle Arrange for toggles, Transporter ID only when Send Through =
 * Transporter, Freight Charge/GST Applicable only when Freight Applicable On Invoice = Y.
 * Transporter ID is a searchable select against the Transporter Data master (TRANSPORT_SHEET_ID,
 * same GET /masters/transporters already used by the Order Punch logistics tab) — selecting
 * one auto-fills Transporter Name, same pattern as Tab4LogisticsDetails.tsx. */
export function CreateTripModal({ onClose, onCreated }: Props) {
  const isMobile = useIsMobile();
  const [sendThrough, setSendThrough] = useState<string>("");
  const [vehicleArrangeFor, setVehicleArrangeFor] = useState<string>("");
  const [transporterId, setTransporterId] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [vehicleSize, setVehicleSize] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContactNo, setDriverContactNo] = useState("");
  const [freightOnInvoice, setFreightOnInvoice] = useState<string>("");
  const [freightCharge, setFreightCharge] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: transporters = [] } = useQuery({ queryKey: ["masters", "transporters"], queryFn: listTransporters });
  const transporterOptions = transportersToOptions(transporters);

  function handleTransporterSelect(_value: string, option?: { value: string; label: string }) {
    setTransporterId(option?.value ?? "");
    setTransporterName(option?.label ?? "");
  }

  function canSave() {
    return !!vehicleArrangeFor && !!vehicleType && !!vehicleNo && !!driverName && !!driverContactNo;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      const { transportId } = await createTrip({
        vehicleArrangeFor,
        sendThrough,
        transporterId: sendThrough === "Transporter" ? transporterId : undefined,
        transporterName: sendThrough === "Transporter" ? transporterName : undefined,
        vehicleType,
        vehicleNo,
        vehicleSize,
        driverName,
        driverContactNo,
        freightApplicableOnInvoice: freightOnInvoice,
        freightCharge: freightOnInvoice === "Y" && freightCharge ? Number(freightCharge) : undefined,
        description,
      });
      onCreated(transportId);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not create trip.");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17,17,20,0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Transport Main Form</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            Vehicle Details
          </div>
        </div>

        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
          <ToggleGroup
            label="Send Through"
            required
            value={sendThrough as (typeof SEND_THROUGH_OPTIONS)[number] | ""}
            onChange={setSendThrough}
            options={SEND_THROUGH_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
          <ToggleGroup
            label="Vehicle Arrange for"
            required
            value={vehicleArrangeFor as (typeof VEHICLE_ARRANGE_OPTIONS)[number] | ""}
            onChange={setVehicleArrangeFor}
            options={VEHICLE_ARRANGE_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
          <p className="text-muted" style={{ fontSize: 12, marginTop: -8 }}>
            Customer - If material direct dispatch to customer. Transport Booking - If material dispatch for
            transport booking. Multi location - If material dispatch by multiple points.
          </p>

          {sendThrough === "Transporter" && (
            <>
              <SearchableSelect
                label="Transporter ID"
                value={transporterId}
                onChange={handleTransporterSelect}
                options={transporterOptions}
                placeholder="Search transporter…"
              />
              <TextField label="Transporter Name" value={transporterName} disabled />
            </>
          )}

          <SearchableSelect label="Vehicle type" required value={vehicleType} onChange={(v) => setVehicleType(v)} options={VEHICLE_TYPES} placeholder="Search" />
          <TextField label="Vehicle No." required value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          <TextField label="Vehicle Size (Ft)" type="number" value={vehicleSize} onChange={(e) => setVehicleSize(e.target.value)} />
          <TextField label="Driver Name" required value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          <TextField label="Driver Contact No." required value={driverContactNo} onChange={(e) => setDriverContactNo(e.target.value)} />

          <ToggleGroup
            label="Freight Applicable On Invoice?"
            required
            value={freightOnInvoice as "N" | "Y" | ""}
            onChange={setFreightOnInvoice}
            options={[{ value: "N", label: "N" }, { value: "Y", label: "Y" }]}
          />
          {freightOnInvoice === "Y" && (
            <TextField label="Freight Charge" type="number" value={freightCharge} onChange={(e) => setFreightCharge(e.target.value)} />
          )}

          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

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
      </div>
    </div>
  );
}
