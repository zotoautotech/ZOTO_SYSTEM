import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { SearchableSelect, type SelectOption } from "../components/form/SearchableSelect";
import { listTaxonomyRows, listBomLines, deleteBomLine, verifyBomLine, type BomLine } from "./lib/npdApi";
import { BomLineForm } from "./BomLineForm";

/** BOM Builder (build-prompt §5.3, §7 screen 6) — add/edit BOM lines against a FG SKU with a
 * live cost roll-up. `/npd/bom` shows an FG SKU picker; `/npd/bom/:fgId` shows that FG's lines.
 * "Verify" (build-prompt's QA sign-off) is folded into each line's own Status, not a separate
 * screen — see bom.ts's own doc comment for why. */
export function BomBuilder() {
  const navigate = useNavigate();
  const { fgId } = useParams<{ fgId?: string }>();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingLine, setEditingLine] = useState<BomLine | null>(null);
  const [actionError, setActionError] = useState("");

  const { data: fgRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sku"],
    queryFn: () => listTaxonomyRows("fg-sku"),
  });

  const fgOptions: SelectOption[] = fgRows.map((r) => ({
    value: r["FG ID"],
    label: r.Name || r["FG ID"],
    subtitle: [r.CATEGORY, r["SUB CATEGORY"]].filter(Boolean).join(" / "),
  }));

  const activeFg = fgRows.find((r) => r["FG ID"] === fgId);

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["npd", "bom", fgId],
    queryFn: () => listBomLines(fgId!),
    enabled: !!fgId,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["npd", "bom", fgId] });
    queryClient.invalidateQueries({ queryKey: ["npd", "taxonomy", "rows", "fg-sku"] });
  }

  async function handleDelete(line: BomLine) {
    if (!window.confirm(`Remove ${line["RM Code"] || line["RM ID"]} from this BOM?`)) return;
    setActionError("");
    try {
      await deleteBomLine(line["Unique ID"]);
      refresh();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not delete — please try again.");
    }
  }

  async function handleVerify(line: BomLine) {
    setActionError("");
    try {
      await verifyBomLine(line["Unique ID"]);
      refresh();
    } catch (err) {
      const detail = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setActionError(detail ?? "Could not verify — please try again.");
    }
  }

  const costOfGoods = lines.reduce((sum, l) => sum + (Number(l["Rate x Quantity Price"]) || 0), 0);

  const columns: Column<BomLine>[] = [
    { key: "rm", header: "RM Code", render: (l) => l["RM Code"] || l["RM ID"] },
    { key: "category", header: "Category / Sub Category", render: (l) => `${l.Category} / ${l["Sub Category"]}` },
    { key: "qty", header: "Qty", render: (l) => `${l.Quantity} ${l.Units}` },
    { key: "level", header: "Level", render: (l) => l.Levels || "—" },
    { key: "rate", header: "Rate", render: (l) => l.Rate || "0" },
    { key: "total", header: "Line Total", render: (l) => l["Rate x Quantity Price"] || "0" },
    { key: "status", header: "Status", render: (l) => l.Status },
    {
      key: "actions",
      header: "",
      render: (l) => (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setEditingLine(l)}>
            Edit
          </button>
          {l.Status !== "Verified" && (
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => handleVerify(l)}>
              Verify
            </button>
          )}
          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => handleDelete(l)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ maxWidth: 480, marginBottom: 20 }}>
        <SearchableSelect
          label="FG SKU"
          value={fgId ?? ""}
          onChange={(value) => navigate(`/npd/bom/${encodeURIComponent(value)}`)}
          options={fgOptions}
          placeholder="Search FG SKU…"
        />
      </div>

      {fgId && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{activeFg?.Name ?? fgId} — BOM</h2>
              <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Cost of Goods: <strong>{costOfGoods.toFixed(2)}</strong>
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              + Add BOM Line
            </button>
          </div>
          {actionError && <p style={{ color: "var(--color-error)", fontSize: 13, marginBottom: 8 }}>{actionError}</p>}
          <DataTable
            columns={columns}
            rows={lines}
            getRowKey={(l) => l["Unique ID"]}
            emptyMessage={isLoading ? "Loading…" : "No BOM lines yet."}
          />
        </>
      )}

      {fgId && adding && (
        <BomLineForm
          fgId={fgId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {fgId && editingLine && (
        <BomLineForm
          fgId={fgId}
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSaved={() => {
            setEditingLine(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
