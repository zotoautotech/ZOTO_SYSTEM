import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOrder } from "../../lib/ordersApi";
import { formatCurrency } from "../../lib/format";
import { useIsCompact, useIsMobile } from "../../lib/responsive";

const COLUMNS = [
  { label: "Part Name", width: 220 },
  { label: "Qty", width: 80 },
  { label: "UOM", width: 80 },
  { label: "Price", width: 100 },
  { label: "Basic Amount", width: 120 },
  { label: "Tax Amount", width: 110 },
  { label: "Total Amount", width: 120 },
  { label: "Remarks", width: 180 },
];

const FINANCIAL_LABELS = new Set(["Price", "Basic Amount", "Tax Amount", "Total Amount"]);

export function OrderItemsView() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = `/modules/${location.pathname.split("/")[2]}`;
  // Dispatch Approval doers shouldn't see order financials at all — see plans/pure-puzzling-gray.md.
  const hideFinancials = basePath === "/modules/dispatch-approval";
  const columns = hideFinancials ? COLUMNS.filter((c) => !FINANCIAL_LABELS.has(c.label)) : COLUMNS;
  const isCompact = useIsCompact();
  const isMobile = useIsMobile();
  const [colWidths, setColWidths] = useState(() => columns.map((c) => c.width));
  const dragState = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const onColMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const { index, startX, startWidth } = dragState.current;
    const next = Math.max(50, startWidth + (e.clientX - startX));
    setColWidths((w) => w.map((v, i) => (i === index ? next : v)));
  }, []);

  const onColMouseUp = useCallback(() => {
    dragState.current = null;
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onColMouseMove);
    window.removeEventListener("mouseup", onColMouseUp);
  }, [onColMouseMove]);

  const onColMouseDown = useCallback(
    (index: number) => (e: React.MouseEvent) => {
      e.stopPropagation();
      dragState.current = { index, startX: e.clientX, startWidth: colWidths[index] };
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onColMouseMove);
      window.addEventListener("mouseup", onColMouseUp);
    },
    [colWidths, onColMouseMove, onColMouseUp]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!),
    enabled: !!orderId,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!data) return <p className="text-muted">Order not found</p>;

  const { items } = data;

  const cell: React.CSSProperties = {
    padding: "10px 14px",
    borderBottom: "1px solid var(--color-border)",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const firstColPad = isCompact ? 12 : 24;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 128px)",
        margin: isCompact ? "0 -12px" : "0 -24px",
      }}
    >
      <div className="sheet-scroll" style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13, whiteSpace: "nowrap" }}>
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.label}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    paddingLeft: i === 0 ? firstColPad : 14,
                    borderBottom: "1px solid var(--color-border)",
                    borderRight: i === columns.length - 1 ? "none" : "1px solid var(--color-border)",
                    position: "relative",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.label}
                  {!isMobile && (
                    <div
                      onMouseDown={onColMouseDown(i)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setColWidths((w) => w.map((v, idx) => (idx === i ? columns[i].width : v)));
                      }}
                      title="Drag to resize column"
                      style={{
                        position: "absolute",
                        top: 0,
                        right: -3,
                        width: 6,
                        height: "100%",
                        cursor: "col-resize",
                        zIndex: 1,
                      }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              return (
                <tr
                  key={it.ITEM_ID}
                  onClick={() => navigate(`${basePath}/${orderId}/items/${it.ITEM_ID}`)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-page)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ ...cell, paddingLeft: firstColPad, fontWeight: 500 }}>{it.PART_NAME}</td>
                  <td style={cell}>{it.QTY}</td>
                  <td style={cell}>{it.UOM}</td>
                  {!hideFinancials && (
                    <>
                      <td style={cell}>{formatCurrency(it.PRICE)}</td>
                      <td style={cell}>{formatCurrency(it.BASIC_AMOUNT)}</td>
                      <td style={cell}>{formatCurrency(it.TAX_AMOUNT)}</td>
                      <td style={cell}>{formatCurrency(it.TOTAL_AMOUNT)}</td>
                    </>
                  )}
                  <td style={{ ...cell, whiteSpace: "normal" }}>{it.NOTES}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
