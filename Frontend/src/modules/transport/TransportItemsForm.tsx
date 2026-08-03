import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { TextField } from "../../components/form/TextField";
import { FormModal } from "../../components/form/FormModal";
import { listPdiItems, type OrderItemRecord } from "../../lib/ordersApi";

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
  const [itemId, setItemId] = useState("");
  const [loadQty, setLoadQty] = useState("");
  const [loadBoxes, setLoadBoxes] = useState("");

  // PDI already records a Box Quantity per item — auto-fill Load Boxes from it below so the
  // doer doesn't have to retype the same number arranging the vehicle (still editable, in
  // case the actual load ends up split differently).
  const { data: completedPdiItems = [] } = useQuery({
    queryKey: ["pdiItems", "COMPLETED"],
    queryFn: () => listPdiItems("COMPLETED"),
  });

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
    const pdi = completedPdiItems.find((r) => r.ITEM_ID === id);
    setLoadBoxes(pdi?.BOX_QUANTITY || "");
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
    <FormModal title="Transport Items Form" onClose={onClose} size="standard" zIndex={60} sectionLabel="Load Limit Details">
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
