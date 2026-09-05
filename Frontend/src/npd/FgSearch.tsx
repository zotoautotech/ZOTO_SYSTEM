import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listTaxonomyRows } from "./lib/npdApi";

/** "FG SEARCH" — the FG-side mirror of `RmSearch.tsx` (see that file's own doc comment for
 * the full reasoning). Left "FG SEARCH" card: a Category multi-select checkbox box (+ Select
 * all + a Part No./Name search box). Right card: a live-filtered `FINAL GOOD SKU` table,
 * titled "<Category> Data" for a single ticked Category, "FG SKU Data" for several, "All FG
 * SKU Data" for none. Row click navigates to that FG SKU's own detail page. Columns are the
 * real live `FINAL GOOD SKU` fields only (Category/Sub Category/Brand/Standard Part/Name/
 * PART NO.) — nothing fabricated. */
export function FgSearch() {
  const navigate = useNavigate();
  const [selectedCategories, setSelectedCategories] = useState<Record<string, true>>({});
  const [fgSearch, setFgSearch] = useState("");

  const { data: categoryRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-category"],
    queryFn: () => listTaxonomyRows("fg-category"),
  });
  const { data: fgSkuRows = [] } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sku"],
    queryFn: () => listTaxonomyRows("fg-sku"),
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

  const filteredRows = fgSkuRows.filter(
    (r) =>
      (categoryNames.length === 0 || categoryNames.includes((r.CATEGORY ?? "").trim())) &&
      (!fgSearch.trim() ||
        (r["PART NO."] || r.Name || r["FG ID"] || "").toLowerCase().includes(fgSearch.trim().toLowerCase()))
  );

  const dataTitle =
    categoryNames.length === 1 ? `${categoryNames[0]} Data` : categoryNames.length > 1 ? "FG SKU Data" : "All FG SKU Data";

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Left: "FG SEARCH" panel, matching RmSearch.tsx's own record card. */}
      <div className="card" style={{ padding: 20, width: 340, flexShrink: 0 }}>
        <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700 }}>FG SEARCH</h3>

        <label style={{ display: "block", fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
          Category
        </label>
        <input
          type="text"
          value={fgSearch}
          onChange={(e) => setFgSearch(e.target.value)}
          placeholder="Search FG code or name…"
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

      {/* Right: live-filtered FG SKU table. */}
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
            {categoryNames.length === 0 ? "Tick a Category on the left to see its FG SKUs." : "No FG SKUs match."}
          </p>
        ) : (
          <div className="sheet-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {["FG ID", "Timestamp", "Part No.", "Name", "Category", "Sub Category", "Brand", "Standard Part"].map(
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
                    key={r["FG ID"]}
                    onClick={() => navigate(`/npd/fg-sku/${encodeURIComponent(r["FG ID"])}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r["FG ID"]}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {r.TIMESTAMP ? new Date(r.TIMESTAMP).toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r["PART NO."] || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r.Name || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r.CATEGORY || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {r["SUB CATEGORY"] || "—"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>{r.Brand || "—"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {r["STANDARD PART"] || "—"}
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
