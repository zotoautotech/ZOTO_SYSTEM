import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { DataTable, type Column } from "../components/DataTable";
import { useIsMobile } from "../lib/responsive";
import { useSearch } from "../lib/search";
import {
  listTaxonomyTables,
  listTaxonomyRows,
  deleteTaxonomyRow,
  type TaxonomyTableMeta,
} from "./lib/npdApi";
import { TaxonomyRowForm } from "./TaxonomyRowForm";

/**
 * NPD Admin: Categories & Taxonomy (build-prompt §7, screen 13) — one generic page for every
 * reference table AND, since Sprint 2, the FG/RM SKU catalogs themselves (same generic CRUD
 * infra, just with `allowCreate: false` — see taxonomy.ts). Field/label metadata comes from
 * the backend, so this component never hardcodes a table's real sheet-header field names.
 * Left rail picks the table (mirrors CustomerFilterPanel's role elsewhere in this app, but
 * picking a *table* rather than filtering rows); right side is a plain DataTable + inline
 * create/edit form, matching PermissionAudit.tsx's simple-admin-page pattern. The header
 * search box filters the active table's rows client-side (useSearch, cleared on route change
 * by Layout.tsx) — the FG SKU catalog alone is ~80 rows, too many to eyeball unfiltered.
 */
export function TaxonomyAdmin() {
  const navigate = useNavigate();
  const { key: activeKey } = useParams<{ key?: string }>();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [editingRow, setEditingRow] = useState<Record<string, string> | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const { data: tables = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "tables"],
    queryFn: listTaxonomyTables,
  });

  const active: TaxonomyTableMeta | undefined =
    tables.find((t) => t.key === activeKey) ?? tables[0];

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", active?.key],
    queryFn: () => listTaxonomyRows(active!.key),
    enabled: !!active,
  });

  const { query } = useSearch();
  const rows = query.trim()
    ? allRows.filter((row) =>
        Object.values(row).some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
      )
    : allRows;

  function selectTable(key: string) {
    setEditingRow(null);
    setCreating(false);
    setDeleteError("");
    navigate(`/npd/taxonomy/${encodeURIComponent(key)}`);
  }

  function refreshRows() {
    queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", active?.key] });
  }

  async function handleDelete(row: Record<string, string>) {
    if (!active) return;
    const id = row[active.idColumn];
    if (!id) return;
    if (!window.confirm(`Delete this ${active.label} row?`)) return;
    setDeleteError("");
    try {
      await deleteTaxonomyRow(active.key, id);
      refreshRows();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setDeleteError(detail ?? "Could not delete — please try again.");
    }
  }

  const columns: Column<Record<string, string>>[] =
    active?.fields.map((f) => ({ key: f, header: f, render: (row) => row[f] || "—" })) ?? [];
  columns.push({
    key: "__actions",
    header: "",
    render: (row) => (
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setEditingRow(row)}>
          Edit
        </button>
        <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => handleDelete(row)}>
          Delete
        </button>
      </div>
    ),
  });

  return (
    <div style={{ display: "flex", gap: 20, flexDirection: isMobile ? "column" : "row", marginTop: 16 }}>
      <div style={{ width: isMobile ? "100%" : 220, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            gap: 6,
            overflowX: isMobile ? "auto" : "visible",
          }}
        >
          {tables.map((t) => (
            <button
              key={t.key}
              className="btn"
              onClick={() => selectTable(t.key)}
              style={{
                textAlign: "left",
                whiteSpace: "nowrap",
                background: t.key === active?.key ? "var(--color-primary)" : undefined,
                color: t.key === active?.key ? "#fff" : undefined,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {active && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{active.label}</h2>
              {active.allowCreate && (
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  + Add {active.label}
                </button>
              )}
            </div>
            {!active.allowCreate && (
              <p className="text-muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
                New rows here are published through their own approval workflow elsewhere in
                NPD (New Part Code Request for the SKU catalogs, Customer KYC for the Customer
                Master) — you can still edit existing rows.
              </p>
            )}
            {deleteError && <p style={{ color: "var(--color-error)", fontSize: 13, marginBottom: 8 }}>{deleteError}</p>}
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(row) => row[active.idColumn] ?? JSON.stringify(row)}
              emptyMessage={isLoading ? "Loading…" : `No ${active.label} rows yet.`}
            />
          </>
        )}
      </div>

      {active && creating && (
        <TaxonomyRowForm
          table={active}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refreshRows();
          }}
        />
      )}
      {active && editingRow && (
        <TaxonomyRowForm
          table={active}
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            refreshRows();
          }}
        />
      )}
    </div>
  );
}
