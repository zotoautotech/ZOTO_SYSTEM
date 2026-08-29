import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { DataTable, type Column } from "../components/DataTable";
import { listStock, type StockItem } from "./lib/npdApi";

/** Stock & WIP Dashboard (build-prompt §7 screen 12) — FG inventory levels vs min/max, flagging
 * low stock. WIP MASTER itself is browsed via the Taxonomy admin page's own "WIP Master" table
 * (reuses the same generic CRUD as every other reference table — see taxonomy.ts) rather than
 * a bespoke stage-tracker UI here; this dashboard focuses on the stock-level read that's the
 * build prompt's own primary description of this screen. Numbers come straight from the live
 * `FINAL GOOD SKU` sheet's own MIN/MAX/OPENING STOCK columns — most rows have these blank
 * (legacy import), so `lowStock` only fires once a MIN STOCK threshold is actually set. */
export function StockWipDashboard() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["npd", "dashboard", "stock"],
    queryFn: listStock,
  });

  const lowStockCount = items.filter((i) => i.lowStock).length;

  const columns: Column<StockItem>[] = [
    { key: "name", header: "FG Name", render: (i) => i.name },
    { key: "category", header: "Category / Sub Category", render: (i) => [i.category, i.subCategory].filter(Boolean).join(" / ") || "—" },
    { key: "opening", header: "Opening Stock", render: (i) => String(i.openingStock) },
    { key: "min", header: "Min Stock", render: (i) => (i.minStock > 0 ? String(i.minStock) : "—") },
    { key: "max", header: "Max Stock", render: (i) => (i.maxStock > 0 ? String(i.maxStock) : "—") },
    { key: "cog", header: "Cost of Goods", render: (i) => i.costOfGoods.toFixed(2) },
    { key: "status", header: "Status", render: (i) => (i.lowStock ? "Low Stock" : "OK") },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Stock &amp; WIP Dashboard</h2>
          <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {lowStockCount > 0 ? `${lowStockCount} item(s) below Min Stock.` : "No items below Min Stock."}{" "}
            WIP stage tracking is under{" "}
            <Link to="/npd/taxonomy/wip-master" style={{ color: "var(--color-primary)" }}>
              Taxonomy → WIP Master
            </Link>
            .
          </p>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={items}
        getRowKey={(i) => i.fgId}
        getRowStyle={(i) => (i.lowStock ? { color: "#C62828", fontWeight: 600 } : undefined)}
        emptyMessage={isLoading ? "Loading…" : "No FG SKUs found."}
      />
    </div>
  );
}
