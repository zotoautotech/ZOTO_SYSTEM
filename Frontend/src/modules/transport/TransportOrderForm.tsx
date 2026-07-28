import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { useIsMobile } from "../../lib/responsive";
import { getOrder, type OrderRecord } from "../../lib/ordersApi";
import { TransportItemsForm, type PickedItem } from "./TransportItemsForm";

export interface QueuedSaleOrder {
  orderId: string;
  customerName: string;
  timestamp: string;
  items: PickedItem[];
}

interface Props {
  eligibleOrders: OrderRecord[];
  onClose: () => void;
  onSave: (entry: QueuedSaleOrder) => void;
}

type Tab = "order" | "logistic";

/** Level-2 nested modal ("Transport Form"), opened from the Arrange Vehicle Form's "Select
 * Sale Orders" New button — Order Details tab picks one pending-transport order and shows
 * its Customer/Shipping fields auto-filled; Logistic Details tab shows that same order's own
 * Preferred Delivery Mode / Freight Paid by (auto-filled from Order Punch, not re-entered)
 * and lets the doer pick specific items + quantities to load via the nested Level-3 "Load
 * Limit Details" form (TransportItemsForm). Saving here queues one row for the parent
 * Arrange Vehicle Form's "Select Sale Orders" table — nothing is persisted to the backend
 * until that outer form's own Save (which creates the trip and attaches every queued order
 * in one go). */
export function TransportOrderForm({ eligibleOrders, onClose, onSave }: Props) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<Tab>("order");
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<PickedItem[]>([]);
  const [showItemsForm, setShowItemsForm] = useState(false);

  const order = eligibleOrders.find((o) => o.ORDER_ID === orderId);
  const { data: orderDetail } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId),
    enabled: !!orderId,
  });

  const orderOptions = eligibleOrders.map((o) => ({ value: o.ORDER_ID, label: o.CUSTOMER_NAME || o.ORDER_ID, subtitle: o.ORDER_ID }));

  function handleSave() {
    if (!order) return;
    onSave({ orderId: order.ORDER_ID, customerName: order.CUSTOMER_NAME || "", timestamp: new Date().toISOString(), items });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(17,17,20,0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", height: isMobile ? "100dvh" : undefined, minHeight: isMobile ? undefined : 480, maxHeight: isMobile ? "100dvh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Transport Form</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!order}>Save</button>
          </div>
        </div>

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
              {order && (
                <>
                  <TextField label="Preferred Delivery Mode" value={order.PREFERRED_DELIVERY_MODE} disabled />
                  <TextField label="Freight Paid by" value={order.FREIGHT_PAID_BY} disabled />
                </>
              )}

              <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
                Select Products & Quantity here that will Dispatch in this vehicle. <span style={{ color: "#d32f2f" }}>*</span>
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
    </div>
  );
}
