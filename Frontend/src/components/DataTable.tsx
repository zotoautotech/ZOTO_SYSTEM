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
}

export function DataTable<T>({ columns, rows, onRowClick, emptyMessage }: DataTableProps<T>) {
  return (
    <div className="sheet-scroll" style={{ overflow: "auto", height: "100%" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
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
              <td colSpan={columns.length} style={{ padding: 32, textAlign: "center" }} className="text-muted">
                {emptyMessage ?? "No records"}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-page)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
