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
}

interface Props {
  items: OrderItemRecord[];
  alreadyPicked: PickedItem[];
  onClose: () => void;
  onAdd: (picked: PickedItem) => void;
}

/** Level-3 nested modal ("Load Limit Details") — Select Product from the sale order's own
 * items, pick a Quantity to load onto this vehicle. Opened from TransportOrderForm's
 * "Select Products & Quantity" New button. */
export function TransportItemsForm({ items, alreadyPicked, onClose, onAdd }: Props) {
  const isMobile = useIsMobile();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");

  const pickedIds = new Set(alreadyPicked.map((p) => p.itemId));
  const options = items
    .filter((it) => !pickedIds.has(it.ITEM_ID))
    .map((it) => ({
      value: it.ITEM_ID,
      label: it.FG_ID ? `${it.PART_NAME} (${it.FG_ID})` : it.PART_NAME || it.ITEM_ID,
      subtitle: it.PART_NO,
    }));

  const selected = items.find((it) => it.ITEM_ID === itemId);
  const maxQty = selected ? Number(selected.QTY || 0) : undefined;
  const qtyError = selected && qty && maxQty && Number(qty) > maxQty ? `Can't exceed the order quantity (${maxQty}).` : "";

  function handleSelect(id: string) {
    setItemId(id);
    const item = items.find((it) => it.ITEM_ID === id);
    setQty(item?.QTY ? String(item.QTY) : "");
  }

  function handleSave() {
    if (!selected || !qty || Number(qty) <= 0 || qtyError) return;
    onAdd({ itemId: selected.ITEM_ID, partName: selected.PART_NAME, qty: Number(qty), unit: selected.UOM || "NOS" });
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
            <TextField
              label={`Quantity${maxQty ? ` (max ${maxQty} ${selected.UOM || ""})` : ""}`}
              required
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              error={qtyError || undefined}
            />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "14px var(--space) 28px" : "14px var(--space)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-page)" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!selected || !qty || Number(qty) <= 0 || !!qtyError}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
