import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrder, listPdiItems } from "../../lib/ordersApi";
import { listGoods, type GoodsRow } from "../../lib/mastersApi";
import { formatTimestamp } from "../../lib/format";
import { useIsCompact, useIsMobile } from "../../lib/responsive";
import { StageForm } from "../../components/stage/StageForm";
import { getStage } from "../../lib/stages";

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

function QuickAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", width: 76 }}
    >
      <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {children}
        </svg>
      </span>
      <span style={{ fontSize: 12, color: "var(--color-text)", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
    </button>
  );
}

/**
 * Item-level PDI detail page — PDI is per-item now (doing PDI for one item never advances
 * the rest of the order's items, see stageRoutes.ts's registerPdiSubmitRoute), so this
 * mirrors DispatchApprovalItemDetail.tsx: Goods Details, Quantity Details, and the item's own
 * PDI result once done. Reached from PdiList.tsx's row click.
 */
export function PdiItemDetail() {
  const { orderId, itemId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCompact = useIsCompact();
  const [showForm, setShowForm] = useState(false);
  const pdiStage = getStage("pdi")!;

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
  });

  const { data: goods = [] } = useQuery({
    queryKey: ["goods"],
    queryFn: listGoods,
  });

  const { data: completedPdiItems = [] } = useQuery({
    queryKey: ["pdiItems", "COMPLETED"],
    queryFn: () => listPdiItems("COMPLETED"),
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Order not found</p>;

  const item = data.items.find((it) => it.ITEM_ID === itemId);
  if (!item) return <p className="text-muted">Item not found</p>;

  const order = data.order;
  const g = goods.find((row) => row["FG ID"] === item.FG_ID);
  const productPdf = pick(g, "Product PDF", "PRODUCT PDF");
  const done = completedPdiItems.find((r) => r.ITEM_ID === itemId);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", flexWrap: isCompact ? "wrap" : "nowrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: isCompact ? "1 1 100%" : "0 0 260px" }}>
          <button
            onClick={() => navigate("/modules/pdi")}
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

          {/* PDI is per-item and its own placeholder now exists as soon as this item's
              Dispatch Approval decision is made (see createPlaceholderPdi in
              stageRoutes.ts) — no longer gated on the whole order's STATUS reaching
              "DISPATCH APPROVAL COMPLETED", since a sibling item can still be undecided
              while this one is already eligible. Just check this item's own completion. */}
          {!done && (
            <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
              <QuickAction label="Give PDI Form" onClick={() => setShowForm(true)}>
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </QuickAction>
            </div>
          )}
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
            <Field label="Part Description" value={pick(g, "Part Description", "Description", "PART DESCRIPTION")} />
            <Field label="Segment" value={item.SEGMENT} />
            <Field label="Category" value={item.CATEGORY} />
            {productPdf && (
              <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                <div className="text-muted" style={{ fontSize: 12, flex: "0 0 140px" }}>
                  Product PDF
                </div>
                <a href={productPdf} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "var(--color-primary)" }}>
                  {productPdf.split("/").pop()}
                </a>
              </div>
            )}
          </Section>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <Section title="Quantity Details">
            <Field label="Order Quantity" value={item.QTY} />
            <Field label="Unit" value={item.UOM} />
          </Section>

          <Section title="PDI">
            {!done ? (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Not done yet for this item.</p>
            ) : (
              <>
                <Field label="PDI Date" value={done.PDI_DATE} />
                <Field label="PDI Remarks" value={done.PDI_REMARKS} />
                {done.PDI_ATTACHMENT_URL && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div className="text-muted" style={{ fontSize: 12, flex: "0 0 140px" }}>
                      PDI Attachment
                    </div>
                    <a href={done.PDI_ATTACHMENT_URL} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "var(--color-primary)" }}>
                      View attachment
                    </a>
                  </div>
                )}
              </>
            )}
          </Section>
        </div>
      </div>

      {showForm && (
        <StageForm
          stage={pdiStage}
          orderId={orderId!}
          itemId={itemId!}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ["order", orderId] });
            queryClient.invalidateQueries({ queryKey: ["pdiItems"] });
            navigate("/modules/pdi");
          }}
        />
      )}
    </div>
  );
}
