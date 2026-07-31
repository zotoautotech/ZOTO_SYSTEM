import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { FormModal } from "../../components/form/FormModal";
import { getOrder, type OrderRecord } from "../../lib/ordersApi";
import { TransportItemsForm, type PickedItem } from "./TransportItemsForm";

export interface QueuedSaleOrder {
  orderId: string;
  customerName: string;
  timestamp: string;
  items: PickedItem[];
  preferredDeliveryMode: string;
  freightPaidBy: string;
  freightPaidAt: string;
}

const DELIVERY_MODE_OPTIONS = ["Courier", "Porter", "Transporter", "Cust. Vehicle", "Local Vehicle"].map((v) => ({ value: v, label: v }));

interface Props {
  eligibleOrders: OrderRecord[];
  onClose: () => void;
  onSave: (entry: QueuedSaleOrder) => void;
}

type Tab = "order" | "logistic";

/** Level-2 nested modal ("Transport Form"), opened from the Arrange Vehicle Form's "Select
 * Sale Orders" New button — Order Details tab picks one pending-transport order and shows
 * its Customer/Shipping fields auto-filled; Logistic Details tab pre-fills Preferred Delivery
 * Mode / Freight Paid by from the order's own preferred logistics fields but leaves them
 * editable (matching the old CRR reference's live toggle buttons), reveals "Freight Paid at"
 * only when Freight Paid by = Customer, and lets the doer pick specific items + quantities to
 * load via the nested Level-3 "Load Limit Details" form (TransportItemsForm). Saving here
 * queues one row for the parent Arrange Vehicle Form's "Select Sale Orders" table — nothing
 * is persisted to the backend until that outer form's own Save (which creates the trip and
 * attaches every queued order in one go). */
export function TransportOrderForm({ eligibleOrders, onClose, onSave }: Props) {
  const [tab, setTab] = useState<Tab>("order");
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<PickedItem[]>([]);
  const [showItemsForm, setShowItemsForm] = useState(false);
  const [preferredDeliveryMode, setPreferredDeliveryMode] = useState("");
  const [freightPaidBy, setFreightPaidBy] = useState<"ZOTO" | "Customer" | "">("");
  const [freightPaidAt, setFreightPaidAt] = useState<"Pay at ZOTO" | "Pay at Customer" | "">("");
  const [saveError, setSaveError] = useState("");

  const order = eligibleOrders.find((o) => o.ORDER_ID === orderId);
  const { data: orderDetail } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId),
    enabled: !!orderId,
  });

  // Pre-fill from the order's own preferred logistics fields, but leave editable — matches
  // the old CRR reference, which shows these as live toggle buttons on this form, not
  // disabled text.
  useEffect(() => {
    if (!order) return;
    setPreferredDeliveryMode(order.PREFERRED_DELIVERY_MODE || "");
    setFreightPaidBy((order.FREIGHT_PAID_BY as "ZOTO" | "Customer") || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.ORDER_ID]);

  const orderOptions = eligibleOrders.map((o) => ({ value: o.ORDER_ID, label: o.CUSTOMER_NAME || o.ORDER_ID, subtitle: o.ORDER_ID }));

  function missingFields(): string[] {
    const missing: string[] = [];
    if (!order) missing.push("Select Order");
    if (!preferredDeliveryMode) missing.push("Preferred Delivery Mode");
    if (!freightPaidBy) missing.push("Freight Paid by");
    if (freightPaidBy === "Customer" && !freightPaidAt) missing.push("Freight Paid at");
    if (items.length === 0) missing.push("Select Products");
    return missing;
  }

  function canSave() {
    return missingFields().length === 0;
  }

  function handleSave() {
    const missing = missingFields();
    if (missing.length > 0 || !order) {
      setSaveError(`Please fill: ${missing.join(", ")}`);
      return;
    }
    setSaveError("");
    onSave({
      orderId: order.ORDER_ID,
      customerName: order.CUSTOMER_NAME || "",
      timestamp: new Date().toISOString(),
      items,
      preferredDeliveryMode,
      freightPaidBy,
      freightPaidAt: freightPaidBy === "Customer" ? freightPaidAt : "",
    });
  }

  return (
    <FormModal
      title="Transport Form"
      onClose={onClose}
      size="standard"
      zIndex={55}
      headerActions={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          {tab === "order" ? (
            <button className="btn btn-primary" onClick={() => setTab("logistic")} disabled={!order}>Next</button>
          ) : (
            <>
              <button className="btn" onClick={() => setTab("order")}>Prev</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </>
          )}
        </div>
      }
    >
        <div style={{ display: "flex", padding: "0 var(--space)", borderBottom: "1px solid var(--color-border)" }}>
          {(["order", "logistic"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "10px 0",
                background: "none",
                border: "none",
                fontWeight: 600,
                fontSize: 14,
                color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {t === "order" ? "Order Details" : "Logistic Details"}
            </button>
          ))}
        </div>

        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
          {tab === "order" && (
            <>
              <SearchableSelect label="Select Order" required value={orderId} onChange={(v) => setOrderId(v)} options={orderOptions} placeholder="Search" />
              {order && (
                <>
                  <TextField label="CUST ID" value={order.CUST_ID} disabled />
                  <TextField label="Customer Name" value={order.CUSTOMER_NAME} disabled />
                  <TextField label="Shipping Address Line 1" value={order.SHIPPING_ADDRESS} disabled />
                  <TextField label="Shipping Address Line 2" value={order.SHIPPING_ADDRESS_2} disabled />
                  <TextField label="Shipping State" value={order.SHIPPING_STATE} disabled />
                  <TextField label="Shipping Pin code" value={order.SHIPPING_PINCODE} disabled />
                  <TextField label="Shipping Country" value={order.SHIPPING_COUNTRY} disabled />
                </>
              )}
            </>
          )}

          {tab === "logistic" && (
            <>
              {saveError && (
                <div className="error-banner" style={{ marginBottom: 16 }}>
                  ⚠ {saveError}
                </div>
              )}
              {order && (
                <>
                  <ToggleGroup
                    label="Preferred Delivery Mode"
                    required
                    value={preferredDeliveryMode}
                    onChange={setPreferredDeliveryMode}
                    options={DELIVERY_MODE_OPTIONS}
                  />
                  <p className="text-muted" style={{ fontSize: 12, marginTop: -8 }}>
                    Select the party that ultimately bears the freight expense (who will finally pay for the
                    transportation cost).
                  </p>
                  <ToggleGroup
                    label="Freight Paid by"
                    required
                    value={freightPaidBy}
                    onChange={(v) => setFreightPaidBy(v as "ZOTO" | "Customer")}
                    options={[{ value: "ZOTO", label: "ZOTO" }, { value: "Customer", label: "Customer" }]}
                  />
                  <p className="text-muted" style={{ fontSize: 12, marginTop: -8 }}>
                    Select the stage at which the freight payment is made to the transporter.
                  </p>
                  {freightPaidBy === "Customer" && (
                    <ToggleGroup
                      label="Freight Paid at"
                      required
                      value={freightPaidAt}
                      onChange={(v) => setFreightPaidAt(v as "Pay at ZOTO" | "Pay at Customer")}
                      options={[{ value: "Pay at ZOTO", label: "Pay at ZOTO" }, { value: "Pay at Customer", label: "Pay at Customer" }]}
                    />
                  )}
                </>
              )}

              <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
                Select Products here that will Dispatch in this vehicle. <span style={{ color: "#d32f2f" }}>*</span>
              </label>
              {items.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {items.map((it) => (
                    <div key={it.itemId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
                      <span>{it.partName}</span>
                      <span>{it.qty} {it.unit}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="btn"
                style={{ width: "100%", color: "#d32f2f", marginBottom: 20 }}
                onClick={() => setShowItemsForm(true)}
                disabled={!orderDetail}
              >
                New
              </button>

              <TextField label="Selected Items Count" value={String(items.length)} disabled />
            </>
          )}
        </div>

      {showItemsForm && orderDetail && (
        <TransportItemsForm
          items={orderDetail.items}
          alreadyPicked={items}
          onClose={() => setShowItemsForm(false)}
          onAdd={(picked) => {
            setItems((prev) => [...prev, picked]);
            setShowItemsForm(false);
          }}
        />
      )}
    </FormModal>
  );
}
