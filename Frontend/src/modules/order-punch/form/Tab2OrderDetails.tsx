import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import { PercentInput } from "../../../components/form/PercentInput";
import { TextField } from "../../../components/form/TextField";
import { SearchableSelect } from "../../../components/form/SearchableSelect";
import { QuantityStepper } from "../../../components/form/QuantityStepper";
import {
  listCustomers,
  listGoods,
  listBillingStrategies,
  listDropdowns,
  getCustomerDetail,
  dropdownValues,
  customersToOptions,
  goodsToOptions,
} from "../../../lib/mastersApi";
import { UOM_OPTIONS } from "../../../lib/modules";
import { AddNewCustomerModal } from "./AddNewCustomerModal";
import { AddNewPartModal } from "./AddNewPartModal";
import { emptyItem, type ItemFormState, type OrderFormState } from "./types";

interface Props {
  form: OrderFormState;
  update: (patch: Partial<OrderFormState>) => void;
}

export function Tab2OrderDetails({ form, update }: Props) {
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["masters", "customers"],
    queryFn: listCustomers,
  });
  const customerOptions = customersToOptions(customers);

  async function selectExistingCustomer(custId: string, customerName: string) {
    const selectedCustomer = customers.find((customer) => customer["CUST ID"] === custId);
    update({
      custId,
      customerName,
      billingAddress: selectedCustomer?.["BILLING ADDRESS"] || "",
      billingState: selectedCustomer?.["Billing STATE"] || "",
      billingPincode: selectedCustomer?.["Billing PIN CODE"] || "",
      billingCountry: selectedCustomer?.["Billing Contry"] || "India",
    });
    if (!custId) return;
    try {
      const detail = await getCustomerDetail(custId);
      const billing = detail.addresses.find((address) => address["Address Type"] === "Billing") ?? detail.addresses[0];
      if (!billing) return;
      update({
        custId,
        customerName,
        billingAddress: billing["Full Address"] || billing["Address Line 1"] || "",
        billingState: billing.State || "",
        billingPincode: billing["Pin Code"] || "",
        billingCountry: billing.Country || "India",
      });
    } catch {
      // Step 3 retains its existing retry/fallback lookup if the first request is unavailable.
    }
  }

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

  return (
    <div>
      <ToggleGroup
        label="Order Type"
        value={form.orderType}
        onChange={(v) => update({ orderType: v })}
        options={[
          { value: "Order Incoming", label: "Order Incoming" },
          { value: "Order Outgoing", label: "Order Outgoing" },
        ]}
      />
      <ToggleGroup
        label="Payment Type"
        value={form.paymentType}
        onChange={(v) => update({ paymentType: v })}
        options={[
          { value: "Credit", label: "Credit" },
          { value: "Advance", label: "Advance" },
        ]}
      />
      {form.paymentType === "Advance" && (
        <PercentInput
          label="Advance Payment (%)"
          value={form.advancePct}
          onChange={(v) => update({ advancePct: v })}
        />
      )}

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Buyer Details</h3>
      <ToggleGroup
        label="Customer Type"
        value={form.customerType}
        onChange={(v) => update({ customerType: v, custId: "", customerName: "", buyerGstin: "" })}
        options={[
          { value: "Existing", label: "Existing" },
          { value: "New", label: "New" },
        ]}
      />
      {form.customerType === "Existing" && (
        <SearchableSelect
          label="Customer ID"
          value={form.custId}
          onChange={(_v, option) => selectExistingCustomer(option?.value ?? "", option?.label ?? "")}
          options={customerOptions}
          loading={customersLoading}
          placeholder="Search customer…"
        />
      )}
      {form.customerType === "New" && (
        <div style={{ marginBottom: 20 }}>
          {form.custId ? (
            <p style={{ fontSize: 14 }}>
              ✅ New customer <strong>{form.customerName}</strong> ({form.custId}) will be created
            </p>
          ) : (
            <button type="button" className="btn btn-outline-primary" onClick={() => setShowAddCustomer(true)}>
              + Add New Customer
            </button>
          )}
        </div>
      )}
      {showAddCustomer && (
        <AddNewCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onCreated={(result) => {
            update({
              custId: result.custId,
              customerName: result.customerName,
              billingAddress: result.billingAddressLine1,
              billingState: result.billingState,
              billingPincode: result.billingPincode,
              billingCountry: result.billingCountry,
            });
            setShowAddCustomer(false);
          }}
        />
      )}

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Items</h3>
      {form.items.map((item, i) => (
        <ItemBlock
          key={i}
          item={item}
          custId={form.custId}
          onChange={(patch) => updateItem(i, patch)}
          onRemove={form.items.length > 1 ? () => removeItem(i) : undefined}
        />
      ))}
      <button type="button" className="btn btn-outline-primary" onClick={addItem}>
        + Add another item
      </button>
    </div>
  );
}

function ItemBlock({
  item,
  custId,
  onChange,
  onRemove,
}: {
  item: ItemFormState;
  custId: string;
  onChange: (patch: Partial<ItemFormState>) => void;
  onRemove?: () => void;
}) {
  const [showAddPart, setShowAddPart] = useState(false);
  const { data: goods = [] } = useQuery({ queryKey: ["masters", "goods"], queryFn: listGoods });
  const goodsOptions = goodsToOptions(goods);
  const { data: billingStrategies = [] } = useQuery({
    queryKey: ["masters", "billing-strategies"],
    queryFn: listBillingStrategies,
  });
  const { data: dropdowns = [] } = useQuery({ queryKey: ["masters", "dropdowns"], queryFn: listDropdowns });
  const uomOptions = dropdownValues(dropdowns, "UOM");
  const uomList = uomOptions.length > 0 ? uomOptions : UOM_OPTIONS;

  useEffect(() => {
    if (!custId || !item.partName) return;
    const match = billingStrategies.find(
      (s) =>
        s["CUST ID"] === custId &&
        (s["Part Code"] && item.partNo ? s["Part Code"] === item.partNo : s["Part Name"] === item.partName) &&
        s["Default Rate T1"]
    );
    if (match) {
      onChange({ price: Number(match["Default Rate T1"]) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custId, item.fgId, item.partName, billingStrategies]);

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
      <ToggleGroup
        label="Part Type"
        value={item.partType}
        onChange={(v) => onChange({ partType: v, fgId: "", partName: "" })}
        options={[
          { value: "Existing", label: "Existing" },
          { value: "New", label: "New" },
        ]}
      />
      {item.partType === "Existing" && !item.fgId && (
        <SearchableSelect
          label="Part (ID)"
          value={item.fgId}
          onChange={(_v, option) =>
            onChange({ fgId: option?.value ?? "", partName: option?.label ?? "", partNo: option?.subtitle ?? "" })
          }
          options={goodsOptions}
          placeholder="Search part…"
          addNewLabel="Add New Product"
          onAddNew={() => setShowAddPart(true)}
        />
      )}
      {item.partType === "Existing" && item.fgId && (
        <>
          <TextField label="Part Code" value={item.partNo} disabled />
          <TextField label="Part Name" value={item.partName} disabled />
        </>
      )}
      {item.partType === "New" && !item.fgId && (
        <button type="button" className="btn btn-outline-primary" onClick={() => setShowAddPart(true)}>
          + Add New Product
        </button>
      )}
      {item.partType === "New" && item.fgId && (
        <p style={{ fontSize: 14 }}>
          ✅ New part <strong>{item.partName}</strong> will be created
        </p>
      )}
      {showAddPart && (
        <AddNewPartModal
          onClose={() => setShowAddPart(false)}
          onCreated={(result) => {
            onChange({
              fgId: result.fgId,
              partName: result.partName,
              partNo: result.partNo ?? "",
              segment: result.segment ?? "",
              category: result.category ?? "",
              price: result.price ?? item.price,
            });
            setShowAddPart(false);
          }}
        />
      )}

      <QuantityStepper label="Quantity" value={item.qty} onChange={(v) => onChange({ qty: v })} />

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>
          UOM
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

      <TextField label="Price" type="number" value={item.price ?? ""} onChange={(e) => onChange({ price: Number(e.target.value) })} />
      <TextField label="Remarks" value={item.remarks} onChange={(e) => onChange({ remarks: e.target.value })} />
    </div>
  );
}
