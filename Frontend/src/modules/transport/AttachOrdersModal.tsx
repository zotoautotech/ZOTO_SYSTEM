import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { listEligibleOrders, attachOrders } from "../../lib/tripsApi";
import { useIsMobile } from "../../lib/responsive";

interface Props {
  transportId: string;
  onClose: () => void;
  onAttached: () => void;
}

/** Matches the reference's "Select Sale Orders here that will transport through this
 * vehicle" picker (docs/04-UIUX-BRIEF.md §9.1) — simplified to a multi-select list instead
 * of the old one-at-a-time nested New-row flow, since attaching several orders at once in
 * one click is strictly better UX and the backend already supports a batch call. */
export function AttachOrdersModal({ transportId, onClose, onAttached }: Props) {
  const isMobile = useIsMobile();
  const { data: orders = [], isLoading } = useQuery({ queryKey: ["transport-eligible-orders"], queryFn: listEligibleOrders });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      await attachOrders(transportId, [...selected].map((orderId) => ({ orderId })));
      onAttached();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ?? "Could not attach orders.");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(17,17,20,0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "85vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Select Sale Orders</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <p className="text-muted" style={{ padding: "0 var(--space)", fontSize: 13 }}>
          Orders that will transport through this vehicle. Every item on a selected order is loaded onto this trip.
        </p>

        <div style={{ padding: "12px var(--space)", overflowY: "auto", flex: 1 }}>
          {isLoading && <p className="text-muted">Loading…</p>}
          {!isLoading && orders.length === 0 && <p className="text-muted">No orders are ready for transport yet.</p>}
          {orders.map((o) => (
            <label
              key={o.ORDER_ID}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                marginBottom: 8,
                borderRadius: 10,
                border: `1px solid ${selected.has(o.ORDER_ID) ? "var(--color-primary)" : "var(--color-border)"}`,
                background: selected.has(o.ORDER_ID) ? "var(--color-primary-tint)" : "var(--color-bg)",
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={selected.has(o.ORDER_ID)} onChange={() => toggle(o.ORDER_ID)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.CUSTOMER_NAME || "Customer not set"}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {o.ORDER_ID} · {o.CUST_ID} · ₹{Number(o.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}
                </div>
              </div>
            </label>
          ))}
          {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={selected.size === 0 || saving}>
            {saving ? "Attaching…" : `Attach ${selected.size || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
