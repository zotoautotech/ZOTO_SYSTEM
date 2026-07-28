import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { listEligibleItems, type EligibleItemRow } from "../../lib/tripsApi";
import { formatTimestamp } from "../../lib/format";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";
import { CreateTripModal } from "./CreateTripModal";

/** "Pending Transport" (matches the old CRR reference view exactly) — item-level, one row
 * per item, with a customer filter sidebar and a "Completed Transport" toggle instead of the
 * generic trip-status list. Pending reads live ORDER_PUNCH.STATUS === "PRE TRANSPORT
 * COMPLETED"; Completed reads Transport_Products directly (see tripRoutes.ts) so an order
 * that's since progressed even further doesn't vanish from this view. Balance Quantity/
 * Balance BOX Quantity/NUG/BOX Quantity/Packing Type from the reference came from the now-
 * removed Pre Transport stage's own manual entry and are intentionally left out, not
 * fabricated — "Quantity" here is the item's own order quantity, not a tracked balance. */
export function TransportList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["transportEligibleItems", showCompleted],
    queryFn: () => listEligibleItems(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });

  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of items) {
      const name = row.CUSTOMER_NAME || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [items]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = items.filter((row) => {
    const matchesCustomer = !activeCustomer || row.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [row.ORDER_ID, row.CUSTOMER_NAME, row.PART_NAME, row.PART_NO].some(
      (value) => (value || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesCustomer && matchesSearch;
  });

  const columns: Column<EligibleItemRow>[] = [
    { key: "timestamp", header: "Timestamp", render: (row) => (row.CREATED_AT ? formatTimestamp(row.CREATED_AT) : "—") },
    { key: "custId", header: "CUST ID", render: (row) => row.CUST_ID || "—" },
    { key: "customer", header: "Customer Name", render: (row) => row.CUSTOMER_NAME || "—" },
    { key: "qty", header: "Quantity", render: (row) => row.QTY || "—" },
    { key: "unit", header: "Unit", render: (row) => row.UOM || "—" },
    { key: "partNo", header: "Part No.", render: (row) => row.PART_NO || "—" },
    { key: "partName", header: "Part Name", render: (row) => row.PART_NAME || "—" },
    { key: "status", header: "Status", render: (row) => row.STATUS_LABEL || "—" },
  ];

  useSetHeaderActions(
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        className="btn"
        title="Completed Transport"
        aria-label="Completed Transport"
        onClick={() => setShowCompleted((current) => !current)}
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {showCompleted ? "Showing Completed Transport" : "Completed Transport"}
      </button>
      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
        + Arrange Vehicle
      </button>
    </div>
  );

  const emptyMessage = isLoading
    ? "Loading…"
    : normalizedQuery
    ? `No items match “${query}”`
    : showCompleted
    ? "No completed transport records."
    : "No orders awaiting transport.";

  const table = isMobile ? (
    <div>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ padding: "8px 0 24px" }}>
        {filtered.map((row) => (
          <div
            key={row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NO}`}
            className="card"
            style={{ padding: 14, marginBottom: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontWeight: 700 }}>{row.CUSTOMER_NAME || "Customer not set"}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>{row.CREATED_AT ? formatTimestamp(row.CREATED_AT) : "—"}</span>
            </div>
            <div style={{ marginTop: 8 }}>{row.PART_NAME || "—"}</div>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>
              {row.CUST_ID} · Qty {row.QTY || "—"} {row.UOM}
            </div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 5 }}>{row.STATUS_LABEL}</div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && <p className="text-muted">{emptyMessage}</p>}
      </div>
    </div>
  ) : (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NO}`}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );

  return (
    <div>
      {table}
      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={(transportId) => {
            setShowCreate(false);
            navigate(`/modules/transport/${transportId}`);
          }}
        />
      )}
    </div>
  );
}
