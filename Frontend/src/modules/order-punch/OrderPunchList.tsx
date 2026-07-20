import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listOrders, type OrderRecord } from "../../lib/ordersApi";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatTimestamp } from "../../lib/format";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";

export function OrderPunchList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [filterWidth, setFilterWidth] = useState(260);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const onDividerMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const next = dragState.current.startWidth + (e.clientX - dragState.current.startX);
    setFilterWidth(Math.min(480, Math.max(160, next)));
  }, []);

  const onDividerMouseUp = useCallback(() => {
    dragState.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onDividerMouseMove);
    window.removeEventListener("mouseup", onDividerMouseUp);
  }, [onDividerMouseMove]);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { startX: e.clientX, startWidth: filterWidth };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onDividerMouseMove);
      window.addEventListener("mouseup", onDividerMouseUp);
    },
    [filterWidth, onDividerMouseMove, onDividerMouseUp]
  );

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: () => listOrders({}),
  });

  const scoped = useMemo(
    () => orders.filter((o) => (showCompleted ? o.CURRENT_STAGE !== "Punch" : o.CURRENT_STAGE === "Punch")),
    [orders, showCompleted]
  );

  const customerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of scoped) {
      const name = o.CUSTOMER_NAME || "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [scoped]);

  const byCustomer = activeCustomer ? scoped.filter((o) => o.CUSTOMER_NAME === activeCustomer) : scoped;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? byCustomer.filter((o) =>
        [o.CUSTOMER_NAME, o.ORDER_ID, o.PO_NO, o.BUYER_GSTIN].some((field) =>
          (field || "").toLowerCase().includes(q)
        )
      )
    : byCustomer;

  const columns: Column<OrderRecord>[] = [
    { key: "status", header: "Status", render: (o) => <StatusBadge status={o.STATUS} /> },
    { key: "timestamp", header: "Timestamp", render: (o) => formatTimestamp(o.CREATED_AT) },
    { key: "tally", header: "Tally", render: () => "Tally 1 (Registered)" },
    { key: "orderType", header: "Order Type", render: (o) => o.ORDER_TYPE },
    {
      key: "paymentType",
      header: "Payment Type",
      render: (o) => (o.PAYMENT_TYPE === "Advance" ? `Advance (${o.ADVANCE_PCT}%)` : o.PAYMENT_TYPE),
    },
    { key: "customerName", header: "Customer Name", render: (o) => o.CUSTOMER_NAME },
    { key: "gstin", header: "Buyer GSTIN No.", render: (o) => o.BUYER_GSTIN },
    { key: "total", header: "Total Amount", render: (o) => `₹${Number(o.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}` },
  ];

  useSetHeaderActions(
    <>
      <button
        aria-label="New"
        onClick={() => navigate("/modules/punch-order/new")}
        style={{
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-bg)",
          color: "var(--color-primary)",
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        +
      </button>
      <button
        className="btn btn-primary"
        onClick={() => setShowCompleted((s) => !s)}
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {showCompleted ? "Showing Completed" : "Completed…"}
      </button>
      <button
        aria-label="Filter"
        style={{
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-bg)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
      </button>
      <button
        aria-label="Select"
        style={{
          width: 38,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-bg)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </svg>
      </button>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 128px)" }}>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "stretch",
          flex: 1,
          minHeight: 0,
        }}
      >
        <CustomerFilterPanel
          customers={customerCounts}
          active={activeCustomer}
          onSelect={setActiveCustomer}
          width={filterWidth}
        />
        {!isMobile && (
          <div
            onMouseDown={onDividerMouseDown}
            onDoubleClick={() => setFilterWidth(260)}
            title="Drag to resize"
            style={{
              width: 5,
              marginLeft: -2,
              marginRight: -2,
              cursor: "col-resize",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ width: 1, height: "100%", background: "var(--color-border)", margin: "0 auto" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DataTable
            columns={columns}
            rows={filtered}
            onRowClick={(o) => navigate(`/modules/punch-order/${o.ORDER_ID}`)}
            emptyMessage={isLoading ? "Loading…" : q ? `No orders match "${query}"` : "No records"}
          />
        </div>
      </div>
    </div>
  );
}
