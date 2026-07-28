import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatTimestamp } from "../../lib/format";
import {
  listDispatchApprovals,
  listDispatchApprovalItems,
  type OrderRecord,
  type DispatchApprovalItemRow,
} from "../../lib/ordersApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";

/** Queue of orders confirmed in SO Confirmation, now awaiting Dispatch Approval. The pending
 * view is item-level (SO Confirmation Time/Customer/Part Name/Order Qty/Available Stock/
 * Short/Excess Quantity — one row per item, matching the old CRR reference table) since
 * Available Stock/Short/Excess Quantity are per-item; Completed stays the order-level table
 * (same pattern as Sale Order/SO Confirmation) since those columns don't apply there. */
export function DispatchApprovalList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["dispatchApprovals", showCompleted],
    queryFn: () => listDispatchApprovals(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });
  const { data: itemRows = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["dispatchApprovals", "items"],
    queryFn: listDispatchApprovalItems,
    enabled: !showCompleted,
  });

  const isLoading = showCompleted ? ordersLoading : itemsLoading;

  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    const source: { CUSTOMER_NAME?: string }[] = showCompleted ? orders : itemRows;
    for (const row of source) {
      const name = row.CUSTOMER_NAME || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [orders, itemRows, showCompleted]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesCustomer = !activeCustomer || order.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [
      order.ORDER_ID, order.PO_NO, order.CUSTOMER_NAME, order.BUYER_GSTIN,
    ].some((value) => (value || "").toLowerCase().includes(normalizedQuery));
    return matchesCustomer && matchesSearch;
  });
  const filteredItems = itemRows.filter((row) => {
    const matchesCustomer = !activeCustomer || row.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [row.ORDER_ID, row.CUSTOMER_NAME, row.PART_NAME].some((value) =>
      (value || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesCustomer && matchesSearch;
  });

  const orderColumns: Column<OrderRecord>[] = [
    { key: "status", header: "Status", render: (order) => <StatusBadge status={order.STATUS || "PENDING"} /> },
    { key: "timestamp", header: "Timestamp", render: (order) => formatTimestamp(order.CREATED_AT) },
    { key: "orderType", header: "Order Type", render: (order) => order.ORDER_TYPE || "—" },
    { key: "payment", header: "Payment Type", render: (order) => order.PAYMENT_TYPE || "—" },
    { key: "customer", header: "Customer Name", render: (order) => order.CUSTOMER_NAME || "—" },
    { key: "gstin", header: "Buyer GSTIN No.", render: (order) => order.BUYER_GSTIN || "—" },
    { key: "total", header: "Total Amount", render: (order) => `₹${Number(order.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}` },
  ];

  const itemColumns: Column<DispatchApprovalItemRow>[] = [
    { key: "soConfTime", header: "SO Confirmation Time", render: (row) => (row.SO_CONFIRMATION_TIME ? formatTimestamp(row.SO_CONFIRMATION_TIME) : "—") },
    { key: "customer", header: "Customer Name", render: (row) => row.CUSTOMER_NAME || "—" },
    { key: "partName", header: "Part Name", render: (row) => row.PART_NAME || "—" },
    { key: "orderQty", header: "Order Quantity", render: (row) => (row.ORDER_QTY ? `${row.ORDER_QTY} ${row.UOM || ""}`.trim() : "—") },
    // Decided by the doer when they actually submit the approval, not known beforehand.
    { key: "availableStock", header: "Available Stock Quantity", render: () => "—" },
    { key: "shortQty", header: "Short Quantity", render: () => "—" },
    { key: "excessQty", header: "Excess Quantity", render: () => "—" },
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
          {showCompleted
            ? filteredOrders.map((order) => (
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
              ))
            : filteredItems.map((row) => (
                <button
                  key={row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NAME}`}
                  onClick={() => navigate(`/modules/dispatch-approval/${row.ORDER_ID}/items/${row.ITEM_ID}`)}
                  className="card"
                  style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 10, color: "var(--color-text)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontWeight: 700 }}>{row.CUSTOMER_NAME || "Customer not set"}</span>
                    <span className="text-muted" style={{ fontSize: 12 }}>{row.SO_CONFIRMATION_TIME ? formatTimestamp(row.SO_CONFIRMATION_TIME) : "—"}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>{row.PART_NAME || "—"}</div>
                  <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>
                    {row.ORDER_ID} · Qty {row.ORDER_QTY || "—"} {row.UOM}
                  </div>
                </button>
              ))}
          {!isLoading && showCompleted && filteredOrders.length === 0 && <p className="text-muted">No completed dispatch approvals.</p>}
          {!isLoading && !showCompleted && filteredItems.length === 0 && <p className="text-muted">No orders awaiting dispatch approval.</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        {showCompleted ? (
          <DataTable
            columns={orderColumns}
            rows={filteredOrders}
            getRowKey={(order) => order.ORDER_ID}
            onRowClick={(order) => navigate(`/modules/dispatch-approval/${order.ORDER_ID}`)}
            emptyMessage={isLoading ? "Loading…" : normalizedQuery ? `No orders match “${query}”` : "No completed dispatch approvals."}
          />
        ) : (
          <DataTable
            columns={itemColumns}
            rows={filteredItems}
            getRowKey={(row) => row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NAME}`}
            onRowClick={(row) => navigate(`/modules/dispatch-approval/${row.ORDER_ID}/items/${row.ITEM_ID}`)}
            emptyMessage={isLoading ? "Loading…" : normalizedQuery ? `No items match “${query}”` : "No orders awaiting dispatch approval."}
          />
        )}
      </div>
    </div>
  );
}
