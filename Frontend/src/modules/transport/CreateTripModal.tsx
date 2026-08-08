import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { FormModal } from "../../components/form/FormModal";
import { createTrip, attachOrders } from "../../lib/tripsApi";
import { listTransporters, transportersToOptions, listZotoVehicles, zotoVehiclesToOptions } from "../../lib/mastersApi";
import { listEligibleOrders } from "../../lib/tripsApi";
import { getOrder, listPdiItems, type OrderRecord } from "../../lib/ordersApi";

interface PickedItem {
  itemId: string;
  partName: string;
  qty: number;
  unit: string;
  loadBoxes?: number;
}

interface QueuedSaleOrder {
  orderId: string;
  customerName: string;
  timestamp: string;
  items: PickedItem[];
  preferredDeliveryMode: string;
  freightPaidBy: string;
  freightPaidAt: string;
}

interface Props {
  onClose: () => void;
  onCreated: (transportId: string) => void;
}

const SEND_THROUGH_OPTIONS = ["Courier", "Porter", "Transporter", "Cust. Vehicle", "Local Vehicle", "ZOTO Vehicle"] as const;
const VEHICLE_ARRANGE_OPTIONS = ["Customer", "Transporter booking", "Multi Location"] as const;
const VEHICLE_TYPES = ["2 Wheeler", "3 Wheeler", "4 Wheeler", "6 Wheeler", "8 Wheeler", "10 Wheeler", "12 Wheeler"].map((v) => ({
  value: v,
  label: v,
}));
/** Same default the Order Punch logistics tab uses — ZOTO's own vehicle, currently the only
 * row in the ZOTO Vehicle master. Details auto-fill from that master once it loads. */
const DEFAULT_ZOTO_VEHICLE_ID = "VEH-001";

/** "Arrange Vehicle Form" (renamed from "Transport Main Form" per user request) — Send
 * Through / Vehicle Arrange for toggles, Transporter ID only when Send Through =
 * Transporter, Freight Charge/GST Applicable only when Freight Applicable On Invoice = Y.
 * Transporter ID is a searchable select against the Transporter Data master (TRANSPORT_SHEET_ID,
 * same GET /masters/transporters already used by the Order Punch logistics tab) — selecting
 * one auto-fills Transporter Name, same pattern as Tab4LogisticsDetails.tsx.
 *
 * "Select Sale Orders" is a checkbox table over the eligible orders: ticking one queues it
 * client-side before the trip even exists, with every item at its full Balance Qty to
 * Dispatch and the logistics fields taken off the order itself. Save then creates the trip
 * and attaches every queued order in one attachOrders() call.
 *
 * This replaced a three-deep nested modal flow (Transport Form → Load Limit Details, one
 * pass per item) that existed only to re-enter values the order already carried. Its one
 * genuine capability was a Load Qty below the full quantity; the user asked for that to go
 * too, so partial loads are deliberately not supported here — restoring them means bringing
 * back a per-item quantity input, not just re-adding a button. */
export function CreateTripModal({ onClose, onCreated }: Props) {
  // Opening defaults — the overwhelmingly common case is ZOTO's own vehicle going straight to
  // a customer with freight off-invoice, so the doer only touches these when it's an
  // exception. All still editable.
  const [sendThrough, setSendThrough] = useState<string>("ZOTO Vehicle");
  const [vehicleArrangeFor, setVehicleArrangeFor] = useState<string>("Customer");
  const [transporterId, setTransporterId] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [transporterType, setTransporterType] = useState("");
  const [zotoVehicleId, setZotoVehicleId] = useState(DEFAULT_ZOTO_VEHICLE_ID);
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [vehicleSize, setVehicleSize] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverContactNo, setDriverContactNo] = useState("");
  const [freightOnInvoice, setFreightOnInvoice] = useState<string>("N");
  const [freightCharge, setFreightCharge] = useState("");
  const [freightGstApplicable, setFreightGstApplicable] = useState<string>("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [queuedOrders, setQueuedOrders] = useState<QueuedSaleOrder[]>([]);
  const [loadingOrderId, setLoadingOrderId] = useState("");
  const queryClient = useQueryClient();

  const { data: transporters = [] } = useQuery({ queryKey: ["masters", "transporters"], queryFn: listTransporters });
  const transporterOptions = transportersToOptions(transporters);
  const { data: zotoVehicles = [] } = useQuery({ queryKey: ["masters", "zoto-vehicles"], queryFn: listZotoVehicles });
  const zotoVehicleOptions = zotoVehiclesToOptions(zotoVehicles);
  const { data: eligibleOrders = [] } = useQuery({ queryKey: ["transport-eligible-orders"], queryFn: listEligibleOrders });
  const unqueuedEligibleOrders = eligibleOrders.filter((o) => !queuedOrders.some((q) => q.orderId === o.ORDER_ID));
  // PDI already recorded a Box Quantity per item, so auto-selecting an order can carry Load
  // Boxes over the same way the manual Load Limit Details form does.
  const { data: completedPdiItems = [] } = useQuery({ queryKey: ["pdiItems", "COMPLETED"], queryFn: () => listPdiItems("COMPLETED") });

  // The vehicle master loads after first render, so the VEH-001 default can't fill its own
  // Vehicle type/No./Size/Driver fields synchronously — do it once the master arrives, and
  // only while the fields are still untouched so a doer's own edits are never overwritten.
  useEffect(() => {
    if (sendThrough !== "ZOTO Vehicle" || !zotoVehicleId || vehicleType || zotoVehicles.length === 0) return;
    const row = zotoVehicles.find((v) => v["zoto vehical id"] === zotoVehicleId);
    if (!row) return;
    setVehicleType(row["Vehicle type"] ?? "");
    setVehicleNo(row["Vehicle No."] ?? "");
    setVehicleSize(row["Vehicle Size (Ft)"] ?? "");
    setDriverName(row["Driver Name"] ?? "");
    setDriverContactNo(row["Driver Contact No."] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zotoVehicles, zotoVehicleId, sendThrough]);

  /** Ticking an order's box queues it whole — every item at its full order quantity, and the
   * logistics fields taken straight off the order's own preferred values. That's what the
   * nested Transport Form / Load Limit Details flow was collecting by hand for the ordinary
   * "ship all of it" case; that flow is still available below for a partial load. */
  async function toggleOrder(order: OrderRecord, checked: boolean) {
    if (!checked) {
      setQueuedOrders((prev) => prev.filter((q) => q.orderId !== order.ORDER_ID));
      return;
    }
    setLoadingOrderId(order.ORDER_ID);
    setError("");
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ["order", order.ORDER_ID],
        queryFn: () => getOrder(order.ORDER_ID),
      });
      const freightPaidBy = order.FREIGHT_PAID_BY || "";
      setQueuedOrders((prev) => [
        ...prev,
        {
          orderId: order.ORDER_ID,
          customerName: order.CUSTOMER_NAME || "",
          timestamp: new Date().toISOString(),
          // Load Qty is the item's full Balance Qty to Dispatch. Zero/blank-quantity items are
          // dropped rather than sent: attachOrders' schema requires a positive qty, so one bad
          // item would 400 the whole trip instead of just itself.
          items: detail.items
            .filter((it) => Number(it.QTY || 0) > 0)
            .map((it) => {
              const boxQty = Number(completedPdiItems.find((r) => r.ITEM_ID === it.ITEM_ID)?.BOX_QUANTITY || 0);
              return {
                itemId: it.ITEM_ID,
                partName: it.PART_NAME,
                qty: Number(it.QTY),
                unit: it.UOM || "NOS",
                loadBoxes: boxQty > 0 ? boxQty : undefined,
              };
            }),
          preferredDeliveryMode: order.PREFERRED_DELIVERY_MODE || "",
          freightPaidBy,
          // No "Freight Paid at" column exists on the order, so mirror who's paying rather
          // than leaving a required-by-the-manual-form field blank.
          freightPaidAt: freightPaidBy === "Customer" ? "Pay at Customer" : "",
        },
      ]);
    } catch {
      setError(`Could not load items for ${order.CUSTOMER_NAME || order.ORDER_ID} — please try again.`);
    } finally {
      setLoadingOrderId("");
    }
  }

  async function toggleAll(checked: boolean) {
    if (!checked) {
      setQueuedOrders([]);
      return;
    }
    for (const order of unqueuedEligibleOrders) await toggleOrder(order, true);
  }

  function handleTransporterSelect(value: string, option?: { value: string; label: string }) {
    setTransporterId(option?.value ?? "");
    setTransporterName(option?.label ?? "");
    // Drives the Vehicle Dispatch -> LR/Delivery branch (see tripRoutes.ts) — only "Registered"
    // transporters get an LR step. The picker only surfaces {value, label}, so look the full
    // row back up in the master list for its own "Transporter Type" column.
    const row = transporters.find((t) => t["Transporter ID"] === value);
    setTransporterType(row?.["Transporter Type"] ?? "");
  }

  // "ZOTO Vehicle" Send Through — pick one of ZOTO's own vehicles by ID and auto-fill the
  // same Vehicle type/No./Size/Driver Name/Driver Contact No. fields that Transporter/Cust.
  // Vehicle/Local Vehicle otherwise require typing by hand.
  function handleZotoVehicleSelect(value: string) {
    setZotoVehicleId(value);
    const row = zotoVehicles.find((v) => v["zoto vehical id"] === value);
    setVehicleType(row?.["Vehicle type"] ?? "");
    setVehicleNo(row?.["Vehicle No."] ?? "");
    setVehicleSize(row?.["Vehicle Size (Ft)"] ?? "");
    setDriverName(row?.["Driver Name"] ?? "");
    setDriverContactNo(row?.["Driver Contact No."] ?? "");
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
        transporterType: sendThrough === "Transporter" ? transporterType : undefined,
        zotoVehicleId: sendThrough === "ZOTO Vehicle" ? zotoVehicleId : undefined,
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

          {sendThrough === "ZOTO Vehicle" && (
            <SearchableSelect
              label="ZOTO Vehicle ID"
              required
              value={zotoVehicleId}
              onChange={handleZotoVehicleSelect}
              options={zotoVehicleOptions}
              placeholder="Search ZOTO vehicle…"
            />
          )}

          <SearchableSelect
            label="Vehicle type"
            required
            value={vehicleType}
            onChange={(v) => setVehicleType(v)}
            options={VEHICLE_TYPES}
            placeholder="Search"
          />
          {/* Picking a ZOTO vehicle fills these from the master, but they stay editable — the
            * truck that actually shows up can differ from the master row (a swapped vehicle, a
            * relief driver), and the doer has to be able to record what really left the gate.
            * Same pre-fill-but-editable convention the logistics fields already follow. */}
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
          <div style={{ overflowX: "auto", marginBottom: 12, border: "1px solid var(--color-border)", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--color-text-muted)", background: "var(--color-bg-page)" }}>
                  <th style={{ padding: "8px 10px", width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all sale orders"
                      checked={eligibleOrders.length > 0 && queuedOrders.length === eligibleOrders.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th style={{ padding: "8px 10px" }}>Customer Name</th>
                  <th style={{ padding: "8px 10px" }}>CUST ID</th>
                  <th style={{ padding: "8px 10px" }}>Delivery Mode</th>
                  <th style={{ padding: "8px 10px" }}>Freight Paid by</th>
                  <th style={{ padding: "8px 10px" }}>Items</th>
                </tr>
              </thead>
              <tbody>
                {eligibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "14px 10px", color: "var(--color-text-muted)" }}>
                      No sale orders are pending transport.
                    </td>
                  </tr>
                )}
                {eligibleOrders.map((o) => {
                  const queued = queuedOrders.find((q) => q.orderId === o.ORDER_ID);
                  const loading = loadingOrderId === o.ORDER_ID;
                  return (
                    <tr key={o.ORDER_ID} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${o.CUSTOMER_NAME || o.ORDER_ID}`}
                          checked={!!queued}
                          disabled={loading}
                          onChange={(e) => toggleOrder(o, e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: "8px 10px" }}>{o.CUSTOMER_NAME || o.ORDER_ID}</td>
                      <td style={{ padding: "8px 10px" }}>{o.CUST_ID}</td>
                      <td style={{ padding: "8px 10px" }}>{o.PREFERRED_DELIVERY_MODE || "—"}</td>
                      <td style={{ padding: "8px 10px" }}>{o.FREIGHT_PAID_BY || "—"}</td>
                      <td style={{ padding: "8px 10px" }}>
                        {loading ? "Loading…" : queued ? `${queued.items.length} (${queued.items.reduce((n, it) => n + it.qty, 0)} qty)` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TextField label="Selected Items Count" value={String(queuedOrders.reduce((n, q) => n + q.items.length, 0))} disabled />

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
    </FormModal>
  );
}
