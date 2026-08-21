import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "../../components/DataTable";
import { getTrip, type TripDispatchRow, type TripItemDispatchRow, type TripTaxInvoiceItemRow } from "../../lib/tripsApi";
import { formatTimestamp, formatCurrency } from "../../lib/format";

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

// Matches TripDetail.tsx's own "All Products of this Tax Invoice" TableCard columns exactly —
// this is that same card's Expand target, just for the tax-invoice stage specifically.
const TAX_INVOICE_ITEM_COLUMNS: Column<TripTaxInvoiceItemRow>[] = [
  { key: "partName", header: "Part Name", render: (row) => row.partName || "—" },
  { key: "qty", header: "Qty", render: (row) => row.qty || "—" },
  { key: "unit", header: "UOM", render: (row) => row.unit || "—" },
  { key: "price", header: "Price", render: (row) => formatCurrency(row.price) },
  { key: "basicAmount", header: "Basic Amount", render: (row) => formatCurrency(row.basicAmount) },
  { key: "taxAmount", header: "Tax Amount", render: (row) => formatCurrency(row.taxAmount) },
  { key: "totalAmount", header: "Total Amount", render: (row) => formatCurrency(row.totalAmount) },
  { key: "remarks", header: "Remarks", render: (row) => row.remarks || "—" },
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
      ) : moduleKey === "tax-invoice" ? (
        <DataTable
          columns={TAX_INVOICE_ITEM_COLUMNS}
          rows={data.taxInvoiceItems}
          getRowKey={(row) => `${row.partName}-${row.qty}-${row.price}`}
        />
      ) : (
        <DataTable columns={ITEM_COLUMNS} rows={data.items} getRowKey={(row) => `${row.partNo}-${row.loadQty}-${row.loadBoxes}`} />
      )}
    </div>
  );
}
