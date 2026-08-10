import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { createOrder } from "../../lib/ordersApi";
import { emptyOrderForm, type OrderFormState } from "./form/types";
import { Tab1PurchaseOrder } from "./form/Tab1PurchaseOrder";
import { Tab2OrderDetails } from "./form/Tab2OrderDetails";
import { Tab3BillingAddress } from "./form/Tab3BillingAddress";
import { Tab4LogisticsDetails } from "./form/Tab4LogisticsDetails";
import { useIsMobile } from "../../lib/responsive";
import { FormModal } from "../../components/form/FormModal";
import { useAuth, type AuthUser } from "../../lib/auth";

const TABS = ["Purchase Order Details", "Order Details", "Billing Address", "Logistics Details"];

// Most fields on this form aren't mandatory to advance or save — validation was removed
// at the user's request so the team can punch partial orders and fill gaps in later.
// A small set of "can't punch an order at all without this" fields are the exception:
// Sale/Order/Payment Type, Customer ID, each item's part/qty/price, Billing Address/State,
// Is Shipping Address Same, the three Logistics toggles, and Preferred Transporter ID
// (only when Preferred Delivery Mode is "Transporter") — matching the old CRR system's
// required set.
function validateTab(tab: number, form: OrderFormState, user: AuthUser | null): string | null {
  if (tab === 1) {
    // Only the doer a customer is assigned to may punch for it (an Admin may punch for
    // anyone) — blocked here so it's caught on the customer's own tab instead of after
    // filling all four. POST /orders enforces the same rule server-side.
    const assignedTo = form.custAssignedTo.trim();
    if (assignedTo && user?.modules !== "ALL" && assignedTo.toLowerCase() !== (user?.name ?? "").trim().toLowerCase()) {
      return `This customer is assigned to ${assignedTo} — only they can punch an order for it`;
    }
    if (!form.saleType) return "Select a Sale Type before continuing";
    // Order Type / Payment Type don't apply to a Return Order and are hidden on this tab
    // for that Sale Type, so they can't be required for it either.
    if (form.saleType !== "Return Order") {
      if (!form.orderType) return "Select an Order Type before continuing";
      if (!form.paymentType) return "Select a Payment Type before continuing";
    }
    if (!form.custId) return "Select a Customer ID before continuing";
    for (const [i, item] of form.items.entries()) {
      if (!item.fgId) return `Select a part for item ${i + 1} before continuing`;
      if (!item.qty) return `Enter a quantity for item ${i + 1} before continuing`;
      if (!item.price) return `Enter a price for item ${i + 1} before continuing`;
    }
  }
  if (tab === 2) {
    if (!form.billingAddress) return "Enter a Billing Address before continuing";
    if (!form.billingState) return "Enter a Billing State before continuing";
    if (!form.shippingSame) return "Select Is Shipping Address Same before continuing";
  }
  if (tab === 3) {
    if (!form.preferredDeliveryMode) return "Select a Preferred Delivery Mode before continuing";
    if (!form.preferredTransportMode) return "Select a Preferred Transportation Mode before continuing";
    if (!form.freightPaidBy) return "Select who Freight is Paid by before continuing";
    if (form.preferredDeliveryMode === "Transporter" && !form.preferredTptId) {
      return "Select a Preferred Transporter ID before continuing";
    }
    if (form.preferredDeliveryMode === "ZOTO Vehicle" && !form.preferredZotoVehicleId) {
      return "Select a Preferred ZOTO Vehicle ID before continuing";
    }
  }
  if (form.paymentType === "Advance" && form.advancePct !== undefined && (form.advancePct < 0 || form.advancePct > 100)) {
    return "Advance Payment (%) must be between 0 and 100";
  }
  return null;
}

export function OrderPunchForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<OrderFormState>(emptyOrderForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(patch: Partial<OrderFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function goNext() {
    const err = validateTab(tab, form, user);
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
    const err = validateTab(tab, form, user);
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createOrder({
        poNo: form.poNo,
        poDate: form.poDate,
        poAttachmentUrl: form.poAttachmentUrl,
        otherAttachmentUrl: form.otherAttachmentUrl,
        poRemarks: form.poRemarks,
        saleType: form.saleType as "Order" | "Sample" | "Return Order",
        orderType: form.orderType as "Order Incoming" | "Order Outgoing",
        paymentType: form.paymentType as "Credit" | "Advance",
        advancePct: form.paymentType === "Advance" ? form.advancePct : undefined,
        custId: form.custId,
        customerName: form.customerName,
        clientClassification: form.clientClassification || undefined,
        billingAddress: form.billingAddress,
        billingState: form.billingState,
        billingPincode: form.billingPincode,
        billingCountry: form.billingCountry,
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
        preferredTptName: form.preferredTptName,
        transporterType: form.transporterType,
        transporterContactNo: form.transporterContactNo,
        transporterPersonName: form.transporterPersonName,
        transporterPersonContactNo: form.transporterPersonContactNo,
        transporterAddress: form.transporterAddress,
        preferredZotoVehicleId: form.preferredZotoVehicleId,
        zotoVehicleDetails: form.zotoVehicleDetails,
        zotoVehicleType: form.zotoVehicleType,
        zotoVehicleNo: form.zotoVehicleNo,
        zotoVehicleSize: form.zotoVehicleSize,
        zotoVehicleDriverName: form.zotoVehicleDriverName,
        zotoVehicleDriverContactNo: form.zotoVehicleDriverContactNo,
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
          notes: it.remarks,
        })),
      });
      // invalidateQueries() only auto-refetches queries with an ACTIVE observer right now —
      // the list page isn't mounted yet (we're still on this modal, about to navigate to it),
      // so invalidate alone just marks the cache stale without fetching, and the list's
      // refetchOnMount:false means it would then render that stale (pre-save) cache as soon
      // as it mounts, only catching up whenever the 30s auto-sync happens to fire next.
      // refetchQueries forces the fetch now, so the cache is already fresh by the time the
      // list mounts a moment later.
      await queryClient.refetchQueries({ queryKey: ["orders"] });
      navigate("/modules/punch-order");
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save the order — ${detail}` : "Could not save the order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal title="Order Punch Form" onClose={() => navigate("/modules/punch-order")} size="standard">
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
            padding: "14px var(--space)",
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
    </FormModal>
  );
}
