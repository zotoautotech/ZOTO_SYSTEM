import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOrder } from "../../lib/ordersApi";
import { listGoods, type GoodsRow } from "../../lib/mastersApi";
import { formatTimestamp } from "../../lib/format";
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

/** Item-level detail page for the "Pending Transport" list (TransportList.tsx's row click) —
 * matches the old CRR reference's own item detail layout (Buyer Details / Goods Details /
 * Load Limit Details). NUG/BOX Quantity, Packing Type, and NUG/BOX Marka Code from that
 * reference are intentionally left out here — they were the now-removed Pre Transport
 * stage's own manual entry (see CLAUDE.md), so there is no live source for them anymore;
 * showing them would mean fabricating data. Load Limit Details here is just the item's own
 * order quantity — actual load qty/boxes are only decided once the doer arranges a vehicle
 * for it via the "+ Arrange Vehicle" flow. */
export function TransportItemDetail() {
  const { orderId, itemId } = useParams();
  const navigate = useNavigate();
  const isCompact = useIsCompact();

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

  const order = data.order;
  const g = goods.find((row) => row["FG ID"] === item.FG_ID);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", flexWrap: isCompact ? "wrap" : "nowrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: isCompact ? "1 1 100%" : "0 0 260px" }}>
          <button
            onClick={() => navigate("/modules/transport")}
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
            {formatTimestamp(order.CREATED_AT)}
          </span>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <Section title="Buyer Details">
            <Field label="CUST ID" value={order.CUST_ID} />
            <Field label="Customer Name" value={order.CUSTOMER_NAME} />
            <Field label="Buyer GSTIN No." value={order.BUYER_GSTIN} />
          </Section>

          <Section title="Goods Details">
            <Field label="Part No." value={item.PART_NO || pick(g, "PART NO.")} />
            <Field label="Part Name" value={item.PART_NAME} />
            <Field label="Segment" value={item.SEGMENT} />
            <Field label="Category" value={item.CATEGORY} />
          </Section>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <Section title="Load Limit Details">
            <Field label="Quantity" value={item.QTY} />
            <Field label="Unit" value={item.UOM} />
          </Section>
        </div>
      </div>
    </div>
  );
}
