import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../CustomerFilterPanel";
import { DataTable, type Column } from "../DataTable";
import { StatusBadge } from "../StatusBadge";
import { formatTimestamp } from "../../lib/format";
import { listStageOrders, type OrderRecord } from "../../lib/ordersApi";
import type { StageDef } from "../../lib/stages";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";

/** Same list/Completed-toggle/customer-filter pattern as every other pipeline queue
 * (Sale Order, SO Confirmation, Dispatch Approval) — driven entirely by a StageDef so all
 * 8 stages after Dispatch Approval share one implementation. */
export function StageQueueList({ stage }: { stage: StageDef }) {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["stageOrders", stage.key, showCompleted],
    queryFn: () => listStageOrders(stage.key, showCompleted ? "COMPLETED" : undefined),
  });

  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      const name = order.CUSTOMER_NAME || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [orders]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = orders.filter((order) => {
    const matchesCustomer = !activeCustomer || order.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [
      order.ORDER_ID, order.PO_NO, order.CUSTOMER_NAME, order.BUYER_GSTIN,
    ].some((value) => (value || "").toLowerCase().includes(normalizedQuery));
    return matchesCustomer && matchesSearch;
  });

  const columns: Column<OrderRecord>[] = [
    { key: "status", header: "Status", render: (order) => <StatusBadge status={order.STATUS || "PENDING"} /> },
    { key: "timestamp", header: "Timestamp", render: (order) => formatTimestamp(order.CREATED_AT) },
    { key: "orderType", header: "Order Type", render: (order) => order.ORDER_TYPE || "—" },
    { key: "customer", header: "Customer Name", render: (order) => order.CUSTOMER_NAME || "—" },
    { key: "gstin", header: "Buyer GSTIN No.", render: (order) => order.BUYER_GSTIN || "—" },
    { key: "total", header: "Total Amount", render: (order) => `₹${Number(order.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}` },
  ];

  useSetHeaderActions(
    <button
      className="btn btn-primary"
      onClick={() => setShowCompleted((current) => !current)}
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {showCompleted ? "Showing Completed" : "Completed…"}
    </button>
  );

  const emptyMessage = isLoading
    ? "Loading…"
    : normalizedQuery
    ? `No orders match “${query}”`
    : showCompleted
    ? `No completed ${stage.label.toLowerCase()} records.`
    : `No orders awaiting ${stage.label}.`;

  if (isMobile) {
    return (
      <div>
        <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
        <div style={{ padding: "8px 0 24px" }}>
          {filtered.map((order) => (
            <button
              key={order.ORDER_ID}
              onClick={() => navigate(`/modules/${stage.key}/${order.ORDER_ID}`)}
              className="card"
              style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 10, color: "var(--color-text)", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <StatusBadge status={order.STATUS || "PENDING"} />
                <span className="text-muted" style={{ fontSize: 12 }}>{formatTimestamp(order.CREATED_AT)}</span>
              </div>
              <div style={{ fontWeight: 700, marginTop: 10 }}>{order.CUSTOMER_NAME || "Customer not set"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>{order.ORDER_ID}</div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && <p className="text-muted">{emptyMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(order) => order.ORDER_ID}
          onRowClick={(order) => navigate(`/modules/${stage.key}/${order.ORDER_ID}`)}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}
