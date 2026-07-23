import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "../../components/form/TextField";
import { SearchableSelect } from "../../components/form/SearchableSelect";
import { QuantityStepper } from "../../components/form/QuantityStepper";
import { listGoods, listDropdowns, dropdownValues, goodsToOptions } from "../../lib/mastersApi";
import { UOM_OPTIONS } from "../../lib/modules";
import { emptyItem, type ItemFormState, type OrderFormState } from "../order-punch/form/types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
  invoiceDiscountRs: string;
  onInvoiceDiscountChange: (value: string) => void;
}

/** "GST Details" tab for SO Confirmation's Changes flow — same items-editing pattern as the
 * punch form's Tab2OrderDetails (search part, qty, UOM, price, GST slab), operating on the
 * order's actual current items so a reviewer can correct them before the order proceeds. */
export function ConfirmationItemsTab({ form, update, invoiceDiscountRs, onInvoiceDiscountChange }: Props) {
  function updateItem(index: number, patch: Partial<ItemFormState>) {
    const items = form.items.slice();
    items[index] = { ...items[index], ...patch };
    update({ items });
  }

  function addItem() {
    update({ items: [...form.items, emptyItem()] });
  }

  function removeItem(index: number) {
    update({ items: form.items.filter((_, i) => i !== index) });
  }

  const basicAmount = form.items.reduce((sum, it) => sum + (it.price ?? 0) * (it.qty ?? 0), 0);
  const taxAmount = form.items.reduce((sum, it) => sum + ((it.price ?? 0) * (it.qty ?? 0) * (it.gstSlabPct ?? 0)) / 100, 0);
  const discount = Number(invoiceDiscountRs || 0);

  return (
    <div>
      <label style={{ display: "block", fontSize: 14, marginBottom: 12 }}>
        SO Confirmation Parts <span style={{ color: "var(--color-error)" }}>*</span>
      </label>
      {form.items.map((item, i) => (
        <ConfirmationItemBlock
          key={i}
          item={item}
          onChange={(patch) => updateItem(i, patch)}
          onRemove={form.items.length > 1 ? () => removeItem(i) : undefined}
        />
      ))}
      <button type="button" className="btn btn-outline-primary" onClick={addItem} style={{ marginBottom: 26 }}>
        + Add another item
      </button>

      <TextField
        label="Invoice Discount (Rs)"
        type="number"
        value={invoiceDiscountRs}
        onChange={(e) => onInvoiceDiscountChange(e.target.value)}
      />
      <TextField label="Basic Amount" disabled value={`₹ ${basicAmount.toFixed(2)}`} />
      <TextField label="Tax Amount" disabled value={`₹ ${taxAmount.toFixed(2)}`} />
      <TextField label="Total Amount" disabled value={`₹ ${(basicAmount + taxAmount - discount).toFixed(2)}`} />
    </div>
  );
}

function ConfirmationItemBlock({
  item,
  onChange,
  onRemove,
}: {
  item: ItemFormState;
  onChange: (patch: Partial<ItemFormState>) => void;
  onRemove?: () => void;
}) {
  const { data: goods = [] } = useQuery({ queryKey: ["masters", "goods"], queryFn: listGoods, staleTime: 60_000 });
  const goodsOptions = goodsToOptions(goods);
  const { data: dropdowns = [] } = useQuery({ queryKey: ["masters", "dropdowns"], queryFn: listDropdowns });
  const uomOptions = dropdownValues(dropdowns, "UOM");
  const uomList = uomOptions.length > 0 ? uomOptions : UOM_OPTIONS;

  useEffect(() => {
    if (uomList.length === 0 || uomList.includes(item.uom)) return;
    onChange({ uom: uomList.includes("SET") ? "SET" : uomList[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uomList.join("|")]);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, position: "relative" }}>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{ position: "absolute", top: 12, right: 12, border: "none", background: "none", cursor: "pointer" }}
        >
          ✕
        </button>
      )}
      <SearchableSelect
        label="Sale Item ID"
        value={item.fgId}
        onChange={(_v, option) =>
          onChange({ fgId: option?.value ?? "", partName: option?.label ?? "", partNo: option?.subtitle ?? "" })
        }
        options={goodsOptions}
        placeholder="Search part…"
      />
      {item.fgId && (
        <>
          <TextField label="Part Code" value={item.partNo} disabled />
          <TextField label="Part Name" value={item.partName} disabled />
        </>
      )}

      <TextField label="Price" required type="number" value={item.price ?? ""} onChange={(e) => onChange({ price: Number(e.target.value) })} />
      <QuantityStepper label="Quantity" value={item.qty} onChange={(v) => onChange({ qty: v })} />

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
          Unit <span style={{ color: "var(--color-error)" }}>*</span>
        </label>
        <select
          value={item.uom}
          onChange={(e) => onChange({ uom: e.target.value })}
          style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius)", border: "1px solid var(--color-border)", fontSize: 14 }}
        >
          {uomList.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <TextField
        label="GST Slab (%)"
        required
        type="number"
        value={item.gstSlabPct ?? ""}
        onChange={(e) => onChange({ gstSlabPct: Number(e.target.value) })}
      />
      <TextField label="Basic Amount" disabled value={`₹ ${((item.price ?? 0) * (item.qty ?? 0)).toFixed(2)}`} />
      <TextField label="Remarks" value={item.remarks} onChange={(e) => onChange({ remarks: e.target.value })} />
    </div>
  );
}
