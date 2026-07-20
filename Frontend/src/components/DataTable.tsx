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
}: DataTableProps<T>) {
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
