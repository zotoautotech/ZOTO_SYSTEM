import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { formatTimestamp } from "../../lib/format";
import { listPdiItems, type PdiItemRow } from "../../lib/ordersApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";
import { openAttachment } from "../../lib/attachments";

/** PDI queue, item-level (one row per item, not per order) in both the pending and Completed
 * toggle states — Timestamp/Part Name/Customer Name/Buyer GSTIN No./Quantity/Unit/PDI Date/
 * PDI Attachment/PDI Remarks, matching the old CRR reference view. Row click still opens the
 * order-level detail page (the PDI form itself submits at the order level, one row per item
 * gets appended on save) — see GET /orders/pdi/items (Backend/src/routes/stageRoutes.ts). */
export function PdiList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pdiItems", showCompleted],
    queryFn: () => listPdiItems(showCompleted ? "COMPLETED" : undefined),
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
    const matchesSearch = !normalizedQuery || [row.ORDER_ID, row.CUSTOMER_NAME, row.PART_NAME, row.BUYER_GSTIN].some(
      (value) => (value || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesCustomer && matchesSearch;
  });

  const columns: Column<PdiItemRow>[] = [
    { key: "timestamp", header: "Timestamp", render: (row) => (row.CREATED_AT ? formatTimestamp(row.CREATED_AT) : "—") },
    { key: "partName", header: "Part Name", render: (row) => row.PART_NAME || "—" },
    { key: "customer", header: "Customer Name", render: (row) => row.CUSTOMER_NAME || "—" },
    { key: "gstin", header: "Buyer GSTIN No.", render: (row) => row.BUYER_GSTIN || "—" },
    { key: "qty", header: "Quantity", render: (row) => row.QTY || "—" },
    { key: "unit", header: "Unit", render: (row) => row.UOM || "—" },
    { key: "pdiDate", header: "PDI Date", render: (row) => row.PDI_DATE || "—" },
    {
      key: "pdiAttachment",
      header: "PDI Attachment",
      render: (row) =>
        row.PDI_ATTACHMENT_URL ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openAttachment(row.PDI_ATTACHMENT_URL);
            }}
            style={{ color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            View
          </button>
        ) : (
          "—"
        ),
    },
    { key: "pdiRemarks", header: "PDI Remarks", render: (row) => row.PDI_REMARKS || "—" },
  ];

  useSetHeaderActions(
    <button
      className="btn btn-primary"
      onClick={() => setShowCompleted((current) => !current)}
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {showCompleted ? "Showing Completed" : "Completed…"}
    </button>
  );

  const emptyMessage = isLoading
    ? "Loading…"
    : normalizedQuery
    ? `No items match “${query}”`
    : showCompleted
    ? "No completed PDI records."
    : "No orders awaiting PDI.";

  if (isMobile) {
    return (
      <div>
        <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
        <div style={{ padding: "8px 0 24px" }}>
          {filtered.map((row) => (
            <button
              key={row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NAME}`}
              onClick={() => navigate(`/modules/pdi/${row.ORDER_ID}`)}
              className="card"
              style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 10, color: "var(--color-text)", cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontWeight: 700 }}>{row.CUSTOMER_NAME || "Customer not set"}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{row.CREATED_AT ? formatTimestamp(row.CREATED_AT) : "—"}</span>
              </div>
              <div style={{ marginTop: 8 }}>{row.PART_NAME || "—"}</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>
                {row.ORDER_ID} · Qty {row.QTY || "—"} {row.UOM}
              </div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && <p className="text-muted">{emptyMessage}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NAME}`}
          onRowClick={(row) => navigate(`/modules/pdi/${row.ORDER_ID}`)}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}
