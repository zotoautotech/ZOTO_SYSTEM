import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOrder } from "../../lib/ordersApi";
import { listGoods, type GoodsRow } from "../../lib/mastersApi";
import { formatTimestamp, formatCurrency } from "../../lib/format";
import { useIsCompact, useIsMobile } from "../../lib/responsive";

function pick(row: GoodsRow | undefined, ...keys: string[]): string {
  if (!row) return "";
  for (const k of keys) {
    const v = row[k];
    if (v) return v;
  }
  return "";
}

function Field({ label, value }: { label: string; value?: string }) {
  const isMobile = useIsMobile();
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 2 : 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: isMobile ? "0 0 auto" : "0 0 140px" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, flex: 1 }}>{value}</div>
    </div>
  );
}

export function OrderItemDetail() {
  const { orderId, itemId } = useParams();
  const navigate = useNavigate();
  const isCompact = useIsCompact();
  const isMobile = useIsMobile();

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

  const item = data.items.find((it) => it.ITEM_ID === itemId);
  if (!item) return <p className="text-muted">Item not found</p>;

  const g = goods.find((row) => row["FG ID"] === item.FG_ID);
  const productPdf = pick(g, "Product PDF", "PRODUCT PDF");

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", flexWrap: isCompact ? "wrap" : "nowrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: isCompact ? "1 1 100%" : "0 0 260px" }}>
          <button
            onClick={() => navigate(`/modules/punch-order/${orderId}/items`)}
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
              marginBottom: 4,
            }}
          >
            ‹
          </button>
          <h2 style={{ margin: "8px 0 0", fontWeight: 500, wordBreak: "break-word" }}>{item.ITEM_ID}</h2>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {formatTimestamp(item.CREATED_AT || data.order.CREATED_AT)}
          </span>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Goods Details</h3>
            <Field label="Part No." value={item.PART_NO || pick(g, "PART NO.")} />
            <Field label="Old Part No." value={pick(g, "Old Part No.", "OLD PART NO.", "Old Part No")} />
            <Field label="Part Name" value={item.PART_NAME} />
            <Field
              label="Part Description"
              value={pick(g, "Part Description", "Description", "PART DESCRIPTION")}
            />
            <Field label="Segment" value={item.SEGMENT} />
            <Field label="Category" value={item.CATEGORY} />
            <Field label="Sub Category" value={pick(g, "Sub Category", "SUB CATEGORY")} />
            <Field label="Paint" value={pick(g, "Paint", "PAINT")} />
            <Field label="Standard Part" value={pick(g, "Standard Part", "Standard", "STANDARD PART")} />
            {productPdf && (
              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  gap: isMobile ? 2 : 16,
                  marginBottom: 12,
                }}
              >
                <div className="text-muted" style={{ fontSize: 12, flex: isMobile ? "0 0 auto" : "0 0 140px" }}>
                  Product PDF
                </div>
                <a href={productPdf} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "var(--color-primary)" }}>
                  {productPdf.split("/").pop()}
                </a>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>GST Details</h3>
            <Field label="Price" value={formatCurrency(item.PRICE)} />
            <Field label="Quantity" value={item.QTY} />
            <Field label="Unit" value={item.UOM} />
            <Field label="Default Discount on" value={item.DISCOUNT_ON} />
            <Field label="Discount (Rs)" value={formatCurrency(item.DISCOUNT_RS || "0")} />
            <Field label="Discount (%)" value={item.DISCOUNT_PCT ? `${item.DISCOUNT_PCT}%` : undefined} />
            <Field label="GST Slab (%)" value={item.GST_SLAB_PCT ? `${item.GST_SLAB_PCT}%` : undefined} />
            <Field label="Basic Amount" value={formatCurrency(item.BASIC_AMOUNT)} />
            <Field label="CGST" value={formatCurrency(item.CGST || "0")} />
            <Field label="SGST" value={formatCurrency(item.SGST || "0")} />
            <Field label="IGST" value={formatCurrency(item.IGST || "0")} />
            <Field label="Total Amount" value={formatCurrency(item.TOTAL_AMOUNT)} />
          </div>
        </div>
      </div>
    </div>
  );
}
