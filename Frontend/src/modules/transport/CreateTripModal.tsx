import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { FormModal } from "../../components/form/FormModal";
import { createTrip, attachOrders } from "../../lib/tripsApi";
import { listTransporters, transportersToOptions } from "../../lib/mastersApi";
import { listEligibleOrders } from "../../lib/tripsApi";
import { formatTimestamp } from "../../lib/format";
import { TransportOrderForm, type QueuedSaleOrder } from "./TransportOrderForm";

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

/** "Arrange Vehicle Form" (renamed from "Transport Main Form" per user request) — Send
 * Through / Vehicle Arrange for toggles, Transporter ID only when Send Through =
 * Transporter, Freight Charge/GST Applicable only when Freight Applicable On Invoice = Y.
 * Transporter ID is a searchable select against the Transporter Data master (TRANSPORT_SHEET_ID,
 * same GET /masters/transporters already used by the Order Punch logistics tab) — selecting
 * one auto-fills Transporter Name, same pattern as Tab4LogisticsDetails.tsx.
 *
 * "Select Sale Orders" queues one or more orders (each with its own picked items/quantities,
 * via the nested TransportOrderForm → TransportItemsForm flow) client-side before the trip
 * even exists; Save creates the trip then attaches every queued order in one attachOrders()
 * call — matches the old CRR reference's nested New-row flow instead of the previous
 * simplified "create trip, then separately attach whole orders from the trip detail page"
 * two-step process. */
export function CreateTripModal({ onClose, onCreated }: Props) {
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
  const [freightGstApplicable, setFreightGstApplicable] = useState<string>("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [queuedOrders, setQueuedOrders] = useState<QueuedSaleOrder[]>([]);
  const [showOrderForm, setShowOrderForm] = useState(false);

  const { data: transporters = [] } = useQuery({ queryKey: ["masters", "transporters"], queryFn: listTransporters });
  const transporterOptions = transportersToOptions(transporters);
  const { data: eligibleOrders = [] } = useQuery({ queryKey: ["transport-eligible-orders"], queryFn: listEligibleOrders });
  const unqueuedEligibleOrders = eligibleOrders.filter((o) => !queuedOrders.some((q) => q.orderId === o.ORDER_ID));

  function handleTransporterSelect(_value: string, option?: { value: string; label: string }) {
    setTransporterId(option?.value ?? "");
    setTransporterName(option?.label ?? "");
  }

  function canSave() {
    if (freightOnInvoice === "Y" && (!freightGstApplicable || !freightCharge || Number(freightCharge) < 0)) return false;
    return queuedOrders.length > 0 && !!vehicleArrangeFor && !!vehicleType && !!vehicleNo && !!driverName && !!driverContactNo;
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
        freightGstApplicable: freightOnInvoice === "Y" ? freightGstApplicable : undefined,
        description,
      });
      await attachOrders(
        transportId,
        queuedOrders.map((q) => ({
          orderId: q.orderId,
          items: q.items.map((it) => ({ itemId: it.itemId, qty: it.qty, loadBoxes: it.loadBoxes })),
          preferredDeliveryMode: q.preferredDeliveryMode,
          freightPaidBy: q.freightPaidBy,
          freightPaidAt: q.freightPaidAt,
        }))
      );
      onCreated(transportId);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not create trip.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Arrange Vehicle Form" onClose={onClose} size="standard" sectionLabel="Vehicle Details">
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
            <>
              <TextField label="Freight Charge" required type="number" min={0} value={freightCharge} onChange={(e) => setFreightCharge(e.target.value)} />
              <ToggleGroup
                label="Freight GST Applicable"
                required
                value={freightGstApplicable as "Yes" | "No" | ""}
                onChange={setFreightGstApplicable}
                options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]}
              />
            </>
          )}

          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

          <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
            Select Sale Orders here that will transport through this vehicle. <span style={{ color: "#d32f2f" }}>*</span>
          </label>
          {queuedOrders.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}>
                    <th style={{ padding: "6px 8px" }}>Customer Name</th>
                    <th style={{ padding: "6px 8px" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {queuedOrders.map((q) => (
                    <tr key={q.orderId} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "6px 8px" }}>{q.customerName || q.orderId}</td>
                      <td style={{ padding: "6px 8px" }}>{formatTimestamp(q.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn" style={{ width: "100%", color: "#d32f2f", marginBottom: 20 }} onClick={() => setShowOrderForm(true)}>
            New
          </button>

          {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

      {showOrderForm && (
        <TransportOrderForm
          eligibleOrders={unqueuedEligibleOrders}
          onClose={() => setShowOrderForm(false)}
          onSave={(entry) => {
            setQueuedOrders((prev) => [...prev, entry]);
            setShowOrderForm(false);
          }}
        />
      )}
    </FormModal>
  );
}
