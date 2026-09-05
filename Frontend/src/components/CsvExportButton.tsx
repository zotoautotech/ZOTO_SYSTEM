import { downloadCsv, type CsvColumn } from "../npd/lib/csv";

/** Shared "Export Data"/CSV icon button — matches the reference AppSheet app's own icon on
 * every list view (`RmSkuCatalog.tsx`/`FgSkuCatalog.tsx`/`AssembleData.tsx`). Exports exactly
 * the rows passed in (the caller decides whether that's the current filtered/visible set or
 * everything) via `downloadCsv()` — a pure client-side `Blob` download, no backend route. */
export function CsvExportButton<T>({
  filename,
  columns,
  rows,
}: {
  filename: string;
  columns: CsvColumn<T>[];
  rows: T[];
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, columns, rows)}
      disabled={rows.length === 0}
      title="Export CSV"
      aria-label="Export Data"
      style={{
        width: 38,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg)",
        color: "var(--color-text)",
        cursor: rows.length === 0 ? "default" : "pointer",
        opacity: rows.length === 0 ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 15h1" />
        <path d="M13 15h2" />
      </svg>
    </button>
  );
}
