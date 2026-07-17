import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOrder } from "../../lib/ordersApi";
import { formatTimestamp, formatCurrency } from "../../lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

export function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Order not found</p>;

  const { order, items } = data;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 500 }}>{order.ORDER_ID}</h2>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {formatTimestamp(order.CREATED_AT)}
          </span>
        </div>
        <button className="btn" onClick={() => navigate(-1)}>
          ← Back to list
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <Section title="Purchase Order Details">
            <Field label="Purchase Order No." value={order.PO_NO} />
            <Field label="Purchase Order Date" value={order.PO_DATE} />
            <Field label="Remarks" value={order.PO_REMARKS} />
          </Section>

          <Section title="Billing Address">
            <Field label="Billing Address" value={order.BILLING_ADDRESS} />
            <Field label="State" value={order.BILLING_STATE} />
            <Field label="Pin Code" value={order.BILLING_PINCODE} />
            <Field label="Is Shipping Address Same" value={order.SHIPPING_SAME} />
          </Section>

          <Section title="Shipping Address">
            <Field label="Shipping Address" value={order.SHIPPING_ADDRESS} />
            <Field label="State" value={order.SHIPPING_STATE} />
            <Field label="Pin Code" value={order.SHIPPING_PINCODE} />
          </Section>

          <Section title="GST Details">
            <Field label="Basic Amount" value={formatCurrency(order.BASIC_AMOUNT)} />
            <Field label="Tax Amount" value={formatCurrency(order.TAX_AMOUNT)} />
            <Field label="Total Amount" value={formatCurrency(order.TOTAL_AMOUNT)} />
          </Section>
        </div>

        <div>
          <Section title="Order Details">
            <Field label="Tally" value="Tally 1 (Registered)" />
            <Field label="Order Type" value={order.ORDER_TYPE} />
            <Field
              label="Payment Type"
              value={order.PAYMENT_TYPE === "Advance" ? `Advance (${order.ADVANCE_PCT}%)` : order.PAYMENT_TYPE}
            />
          </Section>

          <Section title="Buyer Details">
            <Field label="Customer Name" value={order.CUSTOMER_NAME} />
            <Field label="Buyer GSTIN No." value={order.BUYER_GSTIN} />
            <Field label="Client Classification" value={order.CLIENT_CLASSIFICATION} />
            <Field label="Payment Terms" value={order.THIS_ORDER_PAYMENT_TERMS} />
            <Field label="Contact Person" value={order.CONTACT_PERSON} />
            <Field label="Contact No." value={order.CONTACT_NO} />
            <Field label="Sale Staff Name" value={order.SALE_STAFF_NAME} />
            <Field label="Order Given By" value={order.ORDER_GIVEN_BY} />
          </Section>

          <Section title="Logistics Details">
            <Field label="Preferred Delivery Mode" value={order.PREFERRED_DELIVERY_MODE} />
            <Field label="Transportation Mode" value={order.PREFERRED_TRANSPORT_MODE} />
            <Field label="Freight Paid By" value={order.FREIGHT_PAID_BY} />
            <Field label="Preferred Transporter" value={order.PREFERRED_TPT_ID} />
          </Section>
        </div>
      </div>

      <Section title={`Order Punch Parts (${items.length})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Part No.", "Part Name", "Qty", "UOM", "Price", "Basic", "Tax", "Total"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--color-border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.ITEM_ID}>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{it.PART_NO}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{it.PART_NAME}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{it.QTY}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{it.UOM}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{formatCurrency(it.PRICE)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{formatCurrency(it.BASIC_AMOUNT)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{formatCurrency(it.TAX_AMOUNT)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--color-border)" }}>{formatCurrency(it.TOTAL_AMOUNT)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
