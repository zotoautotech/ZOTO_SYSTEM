import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { FormModal } from "../components/form/FormModal";
import {
  listFgMasters,
  createFgMaster,
  listRmMasters,
  createRmMaster,
  listOtherMasters,
  createOtherMaster,
  listWipMasters,
  createWipMaster,
  listImsCustomers,
  createImsCustomer,
  type SheetRow,
} from "./lib/imsApi";

type MasterType = "fg" | "rm" | "other" | "wip" | "customers";

const TABS: { key: MasterType; label: string }[] = [
  { key: "fg", label: "FG" },
  { key: "rm", label: "RM" },
  { key: "other", label: "Other" },
  { key: "wip", label: "WIP" },
  { key: "customers", label: "Customer" },
];

const CONFIG: Record<MasterType, { list: () => Promise<SheetRow[]>; create: (b: Record<string, string>) => Promise<unknown>; columns: string[]; keyField: string }> = {
  fg: { list: listFgMasters, create: createFgMaster, columns: ["FG ID", "PART NO.", "Part Name", "SEGMENT", "Category"], keyField: "FG ID" },
  rm: { list: listRmMasters, create: createRmMaster, columns: ["Part Code", "Old Part Code", "Part Name", "Category", "Sub Category"], keyField: "Part Code" },
  other: { list: listOtherMasters, create: createOtherMaster, columns: ["Part Code", "Old Part Code", "Part Name", "Category", "Unit"], keyField: "Part Code" },
  wip: { list: listWipMasters, create: createWipMaster, columns: ["ID'S", "PART NO.", "Category", "Machined Or Casted", "MAKE BY"], keyField: "ID'S" },
  customers: { list: listImsCustomers, create: createImsCustomer, columns: ["Customer ID", "Customer Code", "Customer Name", "Business Segment", "KYC Status"], keyField: "Customer ID" },
};

/** IMS Masters — FG/RM/WIP/Customer/Other catalogues, one page with a tab strip switching
 * product type (route param drives the active tab so a direct link to /ims/masters/rm works). */
export function ImsMastersList() {
  const { type = "fg" } = useParams<{ type: MasterType }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const config = CONFIG[type as MasterType] ?? CONFIG.fg;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ims", "masters", type],
    queryFn: config.list,
  });

  const columns: Column<SheetRow>[] = config.columns.map((c) => ({ key: c, header: c, render: (r) => r[c] ?? "" }));

  async function handleCreate() {
    await config.create(form);
    setForm({});
    setShowCreate(false);
    queryClient.invalidateQueries({ queryKey: ["ims", "masters", type] });
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>IMS Masters</h1>
        <button onClick={() => setShowCreate(true)}>+ Add</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(`/ims/masters/${t.key}`)}
            style={{ fontWeight: type === t.key ? 700 : 400, padding: "4px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isLoading ? <div>Loading…</div> : <DataTable columns={columns} rows={rows} emptyMessage="No records yet." />}

      {showCreate && (
        <FormModal title={`Add ${TABS.find((t) => t.key === type)?.label ?? ""} Master`} onClose={() => setShowCreate(false)} size="standard">
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
            {config.columns
              .filter((c) => c !== config.keyField)
              .map((field) => (
                <label key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12 }}>{field}</span>
                  <input value={form[field] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
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
