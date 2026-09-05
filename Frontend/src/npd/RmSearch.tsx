import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listTaxonomyRows } from "./lib/npdApi";

/** "RM SEARCH" — matches the AppSheet reference screen: a left "RM SEARCH" panel with a
 * multi-select Category checklist, and a right-hand data table that live-filters to whichever
 * Categories are ticked (titled "<Category> Data", or "RM SKU Data" once more than one
 * Category is ticked — the reference's own title only ever shows a single category name, but
 * this app's own Category is a genuine multi-select, unlike the reference's implied
 * single-pick). Columns are the real live `Raw Material SKU` fields (confirmed directly — see
 * `RmSkuForm.tsx`'s own header comments for the same field list) — the reference's own
 * screenshot additionally shows an "AGAINST ID"/"PAINT" pair that don't exist on this live
 * sheet (that's the old dead-pointer/renamed-to-Brand columns from a different table
 * entirely, `RM ref Category`, not `Raw Material SKU` itself) — not fabricated here. */
export function RmSearch() {
  const navigate = useNavigate();
  const [selectedCategories, setSelectedCategories] = useState<Record<string, true>>({});
  const [rmSearch, setRmSearch] = useState("");

  const { data: categoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-category"],
    queryFn: () => listTaxonomyRows("rm-category"),
  });
  const { data: rmSkuRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const categoryNames = Object.keys(selectedCategories);
  const allTicked = categoryRows.length > 0 && categoryRows.every((r) => r.CATEGORY.trim() in selectedCategories);

  function toggleCategory(name: string) {
    setSelectedCategories((prev) => {
      const next = { ...prev };
      if (name in next) delete next[name];
      else next[name] = true;
      return next;
    });
  }

  function toggleAll() {
    setSelectedCategories(allTicked ? {} : Object.fromEntries(categoryRows.map((r) => [r.CATEGORY.trim(), true as const])));
  }

  const filteredRows = rmSkuRows.filter(
    (r) =>
      (categoryNames.length === 0 || categoryNames.includes((r.Category ?? "").trim())) &&
      (!rmSearch.trim() ||
        (r["PART NO."] || r["ID'S"] || "").toLowerCase().includes(rmSearch.trim().toLowerCase()))
  );

  const dataTitle =
    categoryNames.length === 1 ? `${categoryNames[0]} Data` : categoryNames.length > 1 ? "RM SKU Data" : "All RM SKU Data";

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Left: "RM SEARCH" panel, matching the reference's own record card. */}
      <div className="card" style={{ padding: 20, width: 340, flexShrink: 0 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700 }}>RM SEARCH</h3>

        <label style={{ display: "block", fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
          Category
        </label>
        <input
          type="text"
          value={rmSearch}
          onChange={(e) => setRmSearch(e.target.value)}
          placeholder="Search RM code…"
          style={{
            width: "100%",
            height: 38,
            borderRadius: 6,
            border: "1px solid var(--color-border)",
            padding: "8px 12px",
            fontSize: 14,
            marginBottom: 12,
            boxSizing: "border-box",
            background: "var(--color-bg)",
            color: "var(--color-text)",
          }}
        />

        {categoryRows.length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={allTicked} onChange={toggleAll} style={{ width: 14, height: 14 }} />
            Select all ({categoryRows.length})
          </label>
        )}
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          {categoryRows.map((r) => {
            const name = r.CATEGORY.trim();
            return (
              <label
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={name in selectedCategories}
                  onChange={() => toggleCategory(name)}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14 }}>{name}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Right: live-filtered RM SKU table, matching the reference's own "<Category> Data"
          panel. */}
      <div className="card" style={{ padding: 20, flex: "1 1 500px", minWidth: 320 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{dataTitle}</h3>
          <span
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: "1px 9px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            {filteredRows.length}
          </span>
        </div>
        {filteredRows.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>
            {categoryNames.length === 0 ? "Tick a Category on the left to see its RM SKUs." : "No RM SKUs match."}
          </p>
        ) : (
          <div className="sheet-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {["Unique ID", "Timestamp", "Part No.", "Category", "Sub Category", "Brand", "Make By", "Vendor Name"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r["ID'S"]}
                    onClick={() => navigate(`/npd/rm-sku/${encodeURIComponent(r["ID'S"])}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r["ID'S"]}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {r.TIMESTAMP ? new Date(r.TIMESTAMP).toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r["PART NO."] || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r.Category || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {r["Sub Category"] || "—"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r.Brand || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r["MAKE BY"] || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {r["VENDOR NAME"] || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
