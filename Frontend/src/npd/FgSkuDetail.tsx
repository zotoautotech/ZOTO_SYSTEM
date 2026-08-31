import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listTaxonomyRows } from "./lib/npdApi";

/** FG SKU detail — field layout matches the real legacy reference screen's core fields.
 * The reference's "Drawing Videos"/"Fitment Details" panels and icon actions (Update All
 * Vendor PDFs / Machining & Other Charges / Verify BOM Item) are NOT built — those need file-
 * upload, a Customer-Wise-Fitment table, and a verification workflow this app doesn't have
 * yet. Flagged, not silently omitted. `COST OF GOODS` is the one live figure this app already
 * computes for real, via BOM Builder's roll-up — shown here. */
export function FgSkuDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sku"],
    queryFn: () => listTaxonomyRows("fg-sku"),
  });

  const row = rows.find((r) => r["FG ID"] === id);

  if (isLoading) return <p className="text-muted" style={{ marginTop: 16 }}>Loading…</p>;
  if (!row) return <p className="text-muted" style={{ marginTop: 16 }}>FG SKU not found.</p>;

  const fields: [string, string][] = [
    ["FG ID", row["FG ID"]],
    ["TIMESTAMP", row.TIMESTAMP ? new Date(row.TIMESTAMP).toLocaleString() : "—"],
    ["USEREMAIL", row.USEREMAIL],
    ["PART NO.", row["PART NO."] || "—"],
    ["Name", row.Name || "—"],
    ["SEGMENT", row.SEGMENT || "—"],
    ["CATEGORY", row.CATEGORY || "—"],
    ["SUB CATEGORY", row["SUB CATEGORY"] || "—"],
    ["STANDARD PART", row["STANDARD PART"] || "—"],
    ["UNIT", row.UNIT || "—"],
    ["MIN STOCK", row["MIN STOCK"] || "—"],
    ["MAX STOCK", row["MAX STOCK"] || "—"],
    ["OPENING STOCK", row["OPENING STOCK"] || "—"],
    ["price", row.price || "—"],
    ["COST OF GOODS", row["COST OF GOODS"] ? `₹${row["COST OF GOODS"]}` : "—"],
  ];

  return (
    <div style={{ marginTop: 16, maxWidth: 520 }}>
      <button className="btn" onClick={() => navigate("/npd/fg-sku")} style={{ marginBottom: 16 }}>
        ← Back to FG SKU Catalog
      </button>
      <div className="card" style={{ padding: 20 }}>
        {fields.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)", fontSize: 14 }}>
            <span className="text-muted">{label}</span>
            <span style={{ fontWeight: 500, textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => navigate(`/npd/bom/${encodeURIComponent(id!)}`)}>
          View BOM →
        </button>
      </div>
    </div>
  );
}
