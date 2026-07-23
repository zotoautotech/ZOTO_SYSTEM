import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatTimestamp } from "../../lib/format";
import { listDispatchApprovals, type OrderRecord } from "../../lib/ordersApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";

/** Queue of orders confirmed in SO Confirmation, now awaiting Dispatch Approval. Same
 * table/Completed-toggle/customer-filter pattern as Sale Order and SO Confirmation. */
export function DispatchApprovalList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["dispatchApprovals", showCompleted],
    queryFn: () => listDispatchApprovals(showCompleted ? "COMPLETED" : undefined),
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
    { key: "payment", header: "Payment Type", render: (order) => order.PAYMENT_TYPE || "—" },
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

  if (isMobile) {
    return (
      <div>
        <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
        <div style={{ padding: "8px 0 24px" }}>
          {filtered.map((order) => (
            <button
              key={order.ORDER_ID}
              onClick={() => navigate(`/modules/dispatch-approval/${order.ORDER_ID}`)}
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
          {!isLoading && filtered.length === 0 && <p className="text-muted">{showCompleted ? "No completed dispatch approvals." : "No orders awaiting dispatch approval."}</p>}
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
          onRowClick={(order) => navigate(`/modules/dispatch-approval/${order.ORDER_ID}`)}
          emptyMessage={isLoading ? "Loading…" : normalizedQuery ? `No orders match “${query}”` : showCompleted ? "No completed dispatch approvals." : "No orders awaiting dispatch approval."}
        />
      </div>
    </div>
  );
}
