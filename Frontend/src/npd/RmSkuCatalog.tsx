import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CustomerFilterPanel } from "../components/CustomerFilterPanel";
import { useIsMobile } from "../lib/responsive";
import { useSearch } from "../lib/search";
import { listTaxonomyRows, type TaxonomyRow } from "./lib/npdApi";

/** RM SKU Catalog — rebuilt to match the real legacy AppSheet reference screen exactly
 * (left Category filter with counts, main area = cards grouped by Sub Category header, each
 * card showing Category / created date / PART NO. / Sub Category / Vendor Name), replacing
 * the generic Taxonomy admin table view for this one table. Reuses `CustomerFilterPanel` (the
 * same sidebar component Sales CRR's own list screens use — "CRR UI context" per the user's
 * instruction) even though it's filtering Categories here, not customers; the component is
 * already generic (`{name,count}[]`). */
export function RmSkuCatalog() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { query } = useSearch();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const params = new URLSearchParams(window.location.search);
  const activeCategory = params.get("category");

  const categoryCounts = new Map<string, number>();
  rows.forEach((r) => {
    const cat = r.Category || "Uncategorized";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  });
  const categories = [...categoryCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  const filtered = rows.filter((r) => {
    if (activeCategory && (r.Category || "Uncategorized") !== activeCategory) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return Object.values(r).some((v) => v.toLowerCase().includes(q));
  });

  const groups = new Map<string, TaxonomyRow[]>();
  filtered.forEach((r) => {
    const sub = r["Sub Category"] || "—";
    (groups.get(sub) ?? groups.set(sub, []).get(sub)!).push(r);
  });

  function selectCategory(name: string | null) {
    const p = new URLSearchParams(window.location.search);
    if (name) p.set("category", name);
    else p.delete("category");
    navigate({ search: p.toString() }, { replace: true });
  }

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", marginTop: 16, minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={categories} active={activeCategory} onSelect={selectCategory} />
      <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "0 4px" : "0 0 0 4px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button className="btn btn-primary" onClick={() => navigate("/npd/rm-part-code")}>
            + Add
          </button>
        </div>
        {isLoading && <p className="text-muted">Loading…</p>}
        {!isLoading && filtered.length === 0 && <p className="text-muted">No RM SKUs found.</p>}
        {[...groups.entries()].map(([sub, items]) => (
          <div key={sub} style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, margin: "16px 0 8px" }}>
              {sub} <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>{items.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {items.map((r) => (
                <div
                  key={r["ID'S"]}
                  className="card"
                  style={{ padding: 14, cursor: "pointer" }}
                  onClick={() => navigate(`/npd/rm-sku/${encodeURIComponent(r["ID'S"])}`)}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.Category || "—"}</div>
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {r.TIMESTAMP ? new Date(r.TIMESTAMP).toLocaleString() : "—"}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{r["PART NO."] || "—"}</div>
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{r["Sub Category"]}</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>{r["VENDOR NAME"] || "—"}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
