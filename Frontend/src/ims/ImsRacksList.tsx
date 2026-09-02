import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { FormModal } from "../components/form/FormModal";
import { listRacks, createRack, type SheetRow } from "./lib/imsApi";

const COLUMNS = ["Rack ID", "Rack No.", "Floor", "Unit", "Type", "Status"];

export function ImsRacksList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ Type: "Rack" });

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["ims", "racks"], queryFn: listRacks });
  const columns: Column<SheetRow>[] = COLUMNS.map((c) => ({ key: c, header: c, render: (r) => r[c] ?? "" }));

  async function handleCreate() {
    await createRack(form);
    setForm({ Type: "Rack" });
    setShowCreate(false);
    queryClient.invalidateQueries({ queryKey: ["ims", "racks"] });
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>IMS Racks</h1>
        <button onClick={() => setShowCreate(true)}>+ Add Rack</button>
      </div>
      {isLoading ? <div>Loading…</div> : <DataTable columns={columns} rows={rows} emptyMessage="No racks yet." />}

      {showCreate && (
        <FormModal title="Add Rack" onClose={() => setShowCreate(false)} size="small">
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>Rack No.</span>
              <input value={form["Rack No."] ?? ""} onChange={(e) => setForm((f) => ({ ...f, "Rack No.": e.target.value }))} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>Floor</span>
              <input value={form.Floor ?? ""} onChange={(e) => setForm((f) => ({ ...f, Floor: e.target.value }))} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>Unit</span>
              <input value={form.Unit ?? ""} onChange={(e) => setForm((f) => ({ ...f, Unit: e.target.value }))} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>Type</span>
              <select value={form.Type ?? "Rack"} onChange={(e) => setForm((f) => ({ ...f, Type: e.target.value }))}>
                <option value="Rack">Rack</option>
                <option value="Ground">Ground</option>
                <option value="Ground Lane">Ground Lane</option>
              </select>
            </label>
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
