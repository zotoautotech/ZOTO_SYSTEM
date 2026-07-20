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

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => navigate(`/modules/punch-order/${orderId}`)}
          aria-label="Back"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          ‹
        </button>
        <h2 style={{ fontWeight: 500, margin: 0 }}>Order Punch Items View</h2>
      </div>

      <div className="card sheet-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
          <thead>
            <tr>
              {columns.map((h) => (
                <th
                  key={h}
                  style={{ textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}
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
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>{it.PART_NO}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {pick(g, "Old Part No.", "OLD PART NO.", "Old Part No")}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)", fontWeight: 500 }}>
                    {it.PART_NAME}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {pick(g, "Part Description", "Description", "PART DESCRIPTION")}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>{it.SEGMENT}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>{it.CATEGORY}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {pick(g, "Sub Category", "SUB CATEGORY")}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {pick(g, "Paint", "PAINT")}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {pick(g, "Standard Packing", "Standard", "STANDARD PACKING")}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>{it.QTY}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>{it.UOM}</td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {formatCurrency(it.PRICE)}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {formatCurrency(it.BASIC_AMOUNT)}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {formatCurrency(it.TAX_AMOUNT)}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                    {formatCurrency(it.TOTAL_AMOUNT)}
                  </td>
                  <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)", whiteSpace: "normal" }}>
                    {it.NOTES}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
