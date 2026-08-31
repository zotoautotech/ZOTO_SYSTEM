import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listTaxonomyRows } from "./lib/npdApi";

/** RM SKU detail — field layout matches the real legacy reference screen (ID'S/TIMESTAMP/
 * USEREMAIL/PART NO./Category/Sub Category/Paint/MAKE BY/VENDOR NAME/IQC PDF UPDATE LAST).
 * The reference's right-side category-specific dimension panel (e.g. "Bearing Dimensions") and
 * left icon actions (Upload Images & Drawings / UPDATE IQC PDF / Verified RM item) are NOT
 * built — those need ~26 category-specific dimension tables (one per RM category, see NPD/
 * CONTEXT.md's Sprint 6 note on the 6 FG-side spec tables being a much smaller version of the
 * same idea) and file-upload/verification workflows this app doesn't have yet. Flagged here,
 * not silently omitted — ask before building either. */
export function RmSkuDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const row = rows.find((r) => r["ID'S"] === id);

  if (isLoading) return <p className="text-muted" style={{ marginTop: 16 }}>Loading…</p>;
  if (!row) return <p className="text-muted" style={{ marginTop: 16 }}>RM SKU not found.</p>;

  const fields: [string, string][] = [
    ["ID'S", row["ID'S"]],
    ["TIMESTAMP", row.TIMESTAMP ? new Date(row.TIMESTAMP).toLocaleString() : "—"],
    ["USEREMAIL", row.USEREMAIL],
    ["PART NO.", row["PART NO."] || "—"],
    ["Category", row.Category || "—"],
    ["Sub Category", row["Sub Category"] || "—"],
    ["Paint", row.Paint || "—"],
    ["MAKE BY", row["MAKE BY"] || "—"],
    ["VENDOR NAME", row["VENDOR NAME"] || "—"],
    ["IQC PDF UPDATE LAST", row["IQC PDF UPDATE LAST"] || "—"],
  ];

  return (
    <div style={{ marginTop: 16, maxWidth: 520 }}>
      <button className="btn" onClick={() => navigate("/npd/rm-sku")} style={{ marginBottom: 16 }}>
        ← Back to RM SKU Catalog
      </button>
      <div className="card" style={{ padding: 20 }}>
        {fields.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border)", fontSize: 14 }}>
            <span className="text-muted">{label}</span>
            <span style={{ fontWeight: 500, textAlign: "right" }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
