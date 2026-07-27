import { useState } from "react";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { useIsMobile } from "../../lib/responsive";
import { submitDispatchApproval } from "../../lib/ordersApi";

interface Props {
  orderId: string;
  onClose: () => void;
  onSaved: () => void;
}

type Outcome = "Dispatch Today" | "Dispatch Extended" | "Short Quantity" | "Excess Quantity" | "";

const DISPATCH_APPROVAL_OPTIONS = [
  { value: "Dispatch Today", label: "Dispatch Today" },
  { value: "Dispatch Extended", label: "Dispatch Extended" },
  { value: "Short Quantity", label: "Short Quantity" },
  { value: "Excess Quantity", label: "Excess Quantity" },
];

/**
 * Dispatch Approval form matching the reference's per-outcome field set and live
 * red-border validation. Saves via POST /orders/:id/dispatch-approval.
 *
 * Available Stock Quantity is a placeholder (disabled, "0.00") until a real Inventory
 * Management System is connected — Balance Dispatch Quantity is the only stock-derived
 * number we can show for real today (it comes from the order's own planned/order
 * quantity), so quantity validation only enforces against Balance when it's actually
 * known (> 0); once inventory is wired, Available Stock should feed in the same way.
 */
export function DispatchApprovalForm({ orderId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [outcome, setOutcome] = useState<Outcome>("");
  const [approvedQty, setApprovedQty] = useState("");
  const [shortQty, setShortQty] = useState("");
  const [excessQty, setExcessQty] = useState("");
  const [nextExtendedDate, setNextExtendedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Placeholder until Inventory Management System is connected — see comment above.
  const availableStockQty = 0;
  // Real for today: derived from the order's own quantity, not yet wired here — 0 means
  // "unknown", in which case quantity fields are only checked for being > 0.
  const balanceDispatchQty = 0;

  const qtyError = (value: string, label: string) => {
    const n = Number(value);
    if (!value || Number.isNaN(n) || n <= 0) return "Invalid Quantity.";
    if (balanceDispatchQty > 0 && n > balanceDispatchQty) return `You can't ${label} more than Balance quantity.`;
    return "";
  };

  function canSave() {
    if (!outcome || !remarks.trim()) return false;
    if (outcome === "Dispatch Today") return !qtyError(approvedQty, "Dispatch");
    if (outcome === "Dispatch Extended") return !!nextExtendedDate;
    if (outcome === "Short Quantity") return !qtyError(shortQty, "Short");
    if (outcome === "Excess Quantity") return !qtyError(excessQty, "Excess");
    return false;
  }

  async function handleSave() {
    if (!canSave() || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitDispatchApproval(orderId, {
        outcome: outcome as Exclude<Outcome, "">,
        approvedQty: outcome === "Dispatch Today" ? Number(approvedQty) : undefined,
        shortQty: outcome === "Short Quantity" ? Number(shortQty) : undefined,
        excessQty: outcome === "Excess Quantity" ? Number(excessQty) : undefined,
        nextExtendedDate: outcome === "Dispatch Extended" ? nextExtendedDate : undefined,
        remarks,
      });
      onSaved();
    } catch {
      setError("Could not save — please try again.");
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
        style={{ width: "min(560px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Dispatch Items Approval Form</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)" }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            Dispatch Details
          </div>
        </div>

        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
          <SearchableSelect
            label="Dispatch Approval"
            required
            value={outcome}
            onChange={(v) => setOutcome(v as Outcome)}
            options={DISPATCH_APPROVAL_OPTIONS}
            placeholder="Search"
          />

          {outcome && (
            <TextField label="Available Stock Quantity" disabled value={availableStockQty.toFixed(2)} />
          )}

          {(outcome === "Dispatch Today" || outcome === "Short Quantity" || outcome === "Excess Quantity") && (
            <TextField label="Balance Dispatch Quantity" disabled value={balanceDispatchQty.toFixed(2)} />
          )}

          {outcome === "Dispatch Today" && (
            <TextField
              label="Approved Quantity"
              required
              type="number"
              value={approvedQty}
              onChange={(e) => setApprovedQty(e.target.value)}
              error={approvedQty ? qtyError(approvedQty, "Dispatch") : undefined}
            />
          )}
          {outcome === "Short Quantity" && (
            <TextField
              label="Short Quantity"
              required
              type="number"
              value={shortQty}
              onChange={(e) => setShortQty(e.target.value)}
              error={shortQty ? qtyError(shortQty, "Short") : undefined}
            />
          )}
          {outcome === "Excess Quantity" && (
            <TextField
              label="Excess Quantity"
              required
              type="number"
              value={excessQty}
              onChange={(e) => setExcessQty(e.target.value)}
              error={excessQty ? qtyError(excessQty, "Excess") : undefined}
            />
          )}

          {outcome && <TextField label="Unit" disabled value="NOS" />}

          {outcome === "Dispatch Extended" && (
            <TextField
              label="Next Extended Date"
              required
              type="date"
              value={nextExtendedDate}
              onChange={(e) => setNextExtendedDate(e.target.value)}
            />
          )}

          {outcome && (
            <TextField label="Dispatch Remarks" required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          )}

          {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8 }}>{error}</p>}
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
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
