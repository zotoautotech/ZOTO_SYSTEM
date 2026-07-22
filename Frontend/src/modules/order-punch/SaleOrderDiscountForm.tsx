import { useState } from "react";
import { isAxiosError } from "axios";
import { applyOrderDiscount } from "../../lib/ordersApi";
import { ToggleGroup } from "../../components/form/ToggleGroup";
import { TextField } from "../../components/form/TextField";
import { useIsMobile } from "../../lib/responsive";

interface Props {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SaleOrderDiscountForm({ orderId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"Percentage" | "Rupees" | "">("");
  const [discountPct, setDiscountPct] = useState("");
  const [discountRs, setDiscountRs] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!reason.trim()) return setError("Discount Reason is required");
    if (!type) return setError("Discount Type is required");
    if (type === "Rupees" && !discountRs) return setError("Discount (Rs) is required");
    if (type === "Percentage" && !discountPct) return setError("Discount (%) is required");

    setSaving(true);
    setError("");
    try {
      await applyOrderDiscount(orderId, {
        reason,
        description,
        type,
        discountPct: type === "Percentage" ? Number(discountPct) : undefined,
        discountRs: type === "Rupees" ? Number(discountRs) : undefined,
      });
      onSaved();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(detail ? `Could not save the discount — ${detail}` : "Could not save the discount");
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
      onClick={onClose}
    >
      <div
        className="card modal-in"
        style={{
          width: "min(560px, 100%)",
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
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Sale Order Discount Form</h2>
          <button
            onClick={onClose}
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

        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            Discount Details
          </div>
        </div>

        <div style={{ padding: "20px var(--space)", overflowY: "auto", flex: 1 }}>
          {error && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              ⚠ {error}
            </div>
          )}
          <TextField
            label="Discount Reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <ToggleGroup
            label="Discount Type"
            required
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: "Percentage", label: "Discount In %" },
              { value: "Rupees", label: "Discount In Rs" },
            ]}
          />
          {type === "Rupees" && (
            <TextField
              label="Discount (Rs)"
              required
              type="number"
              value={discountRs}
              onChange={(e) => setDiscountRs(e.target.value)}
            />
          )}
          {type === "Percentage" && (
            <TextField
              label="Discount (%)"
              required
              type="number"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
