import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrder, listItemDispatchApprovalLog } from "../../lib/ordersApi";
import { listGoods, type GoodsRow } from "../../lib/mastersApi";
import { formatTimestamp } from "../../lib/format";
import { useIsCompact, useIsMobile } from "../../lib/responsive";
import { DispatchApprovalForm } from "./DispatchApprovalForm";

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
 * Item-level Dispatch Approval detail page, matching the old CRR/AppSheet reference
 * ("PRE-PD-CONF-…") the doer asked to match — Buyer Details, Special Instructions, Planned
 * Dispatch Dates, Goods Details, Quantity Details, and a Dispatch Approval Follow-ups history
 * table. Reached from the pending Dispatch Approval item-level table's row click.
 *
 * FG stock fields (Warehouse/Assembly Line/Booked/Total) have no backing data source yet —
 * there's no Inventory Management System connected (same gap flagged for Available Stock
 * Quantity on the approval form itself) — so they're shown as "—" here rather than a form
 * field, since this is a read-only detail page, not something a doer fills in.
 */
export function DispatchApprovalItemDetail() {
  const { orderId, itemId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isCompact = useIsCompact();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
  });

  const { data: goods = [] } = useQuery({
    queryKey: ["goods"],
    queryFn: listGoods,
  });

  const { data: log = [] } = useQuery({
    queryKey: ["dispatchApprovalLog", orderId, itemId],
    queryFn: () => listItemDispatchApprovalLog(orderId!, itemId!),
    enabled: !!orderId && !!itemId,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Order not found</p>;

  const item = data.items.find((it) => it.ITEM_ID === itemId);
  if (!item) return <p className="text-muted">Item not found</p>;

  const order = data.order;
  const g = goods.find((row) => row["FG ID"] === item.FG_ID);
  const productPdf = pick(g, "Product PDF", "PRODUCT PDF");
  const plannedDates = (data.dispatchPlan as Record<string, string>[]).filter((d) => d.ITEM_ID === itemId);
  const plannedTotal = plannedDates.reduce((sum, d) => sum + (Number(d.PLANNED_QTY) || 0), 0);
  const latest = log[log.length - 1];

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", flexWrap: isCompact ? "wrap" : "nowrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: isCompact ? "1 1 100%" : "0 0 260px" }}>
          <button
            onClick={() => navigate("/modules/dispatch-approval")}
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
            {formatTimestamp(order.APPROVAL_TIME || order.CREATED_AT)}
          </span>

          {order.STATUS === "DISPATCH APPROVAL" && (
            <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
              <QuickAction label="Give Dispatch Approval Form" onClick={() => setShowForm(true)}>
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </QuickAction>
            </div>
          )}
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <Section title="Buyer Details">
            <Field label="CUST ID" value={order.CUST_ID} />
            <Field label="Customer Name" value={order.CUSTOMER_NAME} />
            <Field label="Buyer GSTIN No." value={order.BUYER_GSTIN} />
            <Field label="Business Segment" value={order.BUSINESS_SEGMENT} />
            <Field label="Type of Customer" value={order.TYPE_OF_CUSTOMER} />
          </Section>

          {item.SPECIAL_INSTRUCTIONS && (
            <Section title="Special Instructions">
              <p style={{ fontSize: 14, margin: 0 }}>{item.SPECIAL_INSTRUCTIONS}</p>
            </Section>
          )}

          <Section title="Planned Dispatch Dates">
            {plannedDates.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No planned dispatch dates for this item.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "6px 8px" }}>Date</th>
                      <th style={{ padding: "6px 8px" }}>Dispatch Qty</th>
                      <th style={{ padding: "6px 8px" }}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plannedDates.map((d, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "6px 8px" }}>{d.EXPECTED_DATE}</td>
                        <td style={{ padding: "6px 8px" }}>{d.PLANNED_QTY}</td>
                        <td style={{ padding: "6px 8px" }}>{d.UOM}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div style={{ flex: isCompact ? "1 1 100%" : 1, minWidth: 0 }}>
          <Section title="Goods Details">
            <Field label="Part No." value={item.PART_NO || pick(g, "PART NO.")} />
            <Field label="Old Part No." value={pick(g, "Old Part No.", "OLD PART NO.", "Old Part No")} />
            <Field label="Part Name" value={item.PART_NAME} />
            <Field label="Part Description" value={pick(g, "Part Description", "Description", "PART DESCRIPTION")} />
            <Field label="Segment" value={item.SEGMENT} />
            <Field label="Category" value={item.CATEGORY} />
            <Field label="Sub Category" value={pick(g, "Sub Category", "SUB CATEGORY")} />
            <Field label="Paint" value={pick(g, "Paint", "PAINT")} />
            <Field label="Standard Part" value={pick(g, "Standard Part", "Standard", "STANDARD PART")} />
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

          <Section title="Quantity Details">
            <Field label="Order Quantity" value={item.QTY} />
            <Field label="Planned Dispatches" value={plannedTotal ? String(plannedTotal) : undefined} />
            {/* No Inventory Management System connected yet — same gap as Available Stock
                Quantity on the approval form itself, shown here as unavailable rather than
                a fabricated figure. */}
            <Field label="FG Stock in Warehouse" value="—" />
            <Field label="FG Stock in Assembly Line" value="—" />
            <Field label="FG Stock Booked" value="—" />
            <Field label="FG Stock in Total" value="—" />
            <Field label="Balance Dispatch Quantity" value={latest?.BALANCE_DISPATCH_QTY} />
            <Field label="Dispatch Approved Quantity" value={latest?.APPROVED_QTY} />
            <Field label="Short Quantity" value={latest?.SHORT_QTY} />
            <Field label="Excess Quantity" value={latest?.EXCESS_QTY} />
            <Field label="Unit" value={item.UOM} />
          </Section>

          <Section title="Dispatch Approval Follow-ups">
            {log.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No follow-ups yet.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "6px 8px" }}>Timestamp</th>
                      <th style={{ padding: "6px 8px" }}>Part No.</th>
                      <th style={{ padding: "6px 8px" }}>Part Name</th>
                      <th style={{ padding: "6px 8px" }}>Dispatch Approval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "6px 8px" }}>{formatTimestamp(row.CREATED_AT)}</td>
                        <td style={{ padding: "6px 8px" }}>{row.PART_NO}</td>
                        <td style={{ padding: "6px 8px" }}>{row.PART_NAME}</td>
                        <td style={{ padding: "6px 8px" }}>{row.DISPATCH_APPROVAL}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </div>

      {showForm && (
        <DispatchApprovalForm
          orderId={orderId!}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ["order", orderId] });
            queryClient.invalidateQueries({ queryKey: ["dispatchApprovalLog", orderId, itemId] });
            queryClient.invalidateQueries({ queryKey: ["dispatchApprovals"] });
            navigate("/modules/dispatch-approval");
          }}
        />
      )}
    </div>
  );
}
