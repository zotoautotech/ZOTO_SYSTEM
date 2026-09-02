import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { FormModal } from "../components/form/FormModal";
import { listStockRecords, createStockRecord, type ImsProductType, type SheetRow } from "./lib/imsApi";

const PART_FIELD: Record<ImsProductType, string> = { fg: "Old Part No", rm: "Old Part Code", wip: "Old Part Code", other: "Old Part Code" };

const FIELDS_BY_TYPE: Record<ImsProductType, string[]> = {
  fg: ["type", "from", "to", "quantity", "unit", "description", "signatureUrl", "oldPartNo", "partNo", "segment", "category", "subCategory"],
  rm: ["type", "from", "entryType", "to", "quantity", "unit", "description", "signatureUrl", "oldPartCode", "partCode", "partName", "category"],
  wip: ["type", "from", "to", "entryType", "quantity", "unit", "weightGrams", "description", "signatureUrl", "batchCode", "oldPartCode", "partCode", "category", "subCategory", "paint"],
  other: ["type", "from", "entryType", "to", "quantity", "unit", "description", "signatureUrl", "oldPartCode", "partCode", "partName", "category"],
};

const COLUMNS_BY_TYPE: Record<ImsProductType, string[]> = {
  fg: ["Record ID", "Type", "From", "To", "Quantity", "Old Part No", "Part No"],
  rm: ["Record ID", "Type", "From", "To", "Quantity", "Old Part Code", "Part Name"],
  wip: ["Record ID", "Type", "From", "To", "Quantity", "Batch Code", "Old Part Code"],
  other: ["Record ID", "Type", "From", "To", "Quantity", "Old Part Code", "Part Name"],
};

const LABELS: Record<string, string> = {
  type: "Type (IN/OUT/TRANSFER)", from: "From (rack)", to: "To (rack)", entryType: "Entry Type", quantity: "Quantity",
  unit: "Unit", description: "Description", signatureUrl: "Signature (upload URL)", oldPartNo: "Old Part No",
  oldPartCode: "Old Part Code", partNo: "Part No", partCode: "Part Code", partName: "Part Name", segment: "Segment",
  category: "Category", subCategory: "Sub Category", batchCode: "Batch Code", weightGrams: "WIP Part Weight (grams)", paint: "Paint",
};

/** IMS Record Entry — one page per product type (:type route param — fg/rm/wip/other), each
 * with its own field set + balance rule, per docs/work/ims-sheet-header-spec.md. Deliberately
 * NOT one shared form with four branches hidden inside — the field sets differ enough
 * (entryType exists on rm/wip/other but not fg; wip alone has weight fields) that a config
 * table (above) plus one render path is clearer than forcing every field into one component. */
export function ImsStockRecordEntry() {
  const { type = "fg" } = useParams<{ type: ImsProductType }>();
  const productType = type as ImsProductType;
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ type: "IN" });
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ims", "stock", productType, "records"],
    queryFn: () => listStockRecords(productType),
  });

  const columns: Column<SheetRow>[] = COLUMNS_BY_TYPE[productType].map((c) => ({ key: c, header: c, render: (r) => r[c] ?? "" }));

  async function handleCreate() {
    setError(null);
    try {
      await createStockRecord(productType, form);
      setForm({ type: "IN" });
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["ims", "stock", productType, "records"] });
    } catch (err) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Save failed";
      setError(message);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Stock — {productType.toUpperCase()} Record Entry</h1>
        <button onClick={() => setShowCreate(true)}>+ New Entry</button>
      </div>
      {isLoading ? <div>Loading…</div> : <DataTable columns={columns} rows={rows} emptyMessage="No records yet." />}

      {showCreate && (
        <FormModal title={`${productType.toUpperCase()} Record Entry`} onClose={() => setShowCreate(false)} size="standard">
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
            {error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}
            {FIELDS_BY_TYPE[productType].map((field) => (
              <label key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12 }}>{LABELS[field] ?? field}</span>
                {field === "type" ? (
                  <select value={form.type ?? "IN"} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="IN">IN</option>
                    <option value="OUT">OUT</option>
                    <option value="TRANSFER">TRANSFER</option>
                  </select>
                ) : (
                  <input value={form[field] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
                )}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 16 }}>
            <button onClick={() => setShowCreate(false)}>Cancel</button>
            <button onClick={handleCreate}>Save</button>
          </div>
        </FormModal>
      )}
    </div>
  );
}

void PART_FIELD; // kept for a future balance-preview feature (show live balance as the doer types Old Part No/Code)
