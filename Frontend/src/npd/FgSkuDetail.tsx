import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listTaxonomyRows, listBomLines } from "./lib/npdApi";
import { QuickAction } from "../components/FloatingActionButton";
import { useSetHeaderActions } from "../lib/headerActions";

/** FG SKU detail — rebuilt on the same real pattern `RmSkuDetail.tsx` now uses (itself copied
 * from `TripDetail.tsx`, Sales CRR's own working detail page), per the user's own screenshot
 * of the AppSheet reference. This pass was explicitly scoped to the Detail page only (the
 * "+ New" create form was a separate, later follow-up — see `FgSkuForm.tsx` and
 * `FgSkuCatalog.tsx`'s own "+ New" wiring for that; `taxonomy.ts`'s `fg-sku` table now has
 * `allowCreate` back on). **Edit here is still visual-only** — there's no edit-mode support in
 * `FgSkuForm.tsx` yet (unlike `RmSkuDetail.tsx`'s real Edit, which opens `RmSkuForm.tsx` with
 * an `editRow` prop) — a reasonable next follow-up once this create form is confirmed working.
 *
 * Field list unchanged from the previous version of this file — the live `FINAL GOOD SKU` tab
 * (`env.sheets.fg`, shared with Sales CRR's own goods search) only has ~20 real columns (see
 * CLAUDE.md's "Verified directly against the workbook" section), NOT the reference
 * screenshot's `Old Part Name`/`Description`/`Paint` fields — those belong to the old
 * 2-wheeler ADC schema that never made it to ZOTO's live sheet. Showing them would be
 * fabricating fields that don't exist; only real columns are shown.
 *
 * Two NEW cards match the reference's shape honestly-empty (no backing feature exists yet,
 * same "flag it, don't fake it" convention as RmSkuDetail.tsx's Dimensions/Drawing & Photos):
 * "Drawing Videos" (no upload feature) and "Fitment Details" (no customer-fitment tracking
 * table exists). A THIRD card, "BOM Items", is genuinely real — it's `listBomLines(fgId)`,
 * the same data `BomBuilder.tsx` already reads/writes, not an empty placeholder. */
export function FgSkuDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "fg-sku"],
    queryFn: () => listTaxonomyRows("fg-sku"),
  });

  const rowIndex = rows.findIndex((r) => r["FG ID"] === id);
  const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : undefined;
  const nextRow = rowIndex >= 0 && rowIndex < rows.length - 1 ? rows[rowIndex + 1] : undefined;
  const row = rows.find((r) => r["FG ID"] === id);

  const { data: bomLines = [] } = useQuery({
    queryKey: ["npd", "bom", id],
    queryFn: () => listBomLines(id!),
    enabled: !!id,
  });

  // Registered unconditionally, before the loading/not-found early returns below — a hook
  // call can never be conditional on those. Edit is disabled/visual-only (title="Coming soon")
  // — no dedicated FgSkuForm.tsx exists yet to open, unlike RmSkuDetail.tsx's real Edit.
  useSetHeaderActions(
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        title="Coming soon"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 36,
          padding: "0 14px",
          borderRadius: 6,
          border: "none",
          background: "var(--color-primary)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          cursor: "default",
          opacity: 0.6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        Edit
      </button>
      <div style={{ width: 1, height: 22, background: "var(--color-border)" }} />
      <HeaderNavButton
        onClick={() => prevRow && navigate(`/npd/fg-sku/${prevRow["FG ID"]}`)}
        label="Previous FG SKU"
        disabled={!prevRow}
      >
        ‹
      </HeaderNavButton>
      <HeaderNavButton
        onClick={() => nextRow && navigate(`/npd/fg-sku/${nextRow["FG ID"]}`)}
        label="Next FG SKU"
        disabled={!nextRow}
      >
        ›
      </HeaderNavButton>
    </div>
  );

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!row) return <p className="text-muted">FG SKU not found.</p>;

  const actions = [
    { label: "Update All Vendor PDFs", icon: <RefreshIconPaths /> },
    { label: "MACHINING & OTHER CHARGES", icon: <RupeeIconPaths /> },
    { label: "Verify BOM Item", icon: <CheckIconPaths /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: "0 0 260px" }}>
          <h2 style={{ margin: "8px 0 0", wordBreak: "break-word" }}>{row.Name || row["FG ID"]}</h2>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {row.TIMESTAMP ? new Date(row.TIMESTAMP).toLocaleString() : "—"}
          </span>
          <div style={{ display: "flex", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            {actions.map((a, i) => (
              <QuickAction key={a.label} label={a.label} onClick={() => {}} stackIndex={i}>
                {a.icon}
              </QuickAction>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <Section title="FG Details">
            <Field label="USEREMAIL" value={row.USEREMAIL} />
            <Field label="ID'S" value={row["FG ID"]} />
            <Field label="PART NO." value={row["PART NO."]} />
            <Field label="Name" value={row.Name} />
            <Field label="Sub Category" value={row["SUB CATEGORY"]} />
            <Field label="Category" value={row.CATEGORY} />
            <Field label="SEGMENT" value={row.SEGMENT} />
            <Field label="Standard Part" value={row["STANDARD PART"]} />
            <Field label="Unit" value={row.UNIT} />
          </Section>

          <Section title="Stock & Pricing">
            <Field label="Min Stock" value={row["MIN STOCK"]} />
            <Field label="Max Stock" value={row["MAX STOCK"]} />
            <Field label="Opening Stock" value={row["OPENING STOCK"]} />
            <Field label="Price" value={row.price ? `₹${row.price}` : undefined} />
            <Field label="Discount" value={row.Discount} />
            <Field label="Final Price" value={row["Final Price"] ? `₹${row["Final Price"]}` : undefined} />
            <Field label="Cost of Goods" value={row["COST OF GOODS"] ? `₹${row["COST OF GOODS"]}` : undefined} />
          </Section>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <TableCard title="Drawing Videos" count={0} rows={[]} columns={[{ header: "File" }]} />

          <TableCard title="Fitment Details" count={0} rows={[]} columns={[{ header: "Customer Name" }, { header: "Timestamp" }]} />

          {/* The only genuinely real card here — same ASSEMBLE RM FG (BOM) data
              BomBuilder.tsx already reads/writes, not an empty placeholder. */}
          <TableCard
            title="BOM Items"
            count={bomLines.length}
            rows={bomLines}
            onExpand={() => navigate(`/npd/bom/${encodeURIComponent(id!)}`)}
            columns={[
              { header: "RM Code", render: (r: (typeof bomLines)[number]) => r["RM Code"] || "—" },
              { header: "Qty", render: (r: (typeof bomLines)[number]) => r.Quantity || "—" },
              { header: "Units", render: (r: (typeof bomLines)[number]) => r.Units || "—" },
              { header: "Rate", render: (r: (typeof bomLines)[number]) => (r.Rate ? `₹${r.Rate}` : "—") },
              { header: "Status", render: (r: (typeof bomLines)[number]) => r.Status || "—" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

// --- Below: same small private helper shapes RmSkuDetail.tsx already uses (itself copied
// from TripDetail.tsx), not extracted into a shared component — this app's own
// small-helper-per-file convention for a handful of reuses.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: "0 0 160px" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, flex: 1 }}>{value}</div>
    </div>
  );
}

function TableCard<T>({
  title,
  count,
  rows,
  columns,
  onExpand,
}: {
  title: string;
  count: number;
  rows: T[];
  columns: { header: string; render?: (row: T) => React.ReactNode }[];
  onExpand?: () => void;
}) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <span
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border)",
              borderRadius: 999,
              padding: "1px 9px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            {count}
          </span>
        </div>
        {onExpand ? (
          <button
            onClick={onExpand}
            style={{ border: "none", background: "none", color: "var(--color-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 4 }}
          >
            Expand
          </button>
        ) : (
          <span style={{ color: "var(--color-primary)", fontSize: 13, fontWeight: 600, padding: 4 }}>Expand</span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No items</p>
      ) : (
        <div className="sheet-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={col.header}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--color-border)",
                      borderRight: i === columns.length - 1 ? "none" : "1px solid var(--color-border)",
                    }}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.header} style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
                      {col.render ? col.render(row) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Same 36x36 bordered icon-button shape RmSkuDetail.tsx's own header-actions slot uses.
function HeaderNavButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontSize: 16,
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function RefreshIconPaths() {
  return (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  );
}

function RupeeIconPaths() {
  return (
    <>
      <path d="M6 4h12" />
      <path d="M6 8h12" />
      <path d="M6 4a6 6 0 0 1 0 8h6" />
      <path d="M6 12l8 8" />
    </>
  );
}

function CheckIconPaths() {
  return (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  );
}
