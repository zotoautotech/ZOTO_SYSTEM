import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { listEligibleItems, listTrips, type EligibleItemRow, type TripRecord } from "../../lib/tripsApi";
import { formatTimestamp } from "../../lib/format";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";
import { CreateTripModal } from "./CreateTripModal";

const TRIP_COLUMNS: Column<TripRecord>[] = [
  { key: "timestamp", header: "Timestamp", render: (row) => (row.Timestamp ? formatTimestamp(row.Timestamp) : "—") },
  { key: "customerName", header: "Customer Name", render: (row) => row["Customer Name"] || "—" },
  { key: "vehicleArrangeFor", header: "Vehicle Arrange for", render: (row) => row["Vehicle Arrange for"] || "—" },
  { key: "sendThrough", header: "Send Through", render: (row) => row["Send Through"] || "—" },
  { key: "transporterName", header: "Transporter Name", render: (row) => row["Transporter Name"] || "—" },
  { key: "vehicleType", header: "Vehicle type", render: (row) => row["Vehicle type"] || "—" },
  { key: "vehicleNo", header: "Vehicle No.", render: (row) => row["Vehicle No."] || "—" },
  { key: "vehicleSize", header: "Vehicle Size (Ft)", render: (row) => row["Vehicle Size (Ft)"] || "—" },
  { key: "driverName", header: "Driver Name", render: (row) => row["Driver Name"] || "—" },
];

/** "Pending Transport" (matches the old CRR reference view exactly) — item-level, one row
 * per item, with a customer filter sidebar; clicking a row opens the item's detail page.
 * "Completed Transport" is trip-level instead — matches the old CRR reference's own
 * "Completed Transport" list (every arranged trip, one row per trip, not per item); clicking
 * a row opens that trip's detail page (TripDetail.tsx). */
export function TransportList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [activeSendThrough, setActiveSendThrough] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["transportEligibleItems"],
    queryFn: () => listEligibleItems(),
    enabled: !showCompleted,
    placeholderData: keepPreviousData,
  });

  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["trips", "ALL"],
    queryFn: () => listTrips("ALL"),
    enabled: showCompleted,
    placeholderData: keepPreviousData,
  });

  const isLoading = showCompleted ? tripsLoading : itemsLoading;

  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of items) {
      const name = row.CUSTOMER_NAME || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [items]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((row) => {
    const matchesCustomer = !activeCustomer || row.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [row.ORDER_ID, row.CUSTOMER_NAME, row.PART_NAME, row.PART_NO].some(
      (value) => (value || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesCustomer && matchesSearch;
  });

  // Party (customer) sidebar for Completed Transport too, matching the Pending view's own
  // customer-grouped sidebar — GET /transport-trips already enriches every trip with a
  // "Customer Name" (see tripRoutes.ts's snapshotByTrip join), so no extra fetch is needed.
  const completedPartyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of trips) {
      const name = row["Customer Name"] || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [trips]);

  const filteredTrips = trips.filter((row) => {
    const matchesParty = !activeSendThrough || (row["Customer Name"] || "Unknown") === activeSendThrough;
    const matchesSearch = !normalizedQuery || [row.Transport_ID, row["Transporter Name"], row["Vehicle No."], row["Driver Name"], row["Customer Name"]].some(
      (value) => (value || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesParty && matchesSearch;
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
    ? `No records match “${query}”`
    : showCompleted
    ? "No completed transport records."
    : "No orders awaiting transport.";

  const table = showCompleted ? (
    isMobile ? (
      <div>
        <CustomerFilterPanel customers={completedPartyOptions} active={activeSendThrough} onSelect={setActiveSendThrough} />
        <div style={{ padding: "8px 0 24px" }}>
          {filteredTrips.map((row) => (
            <div
              key={row.Transport_ID}
              className="card"
              style={{ padding: 14, marginBottom: 10, cursor: "pointer" }}
              onClick={() => navigate(`/modules/transport/${row.Transport_ID}`)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontWeight: 700 }}>{row["Transporter Name"] || row["Send Through"] || "—"}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{row.Timestamp ? formatTimestamp(row.Timestamp) : "—"}</span>
              </div>
              <div style={{ marginTop: 8 }}>{row["Vehicle No."] || "—"} · {row["Vehicle type"] || "—"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>
                {row["Driver Name"] || "—"}
              </div>
            </div>
          ))}
          {!isLoading && filteredTrips.length === 0 && <p className="text-muted">{emptyMessage}</p>}
        </div>
      </div>
    ) : (
      <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
        <CustomerFilterPanel customers={completedPartyOptions} active={activeSendThrough} onSelect={setActiveSendThrough} />
        <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
          <DataTable
            columns={TRIP_COLUMNS}
            rows={filteredTrips}
            getRowKey={(row) => row.Transport_ID}
            emptyMessage={emptyMessage}
            onRowClick={(row) => navigate(`/modules/transport/${row.Transport_ID}`)}
          />
        </div>
      </div>
    )
  ) : isMobile ? (
    <div>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ padding: "8px 0 24px" }}>
        {filteredItems.map((row) => (
          <div
            key={row.DISP_CONF_ITEM_ID || row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NO}`}
            className="card"
            style={{ padding: 14, marginBottom: 10, cursor: "pointer" }}
            onClick={() => navigate(`/modules/transport/${row.ORDER_ID}/items/${row.ITEM_ID}`)}
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
        {!isLoading && filteredItems.length === 0 && <p className="text-muted">{emptyMessage}</p>}
      </div>
    </div>
  ) : (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        <DataTable
          columns={columns}
          rows={filteredItems}
          getRowKey={(row) => row.DISP_CONF_ITEM_ID || row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NO}`}
          emptyMessage={emptyMessage}
          onRowClick={(row) => navigate(`/modules/transport/${row.ORDER_ID}/items/${row.ITEM_ID}`)}
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
          onCreated={() => {
            setShowCreate(false);
            // Stay on this (Transport Pending) view rather than jumping into the trip's
            // Transport Reached screen — the doer just arranged the vehicle, they haven't
            // reached anywhere yet, and navigating there prematurely was confusing (a real
            // doer report). The just-arranged items naturally drop off this Pending list
            // (their order STATUS has moved past "PRE TRANSPORT COMPLETED") once refetched.
            queryClient.invalidateQueries({ queryKey: ["transportEligibleItems"] });
            queryClient.invalidateQueries({ queryKey: ["trips"] });
          }}
        />
      )}
    </div>
  );
}
