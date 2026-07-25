import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "../DataTable";
import { StatusBadge } from "../StatusBadge";
import { formatTimestamp } from "../../lib/format";
import { listTrips, type TripRecord } from "../../lib/tripsApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";

/** One list component for the "Transport" screen (Status=OPEN, create+attach) and every
 * TRIP_STAGES queue (Status=that stage's prevStatus) — same Completed-toggle pattern as
 * every other queue in the app, just trip-shaped rows instead of order-shaped ones. */
export function TripQueueList({
  moduleKey,
  label,
  prevStatus,
  nextStatus,
  onCreateNew,
}: {
  moduleKey: string;
  label: string;
  prevStatus: string;
  nextStatus?: string;
  onCreateNew?: () => void;
}) {
  const navigate = useNavigate();
  const { query } = useSearch();
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["trips", moduleKey, showCompleted],
    queryFn: () => listTrips(showCompleted && nextStatus ? nextStatus : prevStatus),
    placeholderData: keepPreviousData,
  });

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = trips.filter((t) => {
    if (!normalizedQuery) return true;
    return [t.Transport_ID, t["Vehicle No."], t["Transporter Name"], t["Driver Name"]].some((v) =>
      (v || "").toLowerCase().includes(normalizedQuery)
    );
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

  return (
    <div style={{ minHeight: "calc(100vh - 128px)" }}>
      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(t) => t.Transport_ID}
        onRowClick={(t) => navigate(`/modules/${moduleKey}/${t.Transport_ID}`)}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
