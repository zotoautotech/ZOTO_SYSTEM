import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrder, getSaleOrder } from "../../lib/ordersApi";
import { formatTimestamp, formatCurrency } from "../../lib/format";
import { useIsCompact, useIsMobile } from "../../lib/responsive";
import { SaleOrderDiscountForm } from "./SaleOrderDiscountForm";
import { SaleOrderUploadForm } from "./SaleOrderUploadForm";

function QuickAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", width: 76 }}
    >
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {children}
        </svg>
      </span>
      <span style={{ fontSize: 12, color: "var(--color-text)", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  const isMobile = useIsMobile();
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 2 : 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: isMobile ? "0 0 auto" : "0 0 140px" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, flex: 1 }}>{value}</div>
    </div>
  );
}

/** Same row layout as Field, but the value is a clickable attachment link with a file icon —
 * matching the old system's inline "label | filename 📄" attachment rows. */
function FieldFile({ label, url }: { label: string; url?: string }) {
  const isMobile = useIsMobile();
  if (!url) return null;
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 2 : 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: isMobile ? "0 0 auto" : "0 0 140px" }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--color-primary)", textDecoration: "none" }}
        >
          View attachment
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
          </svg>
        </a>
      </div>
    </div>
  );
}

export function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isCompact = useIsCompact();
  // Preserves whichever module list this was opened from (Punch Order vs. Sale Order —
  // both point at the same underlying order data) so back/expand links stay in that module.
  const basePath = `/modules/${location.pathname.split("/")[2]}`;
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
  });

  // Only relevant in the Sale Order module — shows the saved Sale Order form details.
  const { data: saleOrder } = useQuery({
    queryKey: ["saleOrder", orderId],
    queryFn: () => getSaleOrder(orderId!),
    enabled: !!orderId && basePath === "/modules/sale-order",
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
          onClick={() => navigate(`${basePath}/${orderId}/items`)}
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
                onClick={() => navigate(`${basePath}/${orderId}/items/${it.ITEM_ID}`)}
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
      <div style={{ display: "flex", flexWrap: isCompact ? "wrap" : "nowrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: isCompact ? "1 1 100%" : "0 0 260px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <button
              onClick={() => navigate(basePath)}
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
          {/* Three states: STATUS "PENDING" (fresh punch) -> show the discount action;
              "PENDING SALE ORDER" (discount saved) -> show the upload action;
              "SALE ORDER" (form uploaded, this stage done) -> show neither. */}
          {basePath === "/modules/sale-order" && order.STATUS !== "SALE ORDER" && (
            <div style={{ display: "flex", gap: 20, marginTop: 18 }}>
              {order.STATUS !== "PENDING SALE ORDER" ? (
                <QuickAction label="Add Discounts on Sale Order…" onClick={() => setShowDiscountForm(true)}>
                  <path d="M9 5H5a2 2 0 0 0-2 2v4l10 10 8-8L11 3H7" />
                  <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
                </QuickAction>
              ) : (
                <QuickAction label="Upload Sale Order Form" onClick={() => setShowUploadForm(true)}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 2v6h6M9 13h6M9 17h6" />
                </QuickAction>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <Section title="Purchase Order Details">
            <Field label="Purchase Order No." value={order.PO_NO} />
            <Field label="Purchase Order Date" value={order.PO_DATE} />
            <FieldFile label="Purchase Order Attachment" url={order.PO_ATTACHMENT_URL} />
            <FieldFile label="Other Order Attachment" url={order.OTHER_ATTACHMENT_URL} />
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
            <Field label="Invoice Discount (Rs)" value={formatCurrency(order.INVOICE_DISCOUNT_RS)} />
            <Field label="Basic Amount" value={formatCurrency(order.BASIC_AMOUNT)} />
            <Field label="Tax Amount" value={formatCurrency(order.TAX_AMOUNT)} />
            <Field label="Total Amount" value={formatCurrency(order.TOTAL_AMOUNT)} />
          </Section>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          {saleOrder && (
            <Section title="Sale Order Details">
              <Field label="Sale Order No." value={saleOrder.SO_NO} />
              <Field label="Sale Order Date" value={saleOrder.SO_DATE} />
              <Field label="Sale Order ID" value={saleOrder.SALE_ORDER_ID} />
              <Field label="Discount (Rs)" value={saleOrder.INVOICE_DISCOUNT_RS} />
              <Field label="Remarks" value={saleOrder.SO_REMARKS} />
              <FieldFile label="Sale Order Attachment" url={saleOrder.SO_ATTACHMENT_URL} />
            </Section>
          )}

          <Section title="Order Details">
            <Field label="Tally" value="Tally 1 (Registered)" />
            <Field label="Order Type" value={order.ORDER_TYPE} />
            <Field
              label="Payment Type"
              value={order.PAYMENT_TYPE === "Advance" ? `Advance (${order.ADVANCE_PCT}%)` : order.PAYMENT_TYPE}
            />
          </Section>

          <Section title="Seller Details">
            <Field label="Branch" value={order.BRANCH_NAME || order.BRANCH_ID} />
            <Field label="Seller GSTIN No." value={order.SELLER_GSTIN} />
            <Field label="Seller Email" value={order.SELLER_EMAIL} />
            <Field label="Seller Contact No." value={order.SELLER_CONTACT} />
            <Field label="Seller Address" value={order.SELLER_ADDRESS_1} />
            <Field label="Seller State" value={order.SELLER_STATE} />
            <Field label="Seller Pin Code" value={order.SELLER_PINCODE} />
          </Section>

          <Section title="Buyer Details">
            <Field label="Customer Name" value={order.CUSTOMER_NAME} />
            <Field label="Business Segment" value={order.BUSINESS_SEGMENT} />
            <Field label="Type of Customer" value={order.TYPE_OF_CUSTOMER} />
            <Field label="Buyer GSTIN No." value={order.BUYER_GSTIN} />
            <Field label="Buyer Email" value={order.BUYER_EMAIL} />
            <Field label="Buyer Contact No." value={order.BUYER_CONTACT} />
            <Field label="Payment Terms" value={order.PAYMENT_TERMS || order.THIS_ORDER_PAYMENT_TERMS} />
            <Field label="Contact Person" value={order.CONTACT_PERSON} />
            <Field label="Contact No." value={order.CONTACT_NO} />
            <Field label="Sale Staff Name" value={order.SALE_STAFF_NAME} />
            <Field label="Order Given By" value={order.ORDER_GIVEN_BY} />
          </Section>

          {(order.CONSIGNEE_NAME || order.CONSIGNEE_GSTIN) && (
            <Section title="Consignee Details">
              <Field label="Ship to Consignee" value={order.SHIP_TO_CONSIGNEE} />
              <Field label="Consignee Name" value={order.CONSIGNEE_NAME} />
              <Field label="Consignee GSTIN" value={order.CONSIGNEE_GSTIN} />
              <Field label="Consignee Contact No." value={order.CONSIGNEE_CONTACT} />
              <Field label="Consignee Email" value={order.CONSIGNEE_EMAIL} />
            </Section>
          )}

          <Section title="Logistics Details">
            <Field label="Preferred Delivery Mode" value={order.PREFERRED_DELIVERY_MODE} />
            <Field label="Transportation Mode" value={order.PREFERRED_TRANSPORT_MODE} />
            <Field label="Freight Paid By" value={order.FREIGHT_PAID_BY} />
            <Field label="Preferred Transporter" value={order.PREFERRED_TPT_NAME || order.PREFERRED_TPT_ID} />
            <Field label="Transporter Type" value={order.TRANSPORTER_TYPE} />
            <Field label="Transporter Contact No." value={order.TRANSPORTER_CONTACT} />
            <Field label="Transporter Person Name" value={order.TRANSPORTER_PERSON_NAME} />
            <Field label="Transporter Person Contact No." value={order.TRANSPORTER_PERSON_CONTACT} />
            <Field label="Transporter Address" value={order.TRANSPORTER_ADDRESS} />
          </Section>

          {partsCard}
        </div>
      </div>

      {showDiscountForm && (
        <SaleOrderDiscountForm
          orderId={orderId!}
          onClose={() => setShowDiscountForm(false)}
          onSaved={() => {
            setShowDiscountForm(false);
            queryClient.invalidateQueries({ queryKey: ["order", orderId] });
            queryClient.invalidateQueries({ queryKey: ["orders", "all"] });
          }}
        />
      )}

      {showUploadForm && (
        <SaleOrderUploadForm
          orderId={orderId!}
          onClose={() => setShowUploadForm(false)}
          onSaved={() => {
            setShowUploadForm(false);
            queryClient.invalidateQueries({ queryKey: ["order", orderId] });
            queryClient.invalidateQueries({ queryKey: ["orders", "all"] });
            queryClient.invalidateQueries({ queryKey: ["saleOrder", orderId] });
          }}
        />
      )}
    </div>
  );
}
