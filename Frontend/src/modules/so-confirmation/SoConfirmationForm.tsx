import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { FileDropzone } from "../../components/form/FileDropzone";
import { TextField } from "../../components/form/TextField";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { getOrder, submitSoConfirmation, type OrderRecord } from "../../lib/ordersApi";
import { emptyOrderForm, type OrderFormState } from "../order-punch/form/types";
import { Tab1PurchaseOrder } from "../order-punch/form/Tab1PurchaseOrder";
import { Tab3BillingAddress } from "../order-punch/form/Tab3BillingAddress";
import { Tab4LogisticsDetails } from "../order-punch/form/Tab4LogisticsDetails";
import { useIsMobile } from "../../lib/responsive";

type Confirmation = "Confirmed" | "Changes" | "Cancelled" | "";

interface Props {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Maps an ORDER_PUNCH record into the punch form's editable shape, so "Changes" can reuse
 * the exact same Tab1/3/4 components the punch form itself uses, prefilled with current data. */
function orderToFormState(order: OrderRecord): OrderFormState {
  const base = emptyOrderForm();
  return {
    ...base,
    poNo: order.PO_NO || "",
    poDate: order.PO_DATE || "",
    poAttachmentUrl: order.PO_ATTACHMENT_URL || "",
    otherAttachmentUrl: order.OTHER_ATTACHMENT_URL || "",
    poRemarks: order.PO_REMARKS || "",
    saleType: (order.SALE_TYPE as OrderFormState["saleType"]) || "Order",
    orderType: (order.ORDER_TYPE as OrderFormState["orderType"]) || "",
    paymentType: (order.PAYMENT_TYPE as OrderFormState["paymentType"]) || "",
    advancePct: order.ADVANCE_PCT ? Number(order.ADVANCE_PCT) : undefined,
    custId: order.CUST_ID || "",
    customerName: order.CUSTOMER_NAME || "",
    buyerGstin: order.BUYER_GSTIN || "",
    billingAddress: order.BILLING_ADDRESS || "",
    billingState: order.BILLING_STATE || "",
    billingPincode: order.BILLING_PINCODE || "",
    billingCountry: order.BILLING_COUNTRY || "India",
    shippingSame: (order.SHIPPING_SAME as OrderFormState["shippingSame"]) || "",
    shippingAddress: order.SHIPPING_ADDRESS || "",
    shippingState: order.SHIPPING_STATE || "",
    shippingPincode: order.SHIPPING_PINCODE || "",
    preferredDeliveryMode: order.PREFERRED_DELIVERY_MODE || base.preferredDeliveryMode,
    preferredTransportMode: order.PREFERRED_TRANSPORT_MODE || base.preferredTransportMode,
    freightPaidBy: order.FREIGHT_PAID_BY || "",
    freightOnInvoice: (order.FREIGHT_ON_INVOICE as OrderFormState["freightOnInvoice"]) || "No",
    preferredTptId: order.PREFERRED_TPT_ID || "",
    preferredTptName: order.PREFERRED_TPT_NAME || "",
    transporterType: order.TRANSPORTER_TYPE || "",
    transporterContactNo: order.TRANSPORTER_CONTACT || "",
    transporterPersonName: order.TRANSPORTER_PERSON_NAME || "",
    transporterPersonContactNo: order.TRANSPORTER_PERSON_CONTACT || "",
    transporterAddress: order.TRANSPORTER_ADDRESS || "",
  };
}

const TABS = ["Confirmation Details", "Purchase Order Details", "Order Details", "Billing Address", "Logistics Details"];

export function SoConfirmationForm({ orderId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [confirmation, setConfirmation] = useState<Confirmation>("");
  const [remarks, setRemarks] = useState("");
  const [receivedPaymentAmount, setReceivedPaymentAmount] = useState("");
  const [paymentAmountPct, setPaymentAmountPct] = useState("");
  const [paymentAttachment, setPaymentAttachment] = useState("");
  const [form, setForm] = useState<OrderFormState>(emptyOrderForm());

  useEffect(() => {
    getOrder(orderId)
      .then((data) => setForm(orderToFormState(data.order)))
      .finally(() => setLoading(false));
  }, [orderId]);

  function update(patch: Partial<OrderFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  const confirmed = confirmation === "Confirmed";
  const changes = confirmation === "Changes";
  const remarksLabel = confirmation === "Cancelled" ? "Cancelled Remarks" : confirmation === "Changes" ? "Changes Remarks" : "Remarks";

  async function handleSave() {
    if (!confirmation) return;
    if (!remarks.trim()) return setError(`${remarksLabel} is required`);
    if (confirmed && !receivedPaymentAmount) return setError("Received Payment Amount is required");

    setSaving(true);
    setError("");
    try {
      await submitSoConfirmation(orderId, {
        outcome: confirmation,
        remarks,
        receivedPaymentAmount: confirmed ? receivedPaymentAmount : undefined,
        paymentAmountPct: confirmed ? paymentAmountPct : undefined,
        paymentAttachmentUrl: confirmed ? paymentAttachment : undefined,
        changes: changes
          ? {
              poNo: form.poNo,
              poDate: form.poDate,
              poAttachmentUrl: form.poAttachmentUrl,
              otherAttachmentUrl: form.otherAttachmentUrl,
              poRemarks: form.poRemarks,
              saleType: form.saleType,
              orderType: form.orderType,
              paymentType: form.paymentType,
              advancePct: form.advancePct,
              custId: form.custId,
              customerName: form.customerName,
              buyerGstin: form.buyerGstin,
              billingAddress: form.billingAddress,
              billingState: form.billingState,
              billingPincode: form.billingPincode,
              billingCountry: form.billingCountry,
              shippingSame: form.shippingSame,
              shippingAddress: form.shippingAddress,
              shippingState: form.shippingState,
              shippingPincode: form.shippingPincode,
              preferredDeliveryMode: form.preferredDeliveryMode,
              preferredTransportMode: form.preferredTransportMode,
              freightPaidBy: form.freightPaidBy,
              freightOnInvoice: form.freightOnInvoice,
              preferredTptId: form.preferredTptId,
              preferredTptName: form.preferredTptName,
              transporterType: form.transporterType,
              transporterContactNo: form.transporterContactNo,
              transporterPersonName: form.transporterPersonName,
              transporterPersonContactNo: form.transporterPersonContactNo,
              transporterAddress: form.transporterAddress,
            }
          : undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save — ${detail}` : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17, 17, 20, 0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(680px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>SO Confirmation Form</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)" }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", overflow: "hidden", borderBottom: "1px solid var(--color-border)", padding: "0 var(--space)" }}>
          {TABS.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => (changes || index === 0) && setTab(index)}
              disabled={!changes && index > 0}
              style={{
                flexShrink: 0,
                padding: "12px 14px",
                background: "none",
                border: "none",
                color: index === tab ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: index === tab ? "3px solid var(--color-primary)" : "3px solid transparent",
                fontSize: 13,
                cursor: changes || index === 0 ? "pointer" : "default",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : tab === 0 ? (
            <>
              <label style={{ display: "block", fontSize: 14, marginBottom: 12 }}>
                Confirmation <span style={{ color: "var(--color-error)" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 8, marginBottom: 26 }}>
                {(["Confirmed", "Changes", "Cancelled"] as const).map((option) => (
                  <button
                    type="button"
                    key={option}
                    onClick={() => setConfirmation(option)}
                    style={{
                      height: 48,
                      borderRadius: "var(--radius)",
                      border: `1px solid ${confirmation === option ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: confirmation === option ? "var(--color-primary)" : "var(--color-bg-page)",
                      color: confirmation === option ? "#fff" : "var(--color-text)",
                      fontSize: 15,
                      fontWeight: confirmation === option ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {confirmed ? (
                <>
                  <TextField label="Received Payment Amount" required placeholder="₹ 0.00" inputMode="decimal" value={receivedPaymentAmount} onChange={(e) => setReceivedPaymentAmount(e.target.value)} />
                  <TextField label="Payment Amount (%)" placeholder="% 0.00" inputMode="decimal" value={paymentAmountPct} onChange={(e) => setPaymentAmountPct(e.target.value)} />
                  <FileDropzone label="Payment Attachment" value={paymentAttachment} onChange={setPaymentAttachment} context={`SOConfirmation_${orderId}`} />
                  <TextField label="Confirmed Remarks" required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </>
              ) : confirmation ? (
                <TextField label={remarksLabel} required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              ) : null}
            </>
          ) : !changes ? null : tab === 1 ? (
            <Tab1PurchaseOrder form={form} update={update} />
          ) : tab === 2 ? (
            <>
              <ToggleGroup
                label="Order Type"
                value={form.orderType}
                onChange={(v) => update({ orderType: v })}
                options={[
                  { value: "Order Incoming", label: "Order Incoming" },
                  { value: "Order Outgoing", label: "Order Outgoing" },
                ]}
              />
              <ToggleGroup
                label="Payment Type"
                value={form.paymentType}
                onChange={(v) => update({ paymentType: v })}
                options={[
                  { value: "Credit", label: "Credit" },
                  { value: "Advance", label: "Advance" },
                ]}
              />
              {form.paymentType === "Advance" && (
                <TextField label="Advance Payment (%)" type="number" value={form.advancePct ?? ""} onChange={(e) => update({ advancePct: Number(e.target.value) })} />
              )}
              <TextField label="Customer ID" value={form.custId} onChange={(e) => update({ custId: e.target.value })} />
              <TextField label="Customer Name" value={form.customerName} onChange={(e) => update({ customerName: e.target.value })} />
              <TextField label="Buyer GSTIN" value={form.buyerGstin} onChange={(e) => update({ buyerGstin: e.target.value })} />
            </>
          ) : tab === 3 ? (
            <Tab3BillingAddress form={form} update={update} />
          ) : (
            <Tab4LogisticsDetails form={form} update={update} />
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)",
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-page)",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {tab > 0 && (
              <button className="btn" onClick={() => setTab((t) => t - 1)}>
                ‹ Prev
              </button>
            )}
            {changes && tab < TABS.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setTab((t) => Math.min(t + 1, TABS.length - 1))} disabled={!confirmation}>
                Next ›
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleSave} disabled={!confirmation || saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
