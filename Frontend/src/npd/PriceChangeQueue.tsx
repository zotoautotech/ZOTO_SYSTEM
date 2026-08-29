import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "../components/DataTable";
import { listChangelog, type ChangelogEntry } from "./lib/npdApi";

/** Price Change Queue (build-prompt §7 screen 8) — scoped to a plain chronological changelog
 * rather than a real Finance-approval gate; see changelog.ts's own doc comment for why. Every
 * FG SKU price-field edit and every BOM Rate edit lands here, newest first. */
export function PriceChangeQueue() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["npd", "changelog"],
    queryFn: () => listChangelog(),
  });

  const columns: Column<ChangelogEntry>[] = [
    { key: "timestamp", header: "When", render: (e) => new Date(e.Timestamp).toLocaleString() },
    { key: "who", header: "Who", render: (e) => e.Useremail },
    { key: "entity", header: "Entity", render: (e) => e.Entity },
    { key: "entityId", header: "Entity ID", render: (e) => e["Entity ID"] },
    { key: "field", header: "Field", render: (e) => e.Field },
    { key: "old", header: "Old Value", render: (e) => e["Old Value"] || "—" },
    { key: "new", header: "New Value", render: (e) => e["New Value"] || "—" },
  ];

  return (
    <div style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Price &amp; BOM Change Log</h2>
      <p className="text-muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
        Every FG SKU price edit and BOM rate edit, newest first. Read-only — see the FG SKU
        Catalog or BOM Builder to make a change.
      </p>
      <DataTable
        columns={columns}
        rows={entries}
        getRowKey={(e) => `${e.Timestamp}-${e.Entity}-${e["Entity ID"]}-${e.Field}`}
        emptyMessage={isLoading ? "Loading…" : "No changes logged yet."}
      />
    </div>
  );
}
