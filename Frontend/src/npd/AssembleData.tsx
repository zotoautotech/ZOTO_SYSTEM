import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { listTaxonomyRows, type TaxonomyRow } from "./lib/npdApi";

/** "ASSEMBLE DATA" — matches the AppSheet reference's own flat table view: every
 * `assemble-rm-fg` row across every FG SKU (not scoped to one FG SKU, unlike
 * `AssembleRmFgForm.tsx`'s own bulk picker or `FgSkuDetail.tsx`'s own per-SKU BOM Items card).
 * Reuses the same `assemble-rm-fg` taxonomy table/`ASSEMBLE RM FG` tab those write to — this
 * is a pure read-only browse/search view over that same live data, matching `RmSearch.tsx`/
 * `FgSearch.tsx`'s own "search box + DataTable" shape. No "+ Add" icon (no create-a-line-
 * from-here feature exists in this app; a doer adds BOM lines via "Give Assemble RM FG Form"
 * on the relevant FG SKU's own detail page, same as everywhere else in this app) — but a real
 * **CSV export button** was added per explicit instruction, matching the reference's own CSV
 * icon: exports exactly the currently-filtered/visible rows (client-side `Blob` download, no
 * new backend route needed for this). Columns match the reference field-for-field (Sr. No./
 * FG CODE/FG ID/FG CATEGORY/FG SUB CATEGORY/RM ID/RM CODE/Sub Category/Category/No. Of Qty
 * Use) minus "Weight 1 Pcs Gm", which has no live column on this tab (confirmed — not
 * fabricated). */
export function AssembleData() {
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "assemble-rm-fg"],
    queryFn: () => listTaxonomyRows("assemble-rm-fg"),
  });

  // Sr. No. is a stable index baked into each row up front (DataTable's own `render` only
  // receives the row, not a position) rather than an extra column-render signature just for
  // this one field.
  const filtered = rows
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        (r["FG CODE"] ?? "").toLowerCase().includes(q) ||
        (r["FG ID"] ?? "").toLowerCase().includes(q) ||
        (r["RM ID"] ?? "").toLowerCase().includes(q) ||
        (r["RM CODE"] ?? "").toLowerCase().includes(q) ||
        (r.Category ?? "").toLowerCase().includes(q) ||
        (r["Sub Category"] ?? "").toLowerCase().includes(q)
      );
    })
    .map((r, i) => ({ ...r, __sr: String(i + 1) }));

  // CSV_COLUMNS mirrors the visible table columns exactly (same order/labels) so the export
  // matches what a doer is actually looking at, including the current search filter.
  const CSV_COLUMNS: { header: string; get: (r: TaxonomyRow) => string }[] = [
    { header: "Sr. No.", get: (r) => r.__sr ?? "" },
    { header: "FG CODE", get: (r) => r["FG CODE"] ?? "" },
    { header: "FG ID", get: (r) => r["FG ID"] ?? "" },
    { header: "FG CATEGORY", get: (r) => r["FG CATEGORY"] ?? "" },
    { header: "FG SUB CATEGORY", get: (r) => r["FG SUB CATEGORY"] ?? "" },
    { header: "RM ID", get: (r) => r["RM ID"] ?? "" },
    { header: "RM CODE", get: (r) => r["RM CODE"] ?? "" },
    { header: "Sub Category", get: (r) => r["Sub Category"] ?? "" },
    { header: "Category", get: (r) => r.Category ?? "" },
    { header: "No. Of Qty Use", get: (r) => r["No. Of Qty Use"] ?? "" },
  ];

  function escapeCsvCell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }

  function downloadCsv() {
    const lines = [
      CSV_COLUMNS.map((c) => escapeCsvCell(c.header)).join(","),
      ...filtered.map((r) => CSV_COLUMNS.map((c) => escapeCsvCell(c.get(r))).join(",")),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assemble-data.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const columns: Column<TaxonomyRow>[] = [
    { key: "sr", header: "Sr. No.", render: (r) => r.__sr },
    { key: "fgCode", header: "FG CODE", render: (r) => r["FG CODE"] || "—" },
    { key: "fgId", header: "FG ID", render: (r) => r["FG ID"] || "—" },
    { key: "fgCategory", header: "FG CATEGORY", render: (r) => r["FG CATEGORY"] || "—" },
    { key: "fgSubCategory", header: "FG SUB CATEGORY", render: (r) => r["FG SUB CATEGORY"] || "—" },
    { key: "rmId", header: "RM ID", render: (r) => r["RM ID"] || "—" },
    { key: "rmCode", header: "RM CODE", render: (r) => r["RM CODE"] || "—" },
    { key: "subCategory", header: "Sub Category", render: (r) => r["Sub Category"] || "—" },
    { key: "category", header: "Category", render: (r) => r.Category || "—" },
    { key: "qty", header: "No. Of Qty Use", render: (r) => r["No. Of Qty Use"] || "—" },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ASSEMBLE DATA</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search FG/RM code, category…"
              style={{
                width: 280,
                height: 38,
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                padding: "8px 12px",
                fontSize: 14,
                boxSizing: "border-box",
                background: "var(--color-bg)",
                color: "var(--color-text)",
              }}
            />
            {/* Matches the reference's own CSV icon button — exports exactly what's currently
                filtered/visible below. */}
            <button
              type="button"
              onClick={downloadCsv}
              disabled={filtered.length === 0}
              title="Export CSV"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 38,
                padding: "0 14px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                background: "var(--color-bg)",
                color: "var(--color-text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: filtered.length === 0 ? "default" : "pointer",
                opacity: filtered.length === 0 ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M9 15h1" />
                <path d="M13 15h2" />
              </svg>
              CSV
            </button>
          </div>
        </div>
        {isLoading ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <DataTable columns={columns} rows={filtered} emptyMessage="No BOM lines found." />
        )}
      </div>
    </div>
  );
}
