import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listTaxonomyRows } from "./lib/npdApi";
import { QuickAction } from "../components/FloatingActionButton";
import { useSetHeaderActions } from "../lib/headerActions";

/** RM SKU detail — rebuilt to follow this app's OWN real detail-page pattern
 * (`Frontend/src/modules/transport/TripDetail.tsx`) instead of hand-guessing colors/spacing
 * against the AppSheet reference screenshot, per the user's explicit "i want like this" +
 * screenshot of TripDetail itself. Every earlier pass at this file (four of them) invented its
 * own literal-hex styling trying to pixel-match a screenshot from a different, unrelated app;
 * this pass instead reuses the real, working components/conventions already proven elsewhere
 * in this codebase:
 * - `Section`/`Field`/`TableCard` — copied in shape from `TripDetail.tsx` (not imported, since
 *   they're private to that file — same small-helper-per-file convention this app already
 *   uses rather than extracting a shared component for a two-file reuse).
 * - `QuickAction` (`components/FloatingActionButton.tsx`) — the same shared circular red
 *   action-button component `TripDetail.tsx`/`OrderDetail.tsx`/`PdiItemDetail.tsx`/
 *   `DispatchApprovalItemDetail.tsx` already use, not a custom blue-icon row. The three actions
 *   (Upload Images & Drawings / UPDATE IQC PDF / Verified RM item) are real `QuickAction`s
 *   now, stacked via `stackIndex` — clickable, but their actual upload/verify/update handlers
 *   are still a follow-up (per the user: "i will tell me later").
 * - `className="card"` + `--color-*` tokens throughout, not literal hex — this app is
 *   light/dark theme-aware everywhere else; there was never a real reason for this one page to
 *   opt out of that (unlike `RmSkuForm.tsx`'s deliberate literal-hex exception, which pixel-
 *   matches a *panel* the user asked to match exactly — this is a plain detail page).
 * - Field order/labels dumped live off the real `Raw Material SKU` tab headers (unchanged from
 *   the previous pass): TIMESTAMP, USEREMAIL, ID'S, PART NO., Category, Sub Category, Paint,
 *   MAKE BY, VENDOR NAME, IQC PDF, IQC PDF UPDATE LAST (`TrF tO Master Rm` excluded — internal
 *   transfer-tracking, not doer-facing).
 * - Dimensions/Drawing & Photos/RM Images stay as `TableCard`-style cards, genuinely empty (no
 *   per-category dimension tables or image-upload feature exist yet) — not fabricated.
 * - Edit + Previous/Next now live in the app's own breadcrumb-row header actions slot
 *   (`lib/headerActions.tsx`'s `useSetHeaderActions`, the same mechanism `RmSkuCatalog.tsx`'s
 *   own "+ New" button already uses) — not a second row on the page itself. This removed the
 *   need for the standalone "‹ Back" button entirely (the breadcrumb already provides a way
 *   back to the catalog), per the user's own explicit follow-up request. */
export function RmSkuDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["npd", "taxonomy", "rows", "rm-sku"],
    queryFn: () => listTaxonomyRows("rm-sku"),
  });

  const rowIndex = rows.findIndex((r) => r["ID'S"] === id);
  const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : undefined;
  const nextRow = rowIndex >= 0 && rowIndex < rows.length - 1 ? rows[rowIndex + 1] : undefined;

  // Registered unconditionally, before the loading/not-found early returns below — a hook
  // call can never be conditional on those (React's own rule), and the header actions still
  // need to render (disabled Prev/Next, Edit still visually present) while the row loads.
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
        onClick={() => prevRow && navigate(`/npd/rm-sku/${prevRow["ID'S"]}`)}
        label="Previous RM SKU"
        disabled={!prevRow}
      >
        ‹
      </HeaderNavButton>
      <HeaderNavButton
        onClick={() => nextRow && navigate(`/npd/rm-sku/${nextRow["ID'S"]}`)}
        label="Next RM SKU"
        disabled={!nextRow}
      >
        ›
      </HeaderNavButton>
    </div>
  );

  const row = rows.find((r) => r["ID'S"] === id);

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!row) return <p className="text-muted">RM SKU not found.</p>;

  const actions = [
    { label: "Upload Images & Drawings", icon: <ImageIconPaths /> },
    { label: "UPDATE IQC PDF", icon: <RefreshIconPaths /> },
    { label: "Verified RM item", icon: <CheckIconPaths /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: "0 0 260px" }}>
          <h2 style={{ margin: "8px 0 0", wordBreak: "break-word" }}>{row["ID'S"]}</h2>
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
          <Section title="RM Details">
            <Field label="USEREMAIL" value={row.USEREMAIL} />
            <Field label="PART NO." value={row["PART NO."]} />
            <Field label="Category" value={row.Category} />
            <Field label="Sub Category" value={row["Sub Category"]} />
            <Field label="Paint" value={row.Paint} />
            <Field label="MAKE BY" value={row["MAKE BY"]} />
            <Field label="VENDOR NAME" value={row["VENDOR NAME"]} />
          </Section>

          <Section title="IQC Details">
            <FieldFile label="IQC PDF" fileName={row["IQC PDF"]} />
            <Field label="IQC PDF UPDATE LAST" value={row["IQC PDF UPDATE LAST"]} />
            {!row["IQC PDF"] && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Not yet submitted.</p>}
          </Section>
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <TableCard
            title={row.Category ? `${row.Category} Dimensions` : "Dimensions"}
            count={0}
            rows={[]}
            columns={[
              { header: "Unique ID" },
              { header: "TIMESTAMP" },
              { header: "AGAINST ID" },
              { header: "CATEGORY" },
            ]}
          />

          <TableCard title="Drawing & Photos" count={0} rows={[]} columns={[{ header: "File" }]} />

          <TableCard title="RM Images & Drawings" count={0} rows={[]} columns={[{ header: "File" }]} />
        </div>
      </div>
    </div>
  );
}

// --- Below: same small private helper shapes TripDetail.tsx already uses, not extracted into
// a shared component — a two-file reuse doesn't earn a new shared file in this codebase.

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

// Same "View X" link pattern as TripDetail.tsx's own FieldFile — this app has no Drive fileId
// for IQC PDF yet (the live sheet stores a plain filename string, not an uploaded fileId), so
// this shows the filename as plain text instead of a clickable openAttachment() link. Wire it
// up as a real link once IQC PDF upload actually stores a fileId.
function FieldFile({ label, fileName }: { label: string; fileName?: string }) {
  if (!fileName) return null;
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      <div className="text-muted" style={{ fontSize: 12, flex: "0 0 160px" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        {fileName}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.8" style={{ flexShrink: 0 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
      </div>
    </div>
  );
}

// Same title + count-badge + "Expand" (red) + table shape as TripDetail.tsx's own TableCard —
// simplified here since every one of these three cards is genuinely empty for now (no
// per-category dimension tables or image-upload feature exist yet, see this file's module doc
// comment) — "Expand" is present for visual parity but has nowhere to navigate yet, so it's
// non-interactive rather than a dead link.
function TableCard({
  title,
  count,
  rows,
  columns,
}: {
  title: string;
  count: number;
  rows: Record<string, string>[];
  columns: { header: string }[];
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
        <span style={{ color: "var(--color-primary)", fontSize: 13, fontWeight: 600, padding: 4 }}>Expand</span>
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
          </table>
        </div>
      )}
    </div>
  );
}

// Same 38x38 bordered icon-button shape RmSkuCatalog.tsx's own "+ New" header action already
// uses in this exact header-actions slot — reused here for Previous/Next.
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

function ImageIconPaths() {
  return (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <path d="M20 15l-5-5L6 20" />
    </>
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

function CheckIconPaths() {
  return (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  );
}
