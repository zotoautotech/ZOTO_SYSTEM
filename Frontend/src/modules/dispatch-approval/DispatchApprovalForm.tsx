import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { FormModal } from "../../components/form/FormModal";
import { submitDispatchApproval } from "../../lib/ordersApi";
import { listDropdowns, dropdownValues } from "../../lib/mastersApi";
import { UOM_OPTIONS } from "../../lib/modules";
import { useIsMobile } from "../../lib/responsive";

interface Props {
  orderId: string;
  itemId: string;
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
 * Available Stock Quantity / Balance Dispatch Quantity are manually typed for the time being,
 * until a real Inventory Management System is connected — Available Stock has nowhere to
 * persist to yet (no matching sheet column), Balance Dispatch Quantity does and gets sent
 * along. Once inventory is wired, these should auto-fill instead of requiring manual entry.
 * Unit is a real UOM dropdown (same CRR DD-backed list + "SET" default as the Order Punch
 * item editor's UOM select), not manually typed.
 */
export function DispatchApprovalForm({ orderId, itemId, onClose, onSaved }: Props) {
  const isMobile = useIsMobile();
  const [outcome, setOutcome] = useState<Outcome>("");
  const [approvedQty, setApprovedQty] = useState("");
  const [shortQty, setShortQty] = useState("");
  const [excessQty, setExcessQty] = useState("");
  const [nextExtendedDate, setNextExtendedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [availableStockQty, setAvailableStockQty] = useState("");
  const [balanceDispatchQty, setBalanceDispatchQty] = useState("");
  const [unit, setUnit] = useState("SET");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: dropdowns = [] } = useQuery({ queryKey: ["masters", "dropdowns"], queryFn: listDropdowns });
  const uomOptions = dropdownValues(dropdowns, "UOM");
  const uomList = uomOptions.length > 0 ? uomOptions : UOM_OPTIONS;

  // Same reconciliation as the Order Punch item editor's UOM select — the "SET" default
  // isn't guaranteed to be an exact match once the live dropdown list loads.
  useEffect(() => {
    if (uomList.length === 0 || uomList.includes(unit)) return;
    setUnit(uomList.includes("SET") ? "SET" : uomList[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uomList.join("|")]);

  const balanceQtyNum = Number(balanceDispatchQty) || 0;
  const qtyError = (value: string, label: string) => {
    const n = Number(value);
    if (!value || Number.isNaN(n) || n <= 0) return "Invalid Quantity.";
    if (balanceQtyNum > 0 && n > balanceQtyNum) return `You can't ${label} more than Balance quantity.`;
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
      await submitDispatchApproval(orderId, itemId, {
        outcome: outcome as Exclude<Outcome, "">,
        approvedQty: outcome === "Dispatch Today" ? Number(approvedQty) : undefined,
        shortQty: outcome === "Short Quantity" ? Number(shortQty) : undefined,
        excessQty: outcome === "Excess Quantity" ? Number(excessQty) : undefined,
        nextExtendedDate: outcome === "Dispatch Extended" ? nextExtendedDate : undefined,
        remarks,
        availableStockQty: availableStockQty ? Number(availableStockQty) : undefined,
        balanceDispatchQty:
          outcome !== "Dispatch Extended" && balanceDispatchQty ? Number(balanceDispatchQty) : undefined,
        unit: unit || undefined,
      });
      onSaved();
    } catch {
      setError("Could not save — please try again.");
      setSaving(false);
    }
  }

  return (
    <FormModal title="Dispatch Items Approval Form" onClose={onClose} size="standard" sectionLabel="Dispatch Details">
        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", columnGap: 20 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <SearchableSelect
              label="Dispatch Approval"
              required
              value={outcome}
              onChange={(v) => setOutcome(v as Outcome)}
              options={DISPATCH_APPROVAL_OPTIONS}
              placeholder="Search"
            />
          </div>

          {outcome && (
            <TextField
              label="Available Stock Quantity"
              type="number"
              value={availableStockQty}
              onChange={(e) => setAvailableStockQty(e.target.value)}
            />
          )}

          {(outcome === "Dispatch Today" || outcome === "Short Quantity" || outcome === "Excess Quantity") && (
            <TextField
              label="Balance Dispatch Quantity"
              type="number"
              value={balanceDispatchQty}
              onChange={(e) => setBalanceDispatchQty(e.target.value)}
            />
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

          {outcome && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", fontSize: 14 }}
              >
                {uomList.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          {error && <p style={{ color: "#d32f2f", fontSize: 13, marginTop: 8, gridColumn: "1 / -1" }}>{error}</p>}
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
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
    </FormModal>
  );
}
