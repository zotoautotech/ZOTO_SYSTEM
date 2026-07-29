import { useState } from "react";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { useIsMobile } from "../../lib/responsive";
import type { OrderItemRecord } from "../../lib/ordersApi";

export interface PickedItem {
  itemId: string;
  partName: string;
  qty: number;
  unit: string;
  loadBoxes?: number;
}

interface Props {
  items: OrderItemRecord[];
  alreadyPicked: PickedItem[];
  onClose: () => void;
  onAdd: (picked: PickedItem) => void;
}

/** Level-3 nested modal ("Load Limit Details") — matches the old CRR reference field-for-
 * field: Select Product, then read-only Quantity/Unit/Balance Qty to Dispatch (no cross-trip
 * balance tracking exists yet — Balance is just the item's own order quantity, same "no IMS"
 * gap flagged elsewhere in this app), then the doer's own Load Qty and Load Boxes. Opened
 * from TransportOrderForm's "Select Products & Quantity" New button. */
export function TransportItemsForm({ items, alreadyPicked, onClose, onAdd }: Props) {
  const isMobile = useIsMobile();
  const [itemId, setItemId] = useState("");
  const [loadQty, setLoadQty] = useState("");
  const [loadBoxes, setLoadBoxes] = useState("");

  const pickedIds = new Set(alreadyPicked.map((p) => p.itemId));
  const options = items
    .filter((it) => !pickedIds.has(it.ITEM_ID))
    .map((it) => ({
      value: it.ITEM_ID,
      label: it.FG_ID ? `${it.PART_NAME} (${it.FG_ID})` : it.PART_NAME || it.ITEM_ID,
      subtitle: it.PART_NO,
    }));

  const selected = items.find((it) => it.ITEM_ID === itemId);
  const balanceQty = selected ? Number(selected.QTY || 0) : undefined;
  const loadQtyError =
    selected && loadQty && balanceQty && Number(loadQty) > balanceQty ? `Can't exceed the Balance Qty to Dispatch (${balanceQty}).` : "";

  function handleSelect(id: string) {
    setItemId(id);
    setLoadQty("");
    setLoadBoxes("");
  }

  function canSave() {
    return !!selected && !!loadQty && Number(loadQty) > 0 && !loadQtyError && !!loadBoxes && Number(loadBoxes) > 0;
  }

  function handleSave() {
    if (!canSave() || !selected) return;
    onAdd({
      itemId: selected.ITEM_ID,
      partName: selected.PART_NAME,
      qty: Number(loadQty),
      unit: selected.UOM || "NOS",
      loadBoxes: Number(loadBoxes),
    });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,17,20,0.5)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
    >
      <div
        className="card modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px, 100%)", height: isMobile ? "100dvh" : undefined, maxHeight: isMobile ? "100dvh" : "85vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: isMobile ? 0 : 18 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "24px var(--space) 12px" : "20px var(--space) 12px" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Transport Items Form</h2>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--color-bg-page)", fontSize: 16, cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: "8px var(--space) 0" }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--color-primary)", paddingBottom: 10, borderBottom: "2px solid var(--color-primary)" }}>
            Load Limit Details
          </div>
        </div>

        <div style={{ padding: "28px var(--space)", overflowY: "auto", flex: 1 }}>
          <SearchableSelect label="Select Product" required value={itemId} onChange={handleSelect} options={options} placeholder="Search" />
          {selected && (
            <>
              <TextField label="Quantity" value={selected.QTY || ""} disabled />
              <TextField label="Unit" value={selected.UOM || ""} disabled />
              <TextField label="Balance Qty to Dispatch" value={balanceQty !== undefined ? String(balanceQty) : ""} disabled />
              <TextField
                label="Load Qty"
                required
                type="number"
                value={loadQty}
                onChange={(e) => setLoadQty(e.target.value)}
                error={loadQtyError || undefined}
              />
              <TextField label="Load Boxes" required type="number" value={loadBoxes} onChange={(e) => setLoadBoxes(e.target.value)} />
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
