import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteOrders, listOrders, type OrderRecord } from "../../lib/ordersApi";
import { listCustomers, listGoods } from "../../lib/mastersApi";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { Modal } from "../../components/Modal";
import { formatTimestamp } from "../../lib/format";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions, useSetHeaderLeft } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";
import { useAuth } from "../../lib/auth";

export function OrderPunchList({ hideCreate = false }: { hideCreate?: boolean } = {}) {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const canDelete = user?.canDelete ?? false;
  const queryClient = useQueryClient();

  // Warm the customer/part pickers while the user is still browsing the list, so the
  // "New" order modal's dropdowns are already populated instead of showing "Loading…".
  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: ["masters", "customers"], queryFn: listCustomers, staleTime: 60_000 });
    queryClient.prefetchQuery({ queryKey: ["masters", "goods"], queryFn: listGoods, staleTime: 60_000 });
  }, [queryClient]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [filterWidth, setFilterWidth] = useState(260);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrders(Array.from(selectedIds)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setConfirmingDelete(false);
      exitSelectMode();
    },
  });

  const onDividerMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const next = dragState.current.startWidth + (e.clientX - dragState.current.startX);
    setFilterWidth(Math.min(480, Math.max(160, next)));
  }, []);

  const onDividerMouseUp = useCallback(() => {
    dragState.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onDividerMouseMove);
    window.removeEventListener("mouseup", onDividerMouseUp);
  }, [onDividerMouseMove]);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { startX: e.clientX, startWidth: filterWidth };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onDividerMouseMove);
      window.addEventListener("mouseup", onDividerMouseUp);
    },
    [filterWidth, onDividerMouseMove, onDividerMouseUp]
  );

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "all"],
    queryFn: () => listOrders({}),
  });

  const scoped = useMemo(
    () => orders.filter((o) => (showCompleted ? o.CURRENT_STAGE !== "Punch" : o.CURRENT_STAGE === "Punch")),
    [orders, showCompleted]
  );

  const customerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of scoped) {
      const name = o.CUSTOMER_NAME || "Unknown";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [scoped]);

  const byCustomer = activeCustomer ? scoped.filter((o) => o.CUSTOMER_NAME === activeCustomer) : scoped;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? byCustomer.filter((o) =>
        [o.CUSTOMER_NAME, o.ORDER_ID, o.PO_NO, o.BUYER_GSTIN].some((field) =>
          (field || "").toLowerCase().includes(q)
        )
      )
    : byCustomer;

  const columns: Column<OrderRecord>[] = [
    { key: "status", header: "Status", render: (o) => <StatusBadge status={o.STATUS} /> },
    { key: "timestamp", header: "Timestamp", render: (o) => formatTimestamp(o.CREATED_AT) },
    { key: "tally", header: "Tally", render: () => "Tally 1 (Registered)" },
    { key: "orderType", header: "Order Type", render: (o) => o.ORDER_TYPE },
    {
      key: "paymentType",
      header: "Payment Type",
      render: (o) => (o.PAYMENT_TYPE === "Advance" ? `Advance (${o.ADVANCE_PCT}%)` : o.PAYMENT_TYPE),
    },
    { key: "customerName", header: "Customer Name", render: (o) => o.CUSTOMER_NAME },
    { key: "gstin", header: "Buyer GSTIN No.", render: (o) => o.BUYER_GSTIN },
    { key: "total", header: "Total Amount", render: (o) => `₹${Number(o.TOTAL_AMOUNT || 0).toLocaleString("en-IN")}` },
  ];

  const mobileOrders = (
    <div style={{ padding: "8px 0 24px" }}>
      {filtered.map((order) => (
        <button
          key={order.ORDER_ID}
          onClick={() => (selectMode ? toggleRow(order.ORDER_ID) : navigate(`/modules/punch-order/${order.ORDER_ID}`))}
          style={{ width: "100%", textAlign: "left", display: "block", border: "1px solid var(--color-border)", borderRadius: 12, background: selectedIds.has(order.ORDER_ID) ? "var(--color-primary-tint)" : "var(--color-bg)", padding: "14px 16px", marginBottom: 10, color: "var(--color-text)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <StatusBadge status={order.STATUS} />
            <span className="text-muted" style={{ fontSize: 12 }}>{formatTimestamp(order.CREATED_AT)}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 10 }}>{order.CUSTOMER_NAME || "Customer not set"}</div>
          <div className="text-muted" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 5, fontSize: 12 }}>
            <span>{order.ORDER_ID}</span><span>{order.PO_NO || "No PO number"}</span>
          </div>
        </button>
      ))}
      {!isLoading && filtered.length === 0 && <div className="text-muted" style={{ padding: "22px 4px" }}>No records</div>}
      {isLoading && <div className="text-muted" style={{ padding: "22px 4px" }}>Loading…</div>}
    </div>
  );

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
        className="btn"
        onClick={() => setConfirmingDelete(true)}
        disabled={selectedIds.size === 0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--color-error)",
          color: "#fff",
          border: "none",
          opacity: selectedIds.size === 0 ? 0.5 : 1,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
        </svg>
        Delete
      </button>
    ) : (
      <>
        {!hideCreate && (
          <button
            aria-label="New"
            onClick={() => navigate("/modules/punch-order/new")}
            style={{
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              background: "var(--color-bg)",
              color: "var(--color-primary)",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            +
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => setShowCompleted((s) => !s)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {showCompleted ? "Showing Completed" : "Completed…"}
        </button>
        <button
          aria-label="Filter"
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
            <path d="M4 5h16M7 12h10M10 19h4" />
          </svg>
        </button>
        {canDelete && (
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
      </>
    )
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 128px)" }}>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "stretch",
          flex: 1,
          minHeight: 0,
        }}
      >
        <CustomerFilterPanel
          customers={customerCounts}
          active={activeCustomer}
          onSelect={setActiveCustomer}
          width={filterWidth}
        />
        {!isMobile && (
          <div
            onMouseDown={onDividerMouseDown}
            onDoubleClick={() => setFilterWidth(260)}
            title="Drag to resize"
            style={{
              width: 5,
              marginLeft: -2,
              marginRight: -2,
              cursor: "col-resize",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ width: 1, height: "100%", background: "var(--color-border)", margin: "0 auto" }} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile ? mobileOrders : <DataTable
            columns={columns}
            rows={filtered}
            onRowClick={(o) => navigate(`/modules/punch-order/${o.ORDER_ID}`)}
            emptyMessage={isLoading ? "Loading…" : q ? `No orders match "${query}"` : "No records"}
            selectable={selectMode}
            getRowKey={(o) => o.ORDER_ID}
            selectedKeys={selectedIds}
            onToggleRow={toggleRow}
          />}
        </div>
      </div>

      {confirmingDelete && (
        <Modal title="Delete orders" onClose={() => setConfirmingDelete(false)}>
          <p style={{ marginTop: 0 }}>
            Delete {selectedIds.size} order{selectedIds.size === 1 ? "" : "s"}? This permanently removes the
            order{selectedIds.size === 1 ? "" : "s"} and their line items — this can't be undone.
          </p>
          {deleteMutation.isError && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              ⚠ Could not delete — try again
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" onClick={() => setConfirmingDelete(false)} disabled={deleteMutation.isPending}>
              Cancel
            </button>
            <button
              className="btn"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              style={{ background: "var(--color-error)", color: "#fff", border: "none" }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
