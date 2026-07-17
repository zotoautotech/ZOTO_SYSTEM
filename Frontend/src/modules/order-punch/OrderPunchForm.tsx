import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { createOrder } from "../../lib/ordersApi";
import { emptyOrderForm, type OrderFormState } from "./form/types";
import { Tab1PurchaseOrder } from "./form/Tab1PurchaseOrder";
import { Tab2OrderDetails } from "./form/Tab2OrderDetails";
import { Tab3BillingAddress } from "./form/Tab3BillingAddress";
import { Tab4LogisticsDetails } from "./form/Tab4LogisticsDetails";

const TABS = ["Purchase Order Details", "Order Details", "Billing Address", "Logistics Details"];

// No field on this form is mandatory to advance or save — validation removed at the
// user's request so the team can punch partial orders and fill gaps in later.
function validateTab(_tab: number, form: OrderFormState): string | null {
  if (form.paymentType === "Advance" && form.advancePct !== undefined && (form.advancePct < 0 || form.advancePct > 100)) {
    return "Advance Payment (%) must be between 0 and 100";
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
        clientClassification: form.clientClassification || undefined,
        billingAddress: form.billingAddress,
        billingState: form.billingState,
        billingPincode: form.billingPincode,
        shippingSame:
          form.shippingSame === "Same as Previous Order" || form.shippingSame === ""
            ? undefined
            : form.shippingSame,
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
          price: it.price ?? 0,
          qty: it.qty ?? 0,
          uom: it.uom,
          gstSlabPct: it.gstSlabPct,
          remarks: it.remarks,
        })),
      });
      navigate(`/modules/punch-order/${result.orderId}`);
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save the order — ${detail}` : "Could not save the order");
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
      <div
        className="slide-in-panel"
        style={{
          width: "55%",
          minWidth: 480,
          background: "#fff",
          height: "100%",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px var(--space)",
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

        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 var(--space)" }}>
          {TABS.map((t, i) => (
            <div
              key={t}
              style={{
                padding: "12px 16px",
                fontSize: 14,
                color: i === tab ? "var(--color-text)" : "var(--color-text-muted)",
                borderBottom: i === tab ? "3px solid var(--color-primary)" : "3px solid transparent",
                fontWeight: i === tab ? 500 : 400,
                transition: "color 0.15s ease",
              }}
            >
              {t}
            </div>
          ))}
        </div>

        <div style={{ padding: "var(--space)" }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
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
