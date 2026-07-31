import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "../../components/DataTable";
import { getTrip, type TripDispatchRow, type TripItemDispatchRow } from "../../lib/tripsApi";
import { formatTimestamp } from "../../lib/format";

const DISPATCH_COLUMNS: Column<TripDispatchRow>[] = [
  { key: "customer", header: "Cutomer Name", render: (row) => row.customerName || row.orderId },
  { key: "soId", header: "Transport_SO_ID", render: (row) => row.transportSoId || "—" },
  { key: "timestamp", header: "Timestamp", render: (row) => (row.timestamp ? formatTimestamp(row.timestamp) : "—") },
];

const ITEM_COLUMNS: Column<TripItemDispatchRow>[] = [
  { key: "partNo", header: "Part No.", render: (row) => row.partNo || "—" },
  { key: "partName", header: "Part Name", render: (row) => row.partName || "—" },
  { key: "totalQty", header: "Total Qty of Order", render: (row) => row.totalQtyOfOrder || "—" },
  { key: "qty", header: "Quantity", render: (row) => row.loadQty || "—" },
  { key: "unit", header: "Unit", render: (row) => row.unit || "—" },
  { key: "boxes", header: "Load Boxes", render: (row) => row.loadBoxes || "—" },
];

/** Full-page "Expand" view for TripDetail.tsx's S.O Dispatches / S.O Items Dispatches table
 * cards — same expand pattern as OrderDetail.tsx's "Order Punch Parts" -> OrderItemsView.tsx. */
export function TripSubTableView({ kind }: { kind: "dispatches" | "items" }) {
  const { transportId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const moduleKey = location.pathname.split("/")[2];

  const { data, isLoading } = useQuery({
    queryKey: ["trip", transportId],
    queryFn: () => getTrip(transportId!),
    enabled: !!transportId,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Trip not found</p>;

  return (
    <div>
      <button onClick={() => navigate(`/modules/${moduleKey}/${transportId}`)} className="btn" style={{ marginBottom: 16 }}>
        ‹ Back
      </button>
      {kind === "dispatches" ? (
        <DataTable columns={DISPATCH_COLUMNS} rows={data.dispatches} getRowKey={(row) => row.transportSoId || row.orderId} />
      ) : (
        <DataTable columns={ITEM_COLUMNS} rows={data.items} getRowKey={(row) => `${row.partNo}-${row.loadQty}-${row.loadBoxes}`} />
      )}
    </div>
  );
}
