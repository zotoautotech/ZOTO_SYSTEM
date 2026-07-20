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
    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: "0 0 140px" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, flex: 1 }}>{value}</div>
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

  const partsCard = (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Order Punch Parts</h3>
          <span
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: "1px 9px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            {items.length}
          </span>
        </div>
        <button
          onClick={() => navigate(`/modules/punch-order/${orderId}/items`)}
          style={{
            border: "none",
            background: "none",
            color: "var(--color-primary)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            padding: 4,
          }}
        >
          Expand
        </button>
      </div>

      <div className="sheet-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              {[
                "Part No.",
                "Part Name",
                "Segment",
                "Category",
                "Qty",
                "UOM",
                "Price",
                "Basic Amount",
                "Tax Amount",
                "Total Amount",
                "Remarks",
              ].map((h, i, arr) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--color-border)",
                    borderRight: i === arr.length - 1 ? "none" : "1px solid var(--color-border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.ITEM_ID}
                onClick={() => navigate(`/modules/punch-order/${orderId}/items/${it.ITEM_ID}`)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-page)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{it.PART_NO}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)", fontWeight: 500 }}>
                  {it.PART_NAME}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{it.SEGMENT}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{it.CATEGORY}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{it.QTY}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{it.UOM}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                  {formatCurrency(it.PRICE)}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                  {formatCurrency(it.BASIC_AMOUNT)}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                  {formatCurrency(it.TAX_AMOUNT)}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                  {formatCurrency(it.TOTAL_AMOUNT)}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)", whiteSpace: "normal" }}>
                  {it.NOTES}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 20, paddingBottom: 24 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 260px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <button
              onClick={() => navigate("/modules/punch-order")}
              aria-label="Back"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                flexShrink: 0,
              }}
            >
              ‹
            </button>
          </div>
          <h2 style={{ margin: "8px 0 0", fontWeight: 500, wordBreak: "break-word" }}>{order.ORDER_ID}</h2>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {formatTimestamp(order.CREATED_AT)}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
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

        <div style={{ flex: 1, minWidth: 0 }}>
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

          {partsCard}
        </div>
      </div>
    </div>
  );
}
