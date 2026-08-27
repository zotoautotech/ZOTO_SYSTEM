import { useState } from "react";
import { isAxiosError } from "axios";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { FormModal } from "../../components/form/FormModal";
import { submitDispatchApproval, type DispatchApprovalItemRow } from "../../lib/ordersApi";

interface Props {
  items: DispatchApprovalItemRow[];
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

// Label for the per-item quantity column, matching the single-item DispatchApprovalForm's
// own field labels for each outcome.
const QTY_LABEL: Record<Exclude<Outcome, "" | "Dispatch Extended">, string> = {
  "Dispatch Today": "Approved Quantity",
  "Short Quantity": "Short Quantity",
  "Excess Quantity": "Excess Quantity",
};

interface ItemResult {
  item: DispatchApprovalItemRow;
  status: "pending" | "success" | "error";
  message?: string;
}

function itemKey(item: DispatchApprovalItemRow) {
  return item.ITEM_ID || `${item.ORDER_ID}-${item.PART_NAME}`;
}

/**
 * Applies ONE outcome to every selected pending item at once, for the common case of one
 * customer with many items decided the same way together — a second, additional entry point
 * alongside the existing single-item DispatchApprovalForm, which this never touches or calls
 * into. Reuses the exact same POST /orders/:orderId/items/:itemId/dispatch-approval endpoint,
 * once per selected item, run sequentially rather than in parallel so two calls touching the
 * same order's ORDER_PUNCH.STATUS can't race each other.
 *
 * Only the outcome dropdown shows up front. Once an outcome is picked, the selected items
 * appear with a per-item quantity field (Approved/Short/Excess, matching the outcome) —
 * pre-filled from each item's own remaining balance, same as the single-item form's default
 * expectation, but editable per row since a doer may want to decide less than the full
 * balance on some items in the batch.
 */
export function BulkDispatchApprovalForm({ items: itemsProp, onClose, onSaved }: Props) {
  // Snapshot the selection at mount time — `items` is bound to the parent's live pending-item
  // query, and onSaved() invalidates that query mid-flow, which shrinks the pending list (a
  // just-decided item drops off it). Without this snapshot, the prop update would reactively
  // shrink the list WHILE this modal is still open showing its own results — confusing and
  // wrong, since the decision already went through. The form's own view of what it's deciding
  // must stay fixed once opened, regardless of what the background list does afterward.
  const [items] = useState(itemsProp);
  const [outcome, setOutcome] = useState<Outcome>("");
  const [nextExtendedDate, setNextExtendedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [itemKey(item), String(Number(item.BALANCE_QTY) || 0)]))
  );
  // PDI is on hold — Box Quantity is collected right here per item, same as the single-item
  // DispatchApprovalForm, since Transport eligibility reads it straight off this row now.
  // Only meaningful (and required) for "Dispatch Today".
  const [boxQtyByItem, setBoxQtyByItem] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ItemResult[] | null>(null);

  function qtyErrorFor(item: DispatchApprovalItemRow) {
    const balance = Number(item.BALANCE_QTY) || 0;
    const value = qtyByItem[itemKey(item)] ?? "";
    const n = Number(value);
    if (!value || Number.isNaN(n) || n <= 0) return "Invalid quantity.";
    // Excess Quantity is deliberately exempt from the balance cap — it's explicitly "more
    // than was ordered," same exemption the single-item form applies.
    if (outcome !== "Excess Quantity" && balance > 0 && n > balance) {
      return `Only ${balance} ${item.UOM || ""} still outstanding.`.trim();
    }
    return "";
  }

  function boxQtyErrorFor(item: DispatchApprovalItemRow) {
    const value = boxQtyByItem[itemKey(item)] ?? "";
    const n = Number(value);
    if (!value || Number.isNaN(n) || n <= 0) return "Required.";
    return "";
  }

  function canSave() {
    if (!outcome || !remarks.trim()) return false;
    if (outcome === "Dispatch Extended") return !!nextExtendedDate;
    if (!items.every((item) => !qtyErrorFor(item))) return false;
    if (outcome === "Dispatch Today") return items.every((item) => !boxQtyErrorFor(item));
    return true;
  }

  async function handleSave() {
    if (!canSave() || submitting) return;
    setSubmitting(true);
    const running: ItemResult[] = items.map((item) => ({ item, status: "pending" }));
    setResults([...running]);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = Number(qtyByItem[itemKey(item)]) || 0;
      const boxQty = Number(boxQtyByItem[itemKey(item)]) || 0;
      try {
        await submitDispatchApproval(item.ORDER_ID, item.ITEM_ID, {
          outcome: outcome as Exclude<Outcome, "">,
          approvedQty: outcome === "Dispatch Today" ? qty : undefined,
          boxQuantity: outcome === "Dispatch Today" && boxQty > 0 ? boxQty : undefined,
          shortQty: outcome === "Short Quantity" ? qty : undefined,
          excessQty: outcome === "Excess Quantity" ? qty : undefined,
          nextExtendedDate: outcome === "Dispatch Extended" ? nextExtendedDate : undefined,
          remarks,
          unit: item.UOM || undefined,
        });
        running[i] = { item, status: "success" };
      } catch (err) {
        const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
        running[i] = { item, status: "error", message: detail ?? "Could not save." };
      }
      setResults([...running]);
    }

    setSubmitting(false);
    onSaved();
    // Auto-close on a clean sweep — nothing left for the doer to review. A partial failure
    // keeps the modal open so the per-item Saved/Failed list (and the hover reason) stays
    // visible instead of vanishing along with the one thing they'd need to retry.
    if (running.every((r) => r.status === "success")) onClose();
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;
  const done = results !== null && !submitting;
  const showQtyColumn = outcome === "Dispatch Today" || outcome === "Short Quantity" || outcome === "Excess Quantity";

  return (
    <FormModal title="Bulk Dispatch Approval Form" onClose={onClose} size="standard" sectionLabel="Dispatch Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
          Applying one decision to {items.length} selected item{items.length === 1 ? "" : "s"}.
        </p>

        <SearchableSelect
          label="Dispatch Approval"
          required
          value={outcome}
          onChange={(v) => setOutcome(v as Outcome)}
          options={DISPATCH_APPROVAL_OPTIONS}
          placeholder="Search"
        />

        {outcome && (
          <>
            {showQtyColumn && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 4 }}>
                <span className="text-muted" style={{ fontSize: 12, width: 130, textAlign: "left" }}>
                  {QTY_LABEL[outcome as Exclude<Outcome, "" | "Dispatch Extended">]} *
                </span>
                {outcome === "Dispatch Today" && (
                  <span className="text-muted" style={{ fontSize: 12, width: 100, textAlign: "left" }}>
                    Box Qty *
                  </span>
                )}
              </div>
            )}
            <div
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
                margin: "0 0 20px",
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {items.map((item, i) => {
                const key = itemKey(item);
                const result = results?.[i];
                const error = qtyErrorFor(item);
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderBottom: i < items.length - 1 ? "1px solid var(--color-border)" : undefined,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.CUSTOMER_NAME || "—"} · {item.PART_NAME || "—"}
                      </div>
                      <div className="text-muted">
                        Balance {item.BALANCE_QTY || "0"} {item.UOM || ""}
                      </div>
                    </div>
                    {showQtyColumn && (
                      <div style={{ flexShrink: 0, width: 130 }}>
                        <input
                          type="number"
                          value={qtyByItem[key] ?? ""}
                          onChange={(e) => setQtyByItem((prev) => ({ ...prev, [key]: e.target.value }))}
                          disabled={submitting || done}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            border: `1px solid ${error ? "#d32f2f" : "var(--color-border)"}`,
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        />
                        {error && <div style={{ color: "#d32f2f", fontSize: 11, marginTop: 2 }}>{error}</div>}
                      </div>
                    )}
                    {outcome === "Dispatch Today" && (
                      <div style={{ flexShrink: 0, width: 100 }}>
                        <input
                          type="number"
                          min={0}
                          value={boxQtyByItem[key] ?? ""}
                          onChange={(e) => setBoxQtyByItem((prev) => ({ ...prev, [key]: e.target.value }))}
                          disabled={submitting || done}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            border: `1px solid ${boxQtyErrorFor(item) ? "#d32f2f" : "var(--color-border)"}`,
                            borderRadius: 6,
                            fontSize: 13,
                          }}
                        />
                        {boxQtyErrorFor(item) && <div style={{ color: "#d32f2f", fontSize: 11, marginTop: 2 }}>{boxQtyErrorFor(item)}</div>}
                      </div>
                    )}
                    {result && (
                      <span
                        style={{
                          flexShrink: 0,
                          color:
                            result.status === "success"
                              ? "var(--color-success, #2e7d32)"
                              : result.status === "error"
                                ? "#d32f2f"
                                : "var(--color-text-muted)",
                          fontSize: 12,
                        }}
                        title={result.message}
                      >
                        {result.status === "success" ? "Saved" : result.status === "error" ? "Failed" : "…"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {outcome === "Dispatch Extended" && (
              <TextField
                label="Next Extended Date"
                required
                type="date"
                value={nextExtendedDate}
                onChange={(e) => setNextExtendedDate(e.target.value)}
              />
            )}

            <TextField label="Dispatch Remarks" required value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </>
        )}

        {done && (
          <p style={{ fontSize: 13, marginTop: 12 }}>
            {successCount} succeeded{errorCount > 0 ? `, ${errorCount} failed — hover an item above for the reason.` : "."}
          </p>
        )}
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
        <button className="btn" onClick={onClose} disabled={submitting}>
          {done ? "Close" : "Cancel"}
        </button>
        {!done && (
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave() || submitting}>
            {submitting ? `Saving… (${results?.filter((r) => r.status !== "pending").length ?? 0}/${items.length})` : "Save"}
          </button>
        )}
      </div>
    </FormModal>
  );
}
