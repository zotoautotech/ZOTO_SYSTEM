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

interface ItemResult {
  item: DispatchApprovalItemRow;
  status: "pending" | "success" | "error";
  message?: string;
}

/**
 * Applies ONE outcome to every selected pending item at once, for the common case of one
 * customer with many items decided the same way together — a second, additional entry point
 * alongside the existing single-item DispatchApprovalForm, which this never touches or calls
 * into. Reuses the exact same POST /orders/:orderId/items/:itemId/dispatch-approval endpoint,
 * once per selected item, run sequentially rather than in parallel so two calls touching the
 * same order's ORDER_PUNCH.STATUS can't race each other.
 *
 * Quantity is never typed per item here — for outcomes that need one (Dispatch Today/Short/
 * Excess), each item's own full remaining balance (BALANCE_QTY, already known from the
 * pending list — no extra fetch) is used automatically. A doer who needs a PARTIAL quantity
 * on one specific item still uses the single-item form for that one; bulk is for "decide all
 * of these the same way," not partial per-item amounts.
 */
export function BulkDispatchApprovalForm({ items, onClose, onSaved }: Props) {
  const [outcome, setOutcome] = useState<Outcome>("");
  const [nextExtendedDate, setNextExtendedDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ItemResult[] | null>(null);

  function canSave() {
    if (!outcome || !remarks.trim()) return false;
    if (outcome === "Dispatch Extended") return !!nextExtendedDate;
    // Every selected item must actually have a positive balance to decide against — a bulk
    // selection could in theory include a row whose balance already hit 0 in-between (e.g.
    // someone else just decided it) if the list hasn't refetched yet; the per-item submit
    // call still safely 409s on that one row rather than silently skipping it.
    return items.every((it) => (Number(it.BALANCE_QTY) || 0) > 0);
  }

  async function handleSave() {
    if (!canSave() || submitting) return;
    setSubmitting(true);
    const running: ItemResult[] = items.map((item) => ({ item, status: "pending" }));
    setResults([...running]);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = Number(item.BALANCE_QTY) || 0;
      try {
        await submitDispatchApproval(item.ORDER_ID, item.ITEM_ID, {
          outcome: outcome as Exclude<Outcome, "">,
          approvedQty: outcome === "Dispatch Today" ? qty : undefined,
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
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0;
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0;
  const done = results !== null && !submitting;

  return (
    <FormModal title="Bulk Dispatch Approval Form" onClose={onClose} size="standard" sectionLabel="Dispatch Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
          Applying one decision to {items.length} selected item{items.length === 1 ? "" : "s"}. For Dispatch
          Today / Short / Excess Quantity, each item's own full balance is used automatically.
        </p>

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            marginBottom: 20,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {items.map((item, i) => {
            const result = results?.[i];
            return (
              <div
                key={item.ITEM_ID || `${item.ORDER_ID}-${item.PART_NAME}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: i < items.length - 1 ? "1px solid var(--color-border)" : undefined,
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.CUSTOMER_NAME || "—"} · {item.PART_NAME || "—"}
                  </div>
                  <div className="text-muted">
                    Balance {item.BALANCE_QTY || "0"} {item.UOM || ""}
                  </div>
                </div>
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
                      alignSelf: "center",
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

        <SearchableSelect
          label="Dispatch Approval"
          required
          value={outcome}
          onChange={(v) => setOutcome(v as Outcome)}
          options={DISPATCH_APPROVAL_OPTIONS}
          placeholder="Search"
        />

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
