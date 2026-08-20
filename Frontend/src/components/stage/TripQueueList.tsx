import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../DataTable";
import { StatusBadge } from "../StatusBadge";
import { CustomerFilterPanel } from "../CustomerFilterPanel";
import { formatTimestamp } from "../../lib/format";
import { listTrips, listTripItems, listStageRows, type TripRecord } from "../../lib/tripsApi";
import type { StageColumn } from "../../lib/tripStages";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions, useSetHeaderLeft } from "../../lib/headerActions";
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
  pendingColumns,
  pendingStatusLabel,
  bulkForm,
  bulkFormLabel,
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
  /** Replaces the default vehicle-focused pending column set with this stage's own — see
   * tripStages.ts for details. */
  pendingColumns?: StageColumn[];
  /** Shown in the pending (non-Completed) trip table's Status column instead of the raw
   * TRANSPORT.Status value — see tripStages.ts for why this needs to be per-stage. */
  pendingStatusLabel?: string;
  /** When given (together with pendingItemColumns), the item-level pending view also gets a
   * bulk-select mode — a "Select" header action, checkboxes, and a button that opens this
   * component with the selected raw item rows. Only wired up for stages that actually have a
   * bulk form (currently just transport-reached) — every other trip stage leaves this unset
   * and gets no select mode at all. */
  bulkForm?: React.ComponentType<{ items: Record<string, string>[]; onClose: () => void; onSaved: () => void }>;
  bulkFormLabel?: string;
  onCreateNew?: () => void;
}) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { query } = useSearch();
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeParty, setActiveParty] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkForm, setShowBulkForm] = useState(false);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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

  // Party (customer) sidebar, matching the old CRR reference's own Pending Tax Invoice view —
  // the trip-level list now carries a "Customer Name" per trip (joined server-side off the
  // first attached order, since TRANSPORT itself has no customer column) for exactly this.
  const partyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of trips) {
      const name = row["Customer Name"] || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [trips]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = trips.filter((t) => {
    const matchesParty = !activeParty || (t["Customer Name"] || "Unknown") === activeParty;
    // "Order IDs" is a space-joined list of every order attached to the trip (backend join,
    // see tripRoutes.ts) — lets a doer search a Punch/Sale Order id and land on the trip
    // carrying it, not just Transport_ID/vehicle/driver identity.
    const matchesSearch = !normalizedQuery || [t.Transport_ID, t["Vehicle No."], t["Transporter Name"], t["Driver Name"], t["Customer Name"], t["Order IDs"]].some((v) =>
      (v || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesParty && matchesSearch;
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
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.Status || "OPEN"} label={pendingStatusLabel} /> },
    { key: "timestamp", header: "Timestamp", render: (t) => formatTimestamp(t.Timestamp) },
    { key: "transportId", header: "Transport ID", render: (t) => t.Transport_ID },
    { key: "customerName", header: "Customer Name", render: (t) => t["Customer Name"] || "—" },
    ...(pendingColumns ?? []).map((c) => ({
      key: c.field,
      header: c.header,
      render: (t: TripRecord) => t[c.field] || "—",
    })),
    // Default vehicle columns — skipped when a stage supplies its own pendingColumns (Tax
    // Invoice), so its table shows its own field set instead of these generic ones too.
    ...(pendingColumns
      ? []
      : [
          { key: "vehicleArrangeFor", header: "Vehicle Arrange for", render: (t: TripRecord) => t["Vehicle Arrange for"] || "—" },
          { key: "sendThrough", header: "Send Through", render: (t: TripRecord) => t["Send Through"] || "—" },
          { key: "transporterName", header: "Transporter Name", render: (t: TripRecord) => t["Transporter Name"] || "—" },
          { key: "vehicleType", header: "Vehicle type", render: (t: TripRecord) => t["Vehicle type"] || "—" },
          { key: "vehicleNo", header: "Vehicle No.", render: (t: TripRecord) => t["Vehicle No."] || "—" },
          { key: "driverName", header: "Driver Name", render: (t: TripRecord) => t["Driver Name"] || "—" },
        ]),
  ];

  function itemRowKey(r: Record<string, string>) {
    return r.Transport_Pd_ID || `${r.Transport_ID}-${r.ITEM_ID}`;
  }
  const selectedItems = filteredPendingItems.filter((r) => selectedIds.has(itemRowKey(r)));

  function handleBulkSaved() {
    queryClient.invalidateQueries({ queryKey: ["trips", moduleKey] });
    queryClient.invalidateQueries({ queryKey: ["tripItems", moduleKey] });
  }

  function closeBulkFormAndExit() {
    setShowBulkForm(false);
    exitSelectMode();
  }

  const canBulkSelect = !!bulkForm && itemLevelPending;

  useSetHeaderLeft(
    canBulkSelect && selectMode ? (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={exitSelectMode}
          aria-label="Cancel selection"
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
          ✕
        </button>
        <span style={{ fontWeight: 700 }}>{selectedIds.size} Selected</span>
      </div>
    ) : null
  );

  const headerActions = useMemo(
    () =>
      canBulkSelect && selectMode ? (
        <button
          className="btn btn-primary"
          onClick={() => setShowBulkForm(true)}
          disabled={selectedIds.size === 0}
          style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
        >
          {bulkFormLabel ?? "Bulk Form"}
        </button>
      ) : (
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
          {canBulkSelect && (
            <button
              aria-label="Select"
              onClick={() => setSelectMode(true)}
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
          )}
        </div>
      ),
    [onCreateNew, nextStatus, showCompleted, canBulkSelect, selectMode, selectedIds.size, bulkFormLabel]
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
          <CustomerFilterPanel customers={partyOptions} active={activeParty} onSelect={setActiveParty} />
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
            getRowKey={itemRowKey}
            onRowClick={(r) => r.Transport_ID && navigate(`/modules/${moduleKey}/${r.Transport_ID}`)}
            emptyMessage={emptyMessage}
            selectable={canBulkSelect && selectMode}
            selectedKeys={selectedIds}
            onToggleRow={toggleRow}
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
      {showBulkForm &&
        bulkForm &&
        (() => {
          const BulkForm = bulkForm;
          return <BulkForm items={selectedItems} onClose={closeBulkFormAndExit} onSaved={handleBulkSaved} />;
        })()}
    </div>
  );
}
