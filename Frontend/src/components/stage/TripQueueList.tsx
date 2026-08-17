import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../DataTable";
import { StatusBadge } from "../StatusBadge";
import { CustomerFilterPanel } from "../CustomerFilterPanel";
import { formatTimestamp } from "../../lib/format";
import { listTrips, listTripItems, listStageRows, type TripRecord } from "../../lib/tripsApi";
import type { StageColumn } from "../../lib/tripStages";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";

/** One list component for the "Transport" screen (Status=OPEN, create+attach) and every
 * TRIP_STAGES queue (Status=that stage's prevStatus) — same Completed-toggle pattern as
 * every other queue in the app, just trip-shaped rows instead of order-shaped ones. Also has
 * a "Send Through" filter sidebar (Courier/Cust. Vehicle/Local Vehicle/Porter/Transporter),
 * same pattern as TransportList.tsx's own Completed Transport view, matching the old CRR
 * reference's trip-level queues. */
export function TripQueueList({
  moduleKey,
  label,
  prevStatus,
  nextStatus,
  completionTab,
  stageTab,
  completedColumns,
  pendingItemColumns,
  onCreateNew,
}: {
  moduleKey: string;
  label: string;
  prevStatus: string;
  nextStatus?: string;
  /** Set only for Stock Release / Tax Invoice — see tripStages.ts for why. */
  completionTab?: string;
  /** This stage's own sheet tab. When given (with completedColumns), the Completed toggle
   * shows THIS stage's own recorded rows instead of the generic trip table. */
  stageTab?: string;
  completedColumns?: StageColumn[];
  /** When given, the PENDING view goes item-level too — see tripStages.ts. */
  pendingItemColumns?: StageColumn[];
  onCreateNew?: () => void;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { query } = useSearch();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeSendThrough, setActiveSendThrough] = useState<string | null>(null);
  // Each stage's Completed view reads its OWN tab (Stock Release's released parts, Tax
  // Invoice's invoice numbers, LR's LR No./charges…) rather than showing the same generic
  // trip columns at every stage. The pending view stays trip-level — that's genuinely what
  // is pending: a trip awaiting this stage's form.
  const ownCompletedView = showCompleted && !!stageTab && !!completedColumns?.length;
  // Item-level pending only applies while showing PENDING — the Completed toggle still shows
  // either this stage's own recorded rows (ownCompletedView) or the generic trip table.
  const itemLevelPending = !!pendingItemColumns?.length && !showCompleted;
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["trips", moduleKey, showCompleted],
    queryFn: () =>
      completionTab
        ? showCompleted
          ? listTrips("ALL", { includeIfInTab: completionTab })
          : listTrips(prevStatus, { excludeIfInTab: completionTab })
        : listTrips(showCompleted && nextStatus ? nextStatus : prevStatus),
    placeholderData: keepPreviousData,
    enabled: !ownCompletedView && !itemLevelPending,
  });
  const { data: stageRows = [], isLoading: stageRowsLoading } = useQuery({
    queryKey: ["stageRows", stageTab],
    queryFn: () => listStageRows(stageTab!),
    enabled: ownCompletedView,
  });
  const { data: pendingItems = [], isLoading: pendingItemsLoading } = useQuery({
    queryKey: ["tripItems", moduleKey],
    queryFn: () => listTripItems(prevStatus, { excludeIfInTab: completionTab }),
    placeholderData: keepPreviousData,
    enabled: itemLevelPending,
  });
  const isLoading = ownCompletedView ? stageRowsLoading : itemLevelPending ? pendingItemsLoading : tripsLoading;

  const sendThroughOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of trips) {
      const name = row["Send Through"] || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [trips]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = trips.filter((t) => {
    const matchesSendThrough = !activeSendThrough || (t["Send Through"] || "Unknown") === activeSendThrough;
    const matchesSearch = !normalizedQuery || [t.Transport_ID, t["Vehicle No."], t["Transporter Name"], t["Driver Name"]].some((v) =>
      (v || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesSendThrough && matchesSearch;
  });

  // Item-level pending view filters by Customer Name instead of Send Through — matches the
  // Transport stage's own item-level pending view (TransportList.tsx), since that's the
  // customer-facing identity a doer actually filters by here, not the vehicle/transporter.
  const [activeItemCustomer, setActiveItemCustomer] = useState<string | null>(null);
  const itemCustomerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of pendingItems) {
      const name = row["Customer Name"] || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [pendingItems]);
  const filteredPendingItems = pendingItems.filter((r) => {
    const matchesCustomer = !activeItemCustomer || (r["Customer Name"] || "Unknown") === activeItemCustomer;
    const matchesSearch =
      !normalizedQuery ||
      [r["Customer Name"], r["Part No."], r["Part Name"], r.Transport_ID].some((v) =>
        (v || "").toLowerCase().includes(normalizedQuery)
      );
    return matchesCustomer && matchesSearch;
  });

  const columns: Column<TripRecord>[] = [
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.Status || "OPEN"} /> },
    { key: "timestamp", header: "Timestamp", render: (t) => formatTimestamp(t.Timestamp) },
    { key: "transportId", header: "Transport ID", render: (t) => t.Transport_ID },
    { key: "vehicleArrangeFor", header: "Vehicle Arrange for", render: (t) => t["Vehicle Arrange for"] || "—" },
    { key: "sendThrough", header: "Send Through", render: (t) => t["Send Through"] || "—" },
    { key: "transporterName", header: "Transporter Name", render: (t) => t["Transporter Name"] || "—" },
    { key: "vehicleType", header: "Vehicle type", render: (t) => t["Vehicle type"] || "—" },
    { key: "vehicleNo", header: "Vehicle No.", render: (t) => t["Vehicle No."] || "—" },
    { key: "driverName", header: "Driver Name", render: (t) => t["Driver Name"] || "—" },
  ];

  const headerActions = useMemo(
    () => (
      <div style={{ display: "flex", gap: 10 }}>
        {onCreateNew && (
          <button className="btn btn-primary" onClick={onCreateNew}>
            + Arrange Vehicle
          </button>
        )}
        {nextStatus && (
          <button className="btn" onClick={() => setShowCompleted((c) => !c)}>
            {showCompleted ? "Showing Completed" : "Completed…"}
          </button>
        )}
      </div>
    ),
    [onCreateNew, nextStatus, showCompleted]
  );
  useSetHeaderActions(headerActions);

  const emptyMessage = isLoading
    ? "Loading…"
    : normalizedQuery
    ? `No trips match "${query}"`
    : showCompleted
    ? `No completed ${label.toLowerCase()} trips.`
    : `No trips awaiting ${label}.`;

  // On mobile, CustomerFilterPanel renders its own horizontal chip row (not a sidebar) — the
  // desktop-only `display: flex` wrapper below stretched that chip row to the full
  // `calc(100vh - 128px)` height (flex row's default `align-items: stretch`), turning it into
  // a giant blank-looking pink column and squeezing the DataTable pane to nothing. Stacking
  // instead of a row on mobile fixes both.
  // This stage's own Completed view: its own tab's rows, its own columns. Rows still link
  // back to their trip where one is identifiable — Stock Release rows carry ORDER_ID/ITEM_ID
  // rather than Transport_ID (it's the one item-level tab of the six), and LR/Delivery key
  // off Dispatch ID, so a row is only clickable when it actually has a Transport_ID.
  const stageColumns: Column<Record<string, string>>[] = [
    { key: "timestamp", header: "Timestamp", render: (r) => formatTimestamp(r.Timestamp) },
    ...(completedColumns ?? []).map((c) => ({
      key: c.field,
      header: c.header,
      render: (r: Record<string, string>) => r[c.field] || "—",
    })),
  ];
  const filteredStageRows = normalizedQuery
    ? stageRows.filter((r) =>
        stageColumns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(normalizedQuery))
      )
    : stageRows;

  // Item-level pending columns — plain literal Transport_Products headers, same shape as
  // stageColumns above. Rows still open the TRIP (Transport_ID), since this stage's own
  // action form is trip-level, not per-item — item-level here is display only.
  const itemColumns: Column<Record<string, string>>[] = [
    { key: "timestamp", header: "Timestamp", render: (r) => formatTimestamp(r.Timestamp) },
    ...(pendingItemColumns ?? []).map((c) => ({
      key: c.field,
      header: c.header,
      render: (r: Record<string, string>) => r[c.field] || "—",
    })),
  ];

  return (
    <div style={isMobile ? undefined : { display: "flex", minHeight: "calc(100vh - 128px)" }}>
      {!ownCompletedView &&
        (itemLevelPending ? (
          <CustomerFilterPanel customers={itemCustomerOptions} active={activeItemCustomer} onSelect={setActiveItemCustomer} />
        ) : (
          <CustomerFilterPanel customers={sendThroughOptions} active={activeSendThrough} onSelect={setActiveSendThrough} />
        ))}
      <div style={isMobile ? undefined : { flex: 1, minWidth: 0, borderLeft: ownCompletedView ? undefined : "1px solid var(--color-border)" }}>
        {ownCompletedView ? (
          <DataTable
            columns={stageColumns}
            rows={filteredStageRows}
            /* These tabs have no single consistent id column across all six (Stock Release
               is item-level, LR/Delivery key off Dispatch ID), so fall back through the
               plausible ones before the timestamp. */
            getRowKey={(r) => r.Stock_Pd_ID || r["LR ID"] || r["Delivery ID"] || r["Dispatch ID"] || r.Invoice_ID || r.Transport_Reach_ID || r.Transport_ID || r.Timestamp}
            onRowClick={(r) => r.Transport_ID && navigate(`/modules/${moduleKey}/${r.Transport_ID}`)}
            emptyMessage={emptyMessage}
          />
        ) : itemLevelPending ? (
          <DataTable
            columns={itemColumns}
            rows={filteredPendingItems}
            getRowKey={(r) => r.Transport_Pd_ID || `${r.Transport_ID}-${r.ITEM_ID}`}
            onRowClick={(r) => r.Transport_ID && navigate(`/modules/${moduleKey}/${r.Transport_ID}`)}
            emptyMessage={emptyMessage}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(t) => t.Transport_ID}
            onRowClick={(t) => navigate(`/modules/${moduleKey}/${t.Transport_ID}`)}
            emptyMessage={emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
