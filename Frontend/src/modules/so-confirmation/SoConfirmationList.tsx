import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatTimestamp } from "../../lib/format";
import { listSaleOrders, type OrderRecord } from "../../lib/ordersApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";

/** Queue of Sale Orders that were saved and are ready for SO Confirmation. */
export function SoConfirmationList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: saleOrders = [], isLoading } = useQuery({
    queryKey: ["saleOrders"],
    queryFn: listSaleOrders,
  });

  const scoped = useMemo(
    () => saleOrders.filter((order) => (showCompleted ? order.STATUS === "COMPLETED" : order.STATUS !== "COMPLETED")),
    [saleOrders, showCompleted]
  );

  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of scoped) {
      const name = order.CUSTOMER_NAME || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [scoped]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = scoped.filter((order) => {
    const matchesCustomer = !activeCustomer || order.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [
      order.SALE_ORDER_ID, order.SO_NO, order.ORDER_ID, order.CUSTOMER_NAME, order.BUYER_GSTIN,
    ].some((value) => (value || "").toLowerCase().includes(normalizedQuery));
    return matchesCustomer && matchesSearch;
  });

  const columns: Column<OrderRecord>[] = [
    { key: "status", header: "Status", render: (order) => <StatusBadge status={order.STATUS || "PENDING"} /> },
    { key: "timestamp", header: "Timestamp", render: (order) => formatTimestamp(order.CREATED_AT) },
    { key: "soNo", header: "Sale Order No.", render: (order) => order.SO_NO || "—" },
    { key: "soDate", header: "Sale Order Date", render: (order) => order.SO_DATE || "—" },
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
              key={order.SALE_ORDER_ID || order.ORDER_ID}
              onClick={() => navigate(`/modules/so-confirmation/${order.ORDER_ID}`)}
              className="card"
              style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 10, color: "var(--color-text)", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <StatusBadge status={order.STATUS || "PENDING"} />
                <span className="text-muted" style={{ fontSize: 12 }}>{formatTimestamp(order.CREATED_AT)}</span>
              </div>
              <div style={{ fontWeight: 700, marginTop: 10 }}>{order.CUSTOMER_NAME || "Customer not set"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>{order.SO_NO || "Sale order number not set"}</div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && <p className="text-muted">{showCompleted ? "No completed confirmations." : "No saved sale orders awaiting confirmation."}</p>}
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
          getRowKey={(order) => order.SALE_ORDER_ID || order.ORDER_ID}
          onRowClick={(order) => navigate(`/modules/so-confirmation/${order.ORDER_ID}`)}
          emptyMessage={isLoading ? "Loading…" : normalizedQuery ? `No saved sale orders match “${query}”` : showCompleted ? "No completed confirmations." : "No saved sale orders awaiting confirmation."}
        />
      </div>
    </div>
  );
}
