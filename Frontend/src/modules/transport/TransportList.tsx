import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TripQueueList } from "../../components/stage/TripQueueList";
import { CreateTripModal } from "./CreateTripModal";
import { listEligibleItems } from "../../lib/tripsApi";
import { formatTimestamp } from "../../lib/format";

/** Read-only visibility table of PDI-completed order items now waiting to be picked up in
 * "Arrange Vehicle" (STATUS === "PRE TRANSPORT COMPLETED") — matches the old CRR "Pending
 * Transport" reference view's Timestamp/CUST ID/Customer Name/Part No./Part Name/Quantity/
 * Unit columns. Balance Quantity/NUG/Packing Type from that same reference came from the
 * now-removed Pre Transport stage's manual entry and are intentionally left out, not
 * fabricated. */
function EligibleItemsTable() {
  const { data: items = [], isLoading } = useQuery({ queryKey: ["transportEligibleItems"], queryFn: listEligibleItems });

  if (isLoading) return null;
  if (items.length === 0) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20, overflowX: "auto" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Awaiting Transport ({items.length} items)</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}>
            <th style={{ padding: "6px 8px" }}>Timestamp</th>
            <th style={{ padding: "6px 8px" }}>CUST ID</th>
            <th style={{ padding: "6px 8px" }}>Customer Name</th>
            <th style={{ padding: "6px 8px" }}>Part No.</th>
            <th style={{ padding: "6px 8px" }}>Part Name</th>
            <th style={{ padding: "6px 8px" }}>Quantity</th>
            <th style={{ padding: "6px 8px" }}>Unit</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NO}`} style={{ borderTop: "1px solid var(--color-border)" }}>
              <td style={{ padding: "6px 8px" }}>{row.CREATED_AT ? formatTimestamp(row.CREATED_AT) : "—"}</td>
              <td style={{ padding: "6px 8px" }}>{row.CUST_ID || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{row.CUSTOMER_NAME || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{row.PART_NO || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{row.PART_NAME || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{row.QTY || "—"}</td>
              <td style={{ padding: "6px 8px" }}>{row.UOM || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The "Transport" module itself: trips still open for vehicle arrangement / order
 * attachment (Status="OPEN"). The other 6 Transport-family modules reuse TripQueueList
 * directly (see App.tsx) since they don't need the create-trip action. */
export function TransportList() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <EligibleItemsTable />
      <TripQueueList moduleKey="transport" label="Transport" prevStatus="OPEN" onCreateNew={() => setShowCreate(true)} />
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
