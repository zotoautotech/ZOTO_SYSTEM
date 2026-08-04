import { useIsMobile } from "../lib/responsive";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** Enables the checkbox column; clicking a row toggles selection instead of calling onRowClick. */
  selectable?: boolean;
  getRowKey?: (row: T) => string;
  selectedKeys?: Set<string>;
  onToggleRow?: (key: string) => void;
  /** Extra inline style merged onto a row's <tr> — used for e.g. the old CRR's
   * strikethrough-red cancelled-row treatment (see SoConfirmationList.tsx). */
  getRowStyle?: (row: T) => React.CSSProperties | undefined;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  emptyMessage,
  selectable,
  getRowKey,
  selectedKeys,
  onToggleRow,
  getRowStyle,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();

  // A phone can't show 7-9 nowrap columns without sideways scrolling, which made every queue
  // unreadable on mobile (you had to drag horizontally just to read one record). Same data,
  // rendered as one card per row with label/value pairs stacked vertically instead.
  if (isMobile) {
    if (rows.length === 0) {
      return (
        <p className="text-muted" style={{ padding: "32px 12px", textAlign: "center", margin: 0 }}>
          {emptyMessage ?? "No records"}
        </p>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0 16px" }}>
        {rows.map((row, i) => {
          const key = getRowKey?.(row) ?? String(i);
          const checked = selectable && selectedKeys?.has(key);
          return (
            <div
              key={key}
              className="card"
              onClick={() => (selectable ? onToggleRow?.(key) : onRowClick?.(row))}
              style={{
                padding: "12px 14px",
                cursor: selectable || onRowClick ? "pointer" : "default",
                background: checked ? "var(--color-primary-tint)" : undefined,
                borderColor: checked ? "var(--color-primary)" : undefined,
                ...getRowStyle?.(row),
              }}
            >
              {selectable && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={!!checked} readOnly style={{ width: 18, height: 18 }} />
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {checked ? "Selected" : "Tap to select"}
                  </span>
                </div>
              )}
              {columns.map((col, ci) => (
                <div
                  key={col.key}
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "6px 0",
                    borderTop: ci === 0 ? undefined : "1px solid var(--color-border)",
                  }}
                >
                  <span className="text-muted" style={{ fontSize: 12, flex: "0 0 40%" }}>
                    {col.header}
                  </span>
                  <span style={{ fontSize: 14, flex: 1, minWidth: 0, textAlign: "right", overflowWrap: "anywhere" }}>
                    {col.render(row)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="sheet-scroll" style={{ overflow: "auto", height: "100%" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {selectable && (
              <th
                style={{
                  width: 40,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                }}
              />
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                style={{ padding: 32, textAlign: "center" }}
                className="text-muted"
              >
                {emptyMessage ?? "No records"}
              </td>
            </tr>
          )}
          {rows.map((row, i) => {
            const key = getRowKey?.(row) ?? String(i);
            const checked = selectable && selectedKeys?.has(key);
            return (
              <tr
                key={key}
                onClick={() => (selectable ? onToggleRow?.(key) : onRowClick?.(row))}
                style={{
                  cursor: selectable || onRowClick ? "pointer" : "default",
                  background: checked ? "var(--color-primary-tint)" : undefined,
                  ...getRowStyle?.(row),
                }}
                onMouseEnter={(e) => {
                  if (!checked) e.currentTarget.style.background = "var(--color-bg-page)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = checked ? "var(--color-primary-tint)" : "transparent";
                }}
              >
                {selectable && (
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
                    <input type="checkbox" checked={!!checked} readOnly style={{ cursor: "pointer" }} />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--color-border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
