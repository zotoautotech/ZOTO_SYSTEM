import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listOrders, type OrderRecord } from "../../lib/ordersApi";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatTimestamp } from "../../lib/format";

export function OrderPunchList() {
  const navigate = useNavigate();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);

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

  const filtered = activeCustomer ? scoped.filter((o) => o.CUSTOMER_NAME === activeCustomer) : scoped;

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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate("/modules")}
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
            }}
          >
            ‹
          </button>
          <h2 style={{ fontWeight: 500, margin: 0 }}>Pending Order Punch</h2>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={showCompleted ? "btn btn-primary" : "btn"}
            onClick={() => setShowCompleted((s) => !s)}
          >
            ✓ {showCompleted ? "Showing Completed" : "Completed…"}
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/modules/punch-order/new")}>
            + New
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <CustomerFilterPanel customers={customerCounts} active={activeCustomer} onSelect={setActiveCustomer} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <DataTable
            columns={columns}
            rows={filtered}
            onRowClick={(o) => navigate(`/modules/punch-order/${o.ORDER_ID}`)}
            emptyMessage={isLoading ? "Loading…" : "No records"}
          />
        </div>
      </div>
    </div>
  );
}
