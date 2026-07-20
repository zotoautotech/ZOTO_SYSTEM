import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { createOrder } from "../../lib/ordersApi";
import { emptyOrderForm, type OrderFormState } from "./form/types";
import { Tab1PurchaseOrder } from "./form/Tab1PurchaseOrder";
import { Tab2OrderDetails } from "./form/Tab2OrderDetails";
import { Tab3BillingAddress } from "./form/Tab3BillingAddress";
import { Tab4LogisticsDetails } from "./form/Tab4LogisticsDetails";
import { useIsMobile } from "../../lib/responsive";

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
  const isMobile = useIsMobile();
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
        background: "rgba(17, 17, 20, 0.5)",
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        zIndex: 50,
        padding: isMobile ? 0 : 24,
      }}
      onClick={() => navigate("/modules/punch-order")}
    >
      <div
        className="card modal-in"
        style={{
          width: "min(880px, 100%)",
          height: isMobile ? "calc(100dvh - 34px)" : undefined,
          maxHeight: isMobile ? "calc(100dvh - 34px)" : "90vh",
          background: "var(--color-bg)",
          borderRadius: isMobile ? 0 : 18,
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: isMobile ? "28px var(--space) 12px" : "22px var(--space) 12px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Order Punch Form</h2>
          <button
            onClick={() => navigate("/modules/punch-order")}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "none",
              background: "var(--color-bg-page)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
            }}
          >
            ✕
          </button>
        </div>

        {isMobile && (
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, padding: "0 var(--space)" }}>
            {TABS[tab]}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            padding: isMobile ? "10px 12px 6px" : "18px var(--space) 8px",
          }}
        >
          {TABS.map((t, i) => (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                flex: i < TABS.length - 1 ? 1 : "0 0 auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  minWidth: isMobile ? "auto" : 76,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    background: i <= tab ? "var(--color-primary)" : "var(--color-bg)",
                    color: i <= tab ? "#fff" : "var(--color-text-muted)",
                    border: i <= tab ? "none" : "1px solid var(--color-border)",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                >
                  {i < tab ? "✓" : i + 1}
                </div>
                {!isMobile && (
                  <span
                    style={{
                      fontSize: 11,
                      textAlign: "center",
                      color: i === tab ? "var(--color-text)" : "var(--color-text-muted)",
                      fontWeight: i === tab ? 600 : 400,
                    }}
                  >
                    {t}
                  </span>
                )}
              </div>
              {i < TABS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: i < tab ? "var(--color-primary)" : "var(--color-border)",
                    margin: isMobile ? "0 4px" : "0 4px 20px",
                    transition: "background 0.15s ease",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "8px var(--space)", overflowY: "auto", flex: 1 }}>
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
          <button className="btn" onClick={() => navigate("/modules/punch-order")}>
            Cancel
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {tab > 0 && (
              <button className="btn" onClick={goPrev}>
                ‹ Prev
              </button>
            )}
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
      </div>
    </div>
  );
}
