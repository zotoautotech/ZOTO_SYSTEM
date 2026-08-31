import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CustomerFilterPanel } from "../components/CustomerFilterPanel";
import { useIsMobile } from "../lib/responsive";
import { useSearch } from "../lib/search";
import { useSetHeaderActions } from "../lib/headerActions";
import { listTaxonomyRows, type TaxonomyRow } from "./lib/npdApi";

/** RM SKU Catalog — same list-screen chrome as every Sales CRR queue (`OrderPunchList.tsx`
 * etc.): a draggable-width `CustomerFilterPanel` sidebar (here filtering Category, not
 * customer — the component is already generic `{name,count}[]`) + a filter icon in the
 * header-actions row, not a button floating above the grid. The card grid itself still
 * matches the real legacy AppSheet reference (cards grouped by Sub Category, each card
 * showing Category / created date / PART NO. / Sub Category / Vendor Name) — only the page
 * chrome around it was out of step with the rest of this app. There's no "+Add" here: the
 * old RM Part Code Generator flow that used to create these rows was removed from the
 * frontend on request, and no other create form exists yet — add a header "+" button back
 * once a real RM SKU create flow is built. */
export function RmSkuCatalog() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { query } = useSearch();
  const [filterWidth, setFilterWidth] = useState(260);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

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

  const onDividerMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const next = dragState.current.startWidth + (e.clientX - dragState.current.startX);
    setFilterWidth(Math.min(480, Math.max(160, next)));
  }, []);

  const onDividerMouseUp = useCallback(() => {
    dragState.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onDividerMouseMove);
    window.removeEventListener("mouseup", onDividerMouseUp);
  }, [onDividerMouseMove]);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { startX: e.clientX, startWidth: filterWidth };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onDividerMouseMove);
      window.addEventListener("mouseup", onDividerMouseUp);
    },
    [filterWidth, onDividerMouseMove, onDividerMouseUp]
  );

  useSetHeaderActions(
    <button
      aria-label="Filter"
      style={{
        width: 38,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5h16M7 12h10M10 19h4" />
      </svg>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 128px)" }}>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", flex: 1, minHeight: 0 }}>
        <CustomerFilterPanel customers={categories} active={activeCategory} onSelect={selectCategory} width={filterWidth} />
        {!isMobile && (
          <div
            onMouseDown={onDividerMouseDown}
            onDoubleClick={() => setFilterWidth(260)}
            title="Drag to resize"
            style={{ width: 5, marginLeft: -2, marginRight: -2, cursor: "col-resize", flexShrink: 0, position: "relative", zIndex: 1 }}
          >
            <div style={{ width: 1, height: "100%", background: "var(--color-border)", margin: "0 auto" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "8px 4px 0" : "8px 0 0 4px" }}>
          {isLoading && <p className="text-muted">Loading…</p>}
          {!isLoading && filtered.length === 0 && <p className="text-muted">No RM SKUs found.</p>}
          {[...groups.entries()].map(([sub, items]) => (
            <div key={sub} style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, margin: "0 0 8px" }}>
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
    </div>
  );
}
