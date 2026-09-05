/** Shared client-side CSV export helper — factored out of `AssembleData.tsx`'s own original
 * inline version once a second/third page (`RmSkuCatalog.tsx`/`FgSkuCatalog.tsx`) needed the
 * exact same "export whatever's currently filtered/visible" behavior, matching the reference
 * AppSheet app's own "Export Data"/CSV icon on its list views. No new backend route — this is
 * a pure `Blob` download of already-loaded rows. */
export interface CsvColumn<T> {
  header: string;
  get: (row: T) => string;
}

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const lines = [
    columns.map((c) => escapeCsvCell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => escapeCsvCell(c.get(r))).join(",")),
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
