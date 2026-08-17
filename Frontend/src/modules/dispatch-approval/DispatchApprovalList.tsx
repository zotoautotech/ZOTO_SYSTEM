import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatTimestamp } from "../../lib/format";
import {
  listDispatchApprovals,
  listDispatchApprovalItems,
  type OrderRecord,
  type DispatchApprovalItemRow,
} from "../../lib/ordersApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions, useSetHeaderLeft } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";
import { BulkDispatchApprovalForm } from "./BulkDispatchApprovalForm";

/** Queue of orders confirmed in SO Confirmation, now awaiting Dispatch Approval. The pending
 * view is item-level (Status/SO Confirmation Time/Customer/Part Name/Order Qty/Available
 * Stock/Balance/Short/Excess Quantity — one row per item, matching the old CRR reference
 * table) since these are all per-item; Completed stays the order-level table (same pattern
 * as Sale Order/SO Confirmation) since those columns don't apply there.
 *
 * An item's order quantity can be decided across multiple rounds (e.g. 10 of 12 approved
 * today, the remaining 2 decided later) — Balance Order Quantity shrinks with each round and
 * the row only drops out of this pending list once it reaches 0. Status shows "Pending Order
 * Quantity" once at least one round has happened but balance remains, so it reads
 * differently from a genuinely untouched item. */
export function DispatchApprovalList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
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

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["dispatchApprovals", showCompleted],
    queryFn: () => listDispatchApprovals(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });
  const { data: itemRows = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["dispatchApprovals", "items"],
    queryFn: listDispatchApprovalItems,
    enabled: !showCompleted,
  });

  const isLoading = showCompleted ? ordersLoading : itemsLoading;

  const customers = useMemo(() => {
    const counts = new Map<string, number>();
    const source: { CUSTOMER_NAME?: string }[] = showCompleted ? orders : itemRows;
    for (const row of source) {
      const name = row.CUSTOMER_NAME || "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, [orders, itemRows, showCompleted]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrders = orders.filter((order) => {
    const matchesCustomer = !activeCustomer || order.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [
      order.ORDER_ID, order.PO_NO, order.CUSTOMER_NAME, order.BUYER_GSTIN,
    ].some((value) => (value || "").toLowerCase().includes(normalizedQuery));
    return matchesCustomer && matchesSearch;
  });
  const filteredItems = itemRows.filter((row) => {
    const matchesCustomer = !activeCustomer || row.CUSTOMER_NAME === activeCustomer;
    const matchesSearch = !normalizedQuery || [row.ORDER_ID, row.CUSTOMER_NAME, row.PART_NAME].some((value) =>
      (value || "").toLowerCase().includes(normalizedQuery)
    );
    return matchesCustomer && matchesSearch;
  });

  const orderColumns: Column<OrderRecord>[] = [
    { key: "status", header: "Status", render: (order) => <StatusBadge status={order.STATUS || "PENDING"} /> },
    { key: "timestamp", header: "Timestamp", render: (order) => formatTimestamp(order.CREATED_AT) },
    { key: "assignedPerson", header: "Assigned Person", render: (order) => order.SALE_STAFF_NAME || "—" },
    { key: "payment", header: "Payment Type", render: (order) => order.PAYMENT_TYPE || "—" },
    { key: "customer", header: "Customer Name", render: (order) => order.CUSTOMER_NAME || "—" },
    { key: "gstin", header: "Buyer GSTIN No.", render: (order) => order.BUYER_GSTIN || "—" },
    { key: "total", header: "Total Amount", render: (order) => `₹${Number(order.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}` },
  ];

  // "Dispatch Extended" rows stay pending (not a real decision) — once the doer's own Next
  // Extended Date arrives, flag the row red so it's obviously due for a follow-up decision.
  const today = new Date().toISOString().slice(0, 10);
  function isDueExtended(row: DispatchApprovalItemRow) {
    return row.DISPATCH_EXTENDED && !!row.NEXT_EXTENDED_DATE && row.NEXT_EXTENDED_DATE <= today;
  }

  const itemColumns: Column<DispatchApprovalItemRow>[] = [
    {
      key: "status",
      header: "Status",
      // Distinguishes "12 ordered, 10 already approved, 2 still pending" from a genuinely
      // untouched item — the row itself stays in this pending list either way (it only
      // drops off once Balance Quantity hits 0), this just flags that a round already
      // happened. Extended takes priority in display since it's the more actionable state.
      render: (row) =>
        row.DISPATCH_EXTENDED ? "Dispatch Extended" : row.PARTIALLY_DECIDED ? "Pending Order Quantity" : "Pending",
    },
    { key: "soConfTime", header: "SO Confirmation Time", render: (row) => (row.SO_CONFIRMATION_TIME ? formatTimestamp(row.SO_CONFIRMATION_TIME) : "—") },
    { key: "customer", header: "Customer Name", render: (row) => row.CUSTOMER_NAME || "—" },
    { key: "partName", header: "Part Name", render: (row) => row.PART_NAME || "—" },
    { key: "orderQty", header: "Order Quantity", render: (row) => (row.ORDER_QTY ? `${row.ORDER_QTY} ${row.UOM || ""}`.trim() : "—") },
    // Decided by the doer when they actually submit the approval, not known beforehand —
    // unlike Balance Quantity, which IS knowable ahead of time (order qty minus whatever
    // earlier rounds already decided).
    { key: "availableStock", header: "Available Stock Quantity", render: () => "—" },
    { key: "balanceQty", header: "Balance Order Quantity", render: (row) => (row.BALANCE_QTY ? `${row.BALANCE_QTY} ${row.UOM || ""}`.trim() : "—") },
    { key: "shortQty", header: "Short Quantity", render: () => "—" },
    { key: "excessQty", header: "Excess Quantity", render: () => "—" },
  ];

  function itemRowKey(row: DispatchApprovalItemRow) {
    return row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NAME}`;
  }
  const selectedItems = filteredItems.filter((row) => selectedIds.has(itemRowKey(row)));

  function handleBulkSaved() {
    for (const item of selectedItems) queryClient.invalidateQueries({ queryKey: ["order", item.ORDER_ID] });
    queryClient.invalidateQueries({ queryKey: ["dispatchApprovals"] });
  }

  useSetHeaderLeft(
    selectMode ? (
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

  useSetHeaderActions(
    selectMode ? (
      <button
        className="btn btn-primary"
        onClick={() => setShowBulkForm(true)}
        disabled={selectedIds.size === 0}
        style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
      >
        Bulk Dispatch Approval Form
      </button>
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
        {!showCompleted && (
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
    )
  );

  // Once the bulk form's own "Close" is clicked (after a save), also drop out of select mode
  // back to the normal pending view — matches OrderPunchList's delete-then-exit-select flow.
  function closeBulkFormAndExit() {
    setShowBulkForm(false);
    exitSelectMode();
  }

  if (isMobile) {
    return (
      <div>
        <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
        <div style={{ padding: "8px 0 24px" }}>
          {showCompleted
            ? filteredOrders.map((order) => (
                <button
                  key={order.ORDER_ID}
                  onClick={() => navigate(`/modules/dispatch-approval/${order.ORDER_ID}`)}
                  className="card"
                  style={{ display: "block", width: "100%", textAlign: "left", padding: 14, marginBottom: 10, color: "var(--color-text)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <StatusBadge status={order.STATUS || "PENDING"} />
                    <span className="text-muted" style={{ fontSize: 12 }}>{formatTimestamp(order.CREATED_AT)}</span>
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 10 }}>{order.CUSTOMER_NAME || "Customer not set"}</div>
                  <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>{order.ORDER_ID}</div>
                </button>
              ))
            : filteredItems.map((row) => {
                const key = itemRowKey(row);
                const selected = selectedIds.has(key);
                return (
                  <button
                    key={key}
                    onClick={() =>
                      selectMode ? toggleRow(key) : navigate(`/modules/dispatch-approval/${row.ORDER_ID}/items/${row.ITEM_ID}`)
                    }
                    className="card"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: 14,
                      marginBottom: 10,
                      cursor: "pointer",
                      ...(selected
                        ? { background: "var(--color-primary-tint)", color: "var(--color-text)" }
                        : isDueExtended(row)
                          ? { background: "#fdecea", color: "#b71c1c" }
                          : { color: "var(--color-text)" }),
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontWeight: 700 }}>{row.CUSTOMER_NAME || "Customer not set"}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>{row.SO_CONFIRMATION_TIME ? formatTimestamp(row.SO_CONFIRMATION_TIME) : "—"}</span>
                    </div>
                    <div style={{ marginTop: 8 }}>{row.PART_NAME || "—"}</div>
                    <div className="text-muted" style={{ fontSize: 13, marginTop: 5 }}>
                      {row.ORDER_ID} · Qty {row.ORDER_QTY || "—"} {row.UOM}
                      {row.PARTIALLY_DECIDED && ` · Balance ${row.BALANCE_QTY} ${row.UOM}`}
                    </div>
                  </button>
                );
              })}
          {!isLoading && showCompleted && filteredOrders.length === 0 && <p className="text-muted">No completed dispatch approvals.</p>}
          {!isLoading && !showCompleted && filteredItems.length === 0 && <p className="text-muted">No orders awaiting dispatch approval.</p>}
        </div>
        {showBulkForm && (
          <BulkDispatchApprovalForm items={selectedItems} onClose={closeBulkFormAndExit} onSaved={handleBulkSaved} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        {showCompleted ? (
          <DataTable
            columns={orderColumns}
            rows={filteredOrders}
            getRowKey={(order) => order.ORDER_ID}
            onRowClick={(order) => navigate(`/modules/dispatch-approval/${order.ORDER_ID}`)}
            emptyMessage={isLoading ? "Loading…" : normalizedQuery ? `No orders match “${query}”` : "No completed dispatch approvals."}
          />
        ) : (
          <DataTable
            columns={itemColumns}
            rows={filteredItems}
            getRowKey={itemRowKey}
            onRowClick={(row) => navigate(`/modules/dispatch-approval/${row.ORDER_ID}/items/${row.ITEM_ID}`)}
            emptyMessage={isLoading ? "Loading…" : normalizedQuery ? `No items match “${query}”` : "No orders awaiting dispatch approval."}
            getRowStyle={(row) => (isDueExtended(row) ? { background: "#fdecea", color: "#b71c1c" } : undefined)}
            selectable={selectMode}
            selectedKeys={selectedIds}
            onToggleRow={toggleRow}
          />
        )}
      </div>
      {showBulkForm && (
        <BulkDispatchApprovalForm items={selectedItems} onClose={closeBulkFormAndExit} onSaved={handleBulkSaved} />
      )}
    </div>
  );
}
