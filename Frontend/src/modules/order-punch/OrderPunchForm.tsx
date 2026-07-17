import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createOrder } from "../../lib/ordersApi";
import { emptyOrderForm, type OrderFormState } from "./form/types";
import { Tab1PurchaseOrder } from "./form/Tab1PurchaseOrder";
import { Tab2OrderDetails } from "./form/Tab2OrderDetails";
import { Tab3BillingAddress } from "./form/Tab3BillingAddress";
import { Tab4LogisticsDetails } from "./form/Tab4LogisticsDetails";

const TABS = ["Purchase Order Details", "Order Details", "Billing Address", "Logistics Details"];

function validateTab(tab: number, form: OrderFormState): string | null {
  if (tab === 0) {
    if (!form.poNo) return "Purchase Order No. is required";
    if (!form.poDate) return "Purchase Order Date is required";
  }
  if (tab === 1) {
    if (!form.orderType) return "Order Type is required";
    if (!form.paymentType) return "Payment Type is required";
    if (form.paymentType === "Advance" && (form.advancePct === undefined || form.advancePct < 0 || form.advancePct > 100)) {
      return "Advance Payment (%) must be between 0 and 100";
    }
    if (!form.customerType) return "Customer Type is required";
    if (!form.custId) return "Select or add a customer";
    if (!form.clientClassification) return "Client Classification is required";
    for (const item of form.items) {
      if (!item.partType) return "Every item needs a Part Type";
      if (!item.fgId) return "Select or add a part for every item";
      if (!item.qty) return "Quantity is required for every item";
      if (!item.price) return "Price is required for every item";
    }
  }
  if (tab === 2) {
    if (!form.billingAddress) return "Billing Address is required";
    if (!form.billingState) return "Billing State is required";
    if (!form.billingPincode) return "Billing Pin Code is required";
    if (!form.shippingSame) return "Is Shipping Address Same is required";
  }
  if (tab === 3) {
    if (!form.preferredTransportMode) return "Preferred Transportation Mode is required";
    if (!form.freightPaidBy) return "Freight Paid by is required";
    if (form.preferredDeliveryMode === "Transporter" && !form.preferredTptId) {
      return "Select a Preferred Transporter";
    }
  }
  return null;
}

export function OrderPunchForm() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<OrderFormState>(emptyOrderForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<OrderFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function goNext() {
    const err = validateTab(tab, form);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setTab((t) => Math.min(t + 1, TABS.length - 1));
  }

  function goPrev() {
    setError("");
    setTab((t) => Math.max(t - 1, 0));
  }

  async function handleSave() {
    const err = validateTab(tab, form);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await createOrder({
        poNo: form.poNo,
        poDate: form.poDate,
        poAttachmentUrl: form.poAttachmentUrl,
        otherAttachmentUrl: form.otherAttachmentUrl,
        poRemarks: form.poRemarks,
        orderType: form.orderType as "Order Incoming" | "Order Outgoing",
        paymentType: form.paymentType as "Credit" | "Advance",
        advancePct: form.paymentType === "Advance" ? form.advancePct : undefined,
        custId: form.custId,
        customerName: form.customerName,
        buyerGstin: form.buyerGstin,
        clientClassification: form.clientClassification as "Existing" | "New" | "Prospective",
        billingAddress: form.billingAddress,
        billingState: form.billingState,
        billingPincode: form.billingPincode,
        shippingSame: form.shippingSame === "Same as Previous Order" ? "Yes" : (form.shippingSame as "Yes" | "No"),
        shippingAddress: form.shippingAddress,
        shippingState: form.shippingState,
        shippingPincode: form.shippingPincode,
        preferredDeliveryMode: form.preferredDeliveryMode,
        preferredTransportMode: form.preferredTransportMode,
        freightPaidBy: form.freightPaidBy,
        freightOnInvoice: form.freightOnInvoice as "Yes" | "No",
        preferredTptId: form.preferredTptId,
        items: form.items.map((it) => ({
          fgId: it.fgId,
          partNo: it.partNo,
          partName: it.partName,
          segment: it.segment,
          category: it.category,
          price: it.price!,
          qty: it.qty!,
          uom: it.uom,
          gstSlabPct: it.gstSlabPct,
          remarks: it.remarks,
        })),
      });
      navigate(`/modules/punch-order/${result.orderId}`);
    } catch {
      setError("Could not save the order — please check required fields and try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div style={{ width: "55%", minWidth: 480, background: "#fff", height: "100%", overflowY: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => navigate("/modules/punch-order")}
              style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}
            >
              ✕
            </button>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Order Punch Form</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {tab > 0 && (
              <button className="btn" onClick={goPrev}>
                ‹ Prev
              </button>
            )}
            <button className="btn" onClick={() => navigate("/modules/punch-order")}>
              Cancel
            </button>
            {tab < TABS.length - 1 ? (
              <button className="btn btn-primary" onClick={goNext}>
                Next ›
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 24px" }}>
          {TABS.map((t, i) => (
            <div
              key={t}
              style={{
                padding: "12px 16px",
                fontSize: 14,
                color: i === tab ? "var(--color-text)" : "var(--color-text-muted)",
                borderBottom: i === tab ? "3px solid var(--color-primary)" : "3px solid transparent",
                fontWeight: i === tab ? 500 : 400,
              }}
            >
              {t}
            </div>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {error && (
            <div
              style={{
                background: "#FFEBEE",
                color: "var(--color-error)",
                padding: "10px 14px",
                borderRadius: "var(--radius)",
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              ⚠ {error}
            </div>
          )}
          {tab === 0 && <Tab1PurchaseOrder form={form} update={update} />}
          {tab === 1 && <Tab2OrderDetails form={form} update={update} />}
          {tab === 2 && <Tab3BillingAddress form={form} update={update} />}
          {tab === 3 && <Tab4LogisticsDetails form={form} update={update} />}
        </div>
      </div>
    </div>
  );
}
