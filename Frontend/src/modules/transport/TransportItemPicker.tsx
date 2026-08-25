import { useState } from "react";
import { FormModal } from "../../components/form/FormModal";
import type { PdiItemRow } from "../../lib/ordersApi";

export interface PickedItem {
  itemId: string;
  dispConfItemId: string;
  partName: string;
  qty: number;
  unit: string;
  loadBoxes?: number;
}

interface Props {
  customerName: string;
  /** This order's own COMPLETED PDI rows — the full set of what's cleared to travel (see
   * CreateTripModal.tsx's toggleOrder for why PDI, not ORDER_ITEMS, is the source). */
  pdiItems: PdiItemRow[];
  /** Currently-queued picks for this order, so re-opening the picker to adjust an
   * already-ticked order shows the doer's last choice, not a reset back to "everything". */
  initialItems: PickedItem[];
  onClose: () => void;
  onSave: (items: PickedItem[]) => void;
}

/** Nested picker opened the moment an order's checkbox is ticked in the Arrange Vehicle
 * Form's Select Sale Orders table (CreateTripModal.tsx) — lets the doer deselect items or
 * cut down a quantity for a partial load, instead of always shipping the full PDI-approved
 * amount. Re-brought back by explicit user request after a prior redesign had deliberately
 * dropped per-item selection (see CreateTripModal.tsx's own doc comment on that decision) —
 * don't remove this again without checking with the user first, this has now gone back and
 * forth once already. */
export function TransportItemPicker({ customerName, pdiItems, initialItems, onClose, onSave }: Props) {
  const initialByDispConf = new Map(initialItems.map((it) => [it.dispConfItemId, it]));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialItems.length > 0 ? initialItems.map((it) => it.dispConfItemId) : pdiItems.map((r) => r.DISP_CONF_ITEM_ID))
  );
  const [qtyByDispConf, setQtyByDispConf] = useState<Record<string, string>>(
    Object.fromEntries(pdiItems.map((r) => [r.DISP_CONF_ITEM_ID, String(initialByDispConf.get(r.DISP_CONF_ITEM_ID)?.qty ?? r.QTY)]))
  );

  function toggle(dispConfItemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dispConfItemId)) next.delete(dispConfItemId);
      else next.add(dispConfItemId);
      return next;
    });
  }

  function qtyError(r: PdiItemRow): string | null {
    const val = Number(qtyByDispConf[r.DISP_CONF_ITEM_ID]);
    const max = Number(r.QTY);
    if (!Number.isFinite(val) || val <= 0) return "Required";
    if (val > max) return `Max ${max}`;
    return null;
  }

  function canSave() {
    if (selected.size === 0) return false;
    return [...selected].every((id) => {
      const row = pdiItems.find((r) => r.DISP_CONF_ITEM_ID === id);
      return row && !qtyError(row);
    });
  }

  function handleSave() {
    if (!canSave()) return;
    const items: PickedItem[] = pdiItems
      .filter((r) => selected.has(r.DISP_CONF_ITEM_ID))
      .map((r) => {
        const boxQty = Number(r.BOX_QUANTITY || 0);
        return {
          itemId: r.ITEM_ID,
          dispConfItemId: r.DISP_CONF_ITEM_ID,
          partName: r.PART_NAME,
          qty: Number(qtyByDispConf[r.DISP_CONF_ITEM_ID]),
          unit: r.UOM || "NOS",
          loadBoxes: boxQty > 0 ? boxQty : undefined,
        };
      });
    onSave(items);
    onClose();
  }

  return (
    <FormModal title="Select Items" onClose={onClose} size="standard" zIndex={55} sectionLabel={customerName}>
      <div style={{ padding: "20px var(--space)", overflowY: "auto", flex: 1 }}>
        <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
          Uncheck an item to leave it off this trip, or lower its quantity for a partial load.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "6px 8px", width: 30 }} />
                <th style={{ padding: "6px 8px" }}>Part Name</th>
                <th style={{ padding: "6px 8px" }}>Approved Qty</th>
                <th style={{ padding: "6px 8px" }}>Load Qty</th>
                <th style={{ padding: "6px 8px" }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {pdiItems.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "14px 8px", color: "var(--color-text-muted)" }}>
                    No PDI-cleared items on this order.
                  </td>
                </tr>
              )}
              {pdiItems.map((r) => {
                const checked = selected.has(r.DISP_CONF_ITEM_ID);
                const err = checked ? qtyError(r) : null;
                return (
                  <tr key={r.DISP_CONF_ITEM_ID} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(r.DISP_CONF_ITEM_ID)} />
                    </td>
                    <td style={{ padding: "6px 8px" }}>{r.PART_NAME}</td>
                    <td style={{ padding: "6px 8px" }}>
                      {r.QTY} {r.UOM}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        type="number"
                        min={1}
                        max={Number(r.QTY)}
                        disabled={!checked}
                        value={qtyByDispConf[r.DISP_CONF_ITEM_ID] ?? ""}
                        onChange={(e) => setQtyByDispConf((prev) => ({ ...prev, [r.DISP_CONF_ITEM_ID]: e.target.value }))}
                        style={{ width: 80, padding: "4px 6px", border: `1px solid ${err ? "var(--color-error)" : "var(--color-border)"}`, borderRadius: 4 }}
                      />
                      {err && <div style={{ color: "var(--color-error)", fontSize: 11 }}>{err}</div>}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{r.UOM}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={!canSave()}>
          Save
        </button>
      </div>
    </FormModal>
  );
}
