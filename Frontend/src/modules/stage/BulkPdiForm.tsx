import { useState } from "react";
import { isAxiosError } from "axios";
import { TextField } from "../../components/form/TextField";
import { FileDropzone } from "../../components/form/FileDropzone";
import { FormModal } from "../../components/form/FormModal";
import { submitPdiItemForm, type PdiItemRow } from "../../lib/ordersApi";
import { todayIso } from "../../lib/format";

interface Props {
  items: PdiItemRow[];
  onClose: () => void;
  onSaved: () => void;
}

interface ItemResult {
  item: PdiItemRow;
  status: "pending" | "success" | "error";
  message?: string;
}

/**
 * Applies one PDI submission to several selected pending rounds at once — a second,
 * additional entry point alongside the existing single-item PdiItemDetail → StageForm flow,
 * which this never touches or calls into. Reuses the exact same
 * POST /orders/:orderId/items/:itemId/pdi endpoint, once per selected row, run sequentially
 * so two calls touching the same order's ORDER_PUNCH.STATUS can't race each other.
 *
 * PDI Date / Attachment / Remarks are entered once and applied to every selected row — but
 * PDI No. and Box Quantity are genuinely per-item/round values (unlike Dispatch Approval's
 * quantity, which is safely auto-filled from each item's own balance), so those two get their
 * own editable cell per selected row instead.
 */
export function BulkPdiForm({ items, onClose, onSaved }: Props) {
  const [pdiDate, setPdiDate] = useState(todayIso());
  const [pdiAttachmentUrl, setPdiAttachmentUrl] = useState("");
  const [pdiRemarks, setPdiRemarks] = useState("");
  const [rowValues, setRowValues] = useState<Record<string, { pdiNo: string; boxQuantity: string }>>(
    () => Object.fromEntries(items.map((item) => [rowKey(item), { pdiNo: "", boxQuantity: "" }]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ItemResult[] | null>(null);

  function rowKey(item: PdiItemRow) {
    return item.DISP_CONF_ITEM_ID || item.ITEM_ID || `${item.ORDER_ID}-${item.PART_NAME}`;
  }

  function setRowValue(key: string, field: "pdiNo" | "boxQuantity", value: string) {
    setRowValues((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function canSave() {
    if (!pdiDate || !pdiAttachmentUrl || !pdiRemarks.trim()) return false;
    return items.every((item) => {
      const row = rowValues[rowKey(item)];
      return row && row.pdiNo.trim() !== "" && row.boxQuantity.trim() !== "";
    });
  }

  async function handleSave() {
    if (!canSave() || submitting) return;
    setSubmitting(true);
    const running: ItemResult[] = items.map((item) => ({ item, status: "pending" }));
    setResults([...running]);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = rowValues[rowKey(item)];
      try {
        await submitPdiItemForm(item.ORDER_ID, item.ITEM_ID, {
          pdiNo: row.pdiNo,
          pdiDate,
          pdiAttachmentUrl,
          boxQuantity: Number(row.boxQuantity),
          pdiRemarks,
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
    <FormModal title="Bulk PDI Form" onClose={onClose} size="standard" sectionLabel="PDI Details">
      <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 16px" }}>
          Applying PDI Date/Attachment/Remarks to {items.length} selected item{items.length === 1 ? "" : "s"}.
          PDI No. and Box Quantity are entered per item below since they vary item to item.
        </p>

        <TextField label="PDI Date" required type="date" value={pdiDate} onChange={(e) => setPdiDate(e.target.value)} />
        <FileDropzone label="PDI Attachment *" value={pdiAttachmentUrl} onChange={setPdiAttachmentUrl} context="pdi_bulk" />
        <TextField label="PDI Remarks" required value={pdiRemarks} onChange={(e) => setPdiRemarks(e.target.value)} />

        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            marginTop: 16,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {items.map((item, i) => {
            const key = rowKey(item);
            const row = rowValues[key];
            const result = results?.[i];
            return (
              <div
                key={key}
                style={{
                  padding: "10px 12px",
                  borderBottom: i < items.length - 1 ? "1px solid var(--color-border)" : undefined,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.CUSTOMER_NAME || "—"} · {item.PART_NAME || "—"} ({item.QTY || "0"} {item.UOM || ""})
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
                      }}
                      title={result.message}
                    >
                      {result.status === "success" ? "Saved" : result.status === "error" ? "Failed" : "…"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    placeholder="PDI No."
                    value={row.pdiNo}
                    onChange={(e) => setRowValue(key, "pdiNo", e.target.value)}
                    disabled={submitting || done}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  />
                  <input
                    placeholder="Box Quantity"
                    type="number"
                    value={row.boxQuantity}
                    onChange={(e) => setRowValue(key, "boxQuantity", e.target.value)}
                    disabled={submitting || done}
                    style={{
                      width: 120,
                      padding: "6px 8px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

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
