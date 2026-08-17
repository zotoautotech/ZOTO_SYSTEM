import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CustomerFilterPanel } from "../../components/CustomerFilterPanel";
import { DataTable, type Column } from "../../components/DataTable";
import { formatTimestamp } from "../../lib/format";
import { listPdiItems, type PdiItemRow } from "../../lib/ordersApi";
import { useSearch } from "../../lib/search";
import { useSetHeaderActions, useSetHeaderLeft } from "../../lib/headerActions";
import { useIsMobile } from "../../lib/responsive";
import { openAttachment } from "../../lib/attachments";
import { BulkPdiForm } from "./BulkPdiForm";

/** Keys a pending row by its own PDI round (DISP_CONF_ITEM_ID), not just ITEM_ID — an item
 * split across several Dispatch Approval rounds gets one PDI row per round, so ITEM_ID alone
 * would collide two open rounds of the same item into one selection/row identity. Falls back
 * to ITEM_ID/ORDER_ID+PART_NAME for legacy rows with no round id at all. */
function pdiRowKey(row: PdiItemRow) {
  return row.DISP_CONF_ITEM_ID || row.ITEM_ID || `${row.ORDER_ID}-${row.PART_NAME}`;
}

/** PDI queue, item-level (one row per item, not per order) in both the pending and Completed
 * toggle states — Timestamp/Part Name/Customer Name/Buyer GSTIN No./Quantity/Unit/PDI Date/
 * PDI Attachment/PDI Remarks, matching the old CRR reference view. Row click still opens the
 * order-level detail page (the PDI form itself submits at the order level, one row per item
 * gets appended on save) — see GET /orders/pdi/items (Backend/src/routes/stageRoutes.ts). */
export function PdiList() {
  const navigate = useNavigate();
  const { query } = useSearch();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [activeCustomer, setActiveCustomer] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["pdiItems", showCompleted],
    queryFn: () => listPdiItems(showCompleted ? "COMPLETED" : undefined),
    placeholderData: keepPreviousData,
  });

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectionNotice("");
  }

  // The PDI submit endpoint can't target a specific round — it always fills whichever open
  // PDI round for that ITEM_ID is oldest. So two open rounds of the same item can never be
  // bulk-selected together (the second call would silently misfile onto the wrong round).
  function toggleRow(id: string) {
    setSelectionNotice("");
    setSelectedIds((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      const row = items.find((r) => pdiRowKey(r) === id);
      const clashesWithSelected = row && items.some((r) => pdiRowKey(r) !== id && r.ITEM_ID === row.ITEM_ID && prev.has(pdiRowKey(r)));
      if (clashesWithSelected) {
        setSelectionNotice("Only one pending round per item can be bulk-submitted at a time — use that item's own Give PDI Form for the other round.");
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

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

  const selectedItems = filtered.filter((row) => selectedIds.has(pdiRowKey(row)));

  function handleBulkSaved() {
    for (const item of selectedItems) queryClient.invalidateQueries({ queryKey: ["order", item.ORDER_ID] });
    queryClient.invalidateQueries({ queryKey: ["pdiItems"] });
  }

  // Once the bulk form's own "Close" is clicked (after a save), also drop out of select mode
  // back to the normal pending view — same convention as the Dispatch Approval bulk form.
  function closeBulkFormAndExit() {
    setShowBulkForm(false);
    exitSelectMode();
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
        Bulk PDI Form
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
        {selectMode && selectionNotice && (
          <p style={{ color: "#d32f2f", fontSize: 13, padding: "8px 14px 0" }}>{selectionNotice}</p>
        )}
        <div style={{ padding: "8px 0 24px" }}>
          {filtered.map((row) => {
            const key = pdiRowKey(row);
            const selected = selectedIds.has(key);
            return (
              <button
                key={key}
                onClick={() => (selectMode ? toggleRow(key) : navigate(`/modules/pdi/${row.ORDER_ID}/items/${row.ITEM_ID}`))}
                className="card"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 14,
                  marginBottom: 10,
                  cursor: "pointer",
                  background: selected ? "var(--color-primary-tint)" : "var(--color-bg)",
                  color: "var(--color-text)",
                }}
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
            );
          })}
          {!isLoading && filtered.length === 0 && <p className="text-muted">{emptyMessage}</p>}
        </div>
        {showBulkForm && (
          <BulkPdiForm items={selectedItems} onClose={closeBulkFormAndExit} onSaved={handleBulkSaved} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 128px)" }}>
      <CustomerFilterPanel customers={customers} active={activeCustomer} onSelect={setActiveCustomer} />
      <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)" }}>
        {selectMode && selectionNotice && (
          <p style={{ color: "#d32f2f", fontSize: 13, padding: "10px 14px 0" }}>{selectionNotice}</p>
        )}
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={pdiRowKey}
          onRowClick={(row) => navigate(`/modules/pdi/${row.ORDER_ID}/items/${row.ITEM_ID}`)}
          emptyMessage={emptyMessage}
          selectable={selectMode}
          selectedKeys={selectedIds}
          onToggleRow={toggleRow}
        />
      </div>
      {showBulkForm && (
        <BulkPdiForm items={selectedItems} onClose={closeBulkFormAndExit} onSaved={handleBulkSaved} />
      )}
    </div>
  );
}
