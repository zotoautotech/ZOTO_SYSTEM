import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOrder } from "../../lib/ordersApi";
import { listGoods, type GoodsRow } from "../../lib/mastersApi";
import { formatCurrency } from "../../lib/format";

function pick(row: GoodsRow | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const k of keys) {
    const v = row[k];
    if (v) return v;
  }
  return "";
}

export function OrderItemsView() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
  });

  const { data: goods = [] } = useQuery({
    queryKey: ["goods"],
    queryFn: listGoods,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Order not found</p>;

  const { order, items } = data;
  const goodsByFgId = new Map(goods.map((g) => [g["FG ID"], g]));

  const columns = [
    "Part No.",
    "Old Part No.",
    "Part Name",
    "Part Description",
    "Segment",
    "Category",
    "Sub Category",
    "Paint",
    "Standard Packing",
    "Qty",
    "UOM",
    "Price",
    "Basic Amount",
    "Tax Amount",
    "Total Amount",
    "Remarks",
  ];

  const cell: React.CSSProperties = {
    padding: "10px 14px",
    borderBottom: "1px solid var(--color-border)",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 128px)",
        margin: "0 -24px",
      }}
    >
      <div className="sheet-scroll" style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              {columns.map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    paddingLeft: i === 0 ? 24 : 14,
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const g = goodsByFgId.get(it.FG_ID);
              return (
                <tr
                  key={it.ITEM_ID}
                  onClick={() => navigate(`/modules/punch-order/${orderId}/items/${it.ITEM_ID}`)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-page)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ ...cell, paddingLeft: 24 }}>{it.PART_NO}</td>
                  <td style={cell}>{pick(g, "Old Part No.", "OLD PART NO.", "Old Part No")}</td>
                  <td style={{ ...cell, fontWeight: 500 }}>{it.PART_NAME}</td>
                  <td style={cell}>{pick(g, "Part Description", "Description", "PART DESCRIPTION")}</td>
                  <td style={cell}>{it.SEGMENT}</td>
                  <td style={cell}>{it.CATEGORY}</td>
                  <td style={cell}>{pick(g, "Sub Category", "SUB CATEGORY")}</td>
                  <td style={cell}>{pick(g, "Paint", "PAINT")}</td>
                  <td style={cell}>{pick(g, "Standard Packing", "Standard", "STANDARD PACKING")}</td>
                  <td style={cell}>{it.QTY}</td>
                  <td style={cell}>{it.UOM}</td>
                  <td style={cell}>{formatCurrency(it.PRICE)}</td>
                  <td style={cell}>{formatCurrency(it.BASIC_AMOUNT)}</td>
                  <td style={cell}>{formatCurrency(it.TAX_AMOUNT)}</td>
                  <td style={cell}>{formatCurrency(it.TOTAL_AMOUNT)}</td>
                  <td style={{ ...cell, whiteSpace: "normal" }}>{it.NOTES}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
